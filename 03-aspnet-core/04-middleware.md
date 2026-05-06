# ASP.NET Core Middleware

## Core Idea

Middleware is the unit from which the ASP.NET Core request pipeline is constructed. If the previous chapter explained the pipeline as a model, this chapter focuses on middleware as the mechanism that makes that model real.

Each middleware component receives the current `HttpContext` and a delegate representing the rest of the pipeline. It may inspect state, enrich state, wrap downstream execution, or produce the response directly. That flexibility makes middleware the natural home for cross-cutting HTTP concerns that should apply broadly and do not depend on MVC-specific concepts such as action arguments or model state.

## Inline Middleware And Execution Shape

The simplest middleware is inline:

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("Before");
    await next();
    Console.WriteLine("After");
});
```

The execution shape is the important part:

```text
Before
  -> downstream middleware or endpoint
After
```

Inline middleware is useful for experiments, startup-local behavior, or very small pipeline customizations. For reusable production behavior, a dedicated middleware class is usually clearer and more maintainable.

## Custom Middleware Classes

A middleware class typically captures stable dependencies in the constructor and processes each request through `InvokeAsync`.

```csharp
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";

        await _next(context);
    }
}
```

```csharp
app.UseMiddleware<SecurityHeadersMiddleware>();
```

The point of a middleware class is not just organization. It gives the concern a clear name, isolates it from `Program.cs`, and makes its dependencies and behavior easier to understand in isolation.

Extension methods usually improve readability further:

```csharp
public static class SecurityHeadersMiddlewareExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.UseMiddleware<SecurityHeadersMiddleware>();
    }
}
```

```csharp
app.UseSecurityHeaders();
```

## When Middleware Should Short-Circuit

Middleware is allowed to end the request without calling the next delegate.

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

Short-circuiting is appropriate when the middleware can fully decide the outcome of the request. Examples include required-header checks, rate limiting, maintenance mode, static file serving, and health endpoints.

It should not be treated casually, however. Once middleware begins to reject or complete requests early, it becomes part of the application's public behavior and must return clear, consistent HTTP responses rather than silently terminating the chain.

## Middleware Ordering And Dependency Relationships

Middleware does not run in isolation. Its correctness depends on where it sits in the broader pipeline.

```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Several dependencies are structural:

- exception handling should wrap risky downstream work;
- routing should happen before endpoint-aware authorization behavior;
- authentication should precede authorization;
- endpoint mapping should remain late in the pipeline.

When middleware behaves unexpectedly, order is often the first thing to inspect. Many bugs attributed to routing, CORS, or security configuration are really consequences of a misplaced middleware component.

## Middleware And Dependency Injection Lifetimes

One subtle but important aspect of middleware design is dependency lifetime.

Middleware instances are generally long-lived. Scoped services, by contrast, are created per request. For that reason, scoped services should usually not be captured in middleware constructors.

```csharp
public sealed class AuditMiddleware
{
    private readonly AppDbContext _dbContext;

    public AuditMiddleware(RequestDelegate next, AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }
}
```

That pattern is risky because it mixes long-lived middleware instances with request-scoped state. A better approach is method injection:

```csharp
public sealed class AuditMiddleware
{
    private readonly RequestDelegate _next;

    public AuditMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
    {
        await _next(context);
    }
}
```

This keeps the middleware itself stable while resolving the scoped dependency per request.

## The Response-Started Boundary

Middleware can only modify response headers and status code safely until the response has begun.

```csharp
app.Use(async (context, next) =>
{
    await next();

    if (!context.Response.HasStarted)
    {
        context.Response.Headers["X-App"] = "OrdersApi";
    }
});
```

This boundary matters in real systems because late attempts to rewrite status codes, alter headers, or convert an already-streaming response into an error payload often fail or produce inconsistent results. Middleware that intends to shape the outgoing response must be placed and designed with that timing in mind.

## Representative Middleware Patterns

Several recurring middleware patterns appear in production applications.

Correlation ID propagation:

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-ID";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ILogger<CorrelationIdMiddleware> logger)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var value)
            ? value.ToString()
            : Guid.NewGuid().ToString("N");

        context.Response.Headers[HeaderName] = correlationId;

        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId
        }))
        {
            await _next(context);
        }
    }
}
```

Request timing:

```csharp
app.Use(async (context, next) =>
{
    var start = Stopwatch.GetTimestamp();

    await next();

    var elapsed = Stopwatch.GetElapsedTime(start);
    app.Logger.LogInformation(
        "{Method} {Path} -> {StatusCode} in {ElapsedMs}ms",
        context.Request.Method,
        context.Request.Path,
        context.Response.StatusCode,
        elapsed.TotalMilliseconds);
});
```

Maintenance mode:

```csharp
public sealed class MaintenanceModeMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IConfiguration _configuration;

    public MaintenanceModeMiddleware(
        RequestDelegate next,
        IConfiguration configuration)
    {
        _next = next;
        _configuration = configuration;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var enabled = _configuration.GetValue<bool>("MaintenanceMode:Enabled");

        if (!enabled || context.Request.Path.StartsWithSegments("/health"))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.Headers["Retry-After"] = "60";

        await context.Response.WriteAsJsonAsync(new
        {
            title = "Service temporarily unavailable",
            status = StatusCodes.Status503ServiceUnavailable
        });
    }
}
```

These patterns demonstrate the main strengths of middleware: broad applicability, early interception, and control over both request and response flow.

## Middleware Versus Filters

Middleware and filters are related but belong to different layers.

Middleware is appropriate for concerns such as:

- correlation IDs;
- security headers;
- global exception handling;
- request timing;
- CORS;
- static files;
- rate limiting.

Filters are more appropriate when the logic depends on MVC-specific context such as action arguments, model state, or action results. In other words, middleware shapes the HTTP pipeline broadly, while filters shape controller execution more locally.

This distinction matters because middleware should not become an all-purpose dumping ground for concerns that actually need endpoint-specific semantic context.
