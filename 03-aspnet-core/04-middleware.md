# ASP.NET Core Middleware

## Core Idea

Middleware components form the HTTP request pipeline.

Chinese notes:

- `middleware`: 中间件.
- `short-circuit`: 短路.
- `pipeline`: 管道.

## Inline Middleware

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("Before");
    await next();
    Console.WriteLine("After");
});
```

Execution model:

```text
Before
  -> downstream middleware/endpoint
After
```

Inline middleware is useful for small experiments or very small custom logic. For reusable production logic, prefer a named middleware class.

## Custom Middleware

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

Registration:

```csharp
app.UseMiddleware<SecurityHeadersMiddleware>();
```

Extension method registration:

```csharp
public static class SecurityHeadersMiddlewareExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.UseMiddleware<SecurityHeadersMiddleware>();
    }
}
```

Usage:

```csharp
app.UseSecurityHeaders();
```

This keeps `Program.cs` readable.

## Short-circuit

```csharp
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Client-Version"))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    await next();
});
```

Better response:

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

Short-circuiting should be intentional and return a clear response.

## Ordering

Typical order:

```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Common dependency relationships:

```text
UseExceptionHandler before risky downstream work
UseRouting before endpoint-aware auth
UseAuthentication before UseAuthorization
UseCors before endpoints
MapControllers near the end
```

If middleware behaves strangely, check ordering first.

## Middleware With Scoped Services

Do not capture scoped services in middleware constructors.

Risky:

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

Better:

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

Reason:

> Middleware instances can be long-lived, while scoped services are per request.

## Response Started

Once response headers are sent, changing headers/status is unsafe.

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

Middleware that modifies response headers after `next()` should check whether the response has started.

## Practical Middleware Examples

Correlation ID:

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

Request body size guard:

```csharp
public sealed class JsonBodySizeMiddleware
{
    private readonly RequestDelegate _next;
    private readonly long _maxBytes;

    public JsonBodySizeMiddleware(RequestDelegate next, long maxBytes)
    {
        _next = next;
        _maxBytes = maxBytes;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.ContentType?.StartsWith("application/json") == true &&
            context.Request.ContentLength > _maxBytes)
        {
            context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Request body is too large",
                maxBytes = _maxBytes
            });
            return;
        }

        await _next(context);
    }
}
```

Registration with an extension method:

```csharp
public static class MiddlewareRegistration
{
    public static IApplicationBuilder UseJsonBodySizeLimit(
        this IApplicationBuilder app,
        long maxBytes)
    {
        return app.UseMiddleware<JsonBodySizeMiddleware>(maxBytes);
    }
}
```

Usage:

```csharp
app.UseMaintenanceMode();
app.UseJsonBodySizeLimit(maxBytes: 1024 * 1024);
```

The extension for maintenance mode would be similar:

```csharp
public static IApplicationBuilder UseMaintenanceMode(this IApplicationBuilder app)
{
    return app.UseMiddleware<MaintenanceModeMiddleware>();
}
```

## Review Questions

### What is middleware?

> Middleware is a component in the ASP.NET Core request pipeline. It can run code before and after the next middleware and can short-circuit the request.

### Why does order matter?

> Because each middleware depends on what happened before it. For example, authorization depends on authentication.

### Can middleware modify response?

> Yes, as long as the response has not already started.

### Middleware class vs inline middleware?

> Inline middleware is fine for small local logic. Middleware classes are better for reusable, testable, named behavior.

### When should middleware short-circuit?

> When it can fully handle the request or reject it early, such as static files, health checks, rate limiting, maintenance mode, or missing required headers.

## Common Mistakes

### Mistake: Forgetting `await next()`.

Why it is wrong:

> Later middleware and endpoints will not run unless the middleware intentionally short-circuits.

Better answer:

> Call `await next()` for pass-through middleware.

### Mistake: Calling `next()` multiple times.

Why it is wrong:

> It can execute downstream logic twice and corrupt the response or duplicate side effects.

Better answer:

> Call `next()` once.

### Mistake: Writing response after it started.

Why it is wrong:

> The server may have already sent headers/body to the client.

Better answer:

> Check `Response.HasStarted` and design response modifications before writing begins.

### Mistake: Wrong authentication/authorization order.

Why it is wrong:

> Authorization needs the user produced by authentication.

Better answer:

> Use `UseAuthentication()` before `UseAuthorization()`.

### Mistake: Too much business logic in middleware.

Why it is wrong:

> Middleware should handle cross-cutting HTTP concerns. Business workflows belong in application/domain services.

Better answer:

> Keep middleware focused on pipeline concerns such as logging, headers, correlation, rate limiting, and exception handling.
