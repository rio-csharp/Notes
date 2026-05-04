# API Gateway

## Core Idea

An API Gateway is an entry point that routes client requests to backend services.

Chinese notes:

- `API Gateway`: API 网关.
- `reverse proxy`: 反向代理.
- `BFF`: Backend for Frontend.
- `rate limiting`: 限流.
- `request aggregation`: 请求聚合.

## Responsibilities

An API gateway may handle:

- routing;
- TLS termination;
- authentication integration;
- rate limiting;
- request/response transformation;
- load balancing;
- logging;
- correlation IDs;
- API aggregation;
- version routing;
- CORS;
- WAF/security integration.

It should not become the place where core business rules live.

## Gateway Architecture

```text
React App
  -> API Gateway
    -> Identity API
    -> Order API
    -> Payment API
    -> Notification API
```

The gateway is the front door. Services still own business behavior and authorization decisions.

## Common Tools

- Nginx;
- YARP;
- Ocelot;
- Kong;
- Envoy;
- Traefik;
- Azure API Management;
- AWS API Gateway.

## YARP Example

YARP is a .NET reverse proxy library.

Install:

```bash
dotnet add package Yarp.ReverseProxy
```

Configuration:

```json
{
  "ReverseProxy": {
    "Routes": {
      "orders-route": {
        "ClusterId": "orders-cluster",
        "Match": {
          "Path": "/api/orders/{**catch-all}"
        },
        "Transforms": [
          {
            "PathRemovePrefix": "/api"
          }
        ]
      }
    },
    "Clusters": {
      "orders-cluster": {
        "Destinations": {
          "orders-api": {
            "Address": "https://localhost:7101/"
          }
        }
      }
    }
  }
}
```

Program:

```csharp
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapReverseProxy();
```

Request:

```text
GET /api/orders/123
  -> gateway
  -> https://localhost:7101/orders/123
```

## Authentication At Gateway

Gateway can validate tokens before routing.

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Auth:Authority"];
        options.Audience = "api";
    });

builder.Services.AddAuthorization();

app.UseAuthentication();
app.UseAuthorization();

app.MapReverseProxy().RequireAuthorization();
```

Important:

Service-level authorization is still needed. Gateway authentication does not replace resource checks in backend services.

## Rate Limiting

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("api", limiter =>
    {
        limiter.PermitLimit = 100;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
});

app.UseRateLimiter();

app.MapReverseProxy()
    .RequireRateLimiting("api");
```

Rate limits can be based on:

- IP address;
- user ID;
- tenant ID;
- API key;
- route.

In multi-instance deployments, use distributed rate limiting if limits must be global.

## Correlation ID

Gateway is a good place to create or forward a correlation ID.

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
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var existing)
            ? existing.ToString()
            : Guid.NewGuid().ToString("N");

        context.Request.Headers[HeaderName] = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        await _next(context);
    }
}
```

All downstream services should include this ID in logs and traces.

## Gateway vs BFF

API Gateway:

- generic infrastructure;
- routes to services;
- handles cross-cutting concerns;
- should not be UI-specific.

BFF:

- backend tailored to a specific frontend;
- aggregates data for UI needs;
- reduces frontend complexity;
- may own frontend-specific DTOs.

Example:

```text
React Admin UI
  -> Admin BFF
    -> Orders API
    -> Users API
    -> Billing API
```

The BFF may combine data into one dashboard response.

## Aggregation Example

```csharp
[ApiController]
[Route("api/dashboard")]
public sealed class DashboardController : ControllerBase
{
    private readonly IOrdersClient _orders;
    private readonly IBillingClient _billing;

    public DashboardController(IOrdersClient orders, IBillingClient billing)
    {
        _orders = orders;
        _billing = billing;
    }

    [HttpGet("summary")]
    public async Task<DashboardSummaryDto> GetSummary(CancellationToken ct)
    {
        var ordersTask = _orders.GetTodaySummaryAsync(ct);
        var billingTask = _billing.GetTodayRevenueAsync(ct);

        await Task.WhenAll(ordersTask, billingTask);

        return new DashboardSummaryDto(
            await ordersTask,
            await billingTask);
    }
}
```

This aggregation belongs more naturally in a BFF than in a generic gateway.

## Timeout And Resilience

Gateway should not wait forever for downstream services.

Use:

- per-route timeout;
- retry only for safe/idempotent requests;
- circuit breaker;
- fallback where appropriate;
- request body size limits.

Avoid retrying non-idempotent `POST` blindly.

## Risks

- bottleneck;
- single point of failure;
- too much business logic;
- hidden coupling between clients and services;
- difficult debugging without tracing;
- inconsistent authorization model;
- large request/response transformations.

## Common Mistakes

- Business logic in gateway.
- No rate limiting.
- No timeout.
- No observability.
- Gateway as single point of failure.
- Confusing gateway auth with service-level authorization.
- Aggregating too much in a generic gateway instead of a BFF.

## Knowledge Checks

### Why use API Gateway?

It provides a single entry point for clients and centralizes routing, authentication integration, rate limiting, TLS termination, and cross-cutting concerns.

### API Gateway vs BFF?

Gateway is usually generic infrastructure. BFF is a backend tailored to a specific frontend experience and may aggregate data for that client.

### What are risks of API Gateway?

It can become a bottleneck, single point of failure, or place where too much business logic accumulates.

## Practice Task

Design gateway for:

1. React frontend;
2. order service;
3. payment service;
4. auth validation;
5. rate limiting;
6. request tracing.

