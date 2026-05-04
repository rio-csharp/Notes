# Logging And Observability In ASP.NET Core

## Core Idea

Observability helps you understand what a system is doing in production by looking at its external signals.

Chinese notes:

- `logging`: 日志.
- `metrics`: 指标.
- `tracing`: 链路追踪.
- `correlation ID`: 关联 ID.
- `observability`: 可观测性.
- `cardinality`: 基数, meaning how many distinct values a metric label can have.

The three pillars:

- logs;
- metrics;
- traces.

Key takeaway:

> Logs explain what happened, metrics show whether the system is healthy, and traces show where time is spent across services.

## Logs, Metrics, Traces

### Logs

Logs are event records.

Example:

```text
OrderCreated OrderId=1001 CustomerId=42 Amount=128.50
```

Use logs for:

- errors;
- business events;
- diagnostic details;
- security-relevant events;
- one-off investigation.

### Metrics

Metrics are numeric time-series data.

Examples:

```text
http.server.request.duration
orders.created.count
payment.failure.count
database.query.duration
```

Use metrics for:

- dashboards;
- alerting;
- trend analysis;
- SLO/SLA monitoring.

### Traces

Traces show a request or workflow across components.

Example:

```text
HTTP POST /orders
  -> ValidateOrder
  -> SQL INSERT Orders
  -> HTTP POST payment-service
  -> Kafka publish OrderCreated
```

Use traces for:

- distributed systems;
- latency breakdown;
- dependency investigation;
- finding bottlenecks.

## Structured Logging

Bad:

```csharp
_logger.LogInformation("Created order " + order.Id);
```

Good:

```csharp
_logger.LogInformation(
    "Created order {OrderId} for customer {CustomerId}",
    order.Id,
    order.CustomerId);
```

Why structured logging matters:

- log fields are searchable;
- dashboards can group by field;
- support can find all logs for one order or tenant;
- logs are safer than string concatenation;
- log templates stay consistent.

Example service:

```csharp
public sealed class OrderService
{
    private readonly ILogger<OrderService> _logger;
    private readonly IOrderRepository _repository;

    public OrderService(
        ILogger<OrderService> logger,
        IOrderRepository repository)
    {
        _logger = logger;
        _repository = repository;
    }

    public async Task<int> CreateOrderAsync(CreateOrderCommand command, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Creating order for customer {CustomerId} with {ItemCount} items",
            command.CustomerId,
            command.Items.Count);

        var orderId = await _repository.CreateAsync(command, cancellationToken);

        _logger.LogInformation(
            "Created order {OrderId} for customer {CustomerId}",
            orderId,
            command.CustomerId);

        return orderId;
    }
}
```

## Log Levels

Common levels:

| Level | Meaning | Example |
| --- | --- | --- |
| Trace | Very detailed diagnostic information | SQL parameter detail in local debugging |
| Debug | Developer diagnostic information | Branch decisions during development |
| Information | Normal meaningful events | Order created |
| Warning | Unexpected but recoverable | Payment provider timeout, retrying |
| Error | Operation failed | Order creation failed |
| Critical | System-level failure | App cannot connect to required database |

Guideline:

> Do not log every line of execution. Log meaningful events with enough context to investigate.

## Correlation ID

A correlation ID links logs from the same request or workflow.

Middleware:

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

Registration:

```csharp
app.UseMiddleware<CorrelationIdMiddleware>();
```

Then logs inside the request can include `CorrelationId`.

Practical explanation:

> When a user reports a failed request, I use the correlation ID to find all logs, traces, and dependency calls related to that request.

## Logging Scopes

A logging scope adds fields to all logs inside a block.

```csharp
using (_logger.BeginScope(new Dictionary<string, object>
{
    ["OrderId"] = orderId,
    ["CustomerId"] = customerId
}))
{
    _logger.LogInformation("Starting payment");
    await _paymentClient.ChargeAsync(orderId, cancellationToken);
    _logger.LogInformation("Payment completed");
}
```

Why it helps:

> You avoid passing the same fields into every log call manually.

## Do Not Log Sensitive Data

Do not log:

- passwords;
- access tokens;
- refresh tokens;
- API keys;
- credit card numbers;
- full personal identity numbers;
- full request bodies that may contain sensitive data;
- secrets or connection strings.

Bad:

```csharp
_logger.LogInformation("Login request {@Request}", request);
```

Better:

```csharp
_logger.LogInformation("Login attempt for email domain {EmailDomain}", emailDomain);
```

Detailed explanation:

> Logs are often copied into many tools. I treat logs as less protected than the database and avoid writing secrets or sensitive personal data.

## OpenTelemetry

OpenTelemetry is a vendor-neutral standard for traces, metrics, and logs.

Example setup:

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddEntityFrameworkCoreInstrumentation()
            .AddSource("Orders.Api");
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation()
            .AddMeter("Orders.Api");
    });
```

Custom activity:

```csharp
public static class Telemetry
{
    public static readonly ActivitySource ActivitySource = new("Orders.Api");
}
```

```csharp
using var activity = Telemetry.ActivitySource.StartActivity("CreateOrder");
activity?.SetTag("customer.id", command.CustomerId);
activity?.SetTag("order.item_count", command.Items.Count);
```

Custom metric:

```csharp
public sealed class OrderMetrics
{
    private readonly Counter<long> _ordersCreated;

