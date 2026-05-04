# C# Async / Await

## Core Idea

`async/await` is a language feature for writing asynchronous code in a readable way.

It is mainly used to avoid blocking threads during I/O-bound work, such as:

- database calls;
- HTTP calls;
- file I/O;
- message queue operations;
- cloud storage operations.

Important Chinese note:

- `asynchronous` means 异步.
- `non-blocking` means 非阻塞.
- `continuation` means 继续执行的后续逻辑.

## What Async/Await Is Not

`async/await` does not automatically make code faster.

It does not always create a new thread.

It does not turn CPU-heavy work into cheap work.

Wrong mental model:

```text
await = start a new thread
```

Better mental model:

```text
await = pause this method, return control, resume later when the awaited operation completes
```

## Basic Example

```csharp
public async Task<UserDto?> GetUserAsync(int id, CancellationToken cancellationToken)
{
    var user = await _dbContext.Users
        .Where(u => u.Id == id)
        .Select(u => new UserDto(u.Id, u.Name))
        .FirstOrDefaultAsync(cancellationToken);

    return user;
}
```

What happens:

1. The database query starts.
2. The current thread is not blocked while waiting for the database.
3. When the database returns, the method continues.

Controller usage:

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<UserDto>> GetUser(int id, CancellationToken ct)
{
    var user = await _userService.GetUserAsync(id, ct);

    return user is null ? NotFound() : Ok(user);
}
```

Why this matters:

> In ASP.NET Core, async I/O lets the request thread return to the thread pool while waiting for the database. This improves scalability under concurrent load.

## Async State Machine

The compiler transforms an async method into a state machine.

Source:

```csharp
public async Task<int> GetNumberAsync()
{
    await Task.Delay(1000);
    return 42;
}
```

Conceptual flow:

```text
Start method
  -> hit await
  -> if task not completed, save state and return Task
  -> later, continuation resumes
  -> return result
```

This is why exceptions thrown in async methods are stored in the returned `Task`.

## Under The Hood: What The Compiler Generates

When a method contains `await`, the C# compiler rewrites it into a state machine（状态机）.

Original:

```csharp
public async Task<int> GetValueAsync()
{
    var a = await GetAAsync();
    var b = await GetBAsync();
    return a + b;
}
```

Conceptually, the compiler creates something like:

```text
State machine fields:
  state
  builder
  local variable a
  awaiter for GetAAsync
  awaiter for GetBAsync

MoveNext():
  switch state
    start:
      call GetAAsync
      if not complete:
        save state
        register continuation
        return
      read result

    after GetAAsync:
      call GetBAsync
      if not complete:
        save state
        register continuation
        return
      read result

    finish:
      set result or exception on Task
```

This explains several important behaviors:

- local variables may become fields on the state machine;
- exceptions are captured into the returned `Task`;
- the method can return before the work is complete;
- continuation resumes when the awaited operation completes.

## Awaiter Pattern

`await` works on awaitable objects, not only `Task`.

The object must expose an awaiter pattern:

- `GetAwaiter()`;
- `IsCompleted`;
- `OnCompleted(...)`;
- `GetResult()`.

For most application code, you use `Task`, `Task<T>`, or `ValueTask<T>`.

Key point:

> `await` is pattern-based. `Task` is the common awaitable type, but the compiler only requires the awaiter pattern.

## SynchronizationContext And Continuation

`SynchronizationContext` represents where continuation should resume.

Examples:

- UI app: resume on UI thread;
- classic ASP.NET: resume on request context;
- ASP.NET Core: no classic request `SynchronizationContext`.

This matters because blocking on async can deadlock in UI/classic ASP.NET:

```text
UI thread calls .Result and blocks.
Async operation completes.
Continuation wants UI thread.
UI thread is blocked waiting for continuation.
Deadlock.
```

ASP.NET Core usually avoids this exact deadlock, but blocking still harms scalability because it occupies thread pool threads.

## I/O Completion And Thread Pool

For I/O-bound operations, a thread does not sit there waiting.

Example:

```csharp
var json = await httpClient.GetStringAsync(url);
```

High-level flow:

```text
1. Request starts on a thread pool thread.
2. HTTP I/O is initiated.
3. The current thread returns to the pool.
4. OS/network completion eventually signals completion.
5. A continuation is queued.
6. A thread pool thread runs the continuation.
```

This is why async improves scalability for I/O-heavy web servers.

It does not make the database or network faster. It lets the server use threads more efficiently while waiting.

## ExecutionContext

`ExecutionContext` flows ambient data across async calls.

Examples:

- current culture;
- security context;
- `AsyncLocal<T>`;
- logging scopes and correlation IDs in some designs.

Example:

```csharp
private static readonly AsyncLocal<string?> CorrelationId = new();

