# Troubleshooting High CPU And Memory

## Core Idea

High CPU and memory issues require separating workload, application code, .NET runtime behavior, and infrastructure limits.

- `OOMKilled`: container exceeded memory limit and was killed.

High CPU and high memory often affect each other:

```text
High allocation rate
  -> frequent garbage collection
  -> more CPU spent in GC
  -> higher latency
  -> more concurrent requests
  -> even more memory pressure
```

## First Questions

Ask:

```text
When did CPU or memory increase?
Was there a deployment or config change?
Did traffic increase?
Is the issue on all instances or one instance?
Is latency also high?
Did error rate increase?
Are restarts happening?
Is this inside a container with memory limits?
```

One bad instance can indicate data-specific or instance-specific problems. All instances rising together often points to traffic, deployment, shared dependency, or global workload.

## High CPU Patterns

Common:

- expensive loops;
- inefficient serialization;
- high request traffic;
- regex backtracking;
- excessive logging;
- compression/encryption;
- JSON processing;
- thread contention;
- retry storm;
- busy waiting;
- inefficient database result processing;
- too much GC activity.

Bad CPU loop:

```csharp
while (!token.IsCancellationRequested)
{
    var job = queue.TryTake();

    if (job is not null)
    {
        await ProcessAsync(job, token);
    }
}
```

This spins constantly when no work exists.

Better:

```csharp
while (!token.IsCancellationRequested)
{
    var job = await queue.TakeAsync(token);
    await ProcessAsync(job, token);
}
```

Or add a delay when polling:

```csharp
while (!token.IsCancellationRequested)
{
    var job = await TryGetJobAsync(token);

    if (job is null)
    {
        await Task.Delay(TimeSpan.FromSeconds(1), token);
        continue;
    }

    await ProcessAsync(job, token);
}
```

## High Memory Patterns

Common:

- memory leak;
- unbounded cache;
- loading huge result sets;
- large object allocations;
- buffering large files;
- static collections;
- event subscription leaks;
- too many queued background jobs;
- not disposing streams;
- high-cardinality logging scopes;
- retaining request objects after request completion.

Bad unbounded cache:

```csharp
private static readonly Dictionary<string, string> Cache = new();

public string GetValue(string key)
{
    if (Cache.TryGetValue(key, out var value))
    {
        return value;
    }

    value = LoadExpensiveValue(key);
    Cache[key] = value;
    return value;
}
```

Better with size and expiration:

```csharp
builder.Services.AddMemoryCache(options =>
{
    options.SizeLimit = 10_000;
});
```

```csharp
public sealed class ProductCache
{
    private readonly IMemoryCache _cache;

    public ProductCache(IMemoryCache cache)
    {
        _cache = cache;
    }

    public Task<ProductDto> GetAsync(string sku, CancellationToken ct)
    {
        return _cache.GetOrCreateAsync($"product:{sku}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            entry.Size = 1;

            return await LoadProductAsync(sku, ct);
        })!;
    }
}
```

## Useful .NET Tools

Install diagnostic tools:

```powershell
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-dump
dotnet tool install --global dotnet-gcdump
dotnet tool install --global dotnet-trace
```

List processes:

```powershell
dotnet-counters ps
```

Monitor counters:

```powershell
dotnet-counters monitor --process-id 1234 --counters System.Runtime,Microsoft.AspNetCore.Hosting
```

Note: in newer versions of `dotnet-counters`, provider names must be passed with the `--counters` flag as comma-separated values rather than space-separated positional arguments.

Collect memory dump:

```powershell
dotnet-dump collect --process-id 1234 --output app.dmp
```

Collect GC dump:

```powershell
dotnet-gcdump collect --process-id 1234 --output app.gcdump
```

Collect CPU trace:

```powershell
dotnet-trace collect --process-id 1234 --duration 00:00:30 --output cpu.nettrace
```

Tools such as Visual Studio, PerfView, and `dotnet-dump analyze` can inspect these files.

## Key Runtime Counters

Useful runtime counters:

```text
cpu-usage
working-set
gc-heap-size
gen-0-gc-count
gen-1-gc-count
gen-2-gc-count
loh-size
allocation-rate
threadpool-thread-count
threadpool-queue-length
monitor-lock-contention-count
exception-count
```

Interpretation examples:

```text
High CPU + high allocation-rate + frequent Gen 2 GC
  -> allocation/GC pressure.

High latency + low CPU + high threadpool-queue-length
  -> thread pool starvation or blocking work.

Memory rising steadily + few drops after GC
  -> possible retained objects or leak.

Memory sawtooth pattern
  -> may be normal allocation and GC behavior.
```

## GC Pressure

GC pressure means the application allocates enough memory that garbage collection becomes frequent or expensive. Understanding why requires familiarity with the generational GC model.

The .NET GC uses three generations. Gen 0 contains short-lived objects (temporary variables, intermediate results). Gen 1 acts as a buffer between Gen 0 and Gen 2. Gen 2 contains long-lived objects. Collections are cheapest in Gen 0 (fast, processor-local) and most expensive in Gen 2 (may require stopping all threads and compacting the full heap). The Large Object Heap (LOH) is collected as part of Gen 2.

