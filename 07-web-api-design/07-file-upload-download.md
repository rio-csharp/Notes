# File Transfer APIs And Binary Boundaries

## Core Idea

File upload and download endpoints are specialized API surfaces. They differ from ordinary JSON endpoints because they move binary content, impose memory and storage pressure, and create security risks that are easy to underestimate. For that reason, file transfer should be treated as a deliberate boundary in API design rather than as "just another controller action."

This chapter focuses on how binary transfer changes the contract and operational design of an API.

## Small Uploads Versus Large Uploads

Small file uploads can often be handled directly through the application API:

```csharp
[HttpPost("files")]
public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
{
    if (file.Length == 0)
    {
        return BadRequest("Empty file.");
    }

    await using var stream = file.OpenReadStream();
    await _fileStorage.SaveAsync(stream, file.FileName, file.ContentType, ct);

    return Ok();
}
```

That approach is acceptable only within bounded size and throughput assumptions. Once files become large or frequent, direct API handling often becomes the wrong boundary because the web server is now responsible for streaming, buffering, and guarding large payloads under normal request pressure.

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

The important principle is not to trust client-supplied filename or content type as authoritative truth. A file endpoint is an input boundary with unusually high abuse potential.

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
