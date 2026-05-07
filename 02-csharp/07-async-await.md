# C# Async / Await

## Core Idea

`async` and `await` let C# express asynchronous work without forcing ordinary control flow to be written in callbacks or manual continuation chains. They matter most in .NET because so much production code waits on external systems: databases, HTTP services, queues, file systems, cloud storage, and other I/O-heavy dependencies.

Asynchronous control flow revolves around how `Task` represents work, what `await` does to method execution, why blocking defeats the model, and where asynchronous code changes API design.

## Asynchronous Code Is About Non-Blocking Wait

Asynchronous code is not primarily about creating more threads. It is about avoiding the waste of holding a thread idle while external work is in progress.

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

## Await Semantics In A Method

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

The state-machine transformation explains several behaviors that are otherwise non-obvious.

```csharp
public async Task<int> GetValueAsync()
{
    var a = await GetAAsync();
    var b = await GetBAsync();
    return a + b;
}
```

The compiler lowers this method into a private nested struct. A simplified but structurally accurate version of the generated code follows:

```csharp
[CompilerGenerated]
private sealed class <GetValueAsync>d__0 : IAsyncStateMachine
{
    public int <>1__state;          // -1 = running, 0..N = resume point
    public AsyncTaskMethodBuilder<int> <>t__builder;
    private int <a>5__1;            // lifted local
    private int <b>5__2;            // lifted local
    private TaskAwaiter<int> <>u__1; // awaiter for GetAAsync
    private TaskAwaiter<int> <>u__2; // awaiter for GetBAsync

    private void MoveNext()
    {
        int num = <>1__state;
        try
        {
            TaskAwaiter<int> awaiter;
            switch (num)
            {
                case 0:
                    // Resuming after GetAAsync completed
                    <>1__state = -1;
                    <a>5__1 = <>u__1.GetResult();
                    awaiter = GetBAsync().GetAwaiter();
                    if (!awaiter.IsCompleted)
                    {
                        <>1__state = 1;
                        <>u__2 = awaiter;
                        <>t__builder.AwaitUnsafeOnCompleted(ref awaiter, ref this);
                        return;
                    }
                    goto case 1;

                case 1:
                    // Resuming after GetBAsync completed  
                    <>1__state = -1;
                    <b>5__2 = <>u__2.GetResult();
                    // Compute result and complete
                    <>t__builder.SetResult(<a>5__1 + <b>5__2);
                    return;

                default:
                    // Initial entry
                    awaiter = GetAAsync().GetAwaiter();
                    if (!awaiter.IsCompleted)
                    {
                        <>1__state = 0;
                        <>u__1 = awaiter;
                        <>t__builder.AwaitUnsafeOnCompleted(ref awaiter, ref this);
                        return;
                    }
                    goto case 0;
            }
        }
        catch (Exception exception)
        {
            <>1__state = -2;
            <>t__builder.SetException(exception);
        }
    }

    void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine) { }
}
```

Four mechanisms deserve close attention.

**`AsyncTaskMethodBuilder<T>`.** This struct is the bridge between the state machine and the returned `Task<T>`. It creates the task object, stores the result or exception, and schedules continuations. When `MoveNext` completes synchronously, `SetResult` transitions the task to the completed state. When an awaitable is incomplete, `AwaitUnsafeOnCompleted` hooks the state machine as a continuation of that awaitable, so the runtime calls `MoveNext` again when the operation finishes.

**`MoveNext` and state numbers.** Each `await` becomes a numbered state transition. The integer `<>1__state` tracks which `await` the method is waiting on. State `-1` means "running now." States `0` and `1` correspond to resumption points after `GetAAsync` and `GetBAsync`. State `-2` means "faulted with an exception." When an awaitable is incomplete, the state machine saves its state number, stores the awaiter in a field, calls `AwaitUnsafeOnCompleted` to subscribe, and returns. When the awaited operation completes, `MoveNext` is called again, the switch statement jumps to the correct resume label, and `GetResult()` retrieves the value.

