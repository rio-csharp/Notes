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

## Performance Strategies for Large Data

Export systems must handle datasets that exceed available memory on the application server. The following strategies combine to keep memory and latency predictable.

### Streaming

Write the export file incrementally as rows are read from the database. This keeps the working set proportional to a single page of rows rather than the total dataset.

Streaming avoids holding the whole export in memory, but the database still serves all the data. For very large exports, the query itself can be a bottleneck -- use keyset pagination in the worker to break the query into chunks.

For CSV exports, `StreamWriter` over a `FileStream` or `MemoryStream` works well. For Excel exports (`.xlsx`), use a streaming library like `ClosedXML` or `EPPlus` that supports writing rows without loading the entire workbook into memory. For PDF exports, use a paginated approach where each page is rendered and flushed individually.

### Pagination / Batching

Instead of one massive query, the worker fetches rows in pages (e.g., 10,000 rows at a time) using keyset pagination. Each page is written to the output file, then the next page is fetched. This keeps each individual query fast and prevents the database from holding a large result set in memory. The page size should be tuned based on row width: wider rows (many columns, large text fields) need smaller page sizes to keep per-query memory predictable.

### Read Replicas

Route export queries to a read replica to avoid impacting the primary database's transaction throughput. Since exports tolerate slightly stale data (seconds of lag are acceptable), a replica is a natural fit. Configure a dedicated connection string for export operations that points to the replica.

### Write Buffering

For exports writing to object storage (S3, Azure Blob), buffer writes to reduce the number of API calls. Instead of uploading one small chunk at a time, accumulate a buffer of rows (e.g., 1 MB or 10,000 rows) and flush it as a single block upload. Most object storage SDKs support block-level operations that allow composing the final file from multiple uploaded blocks.

### Pre-aggregated / Materialized Tables

For dashboards and scheduled reports that compute aggregations over millions of rows, precompute the results periodically into summary tables. The export worker reads from the summary table rather than scanning the raw fact table.

### Background Workers

Export generation moves to a background job. The API accepts the request and returns immediately; the job runs on a worker that can handle long-running, memory-intensive work without blocking the request pipeline.

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

## Scheduled Reports

For recurring exports (daily sales summary, weekly inventory report), a scheduler triggers export job creation on a cron schedule.

```csharp
public async Task GenerateScheduledReportsAsync(CancellationToken ct)
{
    var schedules = await _dbContext.ReportSchedules
        .Where(x => x.IsEnabled
            && x.NextRunAt <= DateTimeOffset.UtcNow)
        .ToListAsync(ct);

    foreach (var schedule in schedules)
    {
        var jobId = await _exportService.CreateExportJobAsync(
            schedule.ToRequest(), ct);

        schedule.LastRunAt = DateTimeOffset.UtcNow;
        schedule.NextRunAt = CalculateNextRun(schedule.CronExpression);
    }

    await _dbContext.SaveChangesAsync(ct);
}
```

Design considerations:
- Use row-level locking or status-based claiming to prevent multiple scheduler instances from creating duplicate jobs for the same schedule.
- For schedules that generate large reports, stagger the execution time rather than running all at midnight.
- Provide a way for users to preview the report before scheduling (subset of data, same format).

## Security

Exports can leak large volumes of sensitive data. Protect with:

- permission checks per report type;
- tenant and user filters (enforced on the server, not requested from the client);
- audit logs recording every export creation, download, and failure;
- download link expiration (short-lived signed URLs);
- masking sensitive fields (credit card numbers, PII) based on user role;
- rate limiting for export creation to prevent abuse.

## Audit

Export systems need thorough audit logs because a single export can contain thousands of customer records.

Track for each export:

- requesting user ID;
- tenant ID;
- report type and parameters;
- row count in the exported file;
- file size;
- file ID (for traceability);
- creation time;
- download time (each download);
- failure reason if the export failed.
