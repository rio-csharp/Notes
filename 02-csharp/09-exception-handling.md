# C# Exception Handling

## Core Idea

Exceptions are the mechanism C# uses to represent failures that interrupt normal control flow. They are not merely an error-reporting convenience. They are part of the contract between code that detects failure and code that decides whether the failure can be handled, translated, retried, or allowed to terminate the operation.

Engineering discipline around exceptions covers when to throw them, where to catch them, how to preserve diagnostic value, and how to map failures cleanly across domain, application, infrastructure, and API boundaries.

## Exceptions Are For Broken Normal Flow

An exception should indicate that the current path cannot proceed normally. That may be because required data is missing, an invariant has been violated, a dependency call failed, or an unexpected runtime condition occurred.

This is different from ordinary branching logic. If a user supplies invalid input and the application is intentionally validating that input, a result object, model-state error, or explicit conditional branch may be clearer than throwing and catching exceptions as part of routine flow. If a domain rule is violated inside a rich model, however, an exception may be the cleanest way to stop the operation immediately and prevent invalid state from spreading.

```csharp
public void Submit()
{
    if (Status == OrderStatus.Submitted)
    {
        throw new OrderAlreadySubmittedException(Id);
    }

    Status = OrderStatus.Submitted;
}
```

The main distinction is whether the failure is part of expected conversational flow with the caller or whether it represents a broken operation that should unwind the current execution path.

## Catch Only When It Improves The Outcome

The presence of a `catch` block should usually answer a clear question: what useful thing happens here that would not happen if the exception simply continued upward?

Useful reasons to catch include:

- adding business or diagnostic context to logs;
- translating an infrastructure exception into an application-level error;
- compensating for partial work;
- retrying a transient dependency failure;
- mapping an exception to an API response or UI result.

What usually does not help is catching an exception only to hide it or to log it repeatedly at every layer.

```csharp
try
{
    await ProcessOrderAsync(orderId, ct);
}
catch (NotFoundException ex)
{
    _logger.LogWarning(ex, "Order {OrderId} was not found.", orderId);
    throw;
}
```

This catch is defensible because it adds request-specific context and still preserves the failure for higher layers that may need to translate it further. A catch block that simply logs "error happened" and swallows the exception usually destroys information while leaving the system in a less predictable state.

## Preserving The Original Stack Trace

When rethrowing, the difference between `throw;` and `throw ex;` is critical.

```csharp
catch (Exception)
{
    throw;
}
```

```csharp
catch (Exception ex)
{
    throw ex;
}
```

`throw;` preserves the original stack trace. `throw ex;` resets it to the rethrow location. In layered applications, that lost stack information can turn a straightforward diagnosis into a frustrating reconstruction exercise. Unless the code is intentionally wrapping the exception in a new one, preserving the original stack should be the default.

## Custom Exceptions And Semantic Meaning

Custom exceptions are useful when the application needs to communicate a failure category that matters to business logic, API mapping, or operational handling.

```csharp
public sealed class DomainException : Exception
{
    public DomainException(string message) : base(message)
    {
    }
}
```

More specific exceptions often improve clarity further:

```csharp
public sealed class OrderAlreadySubmittedException : DomainException
{
    public OrderAlreadySubmittedException(int orderId)
        : base($"Order {orderId} has already been submitted.")
    {
        OrderId = orderId;
    }

    public int OrderId { get; }
}
```

This helps in three ways. It makes domain rules easier to understand in code, enables targeted handling at boundaries, and avoids collapsing every failure into `InvalidOperationException` or `Exception` — while giving genuinely different failure modes names that the surrounding system can reason about.

## Exception Filters And Selective Handling

Exception filters make handling more precise because they allow the code to catch only the cases it truly understands.

```csharp
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    _logger.LogInformation("Operation cancelled.");
}
```

```csharp
catch (SqlException ex) when (IsUniqueConstraintViolation(ex))
{
    throw new ConflictException("A user with this email already exists.", ex);
}
```

Exception filters execute in a specific runtime context that makes them more powerful than branching inside a catch block. The CLR evaluates the filter predicate *before* the stack has been unwound. This means the filter can inspect the exception and the program state at the point of the throw — not after the frames between the throw site and the catch site have been torn down. In diagnostic terms, this preserves the original call stack for any logging or inspection that occurs inside the filter predicate.

When an exception is caught and then rethrown inside the catch block (even with `throw;`), the stack has already been unwound to the catch site. Any logging at that point sees the truncated stack. A filter, by contrast, can log the full failure context and still decline to handle the exception, letting it propagate with no change to its original stack trace. This distinction is subtle but important in production diagnostics: the filter can enrich observability without consuming the exception.