    public OrderMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create("Orders.Api");
        _ordersCreated = meter.CreateCounter<long>("orders.created");
    }

    public void OrderCreated(string tenantId)
    {
        _ordersCreated.Add(1, new KeyValuePair<string, object?>("tenant.id", tenantId));
    }
}
```

Cardinality warning:

> Do not use high-cardinality values like `user.id`, `order.id`, or raw URL as metric labels. They can explode the number of time series and make the monitoring system expensive or unstable.

Better:

- use `endpoint`, not full URL with IDs;
- use `status_code`, not error message;
- use `tenant_tier`, not every tenant ID when there are many tenants.

## Metrics To Track

API metrics:

- request count;
- latency p50/p95/p99;
- error rate;
- status code count;
- request body size;
- response body size.

Database metrics:

- query duration;
- connection pool usage;
- command timeout count;
- deadlock count;
- slow query count.

External dependency metrics:

- HTTP call duration;
- retry count;
- timeout count;
- circuit breaker open count;
- failure rate by dependency.

Runtime metrics:

- CPU usage;
- memory usage;
- GC pause time;
- thread pool queue length;
- exception count.

Business metrics:

- orders created;
- payment failures;
- login failures;
- notification delivery failures;
- checkout conversion rate.

Engineering perspective:

> Technical metrics tell whether the system is healthy. Business metrics tell whether the product workflow is healthy.

## Error Handling And ProblemDetails

Good error handling connects API responses with logs.

Example:

```csharp
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;

        var logger = context.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("GlobalExceptionHandler");

        logger.LogError(exceptionFeature?.Error,
            "Unhandled exception. TraceId={TraceId}",
            traceId);

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/problem+json";

        var problem = new ProblemDetails
        {
            Title = "An unexpected error occurred.",
            Status = StatusCodes.Status500InternalServerError,
            Extensions =
            {
                ["traceId"] = traceId
            }
        };

        await context.Response.WriteAsJsonAsync(problem);
    });
});
```

Why include `traceId`?

> The client can report the trace ID, and support can find the exact server-side logs.

## Production Investigation Example

Problem:

```text
Users report checkout is slow.
```

Good investigation flow:

1. Check metrics: p95 latency increased for `POST /checkout`.
2. Check traces: most time is in payment provider HTTP calls.
3. Check logs: many payment timeouts and retries.
4. Check dependency dashboard: payment provider has elevated latency.
5. Mitigation: tune timeout, add backoff, show retry-safe client response, contact provider.

Practical investigation habit:

> I do not guess first. I use metrics to find the symptom, traces to locate the slow dependency, and logs to understand the detailed failure.

## Review Questions

### Logs vs metrics vs traces?

Logs describe events, metrics show numeric trends, and traces show request flow across components and dependencies.

### Why structured logging?

It makes logs queryable by fields such as `OrderId`, `UserId`, `TenantId`, and `CorrelationId`, which is essential for production troubleshooting.

### What is a correlation ID?

A correlation ID links logs and operations belonging to the same request or workflow across services.

### What is distributed tracing?

Distributed tracing records a workflow across multiple services and dependencies. It helps identify where time was spent and where failures occurred.

### What should you alert on?

Alert on user-impacting symptoms, such as high error rate, high latency, job failures, payment failures, or queue backlog. Avoid alerting only on noisy internal details unless they predict user impact.

### What is high-cardinality metric data?

High-cardinality data has many distinct label values, such as user IDs or order IDs. It can create too many time series and overload metrics storage.

## Common Mistakes

### Mistake: Logging only strings, not structured fields

Why it is wrong:

> Plain strings are hard to search, group, and aggregate.

Better answer:

> Use structured logging templates with named fields.

### Mistake: Logging sensitive data

Why it is wrong:

> Logs are often widely accessible and retained for a long time.

Better answer:

> Redact secrets and avoid logging full sensitive request bodies.

### Mistake: No correlation ID

Why it is wrong:

> Troubleshooting distributed workflows becomes slow because logs cannot be connected reliably.

Better answer:

> Use correlation IDs, trace IDs, and logging scopes.

### Mistake: Too many noisy logs

Why it is wrong:

> Noise hides real problems and increases storage cost.

Better answer:

> Log meaningful events at appropriate levels and rely on metrics for high-volume trends.

### Mistake: No metrics for business-critical flows

Why it is wrong:

> The system may look technically healthy while checkout, payment, login, or notifications are failing.

Better answer:

> Track both technical and business metrics.

### Mistake: No tracing for distributed systems

Why it is wrong:

> Without traces, it is hard to see which service or dependency caused latency.

Better answer:

> Use OpenTelemetry or a similar tracing solution across services and dependencies.

## Practice Task

Add:

1. structured request logging;
2. correlation ID middleware;
3. error logging with `traceId`;
4. business metric for order creation;
5. trace through API -> database -> external HTTP call;
6. one note explaining what alert you would create for checkout failures.
