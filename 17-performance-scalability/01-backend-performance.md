# Backend Performance

## Core Idea

Backend performance is about reducing latency, increasing throughput, and keeping resource usage stable under load.

## Performance Goals

Performance work should start with a goal.

Examples:

```text
Order list API p95 latency <= 300 ms under 200 RPS.
Order creation API p95 latency <= 500 ms under 50 RPS.
Error rate <= 0.1%.
CPU average <= 70% during expected peak.
No SQL connection pool timeouts.
```

Without a goal, optimization becomes guesswork.

## Investigation Order

Use this order:

```text
1. Measure symptoms.
2. Locate where time is spent.
3. Identify the bottleneck.
4. Fix the largest bottleneck.
5. Re-test under similar conditions.
6. Keep the change only if metrics improve.
```

Good performance work is evidence-driven.

## Common Backend Bottlenecks

- slow database queries;
- missing indexes;
- N+1 queries;
- too much data loaded;
- synchronous blocking;
- external API latency;
- connection pool exhaustion;
- thread pool starvation;
- excessive allocations;
- GC pressure;
- inefficient serialization;
- chatty service calls;
- lock contention;
- cache stampede;
- unbounded concurrency.

## Latency vs Throughput

Latency:

```text
How long one request takes.
```

Throughput:

```text
How many requests are completed per unit of time.
```

You can increase throughput while hurting latency if you overload the system. This is why p95 and p99 latency matter.

## Metrics To Watch

API:

- request rate;
- p50/p95/p99 latency;
- error rate;
- status code distribution;
- request body size;
- response body size.

.NET runtime:

- CPU;
- memory;
- GC collections;
- allocation rate;
- thread pool queue length;
- thread count;
- exception rate.

Dependencies:

- SQL query duration;
- SQL connection pool usage;
- Redis latency;
- external HTTP latency;
- message broker publish/consume time.

## Tracing A Slow Request

Distributed tracing should show where time is spent.

Example:

```text
HTTP GET /api/orders?page=1
  total: 920 ms
  auth middleware: 12 ms
  permission Redis GET: 8 ms
  SQL query Orders: 780 ms
  JSON serialization: 80 ms
```

This points to SQL first, then payload/serialization.

## Async I/O

Use async APIs for I/O.

```csharp
public async Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct)
{
    return await _dbContext.Orders
        .AsNoTracking()
        .Where(o => o.Id == id)
        .Select(o => new OrderDto(o.Id, o.OrderNumber, o.Status.ToString()))
        .FirstOrDefaultAsync(ct);
}
```

Avoid blocking async work:

```csharp
var result = _client.GetDataAsync(ct).Result;
```

Use:

```csharp
var result = await _client.GetDataAsync(ct);
```

Blocking can cause thread pool starvation.

## Thread Pool Starvation

Symptoms:

- requests queue up;
- latency rises sharply;
- CPU may be low or moderate;
- many threads are blocked;
- thread pool queue length grows;
- `.Result`, `.Wait()`, `Thread.Sleep`, or sync I/O appears in request path.

Risky:

```csharp
public string GetReport()
{
    Thread.Sleep(500);
    return "done";
}
```

Better:

```csharp
public async Task<string> GetReportAsync(CancellationToken ct)
{
    await Task.Delay(500, ct);
    return "done";
}
```

`Task.Delay` does not block a thread while waiting.

## CPU-Bound Work

Async does not make CPU-heavy work cheaper.

Risky inside request:

```csharp
public IActionResult GeneratePdf(int orderId)
{
    var pdf = _pdfGenerator.GenerateLargePdf(orderId);
    return File(pdf, "application/pdf");
}
```

Better for large work:

```csharp
[HttpPost("{orderId:int}/pdf")]
public IActionResult RequestPdf(int orderId)
{
    BackgroundJob.Enqueue<IOrderPdfJob>(job =>
        job.GenerateAsync(orderId, CancellationToken.None));

    return Accepted();
}
```

Use background jobs when work is slow, CPU-heavy, or retryable.

## Allocation And GC Pressure

High allocation rate can increase GC frequency and latency.

Risky:

```csharp
public string BuildCsv(IEnumerable<OrderDto> orders)
{
    var csv = "";

    foreach (var order in orders)
    {
        csv += $"{order.Id},{order.Total}\n";
    }

    return csv;
}
```

Better:

```csharp
public string BuildCsv(IEnumerable<OrderDto> orders)
{
    var builder = new StringBuilder();

    foreach (var order in orders)
    {
        builder.Append(order.Id)
            .Append(',')
            .Append(order.Total)
            .AppendLine();
    }

    return builder.ToString();
}
```

For very large exports, stream instead of building everything in memory.

## Streaming Large Responses

```csharp
[HttpGet("export")]
public async Task ExportOrders(CancellationToken ct)
{
    Response.ContentType = "text/csv";
    await using var writer = new StreamWriter(Response.Body);

    await writer.WriteLineAsync("Id,OrderNumber,Total");

    await foreach (var order in _dbContext.Orders
        .AsNoTracking()
        .OrderBy(x => x.Id)
        .Select(x => new { x.Id, x.OrderNumber, x.TotalAmount })
        .AsAsyncEnumerable()
        .WithCancellation(ct))
    {
        await writer.WriteLineAsync($"{order.Id},{order.OrderNumber},{order.TotalAmount}");
    }
}
```