The pattern is not limited to logging. A filter can also decide handling based on mutable state that would have already changed by the time a catch block runs — precisely because the filter runs before unwinding. This is the reason filters are the preferred mechanism for discriminating among failure modes within a single exception type: the decision occurs at the richest possible point of diagnostic visibility.

## Asynchronous Exceptions And Observation

Asynchronous methods do not throw to the caller in the same way synchronous methods do once execution has crossed an `await`. Instead, the exception is captured in the returned task and rethrown when that task is awaited.

```csharp
try
{
    await DoWorkAsync();
}
catch (Exception ex)
{
    _logger.LogError(ex, "Work failed.");
}
```

This behavior makes one pitfall especially significant:

```csharp
var task = DoWorkAsync();
```

If the task is never awaited or otherwise observed, the exception may surface too late, in the wrong place, or only through generic failure hooks. In production systems, detached asynchronous work should usually run under a durable execution model such as a background worker, job scheduler, or message consumer rather than as an unobserved task.

## Capturing Exceptions Across Async Boundaries

When an exception must be captured at one point in the call stack and rethrown later — across an `await` boundary, from a queue, or from a callback — the `ExceptionDispatchInfo` class preserves the original stack trace and call context. Without it, a simple `throw capturedException;` resets the stack to the rethrow site, losing the original failure location.

```csharp
ExceptionDispatchInfo _capturedFailure;

public void RecordFailure(Exception ex)
{
    _capturedFailure = ExceptionDispatchInfo.Capture(ex);
}

public void RethrowIfFailed()
{
    _capturedFailure?.Throw();
}
```

`ExceptionDispatchInfo.Throw()` rethrows the exception with its original stack trace intact, even if the rethrow occurs on a different thread or after multiple asynchronous continuations. The original `StackTrace` and `WatsonBuckets` are preserved as they were at the point of capture.

This is distinct from `throw;` inside a catch block, which also preserves the stack but only works when the exception is still in flight on the same stack. `ExceptionDispatchInfo` is designed for the case where the exception has been stored and must be rethrown after the original catch frame has been exited — a common requirement in asynchronous coordination, retry queues, and out-of-process dispatch patterns.

In ASP.NET Core, the `IExceptionHandler` infrastructure internally relies on `ExceptionDispatchInfo` semantics to ensure that when a handled exception is optionally rethrown, diagnostic fidelity is not degraded by the middleware pipeline's asynchronous execution model.

## Domain, Application, Infrastructure, And API Boundaries

Exception design improves when different layers of the system play distinct roles.

Inside the domain model, exceptions often protect invariants and stop invalid transitions:

```csharp
public sealed class Order
{
    public int Id { get; }
    public OrderStatus Status { get; private set; }

    public Order(int id, OrderStatus status)
    {
        Id = id;
        Status = status;
    }

    public void Cancel()
    {
        if (Status == OrderStatus.Shipped)
        {
            throw new ConflictException("Shipped orders cannot be cancelled.");
        }

        if (Status == OrderStatus.Cancelled)
        {
            return;
        }

        Status = OrderStatus.Cancelled;
    }
}
```

In application services, exceptions often represent missing entities, coordination failures, or propagated business failures:

```csharp
public sealed class CancelOrderService
{
    private readonly IOrderRepository _orders;

    public CancelOrderService(IOrderRepository orders)
    {
        _orders = orders;
    }

    public async Task CancelAsync(int orderId, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(orderId, ct);

        if (order is null)
        {
            throw new NotFoundException($"Order {orderId} was not found.");
        }

        order.Cancel();

        await _orders.SaveAsync(order, ct);
    }
}
```

At infrastructure boundaries, low-level exceptions may need translation so that the rest of the application is not tightly coupled to vendor-specific failure details.

At API boundaries, exceptions should be converted into safe and consistent client responses rather than leaked directly.

This layered view keeps rich internal semantics while preventing infrastructure noise or raw stack traces from becoming part of the external contract.

## Mapping Exceptions To API Responses

In ASP.NET Core, centralized exception handling is usually the cleanest place to translate exceptions into HTTP semantics.

