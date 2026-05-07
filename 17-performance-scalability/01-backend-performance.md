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

Latency measures how long a single request takes from submission to completion. Throughput measures how many requests the system completes per unit of time.

These two dimensions interact through Little's Law: `L = lambda * W` (concurrency equals arrival rate times latency). When a system is driven past its saturation point, request queues grow inside the server. Every new request must wait for queued requests ahead of it, so observed latency rises even though the actual service time per request remains unchanged. This means throughput can appear to increase while latency degrades sharply, because the system is accepting work faster than it can complete it and requests are piling up.

This is why tail latency metrics -- p95 and p99 -- matter more than averages. A rising p95 or p99 signals queue buildup well before average latency becomes concerning, giving operations teams an early warning that the system is approaching saturation.

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

Thread pool starvation occurs when the thread pool has no available threads to schedule new work, even though the machine has CPU capacity to spare.

### Mechanism

When ASP.NET Core receives an HTTP request, it dispatches the request to a thread pool thread. If that thread calls `.Result` or `.Wait()` on an incomplete `Task`, the calling thread blocks synchronously, waiting for the operation to complete. While blocked, that thread cannot process other requests.

The thread pool's hill-climbing algorithm attempts to compensate by injecting additional threads, but the injection rate is deliberately slow -- typically one new thread every 500 milliseconds to 2 seconds. Under a sudden burst of blocking calls, requests accumulate in the queue far faster than new threads can be added, causing latency to spike even while CPU utilization remains moderate.

### Symptoms

- requests queue up;
- latency rises sharply;
- CPU may be low or moderate;
- many threads are blocked;
- thread pool queue length grows;
- `.Result`, `.Wait()`, `Thread.Sleep`, or synchronous I/O appears in the request path.

### Risky Pattern

```csharp
public string GetReport()
{
    Thread.Sleep(500);        // blocks the calling thread for 500 ms
    return "done";
}
```

In an async controller action, the thread is freed during `await`. A synchronous sleep or blocking call prevents that:

```csharp
public async Task<string> GetReportAsync(CancellationToken ct)
{
    await Task.Delay(500, ct); // does not block any thread
    return "done";
}
```

`Task.Delay` returns a task that completes after a timer fires, leaving the calling thread free to process other requests. The same principle applies to I/O: use `await` with async APIs rather than `.Result`.

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

### Mechanism

The .NET garbage collector uses a generational model: objects are allocated in Gen 0 (small, short-lived), promoted to Gen 1 if they survive a collection, and then to Gen 2 (long-lived). Large objects (85,000+ bytes) go directly to the Large Object Heap (LOH), which is collected only during Gen 2 collections.

The GC triggers a collection when a generation's allocation budget is exhausted. Higher allocation rates cause more frequent collections. Gen 0 collections are cheap and fast (sub-millisecond), but frequent Gen 1 and especially Gen 2 collections introduce noticeable application pauses because the runtime must suspend managed threads to compact reachable objects.

High allocation rate also increases CPU usage from the collection work itself. In server GC mode (the default for ASP.NET Core), each logical processor gets its own heap and collection thread, so allocations scale well -- but every object still must be collected eventually.

### Risky Pattern: String Concatenation

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

Each `+=` creates a new string and abandons the old one, generating N allocations for N iterations.

### Better: StringBuilder

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

`StringBuilder` maintains an internal buffer segment, reducing allocations to O(log N) buffer expansions instead of O(N) strings.

### For Large Data Sets: Stream

For very large exports, stream the output instead of building everything in memory. Streaming keeps the working set proportional to the page size rather than the total data size, avoiding both high allocation rate and LOH pressure.

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

Use caching for expensive or frequently accessed data to reduce latency and protect downstream resources.

### Cache Levels

- **In-memory cache** (`IMemoryCache`): fastest, local to a single process, lost on restart.
- **Distributed cache** (`IDistributedCache` with Redis, SQL Server): shared across processes, survives restarts, adds network round-trip.
- **CDN**: caches static or semi-static responses at edge locations for geographic latency reduction.
- **Browser cache**: reduces repeat requests for the same resource via `Cache-Control` headers.
- **Database read models**: precomputed or denormalized tables that serve query-heavy workloads without joins or aggregations.

### In-memory Cache Internals

`IMemoryCache` is backed by `MemoryCache`, which uses a dictionary of `CacheEntry` objects with expiration tracking. Entries can be evicted based on:

- **Absolute expiration**: entry expires at a fixed time.
- **Sliding expiration**: entry expires after a period of inactivity; each access resets the timer.
- **Size limit**: total cache size can be bounded; entries near the limit are evicted via a least-frequently-used policy.
- **Expiration tokens**: entries can be tied to external signals (file change, database notification) for proactive invalidation.
- **Callback on eviction**: a registered delegate fires when an entry is removed, useful for cleanup or logging.

```csharp
builder.Services.AddMemoryCache();
```

```csharp
public async Task<CategoryDto[]> GetCategoriesAsync(CancellationToken ct)
{
    return await _cache.GetOrCreateAsync("categories:v1", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30);
        entry.SlidingExpiration = TimeSpan.FromMinutes(5);

        return await _dbContext.Categories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name))
            .ToArrayAsync(ct);
    }) ?? [];
}
```

`GetOrCreateAsync` performs an atomic check-and-set: if the key exists, the factory is not called. This avoids redundant database queries from concurrent cache misses within the same process.

### When to Cache

- data is read frequently;
- data can tolerate staleness or invalidation is clear;
- cache hit rate is measurable and high enough to justify complexity;
- failure behavior is defined (what happens when cache is unavailable).

## Cache Stampede Protection

