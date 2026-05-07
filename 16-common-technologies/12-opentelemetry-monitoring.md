# OpenTelemetry And Monitoring

## Core Idea

OpenTelemetry is an observability standard for collecting traces, metrics, and logs.

## Observability vs Monitoring

Monitoring tells you whether the system is healthy.

Observability helps you understand why it is unhealthy.

Signals:

- logs: discrete events;
- metrics: numerical measurements over time;
- traces: request journey across components.

## Logs, Metrics, Traces

Logs:

- error details;
- business events;
- diagnostic context.

Metrics:

- request count;
- latency;
- error rate;
- queue depth;
- consumer lag.

Traces:

- one request across services;
- dependency timing;
- bottleneck location.

## Trace And Span

Trace:

```text
One complete request/workflow.
```

Span:

```text
One operation inside a trace.
```

Example:

```text
HTTP POST /orders
  -> SQL INSERT Orders
  -> Redis GET permissions
  -> RabbitMQ publish OrderSubmitted
```

Each operation can be a span in the same trace.

## .NET OpenTelemetry Setup

Packages:

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.EntityFrameworkCore
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
```

Setup:

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .SetResourceBuilder(ResourceBuilder.CreateDefault()
                .AddService(
                    serviceName: "orders-api",
                    serviceVersion: "1.0.0"))
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddEntityFrameworkCoreInstrumentation()
            .AddSource(OrderDiagnostics.ActivitySourceName)
            .AddOtlpExporter();
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddMeter(OrderDiagnostics.MeterName)
            .AddOtlpExporter();
    });
```

## Custom Activity

```csharp
public static class OrderDiagnostics
{
    public const string ActivitySourceName = "MyApp.Orders";
    public const string MeterName = "MyApp.Orders";

    public static readonly ActivitySource ActivitySource = new(ActivitySourceName);
    public static readonly Meter Meter = new(MeterName);

    public static readonly Counter<long> OrdersCreated =
        Meter.CreateCounter<long>("orders.created");
}
```

Usage:

```csharp
public async Task<int> CreateOrderAsync(CreateOrderCommand command, CancellationToken ct)
{
    using var activity = OrderDiagnostics.ActivitySource
        .StartActivity("CreateOrder");

    activity?.SetTag("customer.id", command.CustomerId);
    activity?.SetTag("order.item_count", command.Items.Count);

    var order = Order.Create(command.CustomerId);

    await _repository.AddAsync(order, ct);
    await _unitOfWork.SaveChangesAsync(ct);

    OrderDiagnostics.OrdersCreated.Add(1,
        new KeyValuePair<string, object?>("tenant.id", command.TenantId));

    return order.Id;
}
```

Avoid high-cardinality tags such as raw email, full URL with IDs, or unbounded user input.

## Structured Logging

Good:

```csharp
_logger.LogInformation(
    "Order {OrderId} created for customer {CustomerId}",
    order.Id,
    order.CustomerId);
```

Risky:

```csharp
_logger.LogInformation($"Order {order.Id} created for customer {order.CustomerId}");
```

Structured logs are searchable by fields.

Do not log:

- passwords;
- tokens;
- full credit card numbers;
- sensitive personal data;
- secrets;
- raw authorization headers.

## Key Metrics

API:

- request rate;
- p50/p95/p99 latency;
- error rate;
- status codes;
- saturation.

Database:

- query duration;
- connection pool usage;
- deadlocks;
- timeouts.

Message processing:

- queue depth;
- consumer lag;
- processing duration;
- failure count;
- dead-letter count;

Frontend:

- LCP;
- CLS;
- INP;
- JavaScript errors;
- API latency from browser.

## RED And USE

RED method for request-driven services:

```text
Rate
Errors
Duration
```

USE method for resources:

```text
Utilization
Saturation
Errors
```

Examples:

```text
API: request rate, error rate, duration
CPU: utilization, run queue, errors
DB pool: active connections, waiting requests, timeout errors
```

## p95 And p99 Latency

Average latency can hide slow users.

```text
p95 = 95% of requests are faster than this value
p99 = 99% of requests are faster than this value
```

If average is 100 ms but p99 is 8 seconds, some users are having a bad experience.

## Correlation ID

Correlation ID connects logs across services.

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var value)
            ? value.ToString()
            : Guid.NewGuid().ToString("N");

        context.Response.Headers[HeaderName] = correlationId;

        using var scope = context.RequestServices
            .GetRequiredService<ILogger<CorrelationIdMiddleware>>()
            .BeginScope(new Dictionary<string, object>
            {
                ["CorrelationId"] = correlationId
            });

        await _next(context);
    }
}
```

OpenTelemetry trace IDs are often even better for distributed tracing, but correlation IDs are still useful for logs and support workflows.

## Alerting

Good alerts are actionable.

Examples:

```text
p95 latency > 1s for 10 minutes
HTTP 5xx rate > 2% for 5 minutes
RabbitMQ DLQ count increased
Kafka consumer lag increasing for 15 minutes
SQL connection pool timeout count > 0
Order payment failure rate > baseline
```

Avoid alerting on noisy symptoms without action. Too many noisy alerts cause alert fatigue.

## Dashboard Design

For one API, a useful dashboard includes:

- request rate;
- error rate;
- p50/p95/p99 latency;
- top endpoints by latency;
- dependency latency;
- database timeouts;
- message publish failures;
- current deployment version.

For business workflows, include business metrics:

- orders created;
- payment success rate;
- failed checkout count;
- email delivery failures.

The observability practices described -- trace instrumentation, structured logging, RED/USE metrics, percentile latency tracking, and actionable alerting -- provide the foundation for operating production systems with confidence.
