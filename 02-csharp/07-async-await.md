# C# Async / Await

## Core Idea

`async` and `await` let C# express asynchronous work without forcing ordinary control flow to be written in callbacks or manual continuation chains. They matter most in .NET because so much production code waits on external systems: databases, HTTP services, queues, file systems, cloud storage, and other I/O-heavy dependencies.

This chapter focuses on asynchronous control flow itself: how `Task` represents work, what `await` does to method execution, why blocking defeats the model, and where asynchronous code changes API design. The following chapter takes over when the problem becomes shared state, synchronization, backpressure, or thread-safety under concurrent activity.

## Asynchronous Code Is About Non-Blocking Wait

The most important mental model is that asynchronous code is not primarily about creating more threads. It is about avoiding the waste of holding a thread idle while external work is in progress.

```text
await = pause this method until the operation completes, then resume it later
```

That is why async is so valuable for I/O-bound systems and much less magical for CPU-bound work. If the bottleneck is a database round trip or a network response, a thread does not need to sit blocked during the wait. If the bottleneck is pure CPU computation, the work still has to be executed somewhere.

## Tasks As Representations Of In-Flight Work

`Task` and `Task<T>` are the standard abstractions for asynchronous completion in .NET.

```csharp
Task<string> task = httpClient.GetStringAsync(url);
```

The task is not the thread. It is an object that represents an operation that may already be running, may complete in the future, may fail with an exception, or may be canceled.

This distinction is crucial because many asynchronous operations do not own a dedicated waiting thread at all. For network and file I/O, the runtime can initiate the work, return the current thread to the pool, and schedule a continuation only when the operating system reports completion.

## What `await` Changes In A Method

Consider a typical asynchronous method:

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

At the surface, this looks like ordinary sequential code. Underneath, the compiler rewrites the method into a state machine. When execution reaches an incomplete awaitable, the method saves enough state to continue later, returns a `Task`, and arranges for the remainder of the method to resume when the awaited operation completes.

This is why asynchronous methods can preserve local variables across awaits, propagate exceptions through the returned task, and resume at the right source location without the caller needing to manage callbacks manually.

## The Compiler-Generated State Machine

The state-machine transformation is worth understanding because it explains several behaviors that otherwise feel surprising.

```csharp
public async Task<int> GetValueAsync()
{
    var a = await GetAAsync();
    var b = await GetBAsync();
    return a + b;
}
```

Conceptually, the compiler produces something like this:

```text
State machine contains:
  current state
  task builder
  lifted local variables
  awaiters

Execution flow:
  start method
  call GetAAsync
  if incomplete, save state and return task
  resume when GetAAsync completes
  call GetBAsync
  if incomplete, save state and return task
  resume when GetBAsync completes
  compute result
  complete the task
```

Three consequences matter in real engineering work.

First, local variables that survive across awaits may become fields on the generated state machine, which means asynchronous methods are not free of allocation or capture costs. Second, exceptions thrown after an `await` do not surface synchronously to the caller; they fault the returned task. Third, a method can appear to "return" before its work is finished, because what it returns is the promise of eventual completion.

## Awaitables And The Awaiter Pattern

In normal application code, the awaitable types you see most often are `Task`, `Task<T>`, `ValueTask`, and `ValueTask<T>`. The language, however, is defined in terms of an awaiter pattern rather than a hard dependency on `Task`.

An awaitable type must provide the members that allow the compiler to ask whether the operation is complete, how to schedule continuation, and how to retrieve the result. Most developers do not implement custom awaitables directly, but understanding that `await` is pattern-based helps explain why the feature is broader than one library type.

## Continuations, Context, And Resumption

When an awaited operation completes, the rest of the asynchronous method continues as a continuation. Where that continuation runs depends partly on the environment.

In UI applications, code often resumes on the UI thread because the synchronization context requires it. In classic ASP.NET, continuation may capture a request context. In ASP.NET Core, there is no classic request `SynchronizationContext`, so continuation usually resumes on an available thread-pool thread without a special request-thread affinity.

This context behavior explains why sync-over-async can deadlock in some environments:

```text
UI thread blocks waiting on .Result
async operation completes
continuation needs UI thread
UI thread is still blocked
deadlock
```

ASP.NET Core avoids that exact classic deadlock pattern more often, but blocking is still harmful because it occupies worker threads that could otherwise serve other requests or run queued continuations.

## I/O Completion And Scalability

When asynchronous I/O works well, the runtime is not making the database or network intrinsically faster. It is preserving thread capacity while the process waits.

```csharp
var json = await httpClient.GetStringAsync(url);
```

The high-level flow is closer to this:

```text
request begins on a worker thread
HTTP operation is initiated
worker thread returns to the pool
I/O completion arrives later
continuation is scheduled
another worker thread resumes the method
```

That is the key scalability benefit in web servers and background processors that spend a large portion of their time waiting on external dependencies. Async improves throughput under load because fewer threads remain blocked doing nothing useful.

## Async APIs And Application Boundaries