public async Task HandleAsync()
{
    CorrelationId.Value = "abc";
    await Task.Delay(100);
    Console.WriteLine(CorrelationId.Value); // usually still "abc"
}
```

Key point:

> Async code can preserve contextual data across awaits using ExecutionContext and AsyncLocal. This is useful for correlation IDs, but overusing AsyncLocal can make behavior harder to reason about.

## Task vs Thread

`Thread` is an OS-level execution resource.

`Task` is a promise-like abstraction representing future completion.

Example:

```csharp
Task<string> task = httpClient.GetStringAsync(url);
```

This does not mean there is one dedicated thread waiting for the HTTP response.

## I/O-bound vs CPU-bound

### I/O-bound

Use async APIs.

```csharp
public async Task<string> ReadFileAsync(string path, CancellationToken ct)
{
    return await File.ReadAllTextAsync(path, ct);
}
```

### CPU-bound

Async does not reduce CPU work.

```csharp
public int CalculateHash(byte[] data)
{
    // CPU-bound work
    return data.Aggregate(17, (hash, b) => hash * 31 + b);
}
```

If you need to move CPU-bound work away from a request thread, use a background worker or queue. Avoid blindly using `Task.Run` in ASP.NET Core request handlers.

## CancellationToken

Production code should support cancellation.

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<UserDto>> GetUser(
    int id,
    CancellationToken cancellationToken)
{
    var user = await _userService.GetUserAsync(id, cancellationToken);

    if (user is null)
    {
        return NotFound();
    }

    return Ok(user);
}
```

Pass `CancellationToken` to:

- EF Core async methods;
- HTTP calls;
- file I/O;
- message publishing;
- long-running operations.

Manual cancellation check:

```csharp
public async Task ImportAsync(IEnumerable<Row> rows, CancellationToken ct)
{
    foreach (var row in rows)
    {
        ct.ThrowIfCancellationRequested();
        await ProcessRowAsync(row, ct);
    }
}
```

Timeout example:

```csharp
using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
    timeoutCts.Token,
    requestAbortedToken);

await _externalClient.CallAsync(linkedCts.Token);
```

Why link tokens:

> The operation should stop if either the request is aborted or the internal timeout expires.

## Task.WhenAll

Use `Task.WhenAll` for independent operations.

```csharp
public async Task<UserProfilePage> GetProfilePageAsync(int userId, CancellationToken ct)
{
    var userTask = _userClient.GetUserAsync(userId, ct);
    var ordersTask = _orderClient.GetRecentOrdersAsync(userId, ct);
    var preferencesTask = _preferenceClient.GetPreferencesAsync(userId, ct);

    await Task.WhenAll(userTask, ordersTask, preferencesTask);

    return new UserProfilePage(
        await userTask,
        await ordersTask,
        await preferencesTask);
}
```

Common pitfall:

```csharp
var user = await GetUserAsync();
var orders = await GetOrdersAsync();
var preferences = await GetPreferencesAsync();
```

This runs sequentially. It may be slower if the operations are independent.

Exception behavior:

```csharp
try
{
    await Task.WhenAll(userTask, ordersTask, preferencesTask);
}
catch
{
    // At least one task failed. Inspect individual tasks if needed.
    throw;
}
```

Important:

> `Task.WhenAll` is not a rate limiter. Starting too many operations at once can overload downstream services.

Bounded concurrency example:

```csharp
var semaphore = new SemaphoreSlim(10);

var tasks = ids.Select(async id =>
{
    await semaphore.WaitAsync(ct);
    try
    {
        return await _client.GetItemAsync(id, ct);
    }
    finally
    {
        semaphore.Release();
    }
});

var results = await Task.WhenAll(tasks);
```

## Deadlock Example

Avoid blocking async code:

```csharp
// Bad
var result = GetUserAsync(id).Result;

// Bad
var result = GetUserAsync(id).GetAwaiter().GetResult();
```

In classic ASP.NET or UI apps, this can deadlock due to `SynchronizationContext`.

In ASP.NET Core, deadlock is less likely, but blocking still wastes thread pool threads and can cause thread pool starvation（线程池饥饿）.

Sync-over-async in ASP.NET Core:

```csharp
public IActionResult Get()
{
    var user = _userService.GetUserAsync(1, HttpContext.RequestAborted).Result;
    return Ok(user);
}
```

Problem:

> The request thread waits instead of returning to the pool. Under load, many blocked threads can delay continuations and unrelated requests.

## ConfigureAwait

In ASP.NET Core, there is no classic request `SynchronizationContext`, so `ConfigureAwait(false)` is usually not required in application code.

In reusable libraries, it can still be useful:

```csharp
public async Task<string> LoadAsync()
{
    return await File.ReadAllTextAsync("data.txt").ConfigureAwait(false);
}
```

Practical explanation:

> In UI applications, `ConfigureAwait(false)` avoids resuming on the UI context. In ASP.NET Core, there is no classic synchronization context, so it is less important for request code. For library code, it is still commonly used to avoid unnecessary context capture.

## ValueTask

`ValueTask` can reduce allocations when a result is often available synchronously.

Example:

```csharp
public ValueTask<User?> GetCachedUserAsync(int id)
{
    if (_cache.TryGetValue(id, out User? user))
    {
        return ValueTask.FromResult(user);
    }

    return new ValueTask<User?>(_repository.GetUserAsync(id));
}
```

Use carefully:

- `Task` is simpler and usually good enough.
- `ValueTask` has usage constraints.
- Prefer `ValueTask` only for measured hot paths or APIs designed for high performance.

