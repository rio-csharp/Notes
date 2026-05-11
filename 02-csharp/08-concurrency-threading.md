# C# Concurrency And Threading

## Core Idea

Concurrency is the discipline of making multiple operations progress over overlapping periods of time. Threading is one of the mechanisms the runtime uses to make that possible, but it is not the whole story. In production .NET systems, the harder problems usually appear when several operations contend for shared state, shared execution capacity, or limited downstream resources.

Once several operations interact, engineers must reason about thread safety, worker availability, synchronization, backpressure, and coordination under load.

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

**ThreadPool architecture.** The .NET thread pool manages two distinct categories of threads:

- **Worker threads** — handle CPU-bound work queued via `Task.Run`, `ThreadPool.QueueUserWorkItem`, timer callbacks, and continuations. These threads execute managed code.
- **I/O completion threads** — handle completions from the OS I/O completion port mechanism. When an overlapped I/O operation (network read, file read) finishes, the OS notifies the CLR via an I/O completion port, and an I/O completion thread picks up the notification. These threads are not used for CPU work and are critical for async I/O throughput.

The distinction matters because starvation in one pool does not directly block the other, but the two pools interact. When worker threads are exhausted, continuations that would run on worker threads are delayed, which in turn delays processing of I/O completions that depend on those continuations.

**The hill-climbing algorithm.** The thread pool does not use a fixed thread count. It uses an adaptive algorithm called "hill-climbing" that monitors throughput — measured as the rate of work-item completion — and adjusts the thread count to maximize it. When new work items are queued and threads are busy, the algorithm introduces new threads at a controlled rate (typically one every 500 ms after an initial burst), measuring whether throughput improves. If adding threads increases throughput, it continues; if throughput plateaus or declines (suggesting contention), it stops. This is why the ThreadPool can appear slow to react under sudden load spikes: the injection rate is deliberately conservative to avoid overshooting into contention territory.

**`ThreadPool.SetMinThreads`.** The minimum thread count is the number of threads the thread pool keeps available even when idle. Setting this value at application startup is important for high-throughput servers because the hill-climbing algorithm starts from the minimum, not from zero. If the minimum is too low, the application experiences latency spikes during startup or load surges while the ThreadPool slowly injects threads. A common ASP.NET Core recommendation is to set minimum worker and I/O completion threads to values proportional to expected concurrency:

```csharp
ThreadPool.SetMinThreads(workerThreads: 100, completionPortThreads: 100);
```

This does not create 100 threads immediately; it ensures the ThreadPool will inject threads up to that count without hill-climbing hesitation. Setting the minimum too high wastes memory; setting it too low causes unnecessary latency under load.

## ThreadPool Starvation As A System Failure

ThreadPool starvation happens when work is queued but available workers are not arriving quickly enough to keep the system responsive.

ThreadPool starvation happens when:

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

The response is architectural discipline: async end to end where the work is genuinely asynchronous, bounded CPU work, and careful control over background concurrency.

## Diagnosing Worker Exhaustion

Starvation often presents as a throughput or latency problem rather than a crash.

Starvation often presents as:

- sudden latency spikes;
- timeouts across otherwise unrelated endpoints;
- request queues growing while CPU is only moderate;
- stack traces showing many blocked workers;
- long delays before simple continuations run.

Relevant evidence covers:

- `dotnet-counters` ThreadPool metrics;
- traces showing blocked work;
- dumps showing sync-over-async, locks, or synchronous I/O;
- request duration metrics;
- dependency timing.

This diagnostic pattern matters because many teams initially misread starvation as "the server needs more threads." More often the real question is why existing workers are being held in non-productive waits.

A minimal observation workflow often starts with:

```bash
dotnet-counters monitor --process-id <pid> System.Runtime
```

This produces live counter output:

```text
[System.Runtime]
    CPU Usage (%)
    Working Set (MB)
    GC Heap Size (MB)
    Gen 0 GC / sec
    Gen 1 GC / sec
    Gen 2 GC / sec
    Time in GC (%)
    Allocation Rate (B / 1 sec)
    ThreadPool Thread Count
    ThreadPool Queue Length
    ThreadPool Completed Work Item Count
    Lock Contention Count
    Exception Count
```

During starvation diagnosis, the critical counters are `ThreadPool Thread Count` (is it stuck near the minimum despite queued work?), `ThreadPool Queue Length` (is it growing without bound?), and `ThreadPool Completed Work Item Count` (is throughput flat while queue depth rises?). Together these reveal whether the ThreadPool is injecting threads, whether work is backing up, and whether the system is making forward progress. This does not replace deeper tracing, but it gives a practical entry point for watching ThreadPool and runtime pressure while the workload is running.

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

