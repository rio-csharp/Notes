# File Upload And Download APIs

## Core Idea

File APIs must handle binary data safely, efficiently, and securely.

Chinese notes:

- `multipart/form-data`: 文件上传表单格式.
- `streaming`: 流式处理.
- `pre-signed URL`: 预签名 URL.

## Small File Upload Through API

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

More complete endpoint:

```csharp
[HttpPost("files")]
[RequestSizeLimit(10 * 1024 * 1024)]
public async Task<ActionResult<FileUploadResponse>> Upload(
    IFormFile file,
    CancellationToken ct)
{
    if (file.Length == 0)
    {
        return BadRequest("File is empty.");
    }

    if (file.Length > 10 * 1024 * 1024)
    {
        return BadRequest("File is too large.");
    }

    var allowedContentTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpeg",
        "application/pdf"
    };

    if (!allowedContentTypes.Contains(file.ContentType))
    {
        return BadRequest("Unsupported file type.");
    }

    var safeOriginalName = Path.GetFileName(file.FileName);
    var storageKey = $"uploads/{Guid.NewGuid():N}{Path.GetExtension(safeOriginalName)}";

    await using var stream = file.OpenReadStream();
    await _fileStorage.SaveAsync(storageKey, stream, file.ContentType, ct);

    var metadata = new FileMetadata
    {
        Id = Guid.NewGuid(),
        OriginalFileName = safeOriginalName,
        StorageKey = storageKey,
        ContentType = file.ContentType,
        SizeBytes = file.Length,
        UploadedByUserId = User.FindFirst("sub")?.Value,
        CreatedAt = DateTimeOffset.UtcNow,
        ScanStatus = "Pending"
    };

    _dbContext.Files.Add(metadata);
    await _dbContext.SaveChangesAsync(ct);

    return Ok(new FileUploadResponse(metadata.Id, metadata.OriginalFileName));
}
```

Response:

```csharp
public sealed record FileUploadResponse(Guid FileId, string FileName);
```

Metadata entity:

```csharp
public sealed class FileMetadata
{
    public Guid Id { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StorageKey { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public string? UploadedByUserId { get; set; }
    public string ScanStatus { get; set; } = "Pending";
    public DateTimeOffset CreatedAt { get; set; }
}
```

## Validation

Validate:

- file size;
- extension;
- content type;
- file signature when possible;
- user permission;
- tenant ID;
- malware scanning for risky files.

Do not trust file name or content type blindly.

## Large File Upload

For large files, prefer direct upload to object storage:

```text
1. Client asks API for upload URL.
2. API validates request and creates metadata.
3. API returns short-lived upload URL.
4. Client uploads directly to storage.
5. Client confirms upload.
6. Worker scans/processes file.
```

Pre-signed upload response:

```json
{
  "fileId": "845704dc-e015-48ef-81d1-4c79d5d2c2ac",
  "uploadUrl": "https://storage.example.com/uploads/...",
  "expiresAt": "2026-05-03T12:30:00Z"
}
```

API shape:

```csharp
public sealed record CreateUploadRequest(
    string FileName,
    string ContentType,
    long SizeBytes);

public sealed record CreateUploadResponse(
    Guid FileId,
    string UploadUrl,
    DateTimeOffset ExpiresAt);
```

Endpoint:

```csharp
[HttpPost("files/upload-url")]
public async Task<ActionResult<CreateUploadResponse>> CreateUploadUrl(
    CreateUploadRequest request,
    CancellationToken ct)
{
    if (request.SizeBytes <= 0 || request.SizeBytes > 500 * 1024 * 1024)
    {
        return BadRequest("Invalid file size.");
    }

    var fileId = Guid.NewGuid();
    var safeName = Path.GetFileName(request.FileName);
    var storageKey = $"pending/{fileId:N}/{safeName}";
    var expiresAt = DateTimeOffset.UtcNow.AddMinutes(15);

    var uploadUrl = await _fileStorage.CreateUploadUrlAsync(
        storageKey,
        request.ContentType,
        expiresAt,
        ct);

    _dbContext.Files.Add(new FileMetadata
    {
        Id = fileId,
        OriginalFileName = safeName,
        StorageKey = storageKey,
        ContentType = request.ContentType,
        SizeBytes = request.SizeBytes,
        UploadedByUserId = User.FindFirst("sub")?.Value,
        ScanStatus = "UploadPending",
        CreatedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);

    return Ok(new CreateUploadResponse(fileId, uploadUrl, expiresAt));
}
```