When allocation rate is high, Gen 0 fills quickly and triggers frequent collections. If objects survive Gen 0, they are promoted to Gen 1 and eventually Gen 2, where collection is much more expensive. High allocation plus high survival rate is the worst case: frequent expensive Gen 2 collections that consume CPU and pause application threads.

Bad allocation-heavy code:

```csharp
public string BuildCsv(IEnumerable<Order> orders)
{
    var csv = "";

    foreach (var order in orders)
    {
        csv += $"{order.Id},{order.CustomerName},{order.Total}\n";
    }

    return csv;
}
```

This creates many intermediate strings.

Better:

```csharp
public string BuildCsv(IEnumerable<Order> orders)
{
    var builder = new StringBuilder();

    foreach (var order in orders)
    {
        builder
            .Append(order.Id)
            .Append(',')
            .Append(order.CustomerName)
            .Append(',')
            .Append(order.Total)
            .AppendLine();
    }

    return builder.ToString();
}
```

For very large exports, stream instead of building one giant string.

## Large Object Heap

Large objects are usually allocated on the Large Object Heap.

Large arrays, strings, and buffers can cause memory pressure.

Risky:

```csharp
var bytes = await File.ReadAllBytesAsync(path, ct);
return File(bytes, "application/pdf");
```

Better:

```csharp
var stream = File.OpenRead(path);
return File(stream, "application/pdf", enableRangeProcessing: true);
```

For uploaded files, stream to storage instead of buffering whole files in memory.

## Memory Leak Through Event Subscription

Leak pattern:

```csharp
public sealed class OrderWatcher
{
    public OrderWatcher(OrderEvents events)
    {
        events.OrderCreated += HandleOrderCreated;
    }

    private void HandleOrderCreated(object? sender, OrderCreatedEventArgs args)
    {
        // ...
    }
}
```

If `OrderEvents` lives much longer than `OrderWatcher`, it can keep `OrderWatcher` alive.

Safer pattern:

```csharp
public sealed class OrderWatcher : IDisposable
{
    private readonly OrderEvents _events;

    public OrderWatcher(OrderEvents events)
    {
        _events = events;
        _events.OrderCreated += HandleOrderCreated;
    }

    public void Dispose()
    {
        _events.OrderCreated -= HandleOrderCreated;
    }

    private void HandleOrderCreated(object? sender, OrderCreatedEventArgs args)
    {
        // ...
    }
}
```

## Thread Pool Starvation

Blocking async work can cause high latency and thread pool growth.

Bad:

```csharp
public IActionResult Get()
{
    var data = _client.GetDataAsync().Result;
    return Ok(data);
}
```

Better:

```csharp
public async Task<IActionResult> Get(CancellationToken ct)
{
    var data = await _client.GetDataAsync(ct);
    return Ok(data);
}
```

Symptoms:

- threadpool queue length grows;
- request latency rises;
- CPU may not be fully used;
- many threads exist but throughput is poor.

## Regex Backtracking CPU Spike

Some regex patterns can consume extreme CPU on certain input.

Risky:

```csharp
var regex = new Regex("^(a+)+$");
var isMatch = regex.IsMatch(input);
```

Better:

```csharp
var regex = new Regex(
    "^(a+)$",
    RegexOptions.Compiled,
    TimeSpan.FromMilliseconds(100));

var isMatch = regex.IsMatch(input);
```

Always consider timeouts for regex on user-provided input.

## Retry Storm

Retries can amplify load.

```text
Dependency slows down.
Every request retries 3 times.
Traffic to dependency becomes 4x.
Requests wait longer.
Thread/connection usage increases.
System becomes even slower.
```

Use:

- bounded retries;
- exponential backoff;
- jitter;
- circuit breaker;
- timeout;
- idempotency keys for retried writes.

## Container And Kubernetes Memory Limits

In containers, memory limit matters.

Symptoms of `OOMKilled`:

- pod restarts;
- exit code often `137`;
- logs suddenly stop;
- memory graph reaches limit;
- `kubectl describe pod` shows `OOMKilled`.

Commands:

```powershell
kubectl describe pod orders-api-abc123
kubectl logs orders-api-abc123 --previous
kubectl top pod orders-api-abc123
```

Practical notes:

- memory limit should be tested under realistic load;
- server GC may use more memory;
- large caches should respect container limits;
- do not set memory limit too close to normal working set.

## Investigation Steps

```text
1. Confirm start time and affected instances.
2. Check deployment/config/traffic changes.
3. Compare CPU, memory, latency, error rate, and restarts.
4. Check runtime counters.
5. If memory is high, collect dump/gcdump before restart.
6. If CPU is high, collect trace/profile.
7. Identify hot methods or retained object types.
8. Mitigate with rollback, scaling, feature flag, or workload reduction.
9. Verify metrics after mitigation.
10. Create prevention actions.
```

## Mitigation Options

Possible:

- scale out if workload is parallelizable;
- rollback recent deployment;
- disable heavy feature;
- reduce traffic;
- pause background workers;
- clear or reduce bad cache carefully;
- fix query loading huge data;
- stream large files instead of buffering;
- restart one instance after preserving dump;
- increase memory only when the workload legitimately needs it.

Increasing memory can be valid, but it should not hide an unbounded leak.


