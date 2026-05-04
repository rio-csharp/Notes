# ASP.NET Core Filters

## Core Idea

Filters run inside the MVC / controller execution pipeline. They allow you to run code before or after specific MVC stages, such as authorization, resource execution, action execution, exception handling, and result execution.

Chinese notes:

- `filter`: 过滤器.
- `action filter`: 动作过滤器.
- `resource filter`: 资源过滤器.
- `exception filter`: 异常过滤器.
- `result filter`: 结果过滤器.
- `short-circuit`: 短路, meaning stop the rest of the pipeline and return a response early.

The most important review distinction:

> Middleware is part of the global HTTP pipeline. Filters are part of MVC action execution.

So middleware can affect every request, including static files, health checks, Minimal APIs, and controllers. MVC filters only run when the request reaches MVC controller/action execution.

## Where Filters Fit In The Request Flow

A simplified request flow:

```text
HTTP request
  -> middleware pipeline
     -> routing
     -> authentication
     -> authorization middleware
     -> endpoint execution
        -> MVC filter pipeline
           -> controller action
           -> action result
  <- HTTP response
```

Inside MVC, the filter pipeline looks like this:

```text
Authorization filters
  Resource filters
    Model binding
    Action filters
      Controller action
    Exception filters
    Result filters
      Result execution
```

More precisely:

- authorization filters run early and decide whether MVC should continue;
- resource filters wrap most MVC work and can short-circuit before model binding;
- action filters run around controller action execution;
- exception filters handle exceptions from model binding, action filters, and actions, but not every possible exception in the whole app;
- result filters run around result execution, such as serializing an object to JSON.

## Filter Types

### Authorization Filters

Authorization filters run first in the MVC filter pipeline.

They are powerful but usually you should prefer ASP.NET Core authorization policies:

```csharp
[Authorize(Policy = "CanManageOrders")]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

Use custom authorization filters only when you have a very specific MVC-level reason. For most systems, policy-based authorization is clearer, testable, and consistent.

### Resource Filters

Resource filters run before model binding and after result execution.

They are useful when you need to:

- short-circuit before model binding;
- implement simple MVC-level caching;
- apply logic around the whole MVC request.

Example: reject very large requests before model binding tries to read them.

```csharp
public sealed class MaxRequestBodySizeFilter : IAsyncResourceFilter
{
    private readonly long _maxBytes;

    public MaxRequestBodySizeFilter(long maxBytes)
    {
        _maxBytes = maxBytes;
    }

    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext context,
        ResourceExecutionDelegate next)
    {
        var contentLength = context.HttpContext.Request.ContentLength;

        if (contentLength is not null && contentLength > _maxBytes)
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Title = "Request body too large",
                Status = StatusCodes.Status413PayloadTooLarge
            })
            {
                StatusCode = StatusCodes.Status413PayloadTooLarge
            };

            return;
        }

        await next();
    }
}
```

Key point:

> A resource filter can run before model binding, so it can avoid expensive binding work. An action filter runs after model binding.

### Action Filters

Action filters run before and after a controller action.

They can access:

- action arguments;
- model state;
- controller/action metadata;
- action execution result;
- exceptions thrown by the action.

Example: action timing.

```csharp
public sealed class TimingFilter : IAsyncActionFilter
{
    private readonly ILogger<TimingFilter> _logger;