**`GetAwaiter().OnCompleted` / `AwaitUnsafeOnCompleted`.** This is how the state machine subscribes to completion. Rather than polling, the compiler calls `GetAwaiter()` on the awaited expression, checks `IsCompleted`, and if the operation is not yet done, passes the state machine itself as the continuation callback via `AwaitUnsafeOnCompleted`. The awaitable's implementation — whether it wraps I/O completion ports, timer callbacks, or task continuations — eventually invokes that callback, which calls back into `MoveNext`.

**Lifted locals.** Local variables that survive across an `await` — `a` and `b` in this example — become fields on the state machine struct. This is the allocation cost of async methods: the state machine struct is boxed onto the heap when the first incomplete await is hit. Locals that do not cross `await` boundaries remain on the stack and incur no allocation.

Three engineering consequences follow from this transformation. First, asynchronous methods are not free of allocation; the state machine box incurs GC pressure on hot paths. Second, exceptions thrown after an `await` do not surface synchronously to the caller — they fault the returned task via `SetException`. Third, a method appears to "return" before its work is finished because what it returns is the task — the promise of eventual completion — not the final result.

## Awaitables And The Awaiter Pattern

In normal application code, the most common awaitable types are `Task`, `Task<T>`, `ValueTask`, and `ValueTask<T>`. The language, however, is defined in terms of an awaiter pattern rather than a hard dependency on `Task`.

An awaitable type must provide the members that allow the compiler to ask whether the operation is complete, how to schedule continuation, and how to retrieve the result. Most developers do not implement custom awaitables directly, but understanding that `await` is pattern-based helps explain why the feature is broader than one library type.

## Continuations, Context, And Resumption

When an awaited operation completes, the rest of the asynchronous method continues as a continuation. Where that continuation runs depends on the captured `SynchronizationContext` or `TaskScheduler`.

The capture happens at each `await` point, not just at method entry. When the compiler encounters `await`, it calls `SynchronizationContext.Current` (if non-null) or `TaskScheduler.Current` and stores the result. When the awaited operation completes and the continuation is scheduled, the runtime posts the remainder of the method to that captured context. If no context was captured — either because none existed or because `ConfigureAwait(false)` suppressed the capture — the continuation runs on an available thread-pool thread.

In UI applications (WPF, WinForms), `SynchronizationContext.Current` is a context that marshals work to the UI thread, so continuations resume on the UI thread automatically. In classic ASP.NET, a request-scoped `AspNetSynchronizationContext` serialized continuations onto the request thread. In ASP.NET Core, there is no classic request `SynchronizationContext`; `SynchronizationContext.Current` is null, so continuations resume on any available thread-pool thread without request-thread affinity.

This context behavior explains why sync-over-async deadlocks in some environments:

```text
UI thread enters synchronous method
UI thread calls async method
async method reaches first incomplete await
async method captures UI SynchronizationContext
async method returns an incomplete Task to caller
caller blocks UI thread on task.Result
UI thread is now blocked, waiting for the task to complete
awaited operation completes
continuation attempts to post to captured UI SynchronizationContext
UI thread is still blocked — it cannot process the posted continuation
task never completes → deadlock
```

ASP.NET Core avoids this exact deadlock pattern because there is no SynchronizationContext demanding the original thread. However, blocking on async code in ASP.NET Core still occupies worker threads that could otherwise serve other requests or run queued continuations, creating starvation under load rather than a clean deadlock.

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

A fuller application slice makes that propagation easier to see:

