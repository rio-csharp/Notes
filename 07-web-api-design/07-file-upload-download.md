# File Transfer APIs And Binary Boundaries

## Core Idea

File upload and download endpoints are specialized API surfaces. They differ from ordinary JSON endpoints because they move binary content, impose memory and storage pressure, and create security risks that are easy to underestimate. For that reason, file transfer should be treated as a deliberate boundary in API design rather than as "just another controller action."

## Small Uploads Versus Large Uploads

Small file uploads can often be handled directly through the application API using the buffered model, where the entire file is read into an `IFormFile` object:

```csharp
[HttpPost("files")]
[RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
{
    if (file.Length == 0)
    {
        return BadRequest("Empty file.");
    }

    await using var stream = file.OpenReadStream();
    var storagePath = Path.Combine(_storagePath, Path.GetRandomFileName());
    await _fileStorage.SaveAsync(stream, storagePath, file.ContentType, ct);

    return Ok(new { storagePath });
}
```

This uses `Path.GetRandomFileName()` for the storage name rather than the client-supplied filename, preventing path traversal and name collision issues.

That approach is acceptable only within bounded size and throughput assumptions. The default multipart body length limit is 128 MB, configured through `FormOptions`:

```csharp
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 268_435_456; // 256 MB
});
```

The Kestrel server has its own independent limit:

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 52_428_800; // 50 MB
});
```

The effective limit is the most restrictive of these two settings plus any IIS `maxAllowedContentLength` configuration. Once files become large or frequent, direct API handling often becomes the wrong boundary because the web server is now responsible for streaming, buffering, and guarding large payloads under normal request pressure.

For larger uploads, a streaming approach reads the multipart sections without buffering the entire body. This requires disabling the form model binding that would otherwise consume the stream:

```csharp
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class DisableFormValueModelBindingAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        context.ValueProviderFactories.RemoveType<FormValueProviderFactory>();
        context.ValueProviderFactories.RemoveType<FormFileValueProviderFactory>();
        context.ValueProviderFactories.RemoveType<JQueryFormValueProviderFactory>();
    }

    public void OnResourceExecuted(ResourceExecutedContext context) { }
}
```

The streaming endpoint then processes the multipart reader directly, which keeps memory usage proportional to the size of each section rather than the total request body.

## Direct-To-Storage Upload Patterns

For larger uploads, a more scalable design is often:

1. the client asks the API for upload authorization;
2. the API validates file intent and creates metadata;
3. the API returns a short-lived upload URL or token;
4. the client uploads directly to object storage;
5. the API or background workers validate, scan, and process the stored object.

This changes the role of the API. It stops being the byte transport path and becomes the policy, authorization, and metadata boundary. That is often the correct separation at scale.

## Metadata As Part Of The Contract

File systems and object stores still need relational metadata:

- original file name;
- storage key;
- content type;
- size;
- uploader identity;
- tenant ownership;
- scan status;
- processing status;
- creation time.

This metadata is what turns raw binary storage into an application-level resource. Without it, the API cannot reliably authorize access, track lifecycle state, or expose the file as part of the system's domain.

## Validation Beyond Filename And MIME Type

File APIs need stronger validation than many ordinary JSON endpoints.

Relevant checks often include:

- file size;
- allowed extension;
- content type;
- file signature or magic bytes where applicable;
- tenant or user authorization;
- malware scanning or quarantine workflow;
- storage quota rules.

Client-supplied filename and content type should not be trusted as authoritative truth. A file endpoint is an input boundary with unusually high abuse potential.

### File Signature (Magic Byte) Validation

File extension and MIME type are trivially spoofed. Validating file signatures (magic bytes) provides a stronger check that the content matches the declared type:

```csharp
private static readonly Dictionary<string, byte[]> _signatures = new()
{
    [".jpeg"] = [0xFF, 0xD8, 0xFF],
    [".png"] = [0x89, 0x50, 0x4E, 0x47],
    [".pdf"] = [0x25, 0x50, 0x44, 0x46],
};

public static bool HasValidSignature(string extension, Stream content)
{
    if (!_signatures.TryGetValue(extension, out var expected))
        return false;

    var header = new byte[expected.Length];
    content.ReadExactly(header, 0, expected.Length);
    content.Position = 0;

    return header.AsSpan().SequenceEqual(expected);
}
```

Signature validation is not a complete defense. A file can have valid magic bytes and still contain malicious content, but it catches the simplest class of content-type spoofing.

### Malware Scanning

For environments where uploaded files are redistributed to other users, malware scanning should be part of the upload pipeline. A common pattern is to store the file, mark it as pending scan, and only expose it after scanning completes:

```csharp
await _fileStorage.SaveAsync(stream, storageKey, ct);

var fileRecord = new FileRecord
{
    StorageKey = storageKey,
    OriginalName = Path.GetFileName(clientFileName),
    ContentType = contentType,
    Size = size,
    ScanStatus = ScanStatus.Pending,
    UploadedAt = DateTimeOffset.UtcNow
};

_db.FileRecords.Add(fileRecord);
await _db.SaveChangesAsync(ct);

// Background worker picks up pending files for scanning
await _scanQueue.EnqueueAsync(fileRecord.Id, ct);
```

Downloads for files with a `Pending` or `Failed` scan status return `425 Too Early` or `403 Forbidden` instead of the file content.

## Download Semantics

Downloads also require explicit design. A secure file download endpoint is not merely "open the object and send it back." It must decide:

- whether the caller is authorized;
- whether the file is available yet;
- whether the file should be streamed by the API or accessed through a signed storage URL;
- whether access should be logged;
- whether the file name and content type sent back to the client are safe and correct.

Those questions make download behavior part of the API contract, not just part of infrastructure.

## Streaming Versus Redirecting

Two broad download patterns are common.

The API may stream the file directly, which keeps authorization centralized and lets the application enforce response headers itself.

Or the API may return a short-lived signed URL, shifting the actual byte transfer to object storage while keeping authorization and audit decisions in the application layer.

The right choice depends on file size, infrastructure shape, caching goals, and how much control the API must retain over the transfer path.

## Security Risks

File endpoints introduce several classes of risk:

- path traversal through unsafe filename handling;
- accidental public access to private storage;
- malware or hostile content;
- oversized uploads causing memory or storage pressure;
- insecure download authorization;
- tenant boundary leakage.

This is why random storage keys, filename sanitization, strict access control, and quarantine or scan workflows are so important. Binary content should not be treated as morally equivalent to validated JSON input.

## Lifecycle And Cleanup

File workflows often involve abandoned uploads, partially processed content, expired signed URLs, and temporary storage objects that no longer correspond to live business records. Cleanup is therefore part of the design, not an afterthought.

A robust file-transfer architecture usually includes:

- expiration for pending uploads;
- cleanup jobs for abandoned objects;
- processing-state transitions;
- audit visibility for failed scans or blocked files.

These lifecycle mechanics are what keep file APIs operationally stable over time.

## Design Consequences

File transfer endpoints should be modeled as specialized resource workflows. Small uploads may remain inside the application boundary, but large-scale transfer usually belongs in a direct-to-storage pattern with the API acting as the authorization and metadata authority. Validation, download authorization, malware handling, and cleanup are all part of the contract quality of such endpoints.

When these concerns are ignored, file APIs become one of the fastest ways for an otherwise clean platform to accumulate security and operational debt.