    public TimingFilter(ILogger<TimingFilter> logger)
    {
        _logger = logger;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        var stopwatch = Stopwatch.StartNew();

        ActionExecutedContext? executedContext = null;

        try
        {
            executedContext = await next();
        }
        finally
        {
            stopwatch.Stop();
        }

        _logger.LogInformation(
            "Action {Action} completed in {ElapsedMilliseconds}ms with exception {ExceptionType}",
            context.ActionDescriptor.DisplayName,
            stopwatch.ElapsedMilliseconds,
            executedContext?.Exception?.GetType().Name ?? "None");
    }
}
```

Note:

> If you need `await`, use `IAsyncActionFilter`. Do not block on async work inside a synchronous filter.

### Exception Filters

Exception filters can convert selected exceptions into action results.

Example:

```csharp
public sealed class DomainExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is DomainException ex)
        {
            context.Result = new BadRequestObjectResult(new ProblemDetails
            {
                Title = "Business rule violation",
                Detail = ex.Message,
                Status = StatusCodes.Status400BadRequest
            });

            context.ExceptionHandled = true;
        }
    }
}
```

However, for global API error handling, exception middleware or `IExceptionHandler` is usually preferred.

Why?

- middleware can catch exceptions outside MVC too;
- middleware is easier to make consistent for controllers and Minimal APIs;
- middleware can run near the beginning of the HTTP pipeline;
- exception filters do not catch exceptions thrown by earlier middleware.

Practical explanation:

> I use global exception middleware for application-wide error handling. I use exception filters only for MVC-specific exception mapping when I need access to MVC context.

### Result Filters

Result filters run before and after action result execution.

They are useful when you need to:

- add response headers to MVC responses;
- transform result metadata;
- measure serialization/result execution time.

Example:

```csharp
public sealed class NoStoreResultFilter : IResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
    }

    public void OnResultExecuted(ResultExecutedContext context)
    {
    }
}
```

Be careful:

> After the response body has started, you may no longer be able to change headers or status code.

## Sync vs Async Filters

ASP.NET Core provides synchronous and asynchronous filter interfaces.

Examples:

```csharp
public sealed class LogActionFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
```

```csharp
public sealed class LogAsyncActionFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        await next();
    }
}
```

Rule of thumb:

- use synchronous filters only for fast CPU-only logic;
- use asynchronous filters when doing I/O, logging scopes, database calls, cache calls, or external calls;
- never call `.Result` or `.Wait()` on async work in a filter.

Common mistake:

```csharp
public void OnActionExecuting(ActionExecutingContext context)
{
    var user = _userService.GetCurrentUserAsync().Result; // bad
}
```

Why it is wrong:

- it blocks a thread pool thread;
- it can cause thread starvation under load;
- it hides latency inside the MVC pipeline;
- in some synchronization contexts it can deadlock, though ASP.NET Core itself does not have the classic ASP.NET synchronization context.

Better:

```csharp
public sealed class CurrentUserFilter : IAsyncActionFilter
{
    private readonly IUserService _userService;

    public CurrentUserFilter(IUserService userService)
    {
        _userService = userService;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        var user = await _userService.GetCurrentUserAsync(context.HttpContext.User);
        context.HttpContext.Items["CurrentUser"] = user;

        await next();
    }
}
```

## Filter Scope And Order

Filters can be applied globally, at controller level, or at action level.

Global registration:

```csharp
builder.Services.AddControllers(options =>
{
    options.Filters.Add<TimingFilter>();
});
```

Controller level:

```csharp
[ServiceFilter(typeof(TimingFilter))]
public sealed class OrdersController : ControllerBase
{
}
```

Action level:

```csharp
[TypeFilter(typeof(AuditActionFilter), Arguments = new object[] { "OrderUpdated" })]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

`ServiceFilter` gets the filter from DI. `TypeFilter` can create a filter with DI plus extra arguments.

If filter order matters, implement `IOrderedFilter` or use attributes with `Order`.

```csharp
public sealed class AuditActionFilter : IAsyncActionFilter, IOrderedFilter
{
    public int Order => 100;

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        await next();
    }
}
```

Important warning:

> If your design depends on many filters running in a delicate order, the solution may be too hidden and hard to maintain.

## Validation Filter Example

With `[ApiController]`, ASP.NET Core automatically returns `400 Bad Request` when model validation fails.

Still, learners often ask how a validation filter works.

Example:

```csharp
public sealed class ValidateModelFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (!context.ModelState.IsValid)
        {
            context.Result = new BadRequestObjectResult(new ValidationProblemDetails(context.ModelState)
            {
                Title = "Validation failed",
                Status = StatusCodes.Status400BadRequest
            });
        }
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
```

