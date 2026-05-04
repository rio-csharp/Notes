# C# Concurrency And Threading

## Core Idea

Concurrency means multiple tasks make progress over overlapping time periods. Threading is one way to achieve concurrency.

Chinese notes:

- `concurrency`: 并发.
- `parallelism`: 并行.
- `race condition`: 竞态条件.
- `deadlock`: 死锁.

## Thread vs Task

`Thread`:

- OS thread;
- lower-level;
- expensive to create.

`Task`:

- represents asynchronous operation;
- may or may not use a dedicated thread;
- works with async/await.

Example:

```csharp
var task = Task.Run(() => Calculate());
var result = await task;
```

`Task.Run` queues work to the ThreadPool. But many async tasks, such as HTTP or database calls, do not need a dedicated thread while waiting.

Key point:

> A `Thread` is an execution resource. A `Task` is an abstraction representing work or future completion.

## Under The Hood: ThreadPool

.NET uses the ThreadPool（线程池） to run many short-lived pieces of work without creating a new OS thread for each operation.

Used by:

- `Task.Run`;
- continuations after `await`;
- ASP.NET Core request processing;
- timers;
- background work.

Why it exists:

- creating OS threads is expensive;
- too many threads cause context switching;
- pooling lets .NET reuse worker threads.

Conceptual model:

```text
Work item queued
  -> ThreadPool worker picks it up
  -> executes work
  -> worker returns to pool
```

The ThreadPool can inject more threads when needed, but it does not create unlimited threads instantly.

## ThreadPool Starvation

ThreadPool starvation（线程池饥饿） happens when queued work cannot get worker threads quickly enough.

Common causes:

- blocking async code with `.Result` or `.Wait()`;
- sync database/HTTP calls in high-concurrency paths;
- long CPU-bound work on ThreadPool threads;
- too many fire-and-forget tasks;
- locks held for too long;
- external dependency slowness causing many blocked threads.

Bad:

```csharp
public IActionResult Get()
{
    var result = _client.GetStringAsync("https://example.com").Result;
    return Ok(result);
}
```

Problem:

```text
Request thread blocks.
More requests arrive.
More ThreadPool threads block.
Continuations wait for available ThreadPool threads.
Latency spikes.
```

Better:

```csharp
public async Task<IActionResult> Get(CancellationToken ct)
{
    var result = await _client.GetStringAsync("https://example.com", ct);
    return Ok(result);
}
```

## Diagnosing ThreadPool Starvation

Symptoms:

- sudden latency spike;
- CPU may be low or moderate, not necessarily high;
- request queue grows;
- logs show long gaps before simple work starts;
- many threads blocked in stack traces;
- timeouts increase across unrelated endpoints.

Useful evidence:

- `dotnet-counters` ThreadPool queue length and thread count;
- traces showing blocked threads;
- dumps showing many threads waiting on `.Result`, locks, or sync I/O;
- ASP.NET Core request duration metrics;
- dependency latency.

Practical explanation:

> ThreadPool starvation is when work is queued but cannot get worker threads promptly, often because threads are blocked by sync-over-async or long-running work. I look for blocked stacks, ThreadPool queue length, request latency, and dependency calls, then remove blocking and bound concurrency.

## CPU-bound Work In ASP.NET Core

Async helps I/O-bound work. It does not make CPU-bound work disappear.

Bad pattern:

```csharp
public async Task<IActionResult> Export()
{
    var bytes = GenerateHugeReport(); // CPU-heavy
    return File(bytes, "application/pdf");
}
```

Options:

- move heavy work to background job;
- queue the job and return `202 Accepted`;
- stream output where possible;
- use bounded concurrency;
- scale workers separately;
- avoid `Task.Run` as a default fix in request handlers.

`Task.Run` may be acceptable for small isolated CPU work in some apps, but it is usually not the right architecture for heavy server workloads.

## Locks And Async

Do not `await` while holding a `lock`.

This is illegal:

```csharp
lock (_gate)
{
    await DoWorkAsync(); // not allowed
}
```

Use `SemaphoreSlim` for async coordination:

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

## Race Condition

Bad:

```csharp
private int _count;

public void Increment()
{
    _count++;
}
```

Multiple threads can update incorrectly.

Why:

```text
_count++ roughly means:
  read _count
  add 1
  write _count
```

Two threads can read the same old value and both write the same new value.

Fix:

```csharp
private int _count;

public void Increment()
{
    Interlocked.Increment(ref _count);
}
```

## Lock

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

Use lock to protect shared mutable state.

Keep lock blocks small:

```csharp
public void Add(Order order)
{
    lock (_gate)
    {
        _orders.Add(order);
    }
}
```

Avoid doing slow I/O inside locks:

```csharp
lock (_gate)
{
    // Bad: external call while holding lock
    _paymentClient.Charge(order);
}
```

Why:

> Other threads cannot enter the lock while the external call is slow or stuck.

## SemaphoreSlim

Limit concurrency:

```csharp
private readonly SemaphoreSlim _semaphore = new(5);

public async Task ProcessAsync(Item item, CancellationToken ct)
{
    await _semaphore.WaitAsync(ct);

    try
    {
        await DoWorkAsync(item, ct);
    }
    finally
    {
        _semaphore.Release();
    }
}
```

`SemaphoreSlim` is also useful when an external dependency has a practical limit:

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

This does not make the external API faster. It protects both systems from too much parallel work.

## ConcurrentDictionary

```csharp
private readonly ConcurrentDictionary<string, int> _counts = new();

public void Add(string key)
{
    _counts.AddOrUpdate(key, 1, (_, old) => old + 1);
}
```

## Deadlock

Deadlock happens when operations wait on each other forever.

Classic causes:

- inconsistent lock order;
- blocking async code;
- holding locks while calling external systems;
- no timeout.

Classic lock-order deadlock:

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

If one thread holds `_a` and another holds `_b`, each can wait for the other forever.

Fix:

> Always acquire locks in a consistent order, keep lock duration short, avoid external calls inside locks, and use timeouts where appropriate.

## ReaderWriterLockSlim

`ReaderWriterLockSlim` allows multiple readers or one writer.

It can help when:

- reads are very frequent;
- writes are rare;
- the protected data is in memory;
- the critical section is short and synchronous.

Example:

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

public void Upsert(Product product)
{
    _lock.EnterWriteLock();
    try
    {
        _products[product.Sku] = product;
    }
    finally
    {
        _lock.ExitWriteLock();
    }
}
```

Use it carefully:

- do not hold it during slow I/O;
- do not use it across `await`;
- measure before assuming it is faster than a simple `lock`;
- consider immutable snapshots or `ConcurrentDictionary` first.

## Channels For Producer/Consumer Work

For background producer/consumer workflows, `Channel<T>` is often better than unbounded fire-and-forget tasks.

```csharp
var channel = Channel.CreateBounded<OrderJob>(capacity: 100);

await channel.Writer.WriteAsync(new OrderJob(orderId), ct);

await foreach (var job in channel.Reader.ReadAllAsync(ct))
{
    await ProcessJobAsync(job, ct);
}
```

Why useful:

- supports backpressure;
- avoids unbounded task creation;
- fits background worker design;
- can respect cancellation.

## Immutable Data For Thread Safety

One way to avoid locks is to avoid mutation.

```csharp
public sealed record UserSnapshot(int Id, string Name, string Email);
```

Immutable data can be safely shared across threads because no thread can modify it after creation.

## PeriodicTimer For Repeating Work

`PeriodicTimer` is a clean async-friendly way to run repeated work in a background service.

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

Important details:

- pass the shutdown token;
- handle exceptions inside the loop if one failed iteration should not stop the worker;
- avoid overlapping executions unless the design explicitly allows overlap.

## Review Questions

### Concurrency vs parallelism?

> Concurrency is about dealing with multiple tasks at once. Parallelism means actually executing multiple tasks at the same time, usually on multiple cores.

### What is thread safety?

> Code is thread-safe if it behaves correctly when accessed concurrently by multiple threads.

### How do you avoid race conditions?

> Avoid shared mutable state where possible, or protect it with locks, atomic operations, immutable data, or concurrent collections.

### What is ThreadPool starvation?

> ThreadPool starvation happens when queued work cannot get worker threads quickly because existing threads are blocked or occupied too long. Common causes include sync-over-async, blocking I/O, long CPU work, and unbounded background tasks.

### How do you fix ThreadPool starvation?

> Remove blocking calls, use async APIs end to end, move CPU-heavy work to background workers, bound concurrency, add timeouts, and inspect dumps/counters to find blocked threads.

### When should you use `lock` vs `ConcurrentDictionary`?

> Use `lock` when you need to protect a custom critical section or multiple operations that must be atomic together. Use `ConcurrentDictionary` for common thread-safe dictionary operations such as `GetOrAdd` or `AddOrUpdate`.

### What is backpressure?

> Backpressure means the system slows producers when consumers cannot keep up. Bounded channels, queues, and rate limits prevent unlimited memory growth and dependency overload.

### When would you use `ReaderWriterLockSlim`?

> Use it for short synchronous in-memory critical sections with many readers and few writers. Avoid it for async I/O and measure before using it instead of simpler approaches.

### Why use `PeriodicTimer` in background workers?

> It works naturally with `async` and cancellation, making repeated work easier to stop cleanly during shutdown.

## Common Mistakes

### Mistake: Locking on public objects or strings.

Why it is wrong:

> Other code can lock the same public object or interned string, creating unexpected deadlocks.

Better answer:

> Lock on a private readonly object owned by the class.

### Mistake: Holding locks during async awaits.

Why it is wrong:

> `lock` is synchronous and should not protect code that awaits. Holding exclusive access while waiting for I/O can block other work and create deadlock-like behavior.

Better answer:

> Keep locks short and synchronous, or use async-compatible coordination such as `SemaphoreSlim`.

### Mistake: Blocking async calls with `.Result`.

Why it is wrong:

> It blocks a thread while async work is pending, reducing scalability and contributing to thread pool starvation.

Better answer:

> Use `await`.

### Mistake: Assuming `Dictionary` is thread-safe.

Why it is wrong:

> Concurrent writes can corrupt state or throw exceptions. Even read/write mixtures can be unsafe.

Better answer:

> Use locking, immutable replacement, or `ConcurrentDictionary` depending on the scenario.

### Mistake: No cancellation in long-running work.

Why it is wrong:

> Work may continue after shutdown, timeout, or client disconnect, wasting resources and delaying graceful shutdown.

Better answer:

> Pass and check `CancellationToken`.

### Mistake: Running heavy CPU work on request threads.

Why it is wrong:

> CPU-bound work can occupy thread pool threads and increase latency for unrelated requests.

Better answer:

> Move heavy work to background processing, separate workers, or dedicated compute services when needed.

### Mistake: Creating unbounded fire-and-forget tasks.

Why it is wrong:

> They can grow without backpressure, lose exceptions, and overwhelm dependencies.

Better answer:

> Use bounded queues, background services, or job systems with retry and monitoring.

### Mistake: Treating `Task.Run` as a universal server-side fix.

Why it is wrong:

> `Task.Run` only moves work to another thread pool thread. It does not make blocking I/O scalable and can worsen thread pool pressure.

Better answer:

> Fix the root cause: use async I/O, reduce CPU work, or move work out of the request path.