## Download API

Option 1: API streams file.

```csharp
[HttpGet("files/{id:guid}/download")]
public async Task<IActionResult> Download(Guid id, CancellationToken ct)
{
    var file = await _fileService.GetForDownloadAsync(id, User, ct);
    return File(file.Stream, file.ContentType, file.FileName);
}
```

Service result:

```csharp
public sealed record DownloadFileResult(
    Stream Stream,
    string ContentType,
    string FileName);
```

Secure lookup:

```csharp
public async Task<DownloadFileResult> GetForDownloadAsync(
    Guid fileId,
    ClaimsPrincipal user,
    CancellationToken ct)
{
    var userId = user.FindFirst("sub")?.Value;

    var file = await _dbContext.Files
        .AsNoTracking()
        .SingleOrDefaultAsync(x => x.Id == fileId, ct);

    if (file is null)
    {
        throw new NotFoundException("File not found.");
    }

    if (file.UploadedByUserId != userId)
    {
        throw new ForbiddenException("You do not have access to this file.");
    }

    if (file.ScanStatus != "Clean")
    {
        throw new ConflictException("File is not available yet.");
    }

    var stream = await _fileStorage.OpenReadAsync(file.StorageKey, ct);

    return new DownloadFileResult(
        stream,
        file.ContentType,
        file.OriginalFileName);
}
```

Option 2: API returns pre-signed URL.

```json
{
  "downloadUrl": "https://storage.example.com/...",
  "expiresAt": "2026-04-28T12:00:00Z"
}
```

## Security

Important:

- authorize every download;
- avoid public buckets unless intended;
- avoid path traversal;
- sanitize file names;
- use random storage keys;
- scan files before making available;
- log access for sensitive files.

Path traversal risk:

```csharp
var path = Path.Combine(uploadRoot, file.FileName); // risky
```

If `file.FileName` contains `..\..\web.config`, it may escape the intended folder.

Safer:

```csharp
var safeOriginalName = Path.GetFileName(file.FileName);
var storageFileName = $"{Guid.NewGuid():N}{Path.GetExtension(safeOriginalName)}";
var path = Path.Combine(uploadRoot, storageFileName);
```

Still validate extensions and content. A safe file name does not prove the file is safe.

## Cleanup Job

Abandoned direct uploads should expire.

```csharp
public sealed class AbandonedUploadCleanupWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public AbandonedUploadCleanupWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();

            var cutoff = DateTimeOffset.UtcNow.AddHours(-24);

            var abandoned = await dbContext.Files
                .Where(x => x.ScanStatus == "UploadPending" && x.CreatedAt < cutoff)
                .Take(100)
                .ToListAsync(stoppingToken);

            foreach (var file in abandoned)
            {
                await storage.DeleteIfExistsAsync(file.StorageKey, stoppingToken);
                dbContext.Files.Remove(file);
            }

            await dbContext.SaveChangesAsync(stoppingToken);
        }
    }
}
```

## Review Questions

### How do you handle large file uploads?

> I prefer direct upload to object storage using short-lived pre-signed URLs, with metadata stored in the database and background scanning/processing.

### Why not load whole file into memory?

> Large files can exhaust memory and hurt API performance. Streaming or direct-to-storage upload is safer and more scalable.

### How do you secure downloads?

> Check authorization in the API, then either stream the file or return a short-lived signed download URL.

## Common Mistakes

- Trusting file extension.
- Public storage container by accident.
- Loading file fully into memory.
- No size limit.
- No authorization on download.
- No cleanup for abandoned uploads.

## Practice Task

Build:

1. small file upload endpoint;
2. file validation;
3. metadata table;
4. direct upload design;
5. secure download endpoint;
6. abandoned upload cleanup job.
