# C# Concurrency And Threading

## Core Idea

Concurrency is the discipline of making multiple operations progress over overlapping periods of time. Threading is one of the mechanisms the runtime uses to make that possible, but it is not the whole story. In production .NET systems, the harder problems usually appear when several operations contend for shared state, shared execution capacity, or limited downstream resources.

The previous chapter explained asynchronous control flow. This chapter begins where `async` and `await` stop being enough on their own. Once several operations interact, engineers must reason about thread safety, worker availability, synchronization, backpressure, and coordination under load.

## Concurrency Versus Parallelism

Concurrency and parallelism are related but different.

Concurrency means multiple operations are in progress over time. Parallelism means multiple operations are literally executing at the same instant on different cores.

Many server applications are highly concurrent even when the amount of useful parallel CPU work is modest. A web server may have thousands of requests in flight, most of them waiting on databases or network dependencies. This distinction matters because some problems are about coordination and resource ownership rather than about raw CPU execution.

## Tasks, Threads, And The ThreadPool

A `Task` is an abstraction representing work or future completion. A `Thread` is an execution resource managed by the operating system.

```csharp
var task = Task.Run(() => Calculate());
var result = await task;
```

This queues CPU-bound work to the ThreadPool, but many tasks do not map one-to-one to threads. An asynchronous HTTP call or database query may spend most of its lifetime without any dedicated thread blocked on its behalf.

The ThreadPool exists because creating OS threads is expensive and letting each short operation allocate its own thread would scale poorly. The runtime therefore reuses a pool of worker threads for request handling, continuations, timers, background work, and many framework operations.

```text
work item queued
worker thread picks it up
work executes
worker returns to the pool
```

This pooled model is one reason thread misuse has system-wide consequences. When worker threads are blocked or monopolized, unrelated work may suffer too.

## ThreadPool Starvation As A System Failure

ThreadPool starvation happens when work is queued but available workers are not arriving quickly enough to keep the system responsive.

Common causes include:

- blocking async code with `.Result` or `.Wait()`;
- synchronous dependency calls in high-concurrency paths;
- long CPU-bound work occupying worker threads;
- excessive fire-and-forget fan-out;
- locks held too long;
- downstream slowness that keeps many operations blocked simultaneously.

```csharp
public IActionResult Get()
{
    var result = _client.GetStringAsync("https://example.com").Result;
    return Ok(result);
}
```

This code looks small, but under load it can create a damaging system pattern:

```text
request thread blocks
more requests arrive
more workers block
continuations wait for workers
latency rises across the application
```

The fix is usually not a local trick. It is architectural discipline: async end to end where the work is genuinely asynchronous, bounded CPU work, and careful control over background concurrency.

## Diagnosing Worker Exhaustion

Starvation often presents as a throughput or latency problem rather than a crash.

Typical symptoms include:

- sudden latency spikes;
- timeouts across otherwise unrelated endpoints;
- request queues growing while CPU is only moderate;
- stack traces showing many blocked workers;
- long delays before simple continuations run.

Useful evidence includes:

- `dotnet-counters` ThreadPool metrics;
- traces showing blocked work;
- dumps showing sync-over-async, locks, or synchronous I/O;
- request duration metrics;
- dependency timing.

This diagnostic pattern matters because many teams initially misread starvation as "the server needs more threads." More often the real question is why existing workers are being held in non-productive waits.

## Shared Mutable State And Race Conditions

The central correctness problem in concurrent code is shared mutable state. Once several operations can observe and modify the same data at overlapping times, timing becomes part of program behavior.

```csharp
private int _count;

public void Increment()
{
    _count++;
}
```

This looks trivial, but `_count++` is not an indivisible action. It reads the value, computes a new one, and writes the result back. Two threads can interleave those steps and lose updates.

Race conditions are difficult because the code may appear correct under light load or during local testing and fail only under particular scheduling patterns. The safest long-term strategy is often not smarter locking, but reduced sharing. When data can be owned by a single workflow, queued, or made immutable, entire classes of concurrency bugs disappear.

## Atomic Operations And Locks

For small shared counters or flags, atomic operations can be enough:

```csharp
private int _count;

public void Increment()
{
    Interlocked.Increment(ref _count);
}
```

When a larger invariant must be protected, `lock` is often the simplest correct tool:

```csharp
private readonly object _gate = new();
private int _count;

public void Increment()
{
    lock (_gate)
    {
        _count++;
    }
}
```

The strength of `lock` is that it protects a critical section rather than a single variable. That makes it useful when several related mutations must happen together. Its danger is that poorly scoped lock regions can become bottlenecks or deadlock hazards.

In practice, two habits matter most:

- keep lock duration short;
- avoid slow or external work inside the lock.

```csharp
lock (_gate)
{
    _paymentClient.Charge(order);
}
```

This is risky because the lock now depends on network timing, downstream latency, and possibly remote failure behavior. A critical section should usually protect in-memory state transitions, not long-running I/O.

## Async Coordination And `SemaphoreSlim`

Traditional `lock` is synchronous and cannot span `await`. When the protected workflow itself is asynchronous, `SemaphoreSlim` is often the right coordination primitive.