```csharp
public sealed class UserRepository
{
    private readonly AppDbContext _dbContext;

    public UserRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<UserDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        return _dbContext.Users
            .Where(user => user.Id == id)
            .Select(user => new UserDto(user.Id, user.Name))
            .FirstOrDefaultAsync(ct);
    }
}

public sealed class UserService
{
    private readonly UserRepository _repository;

    public UserService(UserRepository repository)
    {
        _repository = repository;
    }

    public Task<UserDto?> GetUserAsync(int id, CancellationToken ct)
    {
        return _repository.GetByIdAsync(id, ct);
    }
}

[ApiController]
[Route("api/users")]
public sealed class UsersController : ControllerBase
{
    private readonly UserService _userService;

    public UsersController(UserService userService)
    {
        _userService = userService;
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserDto>> GetById(int id, CancellationToken ct)
    {
        var user = await _userService.GetUserAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }
}
```

Once the repository boundary is truly asynchronous, the surrounding service and controller boundaries usually become asynchronous too if the application wants to preserve the scalability benefit instead of blocking it away later.

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

Asynchronous composition is about both latency and load shape.

## Async Streams And Incremental Consumption

Not all asynchronous workflows naturally produce one final result. Some produce a sequence over time. `IAsyncEnumerable<T>` exists for that shape:

```csharp
public async IAsyncEnumerable<OrderDto> StreamOrdersAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    foreach (var order in await _repository.GetRecentOrdersAsync(ct))
    {
        ct.ThrowIfCancellationRequested();
        yield return order;
    }
}
```

Consumption uses `await foreach`:

```csharp
await foreach (var order in _service.StreamOrdersAsync(ct))
{
    Console.WriteLine(order.Id);
}
```

This matters because `Task<List<T>>` and `IAsyncEnumerable<T>` express different contracts. A task returning a list means "wait, then receive the whole collection." An async stream means "consume elements as asynchronous work produces them." That difference affects memory usage, cancellation timing, first-item latency, and API expectations.

In practice, the activation and verification path is visible at the call site. If consumers use `await foreach`, the API is exposing incremental asynchronous consumption rather than one buffered result. If the implementation silently buffers everything before the first `yield return`, the API may still compile but fail to deliver the streaming behavior its shape implies.

## Blocking Defeats The Model

One of the most expensive mistakes in C# asynchronous code is sync-over-async: forcing asynchronous operations back into synchronous waiting.

```csharp
var result = GetUserAsync(id).Result;
var other = GetUserAsync(id).GetAwaiter().GetResult();
```

Both calls block the calling thread until the task completes, but they differ in how exceptions surface. `Task.Result` wraps any exception thrown inside the task in an `AggregateException`, which callers must unwrap to inspect the original failure. `GetAwaiter().GetResult()` re-throws the original exception directly — without the `AggregateException` wrapper — preserving the original stack trace. This makes `GetAwaiter().GetResult()` slightly less dangerous for diagnostic purposes, but both forms are fundamentally problematic because both block the thread.

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

Continuation context is part of asynchronous behavior, and library code often needs to be more conservative about context capture than top-level application code.

In ASP.NET Core request code, adding `ConfigureAwait(false)` usually does not change the fundamental continuation model because there is no classic request synchronization context to escape. In UI code or reusable libraries, the same choice can matter far more.

**.NET 8 introduced `ConfigureAwaitOptions`** as an overload to `ConfigureAwait`, accepting a flags enum rather than a single boolean:

```csharp
await operation.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
```

`ConfigureAwaitOptions` provides three flags:

- `None` — equivalent to `ConfigureAwait(true)`, continues on the captured context.
- `ContinueOnCapturedContext` — explicit equivalent of `true`; continues on the captured SynchronizationContext or TaskScheduler.
- `SuppressThrowing` — suppresses the exception that would otherwise be thrown when the awaited operation is already in a faulted or canceled state at the point of `await`. This is useful when the caller intends to inspect the task's status directly after `await` without exception overhead.

The `SuppressThrowing` option addresses a specific performance concern: when code awaits an operation that may have already faulted, the default behavior throws immediately, and catching that exception allocates. With `SuppressThrowing`, the `await` expression simply evaluates without throwing; the caller can then check `task.IsFaulted` or `task.Status` and handle the failure without exception allocation. This is a micro-optimization for hot paths, not a general-purpose pattern.

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

A more realistic cache-first example looks like this:

```csharp
public sealed class UserCacheService
{
    private readonly IMemoryCache _cache;
    private readonly UserRepository _repository;

    public UserCacheService(IMemoryCache cache, UserRepository repository)
    {
        _cache = cache;
        _repository = repository;
    }

    public ValueTask<UserDto?> GetUserAsync(int id, CancellationToken ct)
    {
        if (_cache.TryGetValue(id, out UserDto? cached))
        {
            return ValueTask.FromResult(cached);
        }

        return new ValueTask<UserDto?>(LoadAndCacheAsync(id, ct));
    }

    private async Task<UserDto?> LoadAndCacheAsync(int id, CancellationToken ct)
    {
        var user = await _repository.GetByIdAsync(id, ct);

        if (user is not null)
        {
            _cache.Set(id, user, TimeSpan.FromMinutes(5));
        }

        return user;
    }
}
```

This example shows why `ValueTask` is an optimization tool rather than a stylistic preference. The API uses it only because a substantial portion of calls may complete synchronously from the cache.

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

## The Danger Of `async void`

`async void` is a distinct and dangerous pattern. Unlike `async Task`, an `async void` method produces no task that the caller can observe. There is no handle for tracking completion, no mechanism for the caller to catch exceptions, and no way to know whether the work finished or failed.

The mechanism-level problem is this: when an `async void` method throws an unhandled exception, it cannot store it in a returned task (there is none), so the exception propagates directly to the `SynchronizationContext` that was active when the method was called. If no context captured it — which is common in ASP.NET Core and console applications — the exception crashes the process.

```csharp
public sealed class PaymentForm
{
    public PaymentForm()
    {
        // async void event handler — the only tolerated async void pattern
        SubmitButton.Click += async (sender, args) =>
        {
            try
            {
                await SubmitPaymentAsync();
            }
            catch (Exception ex)
            {
                // Exception MUST be caught here; it cannot escape the handler
                _logger.LogError(ex, "Payment submission failed");
                ShowError("Payment failed. Please try again.");
            }
        };
    }

    private async Task SubmitPaymentAsync()
    {
        await _paymentService.ProcessAsync();
    }
}
```

UI event handlers are the one place `async void` is unavoidable — event handler signatures are fixed and return `void`. Every other case should use `async Task`. Even fire-and-forget work should prefer `async Task` with a safety net:

```csharp
public IActionResult Submit()
{
    _ = Task.Run(async () =>
    {
        try
        {
            await SendEmailAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Background email send failed");
        }
    });

    return Accepted();
}
```

The `TaskScheduler.UnobservedTaskException` event provides a last-resort safety net for tasks whose exceptions were never observed, but relying on it is fragile. The event fires during garbage collection, which may be far removed from the original failure context, making diagnosis difficult.

When work must outlive the request and survive failures, it belongs in a queue, background worker, scheduler, or message-driven system. `IHostedService` and `BackgroundService` provide the correct infrastructure for long-lived background work, with built-in support for graceful shutdown, dependency injection, and structured error handling.

```csharp
public sealed class EmailBackgroundWorker : BackgroundService
{
    private readonly IEmailQueue _queue;
    private readonly ILogger<EmailBackgroundWorker> _logger;

    public EmailBackgroundWorker(IEmailQueue queue, ILogger<EmailBackgroundWorker> logger)
    {
        _queue = queue;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var email = await _queue.DequeueAsync(stoppingToken);
                await SendEmailAsync(email, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send queued email");
            }
        }
    }

    private static Task SendEmailAsync(Email email, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

This is the architectural alternative to fire-and-forget: explicit queueing, explicit worker lifecycle, and explicit failure handling. The cost is infrastructure complexity; the benefit is reliability under load, restart, and failure.

## `TaskCompletionSource` — Bridging Callback APIs To Async/Await

Not all asynchronous work originates from `Task`-based APIs. Callback-based APIs, event-based patterns, and external signaling mechanisms do not expose awaitable tasks. `TaskCompletionSource<T>` bridges these patterns by creating a `Task<T>` whose completion is controlled manually.

```csharp
public sealed class ConnectionMonitor
{
    private readonly TcpClient _client;

