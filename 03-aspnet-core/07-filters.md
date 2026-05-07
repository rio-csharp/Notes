# ASP.NET Core Filters

## Core Idea

Filters are part of MVC execution rather than part of the global HTTP pipeline. They run only when a request reaches controller-based endpoint execution, and they provide hooks around specific MVC stages such as authorization, resource execution, action execution, exception handling, and result execution.

Filters are useful when the required behavior depends on MVC-specific context such as action arguments, model state, controller metadata, or action results. They are not a general substitute for middleware — their scope is narrower and their purpose is more local to controller execution.

## Filters In The Request Flow

A controller request typically moves through the application like this:

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

Inside MVC, the filter pipeline is layered more finely:

```text
authorization filters
resource filters
  model binding
  action filters
    controller action
  exception filters
  result filters
    result execution
```

This staged model is the main reason filters exist. They allow code to intervene at points in controller execution that middleware cannot observe directly.

## Middleware And Filters Solve Different Problems

The distinction between middleware and filters is foundational.

Middleware is appropriate when behavior should apply broadly across the HTTP application, including controllers, Minimal APIs, health checks, and static files.

Filters are appropriate when behavior depends on MVC-specific information such as:

- action arguments;
- `ModelState`;
- controller/action metadata;
- MVC result execution;
- the ability to short-circuit inside controller execution.

Once this difference is clear, many design decisions become easier. Global exception handling, correlation IDs, and security headers usually belong in middleware. Model-state-dependent logic, controller action timing, and result transformation often belong in filters.

Minimal APIs have their own filter mechanism through the `IEndpointFilter` interface, which runs during endpoint execution. Endpoint filters are conceptually closer to action filters than to middleware, because they operate within the endpoint execution stage and can inspect handler arguments and results. They do not, however, have access to MVC-specific state such as `ModelState` or `ControllerContext`. The distinction is explored further in the Controllers and Minimal APIs chapter.

## Authorization Filters

Authorization filters run first inside the MVC filter pipeline.

In modern ASP.NET Core applications, however, custom authorization filters are usually not the first tool to reach for. Policy-based authorization and authorization middleware generally provide a clearer and more consistent model:

```csharp
[Authorize(Policy = "CanManageOrders")]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

Custom authorization filters still exist, but they are typically most appropriate when a very specific MVC-layer concern requires them. As a general architectural rule, policy-based authorization scales better because it keeps access logic centralized and aligned with the broader security system.

## Resource Filters

Resource filters wrap most MVC work and run before model binding.

That timing gives them a useful niche. They can short-circuit expensive MVC execution before model binding begins, or they can wrap the entire MVC handling of the request.

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

This is a good example of filter placement mattering. An action filter would run too late to avoid model binding. A resource filter can prevent that work altogether.

## Action Filters

Action filters run around controller action execution itself. They are useful when logic depends on action arguments, action metadata, or the outcome of the action.

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

Action filters are often a good fit when behavior should wrap only controller actions rather than the whole application pipeline.

## Exception Filters

Exception filters can convert selected controller-layer exceptions into MVC results.

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

This can be useful when exception translation is intentionally tied to MVC result semantics. Even so, application-wide exception handling is usually better placed in middleware or `IExceptionHandler`, because those mechanisms also cover failures outside MVC execution. Exception filters are therefore best viewed as specialized tools rather than the default global error strategy.

## Result Filters

Result filters run around action result execution.

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

They are useful when the concern is specifically about controller result behavior, such as adjusting response headers, timing result execution, or shaping certain result metadata. Their limitation is the same one found elsewhere in the response path: once the response has started, some changes are no longer safe.

## Synchronous And Asynchronous Filters

ASP.NET Core offers both synchronous and asynchronous filter interfaces.

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

The choice should follow the work being done. Synchronous filters are appropriate for fast CPU-only behavior. Asynchronous filters are appropriate when the filter needs I/O, service calls, or any awaitable workflow. Blocking on asynchronous work inside a synchronous filter is especially harmful because it hides latency inside the MVC pipeline and can contribute to thread-pool pressure.

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

## Scope And Ordering Of Filters

Filters can be applied globally, at controller scope, or at action scope.

Global registration:

```csharp
builder.Services.AddControllers(options =>
{
    options.Filters.Add<TimingFilter>();
});
```

Controller scope:

```csharp
[ServiceFilter(typeof(TimingFilter))]
public sealed class OrdersController : ControllerBase
{
}
```

Action scope:

```csharp
[TypeFilter(typeof(AuditActionFilter), Arguments = new object[] { "OrderUpdated" })]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

Ordering can also be controlled explicitly:

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

If a design depends on many filters in a fragile order, that is often a sign that too much behavior has been hidden in the filter system. Filters are useful, but they should not become a maze of implicit application control flow.

## Validation And The Modern Default

With `[ApiController]`, invalid model state is commonly handled automatically before the action executes. That makes custom validation filters less central than they once were.

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

This still illustrates how action filters can short-circuit based on MVC state, but the broader design lesson is that custom filters should exist for a real reason. If the framework already provides the desired behavior coherently, reproducing it manually often adds maintenance burden without increasing clarity.