`Interlocked` provides `Increment`, `Decrement`, `Add`, `Exchange`, `CompareExchange`, and `Read` (for 64-bit values on 32-bit platforms). Each operation is guaranteed atomic — no other thread can observe a partially completed operation.

### `volatile` And Memory Ordering

The `volatile` keyword disables certain compiler and hardware optimizations on field access. Without it, the JIT compiler, CPU caches, and memory model may reorder reads and writes, and a thread may see a stale value indefinitely:

```csharp
private volatile bool _shutdownRequested;

public void RequestShutdown()
{
    _shutdownRequested = true; // volatile write
}

public void ProcessLoop()
{
    while (!_shutdownRequested) // volatile read; not hoisted out of the loop
    {
        // work
    }
}
```

Without `volatile`, the JIT might hoist `_shutdownRequested` into a register once and never check the field again, causing the loop to run forever. With `volatile`, the compiler and runtime preserve volatile read/write ordering guarantees for that field. This does **not** mean every read goes to "main memory," and it does **not** guarantee that a write is immediately visible to every processor at the same instant.

`volatile` is a narrow tool. It does not make `_count++` atomic (read-modify-write is still three operations), it does not prevent all reorderings (only around the volatile field itself), and it adds a small per-access cost. For most synchronization needs, `lock` or `Interlocked` are safer, clearer choices. `volatile` is most appropriate for simple flags — shutdown signals, status indicators — where a single write communicates a signal to readers and atomicity of compound operations is not required.

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

**`lock` on a reference object is `Monitor.Enter` / `Monitor.Exit`.** When the lock expression is an ordinary reference type such as `object`, the C# `lock` statement compiles to a `try/finally` block wrapping `Monitor.Enter` and `Monitor.Exit`:

```csharp
// lock (_gate) { body } compiles approximately to:
bool lockTaken = false;
try
{
    Monitor.Enter(_gate, ref lockTaken);
    // body
}
finally
{
    if (lockTaken) Monitor.Exit(_gate);
}
```

The `lockTaken` flag ensures `Monitor.Exit` is called only when the lock was successfully acquired, preventing corrupted state if `Monitor.Enter` throws. This `try/finally` structure means exceptions that escape the critical section still release the lock — which is usually correct but can leave protected state partially mutated.

