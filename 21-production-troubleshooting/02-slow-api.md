# Troubleshooting Slow APIs

## Core Idea

Slow API troubleshooting is about locating where time is spent and proving the bottleneck with evidence.

Do not start by rewriting code. Start by finding the slow segment.

## First Questions

Ask:

```text
Which endpoint is slow?
Since when?
All users or some users?
All regions or one region?
All tenants or specific tenants?
Recent deployment or configuration change?
Did error rate increase too?
Is p95 high or only average?
Is the issue constant or during traffic spikes?
```

Average latency can hide tail latency.

Example:

```text
p50 = 120ms
p95 = 8s
p99 = 30s
```

This means most users are fine, but a small percentage have very slow requests.

## Useful Metrics

API metrics:

- request count;
- p50/p95/p99 latency;
- error rate;
- status code distribution;
- request body size;
- response body size.

Runtime metrics:

- CPU;
- memory;
- GC collections;
- thread pool queue length;
- allocation rate;
- exception rate.

Dependency metrics:

- SQL duration;
- SQL timeout count;
- connection pool usage;
- Redis latency;
- external HTTP latency;
- retry count;
- queue depth.

## Trace-Based Investigation

A trace should show where time is spent:

```text
GET /api/orders?page=1              6.8s
  Authentication                    12ms
  Authorization                     18ms
  SQL SELECT Orders                 6.2s
  JSON serialization                300ms
  Response write                    80ms
```

This points to SQL first, then serialization.

Another trace:

```text
POST /api/payments                  12.1s
  Validate request                  3ms
  SQL SELECT Order                  40ms
  HTTP payment-provider/charge      10.0s
  Retry payment-provider/charge     2.0s
```

This points to external dependency latency and retry behavior.

## Add Timing Logs Carefully

Structured timing logs can help when traces are missing.

```csharp
public sealed class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(
        RequestDelegate next,
        ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();

        try
        {
            await _next(context);
        }
        finally
        {
            var elapsed = Stopwatch.GetElapsedTime(started);

            _logger.LogInformation(
                "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs} ms",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                elapsed.TotalMilliseconds);
        }
    }
}
```

Avoid logging request bodies or secrets.

## Slow SQL Query

(This section overlaps with the performance methodology in Chapter 17, "Backend Performance" and "Database Performance". The troubleshooting here focuses on investigation patterns; the performance chapters focus on optimization techniques and execution plan analysis.)

Symptoms:

- traces show long SQL spans;
- database CPU is high;
- query reads many rows;
- large tenants are slower;
- p95/p99 high under load.

Common reasons:

- missing index;
- non-SARGable predicate;
- N+1 query;
- loading too many columns;
- offset pagination on large tables;
- stale statistics;
- parameter sniffing;
- blocking or deadlocks.

Non-SARGable example:

```sql
SELECT *
FROM Orders
WHERE YEAR(CreatedAt) = 2026;
```

Better:

```sql
SELECT *
FROM Orders
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01';
```

## EF Core Query Shape

Risky query:

```csharp
var orders = await _db.Orders
    .Include(o => o.Items)
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

Problems:

- no filter;
- no pagination;
- loads full entities;
- can create large object graphs.

Better projection:

```csharp
var orders = await _db.Orders
    .AsNoTracking()
    .Where(o => o.TenantId == tenantId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        Status = o.Status,
        ItemCount = o.Items.Count,
        CreatedAt = o.CreatedAt
    })
    .Take(50)
    .ToListAsync(ct);
```

Use `AsNoTracking` for read-only queries to reduce tracking overhead.

## N+1 Queries

N+1 example:

```csharp
var orders = await _db.Orders
    .Where(o => o.TenantId == tenantId)
    .Take(50)
    .ToListAsync(ct);

foreach (var order in orders)
{
    var itemCount = await _db.OrderItems
        .CountAsync(i => i.OrderId == order.Id, ct);

    order.SetItemCount(itemCount);
}
```

This creates 1 query for orders plus 50 queries for item counts.

Better:

```csharp
var orders = await _db.Orders
    .Where(o => o.TenantId == tenantId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        ItemCount = o.Items.Count
    })
    .Take(50)
    .ToListAsync(ct);
```

## Lock Contention

Symptoms:

- query is usually fast but sometimes times out;
- database CPU may not be high;
- wait type shows locks;
- one long transaction blocks many requests.

SQL Server blocking query:

```sql
SELECT
    r.session_id,
    r.blocking_session_id,
    r.wait_type,
    r.wait_time,
    r.status,
    t.text AS sql_text
