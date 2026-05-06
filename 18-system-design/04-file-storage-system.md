# File Storage System Design

## Problem

Design a file upload and storage system for documents, images, and exports.

## Requirements

Functional:

- upload files;
- download files;
- store metadata;
- support large files;
- validate file type and size;
- control access by user/tenant;
- scan files for malware;
- generate preview or thumbnails.

Non-functional:

- scalable storage;
- secure access;
- durable files;
- low API server memory usage;
- auditability;
- cost control.

## High-level Architecture

```text
Client
  -> API: create upload request
  -> Object Storage: upload file
  -> API: confirm upload
  -> Database: file metadata
  -> Queue: scan/process file
  -> Worker: virus scan / thumbnail / preview
```

## Direct Upload vs API Proxy Upload

### API Proxy Upload

Client uploads file to API, API streams to storage.

Pros:

- API controls everything;
- simpler client.

Cons:

- API handles large traffic;
- more memory/bandwidth pressure;
- harder to scale.

### Direct Upload With Pre-signed URL

Client asks API for upload URL, then uploads directly to object storage.

Pros:

- reduces API load;
- better for large files;
- object storage handles upload.

Cons:

- more complex flow;
- must carefully control URL expiration and permissions.

## API Design

Create upload:

```http
POST /api/files/upload-requests

{
  "fileName": "invoice.pdf",
  "contentType": "application/pdf",
  "size": 1048576
}
```

Response:

```json
{
  "fileId": "f-123",
  "uploadUrl": "https://storage.example/upload/...",
  "expiresAt": "2026-04-28T12:00:00Z"
}
```

Confirm:

```http
POST /api/files/f-123/confirm
```

Download:

```http
GET /api/files/f-123/download-url
```

## Metadata Table

```sql
CREATE TABLE Files
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    OwnerUserId INT NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    ContentType NVARCHAR(100) NOT NULL,
    SizeBytes BIGINT NOT NULL,
    StorageKey NVARCHAR(500) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    ConfirmedAt DATETIMEOFFSET NULL,
    ScannedAt DATETIMEOFFSET NULL
);
```

Add a unique storage key and status indexes:

```sql
CREATE UNIQUE INDEX UX_Files_StorageKey
ON Files (StorageKey);

CREATE INDEX IX_Files_Tenant_Status_CreatedAt
ON Files (TenantId, Status, CreatedAt DESC);
```

Statuses:

```text
PendingUpload
Uploaded
Scanning
Available
Rejected
Deleted
```

## Security

Validate:

- file size;
- content type;
- file extension;
- actual file signature where possible;
- tenant access;
- owner permissions.

Do not:

- trust client-provided content type blindly;
- make storage container public by default;
- expose raw internal storage keys unnecessarily;
- allow path traversal in file names.

## Large Files

For large files:

- multipart upload;
- resumable upload;
- chunking;
- progress tracking;
- background processing.

## Upload Request Flow

```csharp
public async Task<CreateUploadResponse> CreateUploadAsync(
    CreateUploadRequest request,
    CurrentUser user,
    CancellationToken ct)
{
    ValidateFile(request);

    var fileId = Guid.NewGuid();
    var storageKey = $"tenants/{user.TenantId}/files/{fileId}/{request.FileName}";

    _dbContext.Files.Add(new FileRecord
    {
        Id = fileId,
        TenantId = user.TenantId,
        OwnerUserId = user.UserId,
        FileName = request.FileName,
        ContentType = request.ContentType,
        SizeBytes = request.SizeBytes,
        StorageKey = storageKey,
        Status = "PendingUpload",
        CreatedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);

    var uploadUrl = await _objectStorage.CreateUploadUrlAsync(
        storageKey,
        request.ContentType,
        TimeSpan.FromMinutes(15),
        ct);

    return new CreateUploadResponse(fileId, uploadUrl);
}
```

## Confirmation Flow

```text
1. Client uploads to object storage.
2. Client calls confirm endpoint.
3. API checks object exists and size matches metadata.
4. Status becomes Uploaded.
5. Scan job is queued.
6. File becomes Available only after scan passes.
```

## Abandoned Upload Cleanup

```sql
SELECT *
FROM Files
WHERE Status = 'PendingUpload'
  AND CreatedAt < DATEADD(hour, -2, SYSUTCDATETIME());
```

Cleanup worker:

```csharp
public async Task CleanupAbandonedUploadsAsync(CancellationToken ct)
{
    var cutoff = DateTimeOffset.UtcNow.AddHours(-2);

    var files = await _dbContext.Files
        .Where(x => x.Status == "PendingUpload" && x.CreatedAt < cutoff)
        .Take(100)
        .ToListAsync(ct);

    foreach (var file in files)
    {
        file.Status = "Deleted";
        await _objectStorage.DeleteIfExistsAsync(file.StorageKey, ct);
    }

    await _dbContext.SaveChangesAsync(ct);
}
```

## CDN And Downloads

For public or semi-public downloads:

```text
API authorizes user
  -> returns short-lived signed CDN/object-storage URL
```

For sensitive files:

```text
API authorizes user
  -> streams file
  -> logs access
```

Streaming gives more control but increases API bandwidth cost.

## Practice Task

Design:

1. upload request API;
2. file metadata table;
3. direct upload flow;
4. confirmation endpoint;
5. virus scanning worker;
6. download authorization;
7. abandoned upload cleanup.
