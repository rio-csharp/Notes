# ASP.NET Core Middleware

## Core Idea

Middleware is the unit from which the ASP.NET Core request pipeline is constructed. While the pipeline establishes the execution model, middleware is the mechanism that makes that model real.

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

The convention-based approach shown above is the more common and efficient middleware pattern, because instances are created once and reused across requests. Scoped dependencies must therefore be resolved through method injection in `InvokeAsync` rather than through constructor injection.

### IMiddleware And Factory-Based Middleware

ASP.NET Core also supports middleware through the `IMiddleware` interface, where instances are resolved from the DI container per request rather than being created once at startup.

```csharp
public sealed class RequestLoggingMiddleware : IMiddleware
{
    private readonly AppDbContext _dbContext;

    public RequestLoggingMiddleware(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        _dbContext.RequestLogs.Add(new RequestLog
        {
            Path = context.Request.Path,
            Method = context.Request.Method,
            Timestamp = DateTimeOffset.UtcNow
        });

        await next(context);
    }
}
```

```csharp
builder.Services.AddScoped<RequestLoggingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
```

Because `IMiddleware` instances are created per scope through the DI container, scoped dependencies such as `AppDbContext` can be injected directly into the constructor. The trade-off is that factory-based middleware creates more instances under load than the convention-based approach. Convention-based middleware with method injection is therefore the better default for most scenarios. `IMiddleware` is most useful when method injection is impractical, such as when the middleware wraps behavior around many scoped dependencies that would be unwieldy as method parameters.

## Short-Circuiting Middleware

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

The correlation ID pattern also appears in the logging and observability chapter, where its role in preserving request context across log entries is discussed in more depth.

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

## Built-in Rate Limiting

ASP.NET Core includes built-in rate limiting middleware (`Microsoft.AspNetCore.RateLimiting`) that applies configurable limits to endpoints. Four algorithm types are available:

| Algorithm | Behavior | Best for |
|---|---|---|
| **Fixed window** | Resets count at fixed intervals | Simple per-period limits |
| **Sliding window** | Divides window into segments, smoother limiting | More even request distribution |
| **Token bucket** | Tokens replenish at fixed rate, supports bursts | Burst-tolerant APIs |
| **Concurrency** | Limits simultaneous in-flight requests | Expensive/slow endpoints |

Configuration example:

```csharp
using System.Threading.RateLimiting;

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("api", config =>
    {
        config.PermitLimit = 10;
        config.Window = TimeSpan.FromSeconds(10);
        config.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        config.QueueLimit = 2; // 0 = no queue; reject excess immediately
    });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.Headers["Retry-After"] = "10";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "Rate limit exceeded. Retry after 10 seconds." }, ct);
    };
});

app.UseRateLimiter(); // after UseRouting
```

Policies apply to endpoints or groups:

```csharp
app.MapGet("/api/limited", () => "OK").RequireRateLimiting("api");
```

Partitioned rate limiting creates separate counters per user, IP, or API key:

```csharp
options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromMinutes(1)
        }));
```

Partitions prevent one user or tenant from consuming the entire rate budget, and they enable tiered limits (premium vs. free API keys). The rate limit middleware belongs after `UseRouting` so that endpoint-specific policies are available.

## Built-in Output Caching

Output caching (.NET 7+) is distinct from the older response caching middleware. Response caching sets `Cache-Control` headers for client/browser caching. Output caching stores the response body server-side and serves it directly, bypassing the entire downstream pipeline. The result is a significant reduction in server work for cacheable responses.

```csharp
builder.Services.AddOutputCache(options =>
{
    options.AddBasePolicy(builder => builder.Expire(TimeSpan.FromSeconds(30)));
    options.AddPolicy("LongLived", builder => builder.Expire(TimeSpan.FromMinutes(5)));
});

app.UseOutputCache(); // after UseCors, after UseRouting for Razor/controller apps
```

Apply to endpoints:

```csharp
app.MapGet("/cached", () => DateTime.UtcNow).CacheOutput();
app.MapGet("/cached-long", () => DateTime.UtcNow).CacheOutput("LongLived");
```

Default behavior: only HTTP 200 responses to GET/HEAD requests are cached. Responses that set cookies or require authentication are excluded. Custom policies can override these defaults (e.g., cache POST responses, vary by query string).

**Tag-based eviction** invalidates groups of cached entries at once:

```csharp
app.MapGet("/blog/{id}", ...).CacheOutput(builder => builder.Tag("blog"));
// POST to /purge/blog evicts all blog responses
app.MapPost("/purge/{tag}", async (string tag, IOutputCacheStore store)
    => await store.EvictByTagAsync(tag, default));
```

**Cache revalidation** via ETag or `If-Modified-Since` is automatic when output caching is enabled — the server returns `304 Not Modified` when the client holds a fresh copy. For multi-server deployments, Redis storage (`AddStackExchangeRedisOutputCache`) provides a shared cache across instances.

The output cache middleware must be registered before endpoints that depend on it. For Minimal APIs, a common placement is after `UseCors` and before `UseAuthorization`.