**`System.Threading.Lock` (.NET 9 / C# 13).** .NET 9 introduced the `Lock` class as the recommended replacement for locking on `object`. `Lock` provides clearer intent (the type name specifies its purpose) and uses specialized compiler support when the `lock` expression is statically known to be `System.Threading.Lock`:

```csharp
private readonly Lock _gate = new();

public void Increment()
{
    lock (_gate)
    {
        _count++;
    }
}
```

The `lock` keyword works with both `object` and `Lock` instances. `Lock` is preferred for new code; `object` remains valid for existing codebases and is not deprecated. The generated code is different: when the compiler knows the expression is exactly `System.Threading.Lock`, `lock (_gate)` is equivalent to `using (_gate.EnterScope()) { ... }`. If the same instance is first converted to `object`, the compiler falls back to monitor-based locking, which is why keeping the field typed as `Lock` matters.

**`lock` cannot span `await`.** Monitor-based locking tracks thread ownership, and `System.Threading.Lock` scopes are also synchronous critical sections. If an `await` occurs inside a critical section, the continuation after the `await` may execute later on a different thread while the protected state remains logically locked. The compiler prevents this situation for the `lock` keyword — it produces an error when `await` appears in the body of a `lock` statement. Code using lower-level primitives directly can still create equivalent hazards at runtime.

This thread-affinity constraint is the reason `SemaphoreSlim` (which is not thread-affine) replaces `lock` in asynchronous code paths.

Two guidelines protect lock safety:

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

A more realistic outbound-integration example looks like this:

```csharp
public sealed class CustomerSyncService
{
    private readonly SemaphoreSlim _apiLimit = new(5);
    private readonly ICustomerApi _customerApi;

    public CustomerSyncService(ICustomerApi customerApi)
    {
        _customerApi = customerApi;
    }

    public async Task SyncManyAsync(
        IEnumerable<Customer> customers,
        CancellationToken ct)
    {
        var tasks = customers.Select(customer => SyncOneAsync(customer, ct));
        await Task.WhenAll(tasks);
    }

    private async Task SyncOneAsync(Customer customer, CancellationToken ct)
    {
        await _apiLimit.WaitAsync(ct);
        try
        {
            await _customerApi.UpsertAsync(customer, ct);
        }
        finally
        {
            _apiLimit.Release();
        }
    }
}
```

This example makes the trade-off more concrete. The application still processes many customers concurrently, but it does not let outbound API pressure grow without bound. That is exactly the kind of coordination problem `SemaphoreSlim` solves well.

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

Concurrency bugs often arise from ordering assumptions that remain invisible until load or timing changes. Consistent lock ordering, short critical sections, and avoiding lock-plus-I/O combinations reduce the risk substantially.

## Livelock — Progress Without Forward Motion

Livelock occurs when threads are actively executing but none makes forward progress because each reacts to the others' activity by yielding or retrying. Unlike deadlock, where threads are blocked waiting, livelocked threads are busy — but busy doing nothing useful.

A common livelock pattern arises from spin-based retry loops with conflicting backoff:

```csharp
private int _attempts;

public void DoWork()
{
    while (true)
    {
        if (Interlocked.CompareExchange(ref _attempts, 1, 0) == 0)
        {
            try
            {
                // Critical work
                return;
            }
            finally
            {
                Interlocked.Exchange(ref _attempts, 0);
            }
        }

        // Both threads see contention, both yield, both retry, repeat
        Thread.Yield();
    }
}
```

If two threads enter this method simultaneously, both see `_attempts` is 0, both attempt `CompareExchange`, one succeeds and one fails. The failing thread calls `Thread.Yield()` and retries. But if the successful thread completes quickly and releases the lock before the failing thread resumes, the next attempt may succeed. The livelock risk emerges when timing aligns such that threads repeatedly collide, yield, and collide again — each deferring to the other, neither holding the resource long enough to make meaningful progress, but none blocked.

`SpinWait` offers a more controlled spin than `Thread.Yield`:

```csharp
var spinWait = new SpinWait();

while (true)
{
    if (Interlocked.CompareExchange(ref _attempts, 1, 0) == 0)
    {
        try { return; }
        finally { Interlocked.Exchange(ref _attempts, 0); }
    }

    spinWait.SpinOnce();
}
```

`SpinWait.SpinOnce()` begins with short spins (a few CPU cycles) and progressively yields the thread or sleeps after enough iterations. This reduces the collision probability compared to a naked `Thread.Yield()` loop, but the fundamental vulnerability remains: spin-based coordination does not guarantee progress. When correctness requires guaranteed forward progress, use `lock`, `SemaphoreSlim`, or `Channel<T>` rather than spin loops.

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

## Thread-Local And Async-Local State

Some state is meaningful only within a specific execution context — a thread, or an asynchronous flow. Keeping it out of shared mutable fields eliminates contention and coordination entirely.

### `ThreadLocal<T>`

`ThreadLocal<T>` stores a separate value for each thread:

```csharp
private static readonly ThreadLocal<Stack<int>> _undoStack =
    new(() => new Stack<int>());

public void PushUndo(int operationId)
{
    _undoStack.Value!.Push(operationId);
}
```

Each thread sees its own `ThreadLocal<T>` value; no lock is needed for access to that per-thread value. `ThreadLocal<T>` is most useful for pooling per-thread resources — `StringBuilder` instances, scratch buffers, or accumulated state that is later aggregated — and for scenarios where the same logical field must be distinct across threads.

The `ThreadStaticAttribute` provides similar isolation for static fields but does not support initialization — each thread sees `default(T)` until explicitly set. `ThreadLocal<T>` wraps this with initialization and value disposal.

### `AsyncLocal<T>`

`AsyncLocal<T>` extends `ThreadLocal<T>` through asynchronous continuations. A `ThreadLocal<T>` value does not flow across `await` boundaries because the continuation may run on a different thread. `AsyncLocal<T>` propagates via `ExecutionContext` — the same mechanism that carries security context, culture, and synchronization context:

```csharp
private static readonly AsyncLocal<int> _requestDepth = new();

public async Task ProcessAsync()
{
    _requestDepth.Value++;
    try
    {
        await NextAsync(); // _requestDepth.Value is preserved across await
    }
    finally
    {
        _requestDepth.Value--;
    }
}
```

`AsyncLocal<T>` is the foundation for `HttpContext` access in ASP.NET Core, `Activity.Current` in OpenTelemetry tracing, and ambient correlation IDs. Changes made to an `AsyncLocal<T>` inside an `async` method are visible only to that method's continuation tree — not to sibling continuations or the caller after `await`.

The cost is an allocation on each write: the `ExecutionContext` is immutable, so modifying an `AsyncLocal<T>` value creates a new `ExecutionContext` that copies the previous one with the change. Reading is allocation-free (it reads through the current context). In hot paths with frequent writes, batching writes or using alternatives (method parameters, explicitly passed context objects) avoids repeated allocation.

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

The capacity value is not incidental. It is the activation point for backpressure in this design. Once the channel is bounded, writers eventually have to slow down or wait. Without that bound, the application has a queue but not a meaningful overload-control strategy.

This pattern is often safer than unbounded fire-and-forget task creation because it makes overload visible and manageable rather than silently converting it into memory growth and thread contention.

A fuller pipeline example makes that clearer:

```csharp
public sealed record OrderJob(int OrderId);

var channel = Channel.CreateBounded<OrderJob>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.Wait
});

var producer = Task.Run(async () =>
{
    foreach (var orderId in orderIds)
    {
        await channel.Writer.WriteAsync(new OrderJob(orderId), ct);
    }

    channel.Writer.Complete();
}, ct);

var consumers = Enumerable.Range(0, 4)
    .Select(_ => Task.Run(async () =>
    {
        await foreach (var job in channel.Reader.ReadAllAsync(ct))
        {
            await ProcessJobAsync(job, ct);
        }
    }, ct))
    .ToArray();

await Task.WhenAll(consumers.Prepend(producer));
```

Now the backpressure story is visible in code. Producers and consumers are both explicit, capacity is explicit, and overload control is part of the design rather than an accidental side effect.

## Unbounded Channels And Overload Shedding

`Channel.CreateUnbounded<T>()` creates a channel with no capacity limit. Writes never wait — `WriteAsync` always completes synchronously. This eliminates backpressure entirely, which sounds convenient but is precisely the danger: producers can outpace consumers indefinitely, and memory grows without bound.

```csharp
var unbounded = Channel.CreateUnbounded<OrderJob>();

// This never waits — memory risk if consumers are slower than producers
await unbounded.Writer.WriteAsync(new OrderJob(orderId), ct);
```

Unbounded channels are appropriate only when the producer rate is guaranteed not to exceed the consumer rate, or when memory pressure is acceptable and the application would rather drop nothing. In most production systems, bounding the channel is the safer default.

`BoundedChannelFullMode` provides overload-shedding strategies beyond simple waiting:

```csharp
// DropWrite: newest item is discarded when channel is full
var dropNewest = Channel.CreateBounded<OrderJob>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.DropWrite
});

// DropOldest: oldest item is removed to make room for the newest
var dropOldest = Channel.CreateBounded<OrderJob>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.DropOldest
});
```

`DropWrite` discards the incoming item when the channel is full — appropriate for fire-and-forget telemetry where newer data is not more important than already-queued data. `DropOldest` evicts the oldest item to make room — appropriate when fresher data is more valuable than stale data, such as real-time price updates or sensor readings where an old value is useless by the time a consumer processes it.

Both modes sacrifice completeness for predictable memory and latency. The trade-off should be explicit: the system chooses which data to lose under overload rather than letting unbounded growth crash the process.

## TPL Dataflow — Composable Processing Pipelines

`System.Threading.Tasks.Dataflow` (the TPL Dataflow library, available as a NuGet package) provides higher-level building blocks that compose into processing pipelines with explicit parallelism, throttling, and fan-out/fan-in. While `Channel<T>` provides the queue, Dataflow provides the processing stage wrapped around the queue.

The core blocks:

- `ActionBlock<T>` — executes a delegate for each item. Degree of parallelism is configurable.
- `TransformBlock<TInput, TOutput>` — processes each input into an output, feeding the next block.
- `BufferBlock<T>` — an unbounded or bounded buffer, like a `Channel<T>` without processing.
- `BroadcastBlock<T>` — sends each item to all linked consumers.

A pipeline example makes the composition clearer:

```csharp
using System.Threading.Tasks.Dataflow;

var downloadBlock = new TransformBlock<string, byte[]>(
    async url => await _httpClient.GetByteArrayAsync(url),
    new ExecutionDataflowBlockOptions
    {
        MaxDegreeOfParallelism = 4,
        BoundedCapacity = 100
    });

var processBlock = new ActionBlock<byte[]>(
    async data => await ProcessDataAsync(data),
    new ExecutionDataflowBlockOptions
    {
        MaxDegreeOfParallelism = 2,
        BoundedCapacity = 50
    });

downloadBlock.LinkTo(processBlock, new DataflowLinkOptions { PropagateCompletion = true });

foreach (var url in urls)
{
    await downloadBlock.SendAsync(url, ct);
}

downloadBlock.Complete();
await processBlock.Completion;
```

`BoundedCapacity` on each block provides backpressure: when a block's input queue is full, `SendAsync` on the preceding block waits, propagating backpressure up the pipeline. `MaxDegreeOfParallelism` controls concurrent processing within each block independently from other blocks. `PropagateCompletion` ensures that completing the first block automatically signals completion to the second.

Dataflow shines when the pipeline has multiple stages with different concurrency requirements — for example, network I/O at 4x concurrency feeding CPU processing at 2x concurrency. For simple single-stage producer-consumer scenarios, `Channel<T>` is lighter and does not require an external NuGet dependency. The choice depends on whether the pipeline's structure is the primary concern (Dataflow) or the handoff and backpressure are the primary concern (Channel).

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

## Throttled Concurrent Async With `Parallel.ForEachAsync`

When a workload requires executing many asynchronous operations with a controlled degree of concurrency, `Parallel.ForEachAsync` (.NET 6+) combines parallelism with async awareness:

```csharp
public async Task<List<CustomerResult>> SyncAllCustomersAsync(
    IEnumerable<Customer> customers,
    CancellationToken ct)
{
    var results = new ConcurrentBag<CustomerResult>();

    await Parallel.ForEachAsync(
        customers,
        new ParallelOptions
        {
            MaxDegreeOfParallelism = 8,
            CancellationToken = ct
        },
        async (customer, token) =>
        {
            var result = await _customerApi.UpsertAsync(customer, token);
            results.Add(new CustomerResult(customer.Id, result.Status));
        });

    return results.ToList();
}
```

`MaxDegreeOfParallelism` is the critical parameter. It caps the number of concurrently executing iterations, which bounds both local thread usage and downstream pressure. This is the async equivalent of a bounded semaphore over a collection but integrated directly into the parallel infrastructure.

`Parallel.ForEachAsync` is not a substitute for `Task.WhenAll` and is not universally faster. It adds scheduling overhead from partitioning and work-stealing. Its value is in scenarios where the number of items is large, each item involves I/O, and unbounded concurrent I/O would overwhelm local or remote resources. When the item count is small and the operations are already well-behaved, `Task.WhenAll` is simpler and sufficient.

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

## ThreadPool Registration Patterns

Two additional ThreadPool patterns are useful in specific low-level scenarios.

**`ThreadPool.RegisterWaitForSingleObject`** bridges OS wait handles to the ThreadPool. It registers a `WaitHandle` and a callback; when the handle is signaled or a timeout elapses, the callback executes on a ThreadPool thread:

```csharp
var waitHandle = new EventWaitHandle(false, EventResetMode.AutoReset);

ThreadPool.RegisterWaitForSingleObject(
    waitHandle,
    (state, timedOut) =>
    {
        if (timedOut)
        {
            _logger.LogWarning("Wait timed out");
            return;
        }
        // Handle signal
    },
    state: null,
    timeout: TimeSpan.FromSeconds(30),
    executeOnlyOnce: true);
```

This pattern predates `async`/`await` and is less common in modern code, but it remains useful for integrating with legacy synchronization primitives, named pipes, and OS-level events. The `executeOnlyOnce` parameter controls whether the registration persists for repeated signals or fires once. When set to `false`, the callback re-registers automatically after each signal, which can create overlapping executions if signals arrive faster than the callback completes.

**`ThreadPool.UnsafeQueueUserWorkItem`** bypasses the `ExecutionContext` capture that `QueueUserWorkItem` performs. Capturing `ExecutionContext` propagates ambient state — `AsyncLocal<T>` values, security context, culture — to the worker thread. This capture is correct by default but allocates. `UnsafeQueueUserWorkItem` skips the capture, trading safety for performance:

```csharp
ThreadPool.UnsafeQueueUserWorkItem(state =>
{
    // ExecutionContext is NOT captured — AsyncLocal values may be lost
    ProcessItem((WorkItem)state!);
}, item);
```

This is appropriate only when the callback has no dependency on ambient context and the performance difference has been measured. Incorrect use can cause security context leaks (where work runs with unintended identity) or `AsyncLocal<T>` corruption. Most application code should use `Task.Run` or `QueueUserWorkItem` and let the runtime manage context capture correctly. `UnsafeQueueUserWorkItem` is a library-author optimization, not a general-purpose tool.