```csharp
await _semaphore.WaitAsync(ct);
try
{
    await DoWorkAsync(ct);
}
finally
{
    _semaphore.Release();
}
```

This is useful both for mutual exclusion and for bounded concurrency:

```csharp
private readonly SemaphoreSlim _apiLimit = new(10);

public async Task SyncCustomerAsync(Customer customer, CancellationToken ct)
{
    await _apiLimit.WaitAsync(ct);
    try
    {
        await _externalApi.UpdateCustomerAsync(customer, ct);
    }
    finally
    {
        _apiLimit.Release();
    }
}
```

The point here is not speed. It is load shaping. A semaphore can protect the application and the downstream system from excessive parallelism even when each individual operation is correct in isolation.

## Deadlocks And Ordering Problems

Deadlock occurs when operations wait on one another in a cycle that never resolves.

One classic pattern is inconsistent lock ordering:

```csharp
private readonly object _a = new();
private readonly object _b = new();

public void Method1()
{
    lock (_a)
    {
        lock (_b)
        {
        }
    }
}

public void Method2()
{
    lock (_b)
    {
        lock (_a)
        {
        }
    }
}
```

If one thread acquires `_a` and another acquires `_b`, both can wait forever.

The broader lesson is that concurrency bugs often arise from ordering assumptions that remain invisible until load or timing changes. Consistent lock ordering, short critical sections, and avoiding lock-plus-I/O combinations reduce the risk substantially.

## Concurrent Collections

When the main need is safe concurrent access to a collection, specialized concurrent types can be more appropriate than manual locking.

```csharp
private readonly ConcurrentDictionary<string, int> _counts = new();

public void Add(string key)
{
    _counts.AddOrUpdate(key, 1, (_, old) => old + 1);
}
```

These types are useful because they encode safe collection-level operations directly. They are not, however, a substitute for higher-level invariant design. A `ConcurrentDictionary<TKey, TValue>` can protect dictionary operations while the objects stored inside remain mutable and unsafe for concurrent use. Thread safety at the container level does not automatically imply thread safety at the object graph level.

## Reader-Heavy And Snapshot-Oriented Designs

Some workloads have many reads and comparatively few writes. `ReaderWriterLockSlim` exists for that scenario:

```csharp
private readonly ReaderWriterLockSlim _lock = new();
private readonly Dictionary<string, Product> _products = new();

public Product? Get(string sku)
{
    _lock.EnterReadLock();
    try
    {
        return _products.TryGetValue(sku, out var product) ? product : null;
    }
    finally
    {
        _lock.ExitReadLock();
    }
}
```

It has a real but narrow use case: short, synchronous, in-memory critical sections with many readers and relatively rare writes. It should not be stretched across asynchronous work or assumed to outperform a plain `lock` automatically.

In many designs, immutable snapshots are cleaner:

```csharp
public sealed record UserSnapshot(int Id, string Name, string Email);
```

Immutable data avoids many coordination problems because shared readers no longer compete over mutation.

## Backpressure And Bounded Work

One of the most important concurrency concepts in production systems is backpressure: the idea that producers should not create work faster than consumers can process it sustainably.

Without backpressure, queues grow without bound, memory usage climbs, worker threads saturate, and downstream services are overwhelmed. This is why "just start another task" often scales poorly.

`Channel<T>` is a strong fit for producer-consumer workflows because it expresses both handoff and bounded capacity:

```csharp
var channel = Channel.CreateBounded<OrderJob>(capacity: 100);

await channel.Writer.WriteAsync(new OrderJob(orderId), ct);

await foreach (var job in channel.Reader.ReadAllAsync(ct))
{
    await ProcessJobAsync(job, ct);
}
```

This pattern is often safer than unbounded fire-and-forget task creation because it makes overload visible and manageable rather than silently converting it into memory growth and thread contention.

## CPU-Bound Work In Request-Driven Systems

Not all concurrency problems are about waiting. Some are about too much expensive computation happening in the wrong place.

```csharp
public async Task<IActionResult> Export()
{
    var bytes = GenerateHugeReport();
    return File(bytes, "application/pdf");
}
```

If report generation is genuinely heavy, the issue is not whether the method is marked `async`. The issue is that CPU-intensive work is happening on request-processing capacity that may already be valuable to latency-sensitive traffic.

Possible responses include:

- moving the work to a background job;
- queueing the request and returning `202 Accepted`;
- limiting concurrent exports;
- scaling compute separately from the request tier.

The common anti-pattern is using `Task.Run` as though it were an architecture. It can move CPU work to a worker thread, but it does not make the work cheaper and often does not solve the system-level contention problem.

## Periodic And Background Coordination

Some concurrent workflows are not request-driven at all. They are recurring background processes that must cooperate cleanly with shutdown and failure handling.

`PeriodicTimer` provides a simple async-friendly pattern:

```csharp
public sealed class CleanupWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await DeleteExpiredSessionsAsync(stoppingToken);
        }
    }

    private static Task DeleteExpiredSessionsAsync(CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

The operational details matter here too. Repeated work should usually observe shutdown tokens, decide how failures affect later iterations, and avoid accidental overlap unless overlap is explicitly acceptable.
