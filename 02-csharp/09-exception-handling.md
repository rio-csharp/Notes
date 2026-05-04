# C# Exception Handling

## Core Idea

Exceptions represent unexpected or exceptional conditions in code.

Chinese notes:

- `exception`: 异常.
- `stack trace`: 堆栈跟踪.
- `custom exception`: 自定义异常.

## Basic Try/Catch

```csharp
try
{
    await ProcessOrderAsync(orderId, ct);
}
catch (NotFoundException ex)
{
    _logger.LogWarning(ex, "Order {OrderId} was not found", orderId);
    throw;
}
```

Catching should have a purpose.

Good reasons to catch:

- add useful context to logs;
- translate exception to an API response;
- retry a transient failure;
- compensate or roll back a workflow;
- convert infrastructure errors into domain/application errors at a boundary.

Bad reason:

> Catching only because "exceptions look scary" usually hides real failures.

## throw vs throw ex

Good:

```csharp
catch (Exception)
{
    throw;
}
```

Bad:

```csharp
catch (Exception ex)
{
    throw ex;
}
```

`throw ex` resets stack trace.

## Custom Exceptions

```csharp
public sealed class DomainException : Exception
{
    public DomainException(string message) : base(message)
    {
    }
}
```

Use custom exceptions for meaningful application errors:

- validation;
- not found;
- conflict;
- domain rule violation.

Example:

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

Usage:

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

This makes the failure meaningful and easier to map to an API response.

## Exception Filters

```csharp
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    _logger.LogInformation("Operation cancelled.");
}
```

Another example:

```csharp
catch (SqlException ex) when (IsUniqueConstraintViolation(ex))
{
    throw new ConflictException("A user with this email already exists.", ex);
}
```

Why filters are useful:

> They let you catch only the cases you can handle while allowing other exceptions of the same type to continue upward.

## Async Exceptions

Exceptions in async methods are captured in returned `Task`.

```csharp
try
{
    await DoWorkAsync();
}
catch (Exception ex)
{
    _logger.LogError(ex, "Work failed");
}
```

Important:

```csharp
var task = DoWorkAsync();
```

If you never await or observe `task`, exceptions may not be handled where you expect.

Better:

```csharp
await DoWorkAsync();
```

For background jobs, let the job framework or worker catch, log, retry, and dead-letter failures.

## API Error Mapping

In ASP.NET Core, do not expose raw exception details to clients.

Example mapping:

```text
ValidationException -> 400 Bad Request
NotFoundException -> 404 Not Found
ConflictException -> 409 Conflict
UnauthorizedAccessException -> 403 Forbidden
Unexpected Exception -> 500 Internal Server Error
```

Example shape:

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
        var statusCode = exception switch
        {
            ValidationException => StatusCodes.Status400BadRequest,
            NotFoundException => StatusCodes.Status404NotFound,
            ConflictException => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status500InternalServerError
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "Unhandled exception.");
        }

        httpContext.Response.StatusCode = statusCode;

        await httpContext.Response.WriteAsJsonAsync(new
        {
            title = statusCode == 500 ? "Unexpected error" : exception.Message,
            status = statusCode,
            traceId = httpContext.TraceIdentifier
        }, cancellationToken);

        return true;
    }
}
```

Key point:

> Client responses should be safe and consistent. Logs should contain full diagnostic details.

## Exceptions vs Validation Results

Use validation results for expected user input problems.

```csharp
if (request.Quantity <= 0)
{
    return BadRequest("Quantity must be greater than zero.");
}
```

Use exceptions for unexpected failures or domain rules that should interrupt the workflow.

```csharp
if (Status != OrderStatus.Draft)
{
    throw new DomainException("Only draft orders can be changed.");
}
```

The boundary matters:

> Inside domain code, exceptions can protect invariants. At the API boundary, map them to clear HTTP responses.

## Complete Example: Domain Exception To API Response

This example shows one full path:

```text
domain rule fails
  -> domain exception is thrown
  -> application/API boundary catches it
  -> client receives safe ProblemDetails response
  -> logs keep diagnostic details
```

Domain exception base type:

```csharp
public abstract class AppException : Exception
{
    protected AppException(string message) : base(message)
    {
    }
}

public sealed class NotFoundException : AppException
{
    public NotFoundException(string message) : base(message)
    {
    }
}

public sealed class ConflictException : AppException
{
    public ConflictException(string message) : base(message)
    {
    }
}

public sealed class DomainException : AppException
{
    public DomainException(string message) : base(message)
    {
    }
}
```

Domain object:

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

public enum OrderStatus
{
    Draft,
    Submitted,
    Shipped,
    Cancelled
}
```

Application service:

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

ASP.NET Core endpoint:

```csharp
app.MapPost("/orders/{id:int}/cancel", async (
    int id,
    CancelOrderService service,
    CancellationToken ct) =>
{
    await service.CancelAsync(id, ct);
    return Results.NoContent();
});
```

Central exception handler:

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
            _logger.LogError(exception, "Unhandled exception");
        }
        else
        {
            _logger.LogInformation(
                exception,
                "Handled application exception with status {StatusCode}",
                statusCode);
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

Registration:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
```

Key point:

> Exceptions can be rich and specific inside the application, while HTTP responses stay safe, consistent, and easy for clients to handle.

## Complete Example: Retry Only Transient Failures

Do not retry every exception. Retry only failures that are likely to succeed later.

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

Important:

- do not retry validation errors;
- do not retry authorization failures;
- make writes idempotent before retrying them;
- use a library such as Polly for production-grade retry, timeout, and circuit breaker policies.

## Review Questions

### When should you catch exceptions?

> Catch exceptions when you can add meaningful handling: translate to user response, retry, compensate, log with context, or recover. Do not catch just to hide errors.

### Why is `throw;` better than `throw ex;`?

> `throw;` preserves the original stack trace. `throw ex;` resets it and makes debugging harder.

### Should exceptions be used for normal control flow?

> Usually no. Exceptions are expensive and should represent exceptional conditions, not expected branches.

### How should APIs handle unexpected exceptions?

> Log the full exception internally, return a safe `500` response with a trace ID, and avoid leaking stack traces or connection strings to the client.

### How do you handle cancellation exceptions?

> Treat expected cancellation differently from failure. If the request was cancelled, log at a lower level or not at all depending on policy, and avoid reporting it as an application error.

## Common Mistakes

### Mistake: Swallowing exceptions.

Why it is wrong:

> The system fails silently, making production issues hard to detect and debug.

Better answer:

> Handle the exception meaningfully or let it bubble to centralized error handling.

### Mistake: Catching all exceptions and returning success.

Why it is wrong:

> It lies to callers and can corrupt workflows. A failed payment, file upload, or database write should not look successful.

Better answer:

> Return the correct error response or retry/compensate when appropriate.

### Mistake: Logging and rethrowing everywhere causing duplicate logs.

Why it is wrong:

> The same error appears many times, making incidents noisy and harder to understand.

Better answer:

> Log where useful context exists or at the top-level handler, not blindly at every layer.

### Mistake: Exposing internal exception details to clients.

Why it is wrong:

> Stack traces, SQL details, paths, and configuration values can leak implementation or security-sensitive information.

Better answer:

> Return safe error messages with trace IDs; keep details in logs.

### Mistake: Using exceptions for common validation flow.

Why it is wrong:

> Expected input errors are normal control flow and can be represented clearly as validation results.

Better answer:

> Use validation for predictable user mistakes; use exceptions for exceptional or invariant-breaking situations.