Why it works:

- model binding has already happened before action filters;
- validation has already populated `ModelState`;
- setting `context.Result` short-circuits the action.

Modern answer:

> In current ASP.NET Core APIs, I usually rely on `[ApiController]` for automatic model validation. I write a custom validation filter only if I need a custom response format or special MVC behavior.

## Middleware vs Filters

Use middleware for broad HTTP concerns:

- exception handling;
- correlation ID;
- request logging;
- security headers;
- rate limiting;
- response compression;
- static files;
- health checks.

Use filters for MVC/action concerns:

- action argument validation;
- action timing;
- MVC-specific exception mapping;
- result transformation;
- controller/action audit metadata.

Decision table:

| Requirement | Better fit | Why |
| --- | --- | --- |
| Add correlation ID to every request | Middleware | Applies before MVC and to all endpoints |
| Reject unauthorized users | Authorization middleware / policies | Built-in security model |
| Validate action arguments | Filter or `[ApiController]` | Needs model state and action arguments |
| Catch all app exceptions | Middleware / `IExceptionHandler` | Catches exceptions outside MVC |
| Add a header only for controller results | Result filter | MVC result context is useful |
| Measure controller action time | Action filter | Wraps action execution directly |

## Review Questions

### What are filters?

Filters are MVC components that run before or after specific MVC execution stages. They support cross-cutting concerns such as validation, action logging, exception mapping, and result transformation.

### Filter vs middleware?

Middleware is part of the global HTTP pipeline and can apply to all requests. Filters are part of MVC action execution and have access to MVC-specific information such as action arguments, `ModelState`, and `ActionResult`.

### When would you use an action filter?

Use an action filter when the logic depends on controller action execution, action arguments, model state, or action results. Examples include action timing, audit logging, and custom validation.

### When would you use a resource filter?

Use a resource filter when you need to run code before model binding or wrap most of MVC execution. For example, you might short-circuit large requests or implement MVC-level caching.

### Why are exception filters not always enough for global error handling?

Exception filters only run inside MVC. They do not catch exceptions from earlier middleware, routing, static files, authentication middleware, or Minimal API handlers outside MVC. Global exception middleware or `IExceptionHandler` is broader.

### What happens if a filter sets `context.Result`?

It short-circuits the current MVC stage. For example, an action filter can set `context.Result` during `OnActionExecuting`, and the controller action will not run.

## Common Mistakes

### Mistake: Using filters for things that belong in middleware

Why it is wrong:

> Filters only run for MVC actions. If you put correlation ID, security headers, or global exception handling only in filters, non-MVC endpoints may not get the same behavior.

Better answer:

> Use middleware for global HTTP concerns and filters for controller/action concerns.

### Mistake: Using exception filters for all global exception handling

Why it is wrong:

> Exception filters do not cover the whole ASP.NET Core pipeline. Exceptions can happen before MVC starts.

Better answer:

> Prefer exception middleware or `IExceptionHandler` for consistent app-level error handling. Use exception filters only for MVC-specific cases.

### Mistake: Forgetting filter order

Why it is wrong:

> Authorization filters, resource filters, action filters, exception filters, and result filters run at different stages. If you expect an action filter to run before model binding, your design is wrong.

Better answer:

> Choose the filter type based on the MVC stage where the logic must run.

### Mistake: Adding heavy business logic to filters

Why it is wrong:

> Filters hide behavior away from the action and make business workflows harder to read, test, and debug.

Better answer:

> Keep filters focused on cross-cutting infrastructure concerns. Put business rules in services or domain logic.

### Mistake: Blocking async work in synchronous filters

Why it is wrong:

> Blocking async work wastes thread pool threads and can harm throughput under load.

Better answer:

> Use async filter interfaces when the filter performs asynchronous work.

## Practice Task

Create:

1. a timing action filter;
2. a validation filter;
3. a domain exception filter;
4. a result filter that adds `Cache-Control: no-store`;
5. the same correlation ID logic as middleware and explain why middleware is the better fit.
