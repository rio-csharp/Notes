# ASP.NET Core Review Questions

This file contains knowledge-check questions and compact explanations. Do not memorize word by word. Practice explaining the ideas naturally.

Chinese notes:

- `pipeline`: 管道.
- `middleware`: 中间件.
- `model binding`: 模型绑定.
- `ProblemDetails`: standardized HTTP API error response format.
- `resilience`: 韧性, meaning the system can handle failures gracefully.

## 1. What happens when an HTTP request reaches an ASP.NET Core application?

Short answer:

> The request goes through the ASP.NET Core middleware pipeline. Each middleware can inspect or modify the request, call the next middleware, short-circuit the request, or modify the response. After routing selects an endpoint, MVC or Minimal API executes the handler, then the response travels back through the pipeline.

Detailed explanation:

> In a typical Web API, the request first hits middleware such as exception handling, HTTPS redirection, routing, CORS, authentication, authorization, and endpoint execution. Routing matches the endpoint, authentication builds `HttpContext.User`, authorization checks policies, model binding binds request data, validation runs, the controller action executes, and the result is serialized to the response. Middleware order is important because later components depend on earlier ones.

Example pipeline:

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
app.MapControllers();
```

Follow-up: Why must `UseAuthentication` run before `UseAuthorization`?

> Authentication reads credentials such as a JWT and builds `HttpContext.User`. Authorization needs that user to check roles, claims, and policies. If authorization runs first, it may see an anonymous user and reject the request incorrectly.

Follow-up: Where should exception handling middleware be placed?

> Near the beginning of the pipeline, so it can catch exceptions thrown by later middleware and endpoint handlers. It should generally run before routing and endpoint execution.

Follow-up: What can short-circuit the pipeline?

> Any middleware can choose not to call `next`. Examples include static file middleware returning a file, authentication/authorization rejecting a request, rate limiting returning `429`, or custom middleware returning a cached response.

## 2. Middleware vs filters?

Answer:

> Middleware is part of the global HTTP pipeline and applies to all requests, including static files, health checks, Minimal APIs, and controllers. Filters are part of MVC action execution and have access to MVC-specific context such as action arguments, model state, and action results.

Use middleware for:

- correlation ID;
- global exception handling;
- request logging;
- security headers;
- rate limiting;
- CORS.

Use filters for:

- action timing;
- custom validation around MVC actions;
- MVC-specific exception mapping;
- result transformation;
- action-level auditing.

Example action filter:

```csharp
public sealed class AuditActionFilter : IAsyncActionFilter
{
    private readonly ILogger<AuditActionFilter> _logger;

    public AuditActionFilter(ILogger<AuditActionFilter> logger)
    {
        _logger = logger;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        _logger.LogInformation("Executing action {Action}",
            context.ActionDescriptor.DisplayName);

        await next();
    }
}
```

Follow-up: Why not use a filter for correlation ID?

> A filter only runs for MVC actions. Correlation ID should apply to all HTTP requests, including health checks, Minimal APIs, static files, and failed requests before MVC. Middleware is the better fit.

## 3. How do you design global error handling?

Answer:

> I use centralized exception handling middleware or `IExceptionHandler` and return consistent `ProblemDetails` responses. I map expected exceptions like validation, not found, conflict, and domain rule violations to proper status codes, and unexpected exceptions to `500`. I log unexpected exceptions with trace ID but avoid leaking sensitive internal details to clients.

Example mapping:

```text
ValidationException -> 400
NotFoundException -> 404
ConflictException -> 409
UnauthorizedAccessException -> 403
Unexpected exception -> 500
```

Example response:

```json
{
  "type": "https://httpstatuses.com/409",
  "title": "Conflict",
  "status": 409,
  "detail": "The order has already been paid.",
  "traceId": "00-4bf92f..."
}
```

Engineering perspective:

> I separate client-safe error messages from internal logs. The response should include a trace ID so support can find related logs.

Follow-up: Should you return `200 OK` for errors?

> No. HTTP status codes are part of the API contract. Returning `200` for failed operations breaks clients, monitoring, caching, and error handling.

## 4. How does model binding work?

Answer:

> Model binding maps data from route values, query string, headers, and request body to action parameters or models. With `[ApiController]`, ASP.NET Core automatically validates model state and can return a `400 Bad Request` response for invalid input.

Example:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult GetById(int id, [FromQuery] bool includeItems)
    {
        return Ok();
    }
}
```

