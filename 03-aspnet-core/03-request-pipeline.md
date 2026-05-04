# ASP.NET Core Request Pipeline

## Core Idea

The ASP.NET Core request pipeline is a chain of middleware components that handle every HTTP request.

Each middleware can:

- inspect the request;
- modify the request;
- call the next middleware;
- short-circuit the pipeline;
- modify the response;
- handle exceptions.

Chinese note:

- `middleware` means 中间件.
- `pipeline` means 请求处理管道.
- `short-circuit` means 短路，不再继续往后执行.

## Typical Pipeline

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

Ordering matters.

For example:

- `UseRouting` should happen before endpoint execution.
- `UseAuthentication` should run before `UseAuthorization`.
- exception handling should be early.
- CORS must be placed correctly for endpoint routing.

More production-like order:

```csharp
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapControllers();
```

Why this order:

- exception handling should wrap most downstream work;
- HTTPS redirection happens before normal endpoint processing;
- routing chooses endpoint metadata;
- CORS needs to run before endpoint response;
- authentication builds `HttpContext.User`;
- authorization reads user plus endpoint metadata;
- endpoints execute last.

## Middleware Flow

Conceptually:

```text
Request
  -> Exception middleware
  -> HTTPS redirection
  -> Static files
  -> Routing
  -> CORS
  -> Authentication
  -> Authorization
  -> Endpoint
Response
  <- back through middleware chain
```

Middleware can execute logic before and after `next()`.

```csharp
app.Use(async (context, next) =>
{
    var start = DateTimeOffset.UtcNow;

    await next();

    var elapsed = DateTimeOffset.UtcNow - start;
    app.Logger.LogInformation(
        "Request {Method} {Path} completed with {StatusCode} in {Elapsed}ms",
        context.Request.Method,
        context.Request.Path,
        context.Response.StatusCode,
        elapsed.TotalMilliseconds);
});
```

Timing detail:

```text
Code before await next():
  runs on request path before later middleware/endpoint

Code after await next():
  runs on response path after later middleware/endpoint
```

This is why request timing middleware often measures around `await next()`.

## Under The Hood: How The Pipeline Is Built

`app.Use(...)` does not immediately handle a request. It registers middleware into a pipeline builder.

At startup, ASP.NET Core composes middleware into one request delegate.

Conceptually:

```text
Use(MiddlewareA)
Use(MiddlewareB)
Use(MiddlewareC)

Build:
  RequestDelegate = A(B(C(endpoint)))
```

Each middleware receives:

- `HttpContext`;
- a `next` delegate representing the rest of the pipeline.

This is why middleware works like nested calls:

```text
A before
  B before
    C before
      Endpoint
    C after
  B after
A after
```

Example:

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("A before");
    await next();
    Console.WriteLine("A after");
});

app.Use(async (context, next) =>
{
    Console.WriteLine("B before");
    await next();
    Console.WriteLine("B after");
});
```

Output:

```text
A before
B before
B after
A after
```

unless an endpoint or middleware writes and short-circuits.

Short-circuit output example:

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("A before");

    context.Response.StatusCode = 403;
    await context.Response.WriteAsync("Forbidden");

    Console.WriteLine("A after");
});

app.Use(async (context, next) =>
{
    Console.WriteLine("B before");
    await next();
    Console.WriteLine("B after");
});
```

`B` never runs because the first middleware does not call `next`.

## Under The Hood: Kestrel, HttpContext, And Features

Kestrel is ASP.NET Core's cross-platform web server.

High-level flow:

```text
TCP connection
  -> Kestrel parses HTTP
  -> creates/populates HttpContext
  -> runs ASP.NET Core pipeline
  -> writes response
```

`HttpContext` is a high-level wrapper over request features.

Internally, ASP.NET Core uses feature interfaces for lower-level capabilities, for example:

- request body;
- response body;
- connection information;
- endpoint metadata;
- WebSocket support.

You usually do not work with features directly, but understanding them helps in advanced scenarios.

Practical explanation:

> Kestrel receives the HTTP request, ASP.NET Core creates an `HttpContext`, and the composed middleware delegate processes that context. Middleware can read or modify the context, call the next delegate, or short-circuit the pipeline.

`HttpContext` contains:

- `Request`;
- `Response`;
- `User`;
- `Items`;
- `RequestServices`;
- `Connection`;
- `TraceIdentifier`;
- selected `Endpoint` after routing.

Example:

```csharp
app.Use(async (context, next) =>
{
    context.Items["StartTime"] = TimeProvider.System.GetUtcNow();
    await next();
});
```

Use `HttpContext.Items` for per-request data shared inside the pipeline. Do not use static fields for per-request data.

## Endpoint Routing Internals

Modern ASP.NET Core separates route matching and endpoint execution.

```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Conceptually:

```text
UseRouting:
  match request path/method to endpoint
  attach endpoint metadata to HttpContext

UseAuthentication:
  build HttpContext.User

UseAuthorization:
  read endpoint metadata
  check policies/roles/requirements

Endpoint execution:
  call controller/minimal API handler
```

This is why order matters.

Authorization needs endpoint metadata. Authentication needs to run before authorization so a user identity exists.

Endpoint metadata example:

```csharp
[Authorize(Policy = "OrdersRead")]
[HttpGet("api/orders")]
public IActionResult List()
{
    return Ok();
}
```

Routing attaches endpoint metadata. Authorization later reads the `[Authorize]` metadata and checks the policy.

## Request Scope And DI

For each HTTP request, ASP.NET Core creates a DI scope.

Services registered as scoped are reused within the request:

```text
Request 1 scope
  AppDbContext instance A
  OrderService instance A

Request 2 scope
  AppDbContext instance B
  OrderService instance B
