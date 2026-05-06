# Logging And Observability In ASP.NET Core

## Core Idea

Observability is the ability to understand a running system from its outward signals. In ASP.NET Core applications, that usually means logs, metrics, and traces working together rather than as isolated tools.

This chapter treats observability as part of system design, not as an optional operational accessory. Production debugging, capacity planning, incident response, and reliability improvement all depend on whether the application emits useful signals and whether those signals preserve enough context to explain what the system was doing.

## Logs, Metrics, And Traces As Different Kinds Of Evidence

Logs, metrics, and traces answer different questions.

Logs describe discrete events and their context.

```text
OrderCreated OrderId=1001 CustomerId=42 Amount=128.50
```

Metrics describe numeric behavior over time.

```text
http.server.request.duration
orders.created.count
payment.failure.count
database.query.duration
```

Traces describe the path of a request or workflow through multiple components.

```text
HTTP POST /orders
  -> ValidateOrder
  -> SQL INSERT Orders
  -> HTTP POST payment-service
  -> Kafka publish OrderCreated
```

These signals complement one another. Metrics help detect that something is wrong, traces help locate where time or failure is concentrated, and logs help explain exactly what happened.

## Structured Logging

One of the most important practical disciplines in .NET logging is to log structured data rather than concatenated prose.

```csharp
_logger.LogInformation("Created order " + order.Id);
```

```csharp
_logger.LogInformation(
    "Created order {OrderId} for customer {CustomerId}",
    order.Id,
    order.CustomerId);
```

Structured logging matters because fields such as `OrderId`, `CustomerId`, or `TenantId` can then be indexed, queried, grouped, and correlated in operational tooling. The application is no longer emitting text only for human reading. It is emitting event data that machines can search and aggregate meaningfully.

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

## Log Levels And Signal Discipline

Log levels are meaningful only if they are used consistently.

| Level | Typical meaning |
| --- | --- |
| `Trace` | highly detailed diagnostic information |
| `Debug` | development-oriented investigation detail |
| `Information` | normal meaningful application events |
| `Warning` | unexpected but recoverable conditions |
| `Error` | failed operations |
| `Critical` | system-level failure that threatens application availability |

Applications become harder to operate when every event is logged at the same severity or when highly repetitive normal behavior floods the logs with low-value entries. Good observability is selective. It records enough to reconstruct important events without turning the log stream into noise.

## Correlation And Request Context

Operational value increases sharply when the application can connect related events together.

A correlation identifier is one common mechanism:

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

Correlation becomes especially useful when a failed request must be reconstructed across logs, traces, and dependency calls. Without that shared context, the system may still emit data, but the operator is forced to guess which entries belong together.

## Logging Scopes

Scopes provide a convenient way to attach repeated context to a sequence of log entries.

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

This is useful because context often belongs to a unit of work rather than to a single line. Scopes preserve that relationship without requiring every log call to repeat the same fields manually.

## Sensitive Data And Logging Boundaries

Observability has to be balanced against confidentiality.

The following should generally not appear in logs:

- passwords;
- bearer tokens;
- refresh tokens;
- API keys;
- full payment card data;
- full personal identifiers;
- raw request bodies that may contain secrets or personal data;
- connection strings with embedded credentials.

```csharp
_logger.LogInformation("Login request {@Request}", request);
```

That kind of logging is often overly broad and difficult to control once data begins to flow into shared observability systems. Logs should contain enough diagnostic value to explain behavior, but they should not become a secondary ungoverned datastore for sensitive information.

## OpenTelemetry And Unified Telemetry

Modern .NET applications increasingly use OpenTelemetry to standardize traces, metrics, and related telemetry emission.

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

Application code can also emit custom spans and metrics explicitly:

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

```csharp
public sealed class OrderMetrics
{
    private readonly Counter<long> _ordersCreated;

    public OrderMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create("Orders.Api");
        _ordersCreated = meter.CreateCounter<long>("orders.created");
    }

    public void OrderCreated(string tenantTier)
    {
        _ordersCreated.Add(1, new KeyValuePair<string, object?>("tenant.tier", tenantTier));
    }
}
```

This is where observability stops being "logging plus extras" and becomes a more coherent instrumentation model.

## Cardinality And Cost

Not every useful-looking telemetry dimension is a good production dimension.

Metrics systems are especially sensitive to high cardinality. Labels such as raw `user.id`, `order.id`, or full URLs can explode the number of time series and make the monitoring system itself expensive or unstable.

Low-cardinality dimensions are often better:

- endpoint template instead of full URL;
- status code instead of full error text;
- tenant tier instead of individual tenant ID when many tenants exist.

This is an important design constraint because observability is not only about emitting more data. It is about emitting data that remains queryable, affordable, and actionable at scale.

## What To Measure

Good observability includes both technical and business signals.

Technical signals often include:

- request count;
- request latency percentiles;
- error rate;
- dependency latency;
- database query duration;
- thread-pool pressure;
- memory and GC behavior;
- queue backlog;
- retry and timeout counts.

Business signals often include:

- orders created;
- payment failures;
- login failures;
- notification delivery failures;
- checkout completion rate.

This distinction matters because a technically healthy system can still be operationally unhealthy for the business, and vice versa. Strong observability does not stop at infrastructure metrics alone.

## Error Handling And Client-Facing Diagnostics

One useful connection between observability and API design is the use of trace or correlation identifiers in error responses.

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

This design gives clients a safe diagnostic handle that operators can use to find the corresponding server-side evidence without exposing internal exception detail directly.

## Investigation As A Workflow

Observability is most valuable when it supports an actual investigation process.

Suppose users report that checkout is slow. A disciplined workflow might be:

1. inspect metrics to confirm elevated latency and identify affected endpoints;
2. inspect traces to see where time is being spent across dependencies;
3. inspect logs for the relevant correlation or trace identifiers;
4. verify whether the bottleneck is internal work, a database dependency, or an external service;
5. choose mitigation based on evidence rather than intuition.

This sequence illustrates why observability should be designed as a system, not as a pile of unrelated outputs. Each signal type narrows the problem in a different way.