Important `ValueTask` caution:

- do not await the same `ValueTask` multiple times unless you know it is safe;
- do not call `.Result` before completion;
- avoid storing it for later;
- convert to `Task` with `.AsTask()` only when needed, because that may allocate.

Engineering perspective:

> I default to `Task`. I use `ValueTask` only when profiling shows allocation pressure or when implementing high-performance APIs where synchronous completion is common.

## Exception Handling

```csharp
public async Task ProcessAsync(CancellationToken ct)
{
    try
    {
        await _service.DoWorkAsync(ct);
    }
    catch (OperationCanceledException) when (ct.IsCancellationRequested)
    {
        _logger.LogInformation("Operation was cancelled.");
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Failed to process work.");
        throw;
    }
}
```

Important:

- Do not swallow exceptions silently.
- Use `throw;` instead of `throw ex;` to preserve stack trace.
- Treat cancellation differently from failure.

Fire-and-forget risk:

```csharp
public IActionResult Submit()
{
    _ = SendEmailAsync(); // risky
    return Accepted();
}
```

Why risky:

- exceptions may be unobserved;
- app shutdown can interrupt work;
- no retry or monitoring;
- request-scoped services may be disposed.

Better:

```csharp
public async Task<IActionResult> Submit(CancellationToken ct)
{
    await _backgroundQueue.EnqueueAsync(new SendEmailJob(), ct);
    return Accepted();
}
```

Use a background queue, Hangfire, Quartz, worker service, or message broker when work must outlive the request.

## Practical API Example

```csharp
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var order = await _orderService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var order = await _orderService.GetByIdAsync(id, cancellationToken);
        return order is null ? NotFound() : Ok(order);
    }
}
```

## Review Questions

### What is async/await?

> `async/await` is syntax built around `Task` and compiler-generated state machines. It allows a method to suspend at an incomplete asynchronous operation and resume later, without blocking the current thread.

### Does async create a new thread?

> Not necessarily. For I/O-bound operations, the thread can return to the thread pool while the OS or external service handles the operation. CPU-bound work still needs CPU time and may require a separate execution strategy.

### What does the compiler generate for async/await?

> The compiler generates a state machine. It stores state and local variables, registers continuations at incomplete awaits, and completes the returned `Task` with either a result or an exception.

### Why is blocking on async dangerous?

> Blocking wastes threads and can cause deadlocks in environments with a synchronization context. In ASP.NET Core, it can still cause thread pool starvation and reduce throughput.

### When should you use Task.WhenAll?

> Use it when operations are independent and can run concurrently. Avoid it when operations depend on each other or when it may overload downstream services.

### How do you add timeout to async work?

> Use cancellation, often with `CancellationTokenSource` and linked tokens. The timeout should cancel the operation and the code should pass the token to underlying async APIs.

### Is `Task.Run` good for making APIs faster?

> Usually no. For I/O-bound work, use true async APIs. `Task.Run` just moves work to another thread pool thread. For heavy CPU work, use background workers or separate compute capacity when the work is significant.

## Common Mistakes

### Mistake: Using `.Result` or `.Wait()`.

Why it is wrong:

> Blocking on async work ties up a thread and can contribute to thread pool starvation. In some synchronization-context environments, it can also deadlock.

Better answer:

> Use `await` all the way through the call chain.

### Mistake: Forgetting `CancellationToken`.

Why it is wrong:

> If the client disconnects or a timeout occurs, the server may keep doing useless work.

Better answer:

> Accept and pass `CancellationToken` to I/O, EF Core, and long-running operations.

### Mistake: Making every method async without awaiting anything.

Why it is wrong:

> An `async` method without `await` adds unnecessary state-machine overhead and can hide design confusion.

Better answer:

> Return the existing `Task` directly or keep the method synchronous if no asynchronous work exists.

### Mistake: Using `async void` except for event handlers.

Why it is wrong:

> `async void` cannot be awaited and exceptions are harder to observe and handle.

Better answer:

> Use `Task` or `Task<T>` for async methods. Reserve `async void` for event handlers.

### Mistake: Running independent I/O sequentially.

Why it is wrong:

> If operations do not depend on each other, awaiting them one by one increases total latency.

Better answer:

> Start independent tasks and await them with `Task.WhenAll`, while respecting rate limits and failure behavior.

### Mistake: Using `Task.Run` inside ASP.NET Core request handlers without a clear reason.

Why it is wrong:

> ASP.NET Core already runs request code on thread pool threads. Wrapping I/O work in `Task.Run` wastes threads and can hurt scalability.

Better answer:

> Use true async I/O. Use background queues/workers for long CPU-bound or out-of-band work.

### Mistake: Swallowing exceptions in fire-and-forget tasks.

Why it is wrong:

> Failures can disappear without logs, retries, or user-visible results.

Better answer:

> Use a background job system, queue, or explicitly observe/log exceptions.

## Practice Tasks

1. Create an API endpoint that calls three fake external services sequentially.
2. Rewrite it with `Task.WhenAll`.
3. Add cancellation support.
4. Add timeout handling.
5. Add logging for success, cancellation, and failure.