Streaming reduces peak memory usage.

## Caching

Use caching for expensive or frequently accessed data.

Levels:

- in-memory cache;
- distributed cache;
- CDN;
- browser cache;
- database read models.

In-memory cache:

```csharp
builder.Services.AddMemoryCache();
```

```csharp
public async Task<CategoryDto[]> GetCategoriesAsync(CancellationToken ct)
{
    return await _cache.GetOrCreateAsync("categories:v1", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30);

        return await _dbContext.Categories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name))
            .ToArrayAsync(ct);
    }) ?? [];
}
```

Cache only when:

- data is read frequently;
- data can tolerate staleness or invalidation is clear;
- cache hit rate is measurable;
- failure behavior is defined.

## Cache Stampede Protection

If many requests miss the same cache key, all may hit the database.

Single-process protection:

```csharp
private static readonly SemaphoreSlim CategoryLock = new(1, 1);

public async Task<CategoryDto[]> GetCategoriesSafeAsync(CancellationToken ct)
{
    if (_cache.TryGetValue("categories:v1", out CategoryDto[]? cached))
    {
        return cached;
    }

    await CategoryLock.WaitAsync(ct);

    try
    {
        if (_cache.TryGetValue("categories:v1", out cached))
        {
            return cached;
        }

        var categories = await LoadCategoriesAsync(ct);
        _cache.Set("categories:v1", categories, TimeSpan.FromMinutes(30));
        return categories;
    }
    finally
    {
        CategoryLock.Release();
    }
}
```

For multiple app instances, use distributed locking or request coalescing carefully.

## Pagination

Never return unbounded lists.

```csharp
public sealed record PageRequest(int Page, int PageSize)
{
    public int SafePage => Math.Max(Page, 1);
    public int SafePageSize => Math.Clamp(PageSize, 1, 100);
}
```

Offset pagination:

```csharp
var items = await query
    .OrderByDescending(x => x.CreatedAt)
    .Skip((page.SafePage - 1) * page.SafePageSize)
    .Take(page.SafePageSize)
    .ToListAsync(ct);
```

Keyset pagination for deep scrolling:

```csharp
var items = await _dbContext.Orders
    .AsNoTracking()
    .Where(x => x.CreatedAt < cursorCreatedAt)
    .OrderByDescending(x => x.CreatedAt)
    .Take(pageSize)
    .ToListAsync(ct);
```

Keyset pagination avoids scanning/skipping many rows for deep pages.

## Serialization And Payload Size

Avoid returning huge object graphs.

Risky:

```csharp
return Ok(await _dbContext.Customers
    .Include(c => c.Orders)
    .ThenInclude(o => o.Items)
    .ToListAsync(ct));
```

Better:

```csharp
return Ok(await _dbContext.Customers
    .AsNoTracking()
    .Select(c => new CustomerListItemDto
    {
        Id = c.Id,
        Name = c.Name,
        OrderCount = c.Orders.Count
    })
    .ToListAsync(ct));
```

API contracts should return the shape the client needs, not the entire entity graph.

## HTTP Client Performance

Use `IHttpClientFactory`.

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payment:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

Avoid creating many raw `HttpClient` instances manually:

```csharp
using var client = new HttpClient();
```

That can cause socket exhaustion in long-running services.

## External Calls

Use:

- timeouts;
- retries with backoff and jitter;
- circuit breaker;
- bulkhead;
- fallback where appropriate.

Do not retry everything.

Risky:

```text
POST /payments/charge fails
retry blindly
customer may be charged twice
```

Use idempotency keys for retryable commands.

```csharp
public sealed record ChargePaymentRequest(
    Guid IdempotencyKey,
    int OrderId,
    decimal Amount);
```

## Bounded Concurrency

Unbounded parallel work can overload dependencies.

Risky:

```csharp
await Task.WhenAll(orderIds.Select(id => ProcessOrderAsync(id, ct)));
```

Better:

```csharp
var options = new ParallelOptions
{
    MaxDegreeOfParallelism = 8,
    CancellationToken = ct
};

await Parallel.ForEachAsync(orderIds, options, async (orderId, token) =>
{
    await ProcessOrderAsync(orderId, token);
});
```

Limit concurrency based on dependency capacity.

## Horizontal Scaling

Horizontal scaling works best when services are stateless.

State that should not live only in one app instance:

- user sessions;
- background job state;
- SignalR connection routing without backplane;
- in-memory queues;
- local file uploads;
- cache values that must be shared.

Use:

- distributed cache;
- shared database;
- object storage;
- message broker;
- sticky sessions only when needed;
- managed SignalR/backplane for real-time.

## Practical Slow API Checklist

```text
Is p95/p99 high or only average high?
Is time spent in app code, DB, Redis, external HTTP, or serialization?
Are there N+1 queries?
Is the endpoint returning too much data?
Are async calls blocked?
Is thread pool queue length growing?
Is SQL connection pool exhausted?
Are retries amplifying dependency failures?
Is GC time or allocation rate high?
Did a recent deployment change latency?
```