```

This connects the request pipeline with Dependency Injection:

- middleware can receive singleton dependencies through constructor injection;
- scoped dependencies can be requested through `InvokeAsync` parameters in middleware;
- controllers are created by DI inside the request scope.

Middleware nuance:

```csharp
public sealed class BadMiddleware
{
    private readonly AppDbContext _dbContext; // bad if middleware is singleton-like

    public BadMiddleware(RequestDelegate next, AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }
}
```

Better:

```csharp
public sealed class GoodMiddleware
{
    private readonly RequestDelegate _next;

    public GoodMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
    {
        await _next(context);
    }
}
```

Reason:

> Middleware instances are often created once, so scoped services should usually be injected into `InvokeAsync`, not captured in the constructor.

Alternative:

```csharp
public async Task InvokeAsync(HttpContext context)
{
    var dbContext = context.RequestServices.GetRequiredService<AppDbContext>();
    await _next(context);
}
```

This works, but `InvokeAsync` parameter injection is cleaner when possible.

## Custom Middleware Class

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-ID";
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(
        RequestDelegate next,
        ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var value)
            ? value.ToString()
            : Guid.NewGuid().ToString("N");

        context.Response.Headers[HeaderName] = correlationId;

        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId
        }))
        {
            await _next(context);
        }
    }
}
```

Registration:

```csharp
app.UseMiddleware<CorrelationIdMiddleware>();
```

## Short-circuit Example

```csharp
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Client-Version"))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Missing X-Client-Version header"
        });
        return;
    }

    await next();
});
```

This middleware stops the request before it reaches controllers.

Other common short-circuit examples:

- static file served without controller;
- rate limiter returns `429`;
- auth middleware challenges with `401`;
- authorization middleware forbids with `403`;
- health check endpoint returns immediately;
- custom maintenance middleware returns `503`.

## Exception Handling

Modern ASP.NET Core commonly uses `ProblemDetails`.

```csharp
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
```

Custom exception handler:

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
        _logger.LogError(exception, "Unhandled exception");

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred",
            Detail = "Please contact support with the trace id.",
            Instance = httpContext.Request.Path
        };

        problem.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = problem.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);

        return true;
    }
}
```

Registration:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
```

Important:

> Exception handling middleware can only catch exceptions thrown by later middleware. If it is registered too late, earlier failures will not be handled by it.

## Authentication And Authorization Order

Correct:

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

Why:

- Authentication identifies who the user is.
- Authorization checks what the user can access.

If authorization runs first, it has no authenticated user to evaluate.

## Middleware vs Filter

Use middleware for cross-cutting concerns at HTTP pipeline level:

- logging;
- exception handling;
- correlation ID;
- security headers;
- request timing.

Use filters for MVC/controller-specific concerns:

- action validation;
- controller-level authorization;
- result transformation;
- exception handling around controller actions.

Decision examples:

| Concern | Better Fit | Why |
| --- | --- | --- |
| correlation ID | middleware | applies to all HTTP requests |
| security headers | middleware | response-level concern |
| model validation | filter / `[ApiController]` | MVC action concern |
| action timing for controllers only | filter | needs action context |
| global exception safety | middleware | catches broad pipeline failures |
| response shaping for MVC result | filter | works with action result |

## Review Questions

### What is middleware?

> Middleware is a component in the ASP.NET Core request pipeline. It receives an `HttpContext`, can run logic before and after the next middleware, and can short-circuit the request.

### Why does middleware order matter?

> Because each middleware sees the request in sequence. Some middleware depends on previous middleware. For example, authorization depends on authentication, and endpoint execution depends on routing.

### What is the difference between middleware and filters?

> Middleware works at the HTTP pipeline level and applies broadly. Filters are part of MVC and run around controller action execution. Middleware is better for global HTTP concerns; filters are better for controller/action concerns.

### What does it mean that the response has started?

> It means headers or body bytes have already been sent to the client. After that, you usually cannot safely change status code or headers.

### How do scoped services work in middleware?

> Middleware constructor dependencies are usually long-lived. Scoped services should be resolved per request, commonly through `InvokeAsync` parameters or `context.RequestServices`.

## Common Mistakes

### Mistake: Registering `UseAuthorization` before `UseAuthentication`.

Why it is wrong:

> Authorization needs an authenticated `HttpContext.User`. If authentication has not run, authorization may see an anonymous user.

Better answer:

> Run `UseAuthentication()` before `UseAuthorization()`.

### Mistake: Placing exception handling too late.

Why it is wrong:

> It only catches exceptions from middleware registered after it.

Better answer:

> Put global exception handling near the beginning of the pipeline.

### Mistake: Forgetting to call `await next()`.

Why it is wrong:

> The middleware short-circuits the pipeline, so later middleware and endpoints never run.

Better answer:

> Call `await next()` unless the middleware intentionally returns a response.

### Mistake: Calling `next()` more than once.

Why it is wrong:

> The downstream pipeline is generally designed to run once. Calling it twice can duplicate writes, side effects, or throw response errors.

Better answer:

> Call `next()` once, or short-circuit intentionally.

### Mistake: Writing to the response after it has already started.

Why it is wrong:

> Headers and status code may already be sent, so changing them can fail or produce corrupt responses.

Better answer:

> Check `context.Response.HasStarted` and design response-writing middleware carefully.

### Mistake: Logging sensitive request data.

Why it is wrong:

> Logs may expose tokens, passwords, personal data, or payment information.

Better answer:

> Log structured metadata and redact sensitive values.

## Practice Task

Build three middleware components:

1. correlation ID middleware;
2. request timing middleware;
3. security headers middleware.

Then add a controller and verify the response contains the correlation ID and security headers.