Follow-up: Where does `id` come from?

> `id` is bound from the route because the route template contains `{id:int}`.

Follow-up: Where does `includeItems` come from?

> `includeItems` is bound from the query string because it is marked with `[FromQuery]`.

Follow-up: Where do complex request models usually come from?

> For API controllers, complex models usually bind from the JSON request body. Route and query parameters are better for identifiers, filters, sorting, and pagination.

Follow-up: Can a GET request have a body?

> Technically HTTP does not completely forbid it, but it is not commonly supported or expected. For APIs, use query string for GET filters and body for POST/PUT/PATCH commands.

## 5. What is the Options pattern?

Answer:

> The Options pattern binds configuration sections to strongly typed classes. It avoids injecting `IConfiguration` everywhere and supports validation. I use `IOptions` for stable config, `IOptionsSnapshot` for scoped refreshed config, and `IOptionsMonitor` when singleton services need to observe changes.

Example:

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection("Payment"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

Follow-up: Why is `ValidateOnStart()` useful?

> It fails the application during startup if required configuration is invalid, instead of letting the first real user request discover the problem.

Follow-up: Can all configuration reload automatically?

> No. Reload depends on the configuration provider and how the app consumes options. `IOptionsMonitor` supports change notifications, but the provider must also support reload.

## 6. How do you implement authentication and authorization?

Answer:

> Authentication verifies identity and creates a `ClaimsPrincipal`. Authorization checks whether that principal can access a resource. In APIs, I often use JWT bearer authentication with issuer, audience, lifetime, and signing key validation. For authorization, I use policies for permissions and resource-based authorization when access depends on a specific resource.

Example JWT registration:

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://identity.example.com";
        options.Audience = "orders-api";
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanManageOrders", policy =>
    {
        policy.RequireClaim("permission", "orders.manage");
    });
});
```

Security perspective:

> Frontend checks only improve UX. Backend authorization is the real security boundary.

Follow-up: What is the difference between `401` and `403`?

> `401` means the caller is not authenticated or the credential is invalid. `403` means the caller is authenticated but does not have permission.

Follow-up: When do you need resource-based authorization?

> When permission depends on a specific resource, such as order owner, tenant, region, department, or current workflow state.

## 7. How do you handle CORS?

Answer:

> CORS is a browser security mechanism that controls whether a web page from one origin can call APIs from another origin. In ASP.NET Core, I configure allowed origins, methods, headers, and credentials. I avoid allowing any origin with credentials because that is unsafe.

Example:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("https://app.example.com")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
```

Follow-up: Is CORS server-to-server security?

> No. CORS is enforced by browsers. Server-to-server calls are not protected by CORS. APIs still need authentication and authorization.

Follow-up: Why is `AllowAnyOrigin()` with credentials unsafe?

> Credentials such as cookies or authorization headers should not be accepted from arbitrary origins. It can expose authenticated APIs to malicious websites.

## 8. How do you improve ASP.NET Core API performance?

Answer:

> I first measure using logs, metrics, traces, and profiling. Common improvements include async I/O, optimized EF Core queries, pagination, response compression, caching, reducing payload size, avoiding blocking calls, using `IHttpClientFactory`, and adding timeouts and resilience for external dependencies.

Incomplete explanation:

```text
Use async and cache.
```

More useful explanation:

> I locate the bottleneck first. If traces show database time dominates, I inspect generated SQL and execution plan. If external calls dominate, I add timeouts, retries with backoff, and circuit breaker where appropriate.

Follow-up: Does async make CPU work faster?

> No. Async improves scalability for I/O-bound work by freeing threads while waiting. CPU-bound work still needs CPU time and may require optimization, batching, or background processing.

Follow-up: Why is pagination important?

> Returning unbounded data increases database load, memory usage, response size, and latency. Pagination limits work and makes APIs predictable.

## 9. What is `IHttpClientFactory` and why use it?

Answer:

> `IHttpClientFactory` manages `HttpClient` creation and underlying handlers to avoid socket exhaustion and stale DNS issues. It centralizes configuration, logging, and resilience policies for outgoing HTTP calls.

Example:

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri("https://api.payment.example");
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

Follow-up: Why not create a new `HttpClient` for every request?

> Creating many short-lived clients can exhaust sockets because underlying connections may remain in `TIME_WAIT`. `IHttpClientFactory` manages handlers and connection lifetimes.