Asynchronous code tends to propagate outward. If a repository exposes asynchronous I/O, then the service that depends on it usually becomes asynchronous, and so does the controller or endpoint that calls the service.

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<UserDto>> GetUser(int id, CancellationToken ct)
{
    var user = await _userService.GetUserAsync(id, ct);
    return user is null ? NotFound() : Ok(user);
}
```

This is one reason partial async adoption often feels awkward. Once the underlying work is genuinely asynchronous, keeping the upper layers synchronous usually means blocking somewhere, and that destroys much of the benefit.

## I/O-Bound Work Versus CPU-Bound Work

Async is the natural shape for I/O-bound work:

```csharp
public async Task<string> ReadFileAsync(string path, CancellationToken ct)
{
    return await File.ReadAllTextAsync(path, ct);
}
```

CPU-bound work is different:

```csharp
public int CalculateHash(byte[] data)
{
    return data.Aggregate(17, (hash, b) => hash * 31 + b);
}
```

Making a CPU-heavy method `async` does not reduce the amount of computation. It only changes how the result is represented. If CPU-bound work should not run in a latency-sensitive request path, the real solution is usually architectural: offload it to background processing, separate workers, bounded pipelines, or specialized compute resources.

Blindly wrapping CPU work in `Task.Run` inside ASP.NET Core request handlers often just moves the pressure from one thread-pool thread to another.

## Cancellation As Part Of API Design

Cancellation is one of the most important engineering disciplines in asynchronous systems because it allows work to stop when the caller no longer cares about the result.

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

The token should usually be passed through to downstream asynchronous APIs so that the whole operation observes the same cancellation signal:

- EF Core query methods
- HTTP calls
- file I/O
- queue operations
- long-running loops

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

Timeouts are commonly expressed through cancellation as well:

```csharp
using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
    timeoutCts.Token,
    requestAbortedToken);

await _externalClient.CallAsync(linkedCts.Token);
```

This keeps the cancellation story coherent instead of inventing separate timeout and abort mechanisms for every layer.

## Coordinating Independent Asynchronous Operations

When several asynchronous operations are independent, starting them together and awaiting them as a group can reduce overall latency.

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

This is valuable when the operations do not depend on one another and the downstream systems can tolerate the combined concurrency. The warning matters as much as the benefit: `Task.WhenAll` is not a universal optimization. Starting too much work at once can overload external systems, create memory pressure, or trigger rate limits.

The broader topic of bounded concurrency belongs in the next chapter, but the design principle begins here: asynchronous composition is about both latency and load shape.

## Blocking Defeats The Model

One of the most expensive mistakes in C# asynchronous code is sync-over-async: forcing asynchronous operations back into synchronous waiting.

```csharp
var result = GetUserAsync(id).Result;
var other = GetUserAsync(id).GetAwaiter().GetResult();
```

In UI and classic ASP.NET applications this can deadlock because continuations attempt to resume on a blocked context. In ASP.NET Core, the more common failure mode is reduced scalability and eventual thread-pool starvation under load.

```csharp
public IActionResult Get()
{
    var user = _userService.GetUserAsync(1, HttpContext.RequestAborted).Result;
    return Ok(user);
}
```

This request thread now waits instead of returning to the pool. Multiply that pattern across many concurrent requests and the server spends threads waiting rather than serving work.

## ConfigureAwait And Library Boundaries

`ConfigureAwait(false)` matters most in reusable libraries and environments with a synchronization context.

```csharp
public async Task<string> LoadAsync()
{
    return await File.ReadAllTextAsync("data.txt").ConfigureAwait(false);
}
```

In ASP.NET Core application code, there is no classic request synchronization context to avoid, so `ConfigureAwait(false)` is often unnecessary. In general-purpose libraries, it can still be useful because the library should not assume anything about the caller's context requirements.

The important point is not that one style is always correct. It is that continuation context is part of asynchronous behavior, and library code often needs to be more conservative about context capture than top-level application code.

## ValueTask And Hot-Path Optimization

`ValueTask<T>` can reduce allocation overhead when an asynchronous result is frequently available synchronously.

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

This is a specialized optimization, not the default recommendation. `Task` remains simpler, easier to compose, and safer to use in ordinary application code. `ValueTask` becomes attractive only when profiling shows real allocation pressure or when a library API is deliberately tuned for high-frequency paths.

It also has usage constraints:

- it should not be awaited multiple times unless the source explicitly allows that;
- it should not be treated like a stable long-lived value object;
- converting it to `Task` may reintroduce allocation.

The presence of `ValueTask` in an API is therefore a signal that performance trade-offs have become important enough to complicate the programming model.

## Exceptions, Fire-And-Forget Work, And Reliability

Exceptions in asynchronous methods are stored in the returned task and surface when the task is awaited.

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

This is one reason fire-and-forget work is risky:

```csharp
public IActionResult Submit()
{
    _ = SendEmailAsync();
    return Accepted();
}
```

Once the task is detached, failures may be unobserved, request-scoped dependencies may already be disposed when the work runs, and shutdown may interrupt the operation with no retry or recovery boundary. If work must outlive the request, it usually belongs in a queue, background worker, scheduler, or message-driven system rather than in a detached task launched from a controller.