```text
ValidationException -> 400 Bad Request
NotFoundException -> 404 Not Found
ConflictException -> 409 Conflict
UnauthorizedAccessException -> 403 Forbidden
Unexpected Exception -> 500 Internal Server Error
```

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, exception.Message),
            ConflictException => (StatusCodes.Status409Conflict, exception.Message),
            DomainException => (StatusCodes.Status400BadRequest, exception.Message),
            _ => (StatusCodes.Status500InternalServerError, "Unexpected error")
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "Unhandled exception.");
        }

        httpContext.Response.StatusCode = statusCode;

        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Extensions =
            {
                ["traceId"] = httpContext.TraceIdentifier
            }
        }, cancellationToken);

        return true;
    }
}
```

This keeps internal diagnostics rich while ensuring clients receive stable and non-sensitive response shapes. It also prevents controllers and endpoints from duplicating exception-to-response mapping logic repeatedly.

In ASP.NET Core, the handler becomes active only when the application registers and uses it:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
```

That activation path matters because writing a handler class alone does not change runtime behavior. The application must register the handler in the container and place the exception-handling middleware into the pipeline.

A fuller end-to-end example makes that boundary more concrete:

```csharp
public sealed class SubmitOrderEndpoint
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapPost("/orders/{id:int}/submit", HandleAsync);
    }

    private static async Task<IResult> HandleAsync(
        int id,
        SubmitOrderService service,
        CancellationToken ct)
    {
        await service.SubmitAsync(id, ct);
        return Results.NoContent();
    }
}

public sealed class SubmitOrderService
{
    private readonly IOrderRepository _orders;

    public SubmitOrderService(IOrderRepository orders)
    {
        _orders = orders;
    }

    public async Task SubmitAsync(int orderId, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(orderId, ct);

        if (order is null)
        {
            throw new NotFoundException($"Order {orderId} was not found.");
        }

        if (order.Status == OrderStatus.Submitted)
        {
            throw new ConflictException($"Order {orderId} has already been submitted.");
        }

        order.Submit();
        await _orders.SaveAsync(order, ct);
    }
}
```

At the endpoint level, there is no explicit `try/catch`. The service throws semantically meaningful exceptions, and the centralized handler translates them into stable HTTP responses. That is the architectural payoff of the pattern.

## Centralized Exception Handling: Middleware Versus IExceptionHandler

ASP.NET Core offers two primary paths for centralized exception handling, and the choice between them affects both the programming model and the runtime behavior.

The middleware approach — `app.UseExceptionHandler()` — has been available since early ASP.NET Core versions and works by catching unhandled exceptions at the middleware level, then re-executing a designated error endpoint within a fresh request pipeline. The re-execution clears the original `HttpContext` state and runs the error path as a separate request, which means the original exception is available only through `IExceptionHandlerPathFeature`:

```csharp
app.UseExceptionHandler("/error");

app.Map("/error", (HttpContext context) =>
{
    var feature = context.Features.Get<IExceptionHandlerPathFeature>();
    var exception = feature?.Error;

    return Results.Problem(
        statusCode: StatusCodes.Status500InternalServerError,
        title: "An unexpected error occurred.");
});
```

The middleware approach is simple to configure and well-suited to controller-based applications where the error-handling endpoint is a conventional MVC action. The cost is indirection: the exception is handled in a second request pipeline execution, which adds latency and loses the original request's response-writing context.

The `IExceptionHandler` interface, introduced in .NET 8, provides a more direct alternative. A handler implementing `IExceptionHandler` receives the original `HttpContext` and the exception directly, without re-execution:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();
```

When `IExceptionHandler` is registered alongside `AddProblemDetails()`, the same `app.UseExceptionHandler()` call activates the handler-based pipeline rather than the re-execution pipeline. The handler writes the response directly into the original `HttpContext`, preserving the request context and avoiding the overhead of a second pipeline execution. Multiple handlers can be registered, and the runtime invokes them in registration order until one returns `true`, indicating the exception has been handled.

The handler approach is the recommended path for new applications targeting .NET 8 or later, particularly those using minimal APIs, because it aligns with the endpoint-oriented programming model and does not require a separate error endpoint.

## Non-Exception Status Codes And StatusCodePages

Not every failure reaches the exception handler. When an endpoint returns a non-success status code through normal control flow — by calling `Results.NotFound()` or `Results.Unauthorized()`, for example — no exception is thrown, and the exception handling middleware never sees it. The response carries the status code but lacks the structured problem details body that `AddProblemDetails()` would produce for exceptions.

`UseStatusCodePages` fills this gap. The most flexible variant, `UseStatusCodePagesWithReExecute`, re-executes a status-code endpoint for any response in the 400–599 range that has not yet had a body written:

```csharp
app.UseStatusCodePagesWithReExecute("/status/{0}");

app.Map("/status/{0}", (int statusCode) =>
    Results.Problem(
        statusCode: statusCode,
        title: statusCode switch
        {
            404 => "Resource not found.",
            400 => "Invalid request.",
            _ => "An error occurred."
        }));