    public ConnectionMonitor(TcpClient client)
    {
        _client = client;
    }

    public Task WaitForDisconnectAsync(CancellationToken ct)
    {
        var tcs = new TaskCompletionSource<bool>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        ct.Register(() => tcs.TrySetCanceled(ct));

        _client.Disconnected += () => tcs.TrySetResult(true);

        // If already disconnected, complete immediately
        if (!_client.Connected)
        {
            tcs.TrySetResult(true);
        }

        return tcs.Task;
    }
}
```

The key design choices in `TaskCompletionSource` usage are:

- **`TaskCreationOptions.RunContinuationsAsynchronously`** — forces continuations to run on the thread pool rather than inline on the thread that calls `TrySetResult`. This prevents the completing thread from being hijacked by arbitrary continuation code, which matters when the completing thread holds locks or is itself a sensitive resource.
- **`TrySetResult` vs `SetResult`** — `TrySetResult` returns `false` if the task is already completed (instead of throwing), which is safer when multiple paths might attempt to complete the same source.
- **Cancellation registration** — linking a `CancellationToken` to `TrySetCanceled` ensures the task observes the same cancellation signal as the rest of the system.

A more complex example bridges the legacy `WebRequest.BeginGetResponse` / `EndGetResponse` APM pattern:

```csharp
public static Task<WebResponse> GetResponseAsync(this WebRequest request)
{
    var tcs = new TaskCompletionSource<WebResponse>(
        TaskCreationOptions.RunContinuationsAsynchronously);

    request.BeginGetResponse(asyncResult =>
    {
        try
        {
            var response = request.EndGetResponse(asyncResult);
            tcs.TrySetResult(response);
        }
        catch (Exception ex)
        {
            tcs.TrySetException(ex);
        }
    }, null);

    return tcs.Task;
}
```

`TaskCompletionSource` is also the foundation for converting between different task shapes, implementing timeouts as tasks, and building custom coordination primitives.

## Scenarios Where Async Adds Cost Without Benefit

Async is a mechanism, not a stylistic default. Several scenarios are better served by synchronous code or different asynchronous patterns.

**Trivially fast operations.** If a method always completes in microseconds — a dictionary lookup, an in-memory computation, a simple property access — the state machine allocation and continuation scheduling overhead may exceed the cost of the operation itself. Profiling decides this; guessing does not.

```csharp
// Synchronous is appropriate: no I/O, no blocking, completes in nanoseconds
public string Normalize(string input)
{
    return input.Trim().ToUpperInvariant();
}
```

**CPU-bound parallel work.** Making a method `async` and wrapping CPU work in `Task.Run` does not reduce computation cost. It repackages it. For CPU-bound work that benefits from parallelism, `Parallel.ForEach`, PLINQ, or `Task.Run` with explicit degree-of-parallelism control are more appropriate than sprinkling `async` on every method.

**Methods that only call synchronous dependencies.** If the entire call chain is synchronous, adding `async Task` to the outermost method adds allocation overhead without enabling any non-blocking behavior. Async should propagate outward from genuinely asynchronous I/O, not inward from an API preference.

**Constructor logic.** Constructors cannot be `async`. Work that requires asynchronous initialization should use a factory pattern (`static async Task<MyService> CreateAsync()`) or defer initialization to a separate `InitializeAsync` method called after construction, typically wired through dependency injection lifecycle hooks.

**Properties.** Properties cannot be `async` in C#. Properties that would require asynchronous work to compute signal a design tension: either the value should be eagerly loaded, cached with a synchronous fallback, or exposed as a `Task<T>`-returning method instead.

The principle is straightforward: async exists to avoid blocking threads during I/O-bound waits. When there is no I/O-bound wait to avoid, async adds complexity without adding value.