A cache stampede occurs when a cache entry expires and multiple concurrent requests all miss simultaneously. Each request attempts to regenerate the expensive value, creating a thundering-herd problem that can overload the database or upstream service.

### Single-Process Protection

The pattern is a double-checked lock: on cache miss, acquire a local semaphore, then check the cache again before regenerating. The second check prevents redundant work when multiple requests arrive at the same time.

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
        // Double-check: another thread may have populated the cache
        // while this thread was waiting for the lock.
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

A subtle timing risk remains: cache entries may be set with an absolute expiration, causing all instances to expire at nearly the same moment. Using sliding expiration or adding a random jitter to the expiration time spreads the renewal load across a wider window.

### Multi-Instance Protection

When multiple application instances share a cache, a local semaphore protects only within one process. For cross-instance stampede protection, options include:

- **Distributed locking** (Redis `RedLock`, `SET NX`): one instance wins the lock and regenerates; others wait or serve stale data.
- **Request coalescing** with a distributed semaphore (e.g., Redis `SemaphoreSlim` pattern).
- **Early expiration** (probabilistic early recomputation): cache entries are refreshed before they actually expire when the remaining TTL falls below a computed threshold based on request rate.

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

External dependencies (payment gateways, third-party APIs, databases) introduce latency, availability, and correctness risks. The following patterns, collectively known as resilience engineering, mitigate these risks.

### Timeouts

Every external call must have a timeout. Without one, a slow dependency can hold a thread indefinitely, leading to thread pool starvation and cascading latency.

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

### Retries with Backoff and Jitter

Retries compensate for transient failures (network hiccups, provider throttling). Exponential backoff prevents the retry storm from amplifying load on an already-strained dependency. Jitter prevents synchronized retry waves when many clients observe the same failure simultaneously.

```text
Try 1: wait 100 ms
Try 2: wait 400 ms + random(0..200)
Try 3: wait 900 ms + random(0..400)
```

Use a library such as Polly for configurable retry policies. .NET 8+ includes built-in resilience via `Microsoft.Extensions.Http.Resilience`.

### Circuit Breaker

A circuit breaker monitors failure rates and stops sending requests when the failure rate exceeds a threshold. After a cooldown period, it allows a probe request; if it succeeds, the circuit closes again. This protects the caller from wasting resources on a failing dependency and gives the dependency time to recover.

States: **Closed** (normal operation) -> **Open** (requests fail fast) -> **Half-Open** (probing for recovery).

### Bulkhead

A bulkhead isolates resources by allocating a fixed number of concurrent slots to each dependency. If one dependency saturates its slots, other dependencies remain unaffected. This prevents a single failing or slow dependency from exhausting the entire thread pool.

### Fallback

When all retries are exhausted, a fallback provides a degraded response -- serving cached data, returning a default value, or redirecting to a secondary provider.

### Idempotency for Safe Retries

Do not retry everything uniformly. Non-idempotent retries can cause data corruption.

```text
POST /payments/charge fails
retry blindly -> customer may be charged twice
```

Use idempotency keys to make retries safe. The server detects the duplicate key and returns the previous result instead of executing the operation again.

```csharp
public sealed record ChargePaymentRequest(
    Guid IdempotencyKey,
    int OrderId,
    decimal Amount);
```

### When to Apply

| Pattern | Applies To |
|---|---|
| Timeout | every external call |
| Retry | transient-safe, idempotent operations |
| Circuit breaker | dependencies with failure modes |
| Bulkhead | multiple dependencies, high concurrency |
| Fallback | read operations, degraded-mode acceptable |

## Bounded Concurrency

Unbounded parallel work can overload downstream dependencies. When a service fans out N parallel calls without limiting concurrency, the dependency receives N simultaneous requests. If N is large enough, the dependency's connection pool, thread pool, or database can become saturated, causing timeouts and cascading failures.

### The Risk

```csharp
// Creates N simultaneous tasks with no concurrency limit.
// If N is 5,000, the downstream system receives 5,000 concurrent calls.
await Task.WhenAll(orderIds.Select(id => ProcessOrderAsync(id, ct)));
```

### Bounded Approaches

**Parallel.ForEachAsync** limits concurrency via `MaxDegreeOfParallelism`. The runtime internally throttles task creation so that at most M tasks are in flight simultaneously.

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

**SemaphoreSlim** for more control over concurrent access to a shared resource:

```csharp
private readonly SemaphoreSlim _throttle = new(8, 8);

public async Task ProcessOrdersAsync(IEnumerable<int> orderIds, CancellationToken ct)
{
    var tasks = orderIds.Select(async orderId =>
    {
        await _throttle.WaitAsync(ct);
        try
        {
            await ProcessOrderAsync(orderId, ct);
        }
        finally
        {
            _throttle.Release();
        }
    });

    await Task.WhenAll(tasks);
}
```

**Channel-based producer-consumer** for backpressure-aware processing. A `Channel<T>` acts as a bounded queue: the producer blocks when the channel is full, naturally applying backpressure to the caller.

```csharp
var channel = Channel.CreateBounded<(int OrderId, CancellationToken Token)>(
    new BoundedChannelOptions(8) { FullMode = BoundedChannelFullMode.Wait });

// Consumer: processes items at bounded concurrency
var consumer = Task.Run(async () =>
{
    await foreach (var item in channel.Reader.ReadAllAsync(ct))
    {
        await ProcessOrderAsync(item.OrderId, item.Token);
    }
});

// Producer: feeds items, blocks when channel is full
foreach (var id in orderIds)
{
    await channel.Writer.WriteAsync((id, ct));
}
channel.Writer.Complete();
await consumer;
```

The appropriate concurrency limit depends on the downstream dependency's capacity. Measure the dependency's p95 latency and error rate under increasing concurrency to find the saturation point, then set the limit well below it.

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