```

This ensures that even non-exception failures — a missing resource, an authorization denial through `Results.Forbid()` — produce consistent, structured error responses. The `{0}` placeholder in the path template receives the HTTP status code.

In .NET 8 and later, `AddProblemDetails()` combined with `IExceptionHandler` covers the exception path, while `UseStatusCodePages` covers the non-exception status-code path. Together they ensure that every error response, regardless of how it originates, conforms to the same `ProblemDetails` contract.

One of the more subtle design choices is deciding whether a failure should be represented as an exception or as a normal result.

For boundary validation, explicit results are often clearer:

```csharp
if (request.Quantity <= 0)
{
    return BadRequest("Quantity must be greater than zero.");
}
```

For internal rule enforcement, exceptions often preserve stronger invariants:

```csharp
if (Status != OrderStatus.Draft)
{
    throw new DomainException("Only draft orders can be changed.");
}
```

The difference is largely about ownership. At the system boundary, the application is often negotiating with imperfect caller input. Inside the model, it is preserving correctness. Those are related but distinct concerns, and using one mechanism for both can blur intent.

## Retrying Only Transient Failures

Retries belong to exception handling, but only for failures that are likely to succeed later.

```csharp
public async Task<string> GetWithSimpleRetryAsync(
    HttpClient client,
    string url,
    CancellationToken ct)
{
    const int maxAttempts = 3;

    for (var attempt = 1; attempt <= maxAttempts; attempt++)
    {
        try
        {
            return await client.GetStringAsync(url, ct);
        }
        catch (HttpRequestException) when (attempt < maxAttempts)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(200 * attempt), ct);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested && attempt < maxAttempts)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(200 * attempt), ct);
        }
    }

    throw new InvalidOperationException("Retry loop ended unexpectedly.");
}
```

This works because the handled failures are plausibly transient. Validation failures, authorization failures, and invariant violations are different. Retrying them only repeats a guaranteed failure. In production systems, resilience libraries such as Polly often provide a stronger and more observable approach, but the design principle remains the same: retry based on failure semantics, not on the mere existence of an exception.

## Exception Handling In Background Services

Background services run continuously and without a surrounding request context, which changes the exception handling model. There is no HTTP pipeline to translate exceptions into responses, and no caller to observe the failure. The service itself owns the entire failure lifecycle: detect, decide, retry or abandon, and ensure the loop continues.

A `BackgroundService` should catch at the top level of its execution loop. An unhandled exception that escapes `ExecuteAsync` terminates the entire host process unless an `IHostedService` wrapper or the host itself catches it. The default behavior in .NET's generic host is to stop the host on an unobserved background exception, which is rarely the desired outcome for a service that should remain resilient.

```csharp
public sealed class OrderProcessingService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderProcessingService> _logger;
    private readonly IHostApplicationLifetime _lifetime;

    public OrderProcessingService(
        IServiceScopeFactory scopeFactory,
        ILogger<OrderProcessingService> logger,
        IHostApplicationLifetime lifetime)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _lifetime = lifetime;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Background service shutting down.");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled exception in background processing loop.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<IBatchHandler>();

        await handler.ProcessNextBatchAsync(ct);
    }
}
```

The top-level catch for general exceptions prevents the loop from terminating. The delay before continuing serves as a simple backpressure mechanism: if the failure is caused by a transient infrastructure outage, immediate retry would only hammer the failing dependency. In practice, the delay strategy often escalates from a fixed pause to exponential backoff, similar to the HTTP retry pattern, but bounded so that the service does not back off so long that it appears dead.

Exponential backoff can be layered into the loop without introducing additional libraries:

```csharp
private async Task ExecuteWithBackoffAsync(CancellationToken ct)
{
    var consecutiveFailures = 0;
    const int maxBackoffSeconds = 60;

    while (!ct.IsCancellationRequested)
    {
        try
        {
            await ProcessBatchAsync(ct);
            consecutiveFailures = 0;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            break;
        }
        catch (Exception ex)
        {
            consecutiveFailures++;
            var delay = TimeSpan.FromSeconds(
                Math.Min(Math.Pow(2, consecutiveFailures), maxBackoffSeconds));

            _logger.LogError(ex,
                "Batch processing failed. Backing off {DelaySeconds}s (failure {FailureCount}).",
                delay.TotalSeconds, consecutiveFailures);

            await Task.Delay(delay, ct);
        }
    }
}
```

`IHostApplicationLifetime` provides the coordination point for graceful shutdown. When `ApplicationStopping` or `ApplicationStopped` is triggered — typically by a SIGTERM signal in containerized deployments — the cancellation token passed to `ExecuteAsync` is cancelled. The background service detects this through the `OperationCanceledException` filter and exits cleanly. A service that ignores the cancellation token during a long-running operation will be forcibly terminated when the host shutdown timeout expires, potentially abandoning in-flight work.

## Exception Handling In Message Consumers

Message-driven systems introduce an additional dimension: the message broker itself participates in the failure model. When a consumer throws an exception while processing a message, the broker must decide whether to redeliver the message, move it to a dead-letter queue, or discard it. The exception thrown by the handler directly influences that broker-level decision, which makes the exception's semantic meaning as important inside the consumer as it is at an HTTP boundary.

In Azure Service Bus, the `ServiceBusProcessor` and `ServiceBusSender` surfaces expose this relationship through the `ProcessMessageEventArgs` and `ProcessErrorEventArgs`:

```csharp
public sealed class OrderMessageHandler : IHostedService
{
    private readonly ServiceBusProcessor _processor;
    private readonly ILogger<OrderMessageHandler> _logger;