FROM sys.dm_exec_requests AS r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) AS t
WHERE r.blocking_session_id <> 0;
```

Understanding the wait type is critical because it determines the right mitigation. Common blocking wait types include `LCK_M_*` (lock waits from contention), `PAGELATCH_*` (internal page latch contention, often from concurrent inserts on the same index page), and `WRITELOG` (waiting for the transaction log to flush). Each requires a different approach: lock waits need index or query changes, page latch contention may need index partitioning or sequential key design, and log waits need storage performance improvements.

Mitigation:

- identify blocker and its wait type;
- understand what the blocker is doing;
- avoid killing sessions blindly;
- reduce transaction duration;
- add proper indexes to reduce lock duration;
- process large updates in batches;
- use appropriate isolation strategy (read committed snapshot isolation reduces read-write blocking).

## Connection Pool Exhaustion

Symptoms:

- requests wait before SQL execution;
- errors mention timeout while obtaining connection;
- database may not be overloaded;
- many long-running queries hold connections;
- connections are not disposed.

Bad:

```csharp
public async Task<List<Order>> GetOrdersAsync()
{
    var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync();

    // Connection is never disposed if an exception happens.
    return await connection.QueryAsync<Order>("SELECT * FROM Orders");
}
```

Better:

```csharp
public async Task<IReadOnlyList<Order>> GetOrdersAsync(CancellationToken ct)
{
    await using var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync(ct);

    var orders = await connection.QueryAsync<Order>(
        new CommandDefinition(
            "SELECT TOP (50) * FROM Orders ORDER BY CreatedAt DESC",
            cancellationToken: ct));

    return orders.AsList();
}
```

Always dispose connections.

## Thread Pool Starvation

(For a deeper explanation of thread pool starvation mechanism, hill-climbing, and mitigation patterns, see Chapter 17, "Backend Performance".)

Symptoms:

- CPU may be low or moderate;
- requests queue up;
- latency increases broadly;
- thread pool queue length grows;
- code blocks on async work.

Bad:

```csharp
public IActionResult Get()
{
    var result = _externalClient.GetDataAsync().Result;
    return Ok(result);
}
```

Better:

```csharp
public async Task<IActionResult> Get(CancellationToken ct)
{
    var result = await _externalClient.GetDataAsync(ct);
    return Ok(result);
}
```

Avoid `.Result`, `.Wait()`, and blocking sleeps in request paths.

**Why this causes starvation:** When `await` is used, the method returns its thread pool thread to the pool while the async operation is in flight, allowing that thread to serve other requests. When `.Result` or `.Wait()` is used, the calling thread is blocked. If the async operation needs to resume on the thread pool (which is the default behavior for `Task` continuations in ASP.NET Core's `SynchronizationContext`), it cannot proceed because all available threads are blocked. The thread pool must then inject additional threads to handle the backlog, but thread injection is slow (roughly one new thread per second). During this window, requests queue up and latency spikes.

## External Dependency Slowdown

Symptoms:

- traces show slow HTTP dependency spans;
- retries multiply latency;
- provider status page shows issues;
- timeout settings are too high;
- many requests wait on same provider.

Use `HttpClientFactory` with timeouts and resilience:

```csharp
builder.Services.AddHttpClient<PaymentClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payment:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

Pass cancellation tokens:

```csharp
public async Task<PaymentResult> ChargeAsync(
    PaymentRequest request,
    CancellationToken ct)
{
    using var response = await _httpClient.PostAsJsonAsync(
        "/charges",
        request,
        ct);

    if (!response.IsSuccessStatusCode)
    {
        return PaymentResult.Failed(response.StatusCode.ToString());
    }

    return PaymentResult.Succeeded();
}
```

Retries should be bounded and should not retry non-idempotent operations unless idempotency keys are used.

## Large Payloads

Symptoms:

- SQL is not very slow;
- serialization span is large;
- response size is huge;
- browser receives data slowly;
- memory allocation spikes.

Bad:

```csharp
return await _db.Orders
    .Include(o => o.Items)
    .ThenInclude(i => i.Product)
    .ToListAsync(ct);
```

Better:

```csharp
return await _db.Orders
    .AsNoTracking()
    .Where(o => o.TenantId == tenantId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderSummaryDto
    {
        Id = o.Id,
        Status = o.Status,
        CreatedAt = o.CreatedAt,
        Total = o.Total
    })
    .Take(50)
    .ToListAsync(ct);
```

Use pagination and DTO projection.

## Cache Problems

Cache outage or cache stampede can slow APIs. (For cache stampede protection, in-memory cache internals, and distributed cache patterns, see Chapter 17, "Backend Performance".)

Cache stampede:

```text
Popular cache key expires.
Many requests miss at the same time.
All requests query database.
Database becomes slow.
API latency increases.
```

Mitigations:

- randomized expiration jitter;
- single-flight locking;
- stale-while-revalidate;
- rate limiting expensive rebuilds;
- protect database fallback.

Simple jitter:

```csharp
var baseTtl = TimeSpan.FromMinutes(10);
var jitterSeconds = Random.Shared.Next(0, 60);
var ttl = baseTtl.Add(TimeSpan.FromSeconds(jitterSeconds));

await cache.SetStringAsync(key, json, new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = ttl
}, ct);
```

## Investigation Checklist

```text
1. Confirm endpoint, start time, and severity.
2. Compare p50, p95, and p99 latency.
3. Check error rate and status codes.
4. Inspect traces for slow spans.
5. Check recent deployments/config/migrations.
6. Check database query duration, plans, locks, and connection pool.
7. Check external dependency latency and retries.
8. Check CPU, memory, GC, and thread pool.
9. Check payload size and serialization time.
10. Mitigate based on evidence.
11. Verify recovery with metrics.
12. Create prevention actions.
```

## Mitigation Options

Depending on cause:

- rollback recent deployment;
- disable feature flag;
- add or adjust cache carefully;
- scale out if CPU-bound and stateless;
- kill blocking query carefully;
- pause heavy background jobs;
- reduce request fan-out;
- lower timeout for failing dependency;
- add index after validation;
- use pagination or reduce payload.

Do not increase timeout blindly. Longer timeout can make saturation worse.
