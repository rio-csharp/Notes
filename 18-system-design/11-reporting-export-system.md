# Reporting And Export System Design

## Problem

Design a reporting/export system for dashboards and large CSV/Excel/PDF exports.

## Requirements

Functional:

- dashboard metrics;
- filtered reports;
- export CSV/Excel/PDF;
- scheduled reports;
- permission-aware data.

Non-functional:

- large data support;
- does not block API;
- secure downloads;
- audit exports;
- predictable performance.

## Small Export

For small datasets:

```http
GET /api/orders/export?status=Paid
```

Can return CSV directly if fast.

## Large Export

Use async job:

```text
1. User requests export.
2. API creates export job.
3. Worker generates file.
4. File stored in object storage.
5. User gets notification/download link.
```

## Export Job Creation

```csharp
public async Task<Guid> CreateExportJobAsync(
    CreateExportJobRequest request,
    CurrentUser user,
    CancellationToken ct)
{
    var job = new ExportJob
    {
        Id = Guid.NewGuid(),
        TenantId = user.TenantId,
        RequestedByUserId = user.UserId,
        Type = request.Type,
        Status = "Queued",
        ParametersJson = JsonSerializer.Serialize(request.Parameters),
        CreatedAt = DateTimeOffset.UtcNow
    };

    _dbContext.ExportJobs.Add(job);
    await _dbContext.SaveChangesAsync(ct);

    BackgroundJob.Enqueue<IReportExportJob>(x =>
        x.RunAsync(job.Id, CancellationToken.None));

    return job.Id;
}
```

## API Design

Create job:

```http
POST /api/reports/order-export-jobs
```

Response:

```json
{
  "jobId": "job-123",
  "status": "Queued"
}
```

Check status:

```http
GET /api/reports/export-jobs/job-123
```

## Data Model

```sql
CREATE TABLE ExportJobs
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    RequestedByUserId INT NOT NULL,
    Type NVARCHAR(100) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    ParametersJson NVARCHAR(MAX) NOT NULL,
    FileId UNIQUEIDENTIFIER NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    CompletedAt DATETIMEOFFSET NULL
);
```

## Performance

Use:

- streaming;
- pagination/batching;
- read replicas;
- pre-aggregated tables;
- background workers;
- file storage.

## Streaming CSV

```csharp
public async Task ExportOrdersCsvAsync(
    Stream output,
    OrderExportFilter filter,
    CancellationToken ct)
{
    await using var writer = new StreamWriter(output, leaveOpen: true);
    await writer.WriteLineAsync("Id,OrderNumber,Status,TotalAmount");

    await foreach (var row in _dbContext.Orders
        .AsNoTracking()
        .Where(x => x.TenantId == filter.TenantId && x.Status == filter.Status)
        .OrderBy(x => x.Id)
        .Select(x => new { x.Id, x.OrderNumber, x.Status, x.TotalAmount })
        .AsAsyncEnumerable()
        .WithCancellation(ct))
    {
        await writer.WriteLineAsync(
            $"{row.Id},{row.OrderNumber},{row.Status},{row.TotalAmount}");
    }
}
```

Streaming avoids holding the whole export in memory.

## Job Statuses

```text
Queued
Running
Succeeded
Failed
Expired
Cancelled
```

Failed jobs should store an error summary, not a giant exception dump with sensitive data.

Avoid:

- loading millions of rows into memory;
- exporting in request thread;
- no permission filter.

## Security

Exports can leak lots of data.

Protect with:

- permission checks;
- tenant filters;
- audit logs;
- expiration on download links;
- masking sensitive fields where needed.

## Audit

Export systems need audit logs because exports can contain large amounts of data.

Track:

- user ID;
- tenant ID;
- report type;
- filters;
- row count;
- file ID;
- created time;
- download time.