    public async Task StartAsync(CancellationToken ct)
    {
        _processor.ProcessMessageAsync += HandleMessageAsync;
        _processor.ProcessErrorAsync += HandleErrorAsync;
        await _processor.StartProcessingAsync(ct);
    }

    private async Task HandleMessageAsync(ProcessMessageEventArgs args)
    {
        try
        {
            await ProcessOrderMessageAsync(args.Message, args.CancellationToken);

            // Success: complete the message so it is removed from the queue.
            await args.CompleteMessageAsync(args.Message);
        }
        catch (ConflictException ex)
        {
            // Domain rule violation: the message will never succeed.
            // Dead-letter immediately rather than retrying.
            _logger.LogWarning(ex, "Conflict processing message {MessageId}. Dead-lettering.",
                args.Message.MessageId);
            await args.DeadLetterMessageAsync(args.Message, "Conflict", ex.Message);
        }
        catch (JsonException ex)
        {
            // Unreadable payload: retrying will not fix it.
            _logger.LogError(ex, "Unreadable message body for {MessageId}.",
                args.Message.MessageId);
            await args.DeadLetterMessageAsync(args.Message, "MalformedPayload", ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Transient failure processing message {MessageId}. Abandoning.",
                args.Message.MessageId);

            // Abandon: return the message to the queue for redelivery.
            // The broker's MaxDeliveryCount will eventually dead-letter if
            // the failure persists across all delivery attempts.
            await args.AbandonMessageAsync(args.Message);
        }
    }

    private Task HandleErrorAsync(ProcessErrorEventArgs args)
    {
        // ProcessError fires for infrastructure-level errors (connection loss,
        // authentication failures, etc.) — not for handler exceptions.
        _logger.LogError(args.Exception, "Service Bus processor error: {ErrorSource}.",
            args.ErrorSource);
        return Task.CompletedTask;
    }
}
```

The decision tree is explicit: domain invariants and malformed payloads are poison messages that will never succeed regardless of delivery count, so they go directly to the dead-letter queue. Transient failures — network blips, database timeouts, temporary downstream unavailability — abandon the message back to the queue for retry. The broker enforces an upper bound through `MaxDeliveryCount`; if every delivery attempt throws a transient exception, the message eventually dead-letters automatically, protecting the system from infinite retry loops.

RabbitMQ consumers follow the same principle through a different mechanism. Acknowledging (`BasicAck`) removes the message; rejecting without requeue (`BasicNack` with `requeue: false`) sends it to the dead-letter exchange; rejecting with requeue returns it to the queue:

```csharp
catch (ConflictException)
{
    channel.BasicNack(deliveryTag, multiple: false, requeue: false);
}
catch (Exception)
{
    channel.BasicNack(deliveryTag, multiple: false, requeue: true);
}
```

The shared design principle across brokers is that the exception thrown by the handler encodes a routing decision: complete, dead-letter, or retry. Treating every exception as a retry — or every exception as fatal — eliminates the granularity the messaging infrastructure was designed to provide. The handler's catch blocks are the point where domain semantics meet infrastructure mechanics, and the mapping between them must be deliberate.

## Cancellation Is Not The Same As Failure

Cancellation deserves separate treatment from ordinary failure because it often indicates that the system behaved correctly in response to caller intent or shutdown.

```csharp
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    _logger.LogInformation("Operation was cancelled.");
}
```

Treating all cancellations as errors can distort logs, metrics, and alerts. In asynchronous systems especially, distinguishing between "the work failed" and "the work was no longer needed" is operationally important.
