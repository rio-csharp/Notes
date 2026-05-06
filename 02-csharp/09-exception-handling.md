# C# Exception Handling

## Core Idea

Exceptions are the mechanism C# uses to represent failures that interrupt normal control flow. They are not merely an error-reporting convenience. They are part of the contract between code that detects failure and code that decides whether the failure can be handled, translated, retried, or allowed to terminate the operation.

This chapter focuses on engineering discipline around exceptions: when to throw them, where to catch them, how to preserve diagnostic value, and how to map failures cleanly across domain, application, infrastructure, and API boundaries.

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

## Catch Only When You Can Improve The Outcome

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

This helps in three ways. It makes domain rules easier to understand in code, enables targeted handling at boundaries, and avoids collapsing every failure into `InvalidOperationException` or `Exception`. The goal is not to create dozens of novelty exception types. The goal is to give genuinely different failure modes names that the surrounding system can reason about.

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

This is better than catching a broad exception and then branching inside the catch block because exceptions that do not match the filter continue up the stack untouched. Filters are especially helpful when one framework exception type can represent several operational situations but only some of them should be translated.

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

This behavior makes one pitfall especially important:

```csharp
var task = DoWorkAsync();
```

If the task is never awaited or otherwise observed, the exception may surface too late, in the wrong place, or only through generic failure hooks. In production systems, detached asynchronous work should usually run under a durable execution model such as a background worker, job scheduler, or message consumer rather than as an unobserved task.

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

## Exceptions Versus Validation Results

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

## Cancellation Is Not The Same As Failure

Cancellation deserves separate treatment from ordinary failure because it often indicates that the system behaved correctly in response to caller intent or shutdown.

```csharp
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    _logger.LogInformation("Operation was cancelled.");
}
```

Treating all cancellations as errors can distort logs, metrics, and alerts. In asynchronous systems especially, distinguishing between "the work failed" and "the work was no longer needed" is operationally important.
