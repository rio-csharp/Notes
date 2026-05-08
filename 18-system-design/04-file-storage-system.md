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

The client requests an upload URL from the API, then uploads directly to object storage (AWS S3, Azure Blob, GCS) without the API server acting as a proxy.

#### Pre-signed URL Mechanism

A pre-signed URL embeds authentication credentials (typically a signature computed from the request parameters and a secret key) directly into the URL for a limited time. The object storage service verifies the signature before accepting the upload. This offloads the data transfer burden from the application server to the storage backend.

```text
Client -> API:      "I want to upload invoice.pdf (1 MB)"
API -> Client:      "Here is a URL valid for 15 minutes: https://storage.example/upload/..."
Client -> Storage:  PUT https://storage.example/upload/... (file data)
Client -> API:      "I have uploaded file f-123, please confirm."
```

#### Security Considerations

- **URL expiration**: short-lived URLs (5-15 minutes) limit the window for interception. Generate URLs just-in-time, not pre-stored.
- **Permission scoping**: the pre-signed URL should grant only the minimum permissions needed for the operation (upload only, no read or delete for other objects).
- **Content type and size enforcement**: the pre-signed URL can include conditions limiting allowed content type and maximum object size. Without these, a client could upload a different file than declared.
- **Path uniqueness**: the storage key should include a random component (e.g., `tenants/{tenantId}/files/{fileId}/{originalFileName}`) to prevent enumeration or overwrite attacks.

Pros:

- reduces API server load, especially for large files;
- object storage handles upload bandwidth, not the application;
- client can resume interrupted uploads using multipart APIs.

Cons:

- more complex client-server interaction;
- pre-signed URLs that expire too early cause user-facing upload failures;
- compromised pre-signed URLs allow unauthorized uploads within the validity window.

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

## Virus Scanning Workflow

Uploaded files must be scanned for malware before being made available to users. The scanning step is inserted between upload confirmation and final availability.

### Scanning Flow

```text
File confirmed (Status = Uploaded)
  -> Scan job queued
  -> Scanner downloads file
  -> Scans with antivirus engine (ClamAV, commercial scanner, cloud API)
  -> If clean:    Status = Available
  -> If infected: Status = Rejected, file deleted, admin alerted
```

### Key Design Decisions

1. **Scan before availability**: files should not be downloadable until the scan completes. The `Status` column gates access -- the download endpoint checks for `Status = Available`.
2. **Async scanning**: scanning can take seconds for large files. Use a background worker rather than blocking the upload confirmation response. The confirm endpoint returns immediately; the client polls or receives a callback when scanning finishes.
3. **Multiple engines**: for defense in depth, pass files through two scanning engines. This catches zero-day threats that one engine may miss.
4. **Scan timeout and quarantine**: if scanning times out or the engine crashes, move the file to a quarantine bucket for manual review rather than making it available automatically.

## Large Files

For files exceeding typical API payload limits (e.g., 100 MB+):

- **Multipart upload** (S3's `CreateMultipartUpload`, Azure Blob's `StageBlock`/`CommitBlockList`): the file is split into parts uploaded in parallel, each independently retryable. A failed part can be re-uploaded without restarting the entire file. After all parts are uploaded, a completion request assembles the final object. The maximum part count is typically 10,000, so the minimum part size is total-size / 10,000.
- **Resumable upload** (TUS protocol): track byte offset, resume from the last confirmed byte on failure. Useful for very large files over unreliable connections where the client runs for hours.
- **Chunked streaming** on the upload confirmation path: the API streams parts as they arrive without buffering the entire file.
- **Progress tracking** via WebSocket or polling: the upload endpoint emits progress updates so the UI can display a progress bar. For multipart uploads, each completed part advances the progress counter.
- **Background processing** that starts after the final part is confirmed: the confirmation event triggers the virus scan, thumbnail generation, or format conversion pipeline.

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

## Verification

Key aspects to verify:

1. upload request API;
2. file metadata table;
3. direct upload flow;
4. confirmation endpoint;
5. virus scanning worker;
6. download authorization;
7. abandoned upload cleanup.