Follow-up: Why not keep one static `HttpClient` forever?

> A single long-lived client can miss DNS changes depending on handler configuration. `IHttpClientFactory` balances connection reuse with handler rotation.

## 10. How do you make APIs observable?

Answer:

> I use structured logs, correlation IDs, metrics, and distributed tracing. Logs explain what happened, metrics show trends and health, and traces show where time is spent across services and dependencies. For .NET, I can use `ILogger`, Serilog, OpenTelemetry, Application Insights, Prometheus, or Grafana depending on the stack.

Example structured log:

```csharp
_logger.LogInformation(
    "Created order {OrderId} for customer {CustomerId}",
    order.Id,
    order.CustomerId);
```

Follow-up: What metrics matter for APIs?

> Request rate, latency p50/p95/p99, error rate, status code count, dependency latency, database query duration, and business metrics such as order creation or payment failures.

Follow-up: What is high-cardinality metric data?

> Data with many unique values, such as user IDs or order IDs. It should usually not be used as metric labels because it can create too many time series.

## 11. How do you design background processing?

Answer:

> I use `BackgroundService`, queue consumers, or a scheduler depending on the requirement. I keep heavy work out of request paths, respect cancellation tokens, create DI scopes for scoped services, handle errors inside the worker loop, and design processing to be idempotent.

Example:

```csharp
public sealed class CleanupWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await RunCleanupAsync(stoppingToken);
        }
    }

    private static Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
```

Follow-up: Why should queue consumers be idempotent?

> Many queues provide at-least-once delivery. If a worker crashes after doing work but before acknowledging the message, the message may be delivered again.

Follow-up: How do you avoid the same scheduled job running on every app instance?

> Use distributed locks, leader election, database row claiming, queue competing consumers, or an external scheduler such as Hangfire, Quartz, Kubernetes CronJob, or cloud scheduler.

## 12. How do you secure an ASP.NET Core API?

Answer:

> I use HTTPS, strong authentication, backend authorization, input validation, safe error responses, secure CORS, secret management, security headers, dependency patching, rate limiting, and logging for security-relevant events.

Important practices:

- validate JWT issuer, audience, lifetime, and signature;
- enforce authorization on the backend;
- avoid logging secrets;
- use parameterized SQL through EF Core or commands;
- apply least privilege to database accounts;
- protect secrets with a secret manager;
- use rate limiting for sensitive endpoints;
- return safe error messages.

Follow-up: Is JWT enough to secure an API?

> No. JWT is only one authentication mechanism. You still need correct validation, authorization, HTTPS, secure storage, expiration strategy, and protection against common web risks.

## 13. How do you version APIs?

Answer:

> API versioning manages breaking changes. Common approaches include URL versioning, header versioning, and media type versioning. I keep backward compatibility where possible and version only when the contract breaks.

Examples:

```text
/api/v1/orders
/api/v2/orders
```

Follow-up: What is a breaking API change?

> Removing fields, changing field meaning, changing required fields, changing status codes in incompatible ways, or changing response shape expected by clients.

## 14. Controllers vs Minimal APIs?

Answer:

> Controllers are good for larger APIs that benefit from attributes, filters, model conventions, and a familiar MVC structure. Minimal APIs are good for small services, lightweight endpoints, and focused APIs with less ceremony. Both can be production-ready.

Example Minimal API group:

```csharp
var orders = app.MapGroup("/api/orders")
    .RequireAuthorization();

orders.MapGet("/{id:int}", async (int id, IOrderService service) =>
{
    var order = await service.GetByIdAsync(id);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
```

Follow-up: Which one is better?

> It depends on the application. For a large enterprise API, I often prefer controllers for consistency and conventions. For small focused services, Minimal APIs can be simpler.

## 15. What are common misconceptions in ASP.NET Core?

Avoid:

- "Middleware and filters are basically the same."
- "JWT means user is secure."
- "We can just hide buttons on the frontend."
- "Async always creates new threads."
- "I always catch all exceptions and return 200."
- "CORS protects my API from all clients."
- "Background jobs cannot run twice."
- "I can inject `DbContext` directly into any singleton."
- "Logs are enough; we do not need metrics or traces."

Better summary:

> ASP.NET Core engineering is not just writing endpoints. It is about pipeline design, security boundaries, reliable background work, configuration safety, observability, and performance under production constraints.
