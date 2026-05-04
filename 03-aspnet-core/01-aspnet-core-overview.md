# ASP.NET Core Overview

## Core Idea

ASP.NET Core is a high-performance, cross-platform framework for building web APIs, web apps, real-time apps, and background services.

Chinese notes:

- `web framework`: Web 框架.
- `endpoint`: 端点.
- `hosting model`: 托管模型.

## What ASP.NET Core Provides

- HTTP server integration;
- middleware pipeline;
- routing;
- controllers and Minimal APIs;
- dependency injection;
- configuration;
- logging;
- authentication and authorization;
- model binding and validation;
- filters;
- static files;
- background services;
- health checks.

Mental model:

```text
Client
  -> reverse proxy / load balancer
  -> Kestrel
  -> middleware pipeline
  -> routing
  -> authentication / authorization
  -> model binding / validation
  -> controller or Minimal API endpoint
  -> service layer
  -> database / cache / external systems
  -> response
```

ASP.NET Core itself should not contain all business logic. It is the web boundary: it accepts HTTP requests, validates and authorizes them, calls application code, and returns HTTP responses.

## Minimal Hosting Model

Modern ASP.NET Core often uses `Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var app = builder.Build();

app.MapControllers();

app.Run();
```

More realistic API setup:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();
```

What happens here:

- `builder.Services` configures DI and framework services;
- `builder.Build()` creates the application pipeline builder;
- `app.Use...` registers middleware;
- `app.Map...` maps endpoints;
- `app.Run()` starts the server.

Older projects may use `Startup.cs` with `ConfigureServices` and `Configure`.

Clear wording:

> Minimal hosting moved setup into `Program.cs`, but the concepts are the same: register services, build the app, configure middleware, map endpoints, then run.

## Kestrel

Kestrel is ASP.NET Core's cross-platform web server.

In production, it is often placed behind:

- IIS;
- Nginx;
- Apache;
- YARP;
- cloud load balancer;
- Kubernetes ingress.

Typical production deployment:

```text
Browser / API client
  -> HTTPS load balancer
  -> Nginx / IIS / ingress
  -> Kestrel
  -> ASP.NET Core app
```

Why put Kestrel behind a reverse proxy?

- TLS termination;
- load balancing;
- compression/caching/static file handling in some setups;
- request size limits;
- centralized routing;
- security headers and edge policies.

Kestrel can also serve traffic directly, but many production systems still use a fronting proxy or platform ingress.

## Controllers vs Minimal APIs

Controllers:

- structured;
- good for larger APIs;
- filters and conventions;
- familiar MVC pattern.

Minimal APIs:

- lightweight;
- good for small services;
- simple endpoint definitions;
- less ceremony.

Controller example:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<OrderDto> GetById(int id)
    {
        return Ok(new OrderDto(id, "Draft"));
    }
}
```

Minimal API example:

```csharp
app.MapGet("/api/orders/{id:int}", (int id) =>
{
    return Results.Ok(new OrderDto(id, "Draft"));
});
```

Decision guide:

| Use Controllers When | Use Minimal APIs When |
| --- | --- |
| API is large | service is small |
| you want controller conventions | endpoint logic is simple |
| filters and attributes are heavily used | lightweight endpoint definitions are preferred |
| team is familiar with MVC structure | startup speed and low ceremony matter |

They can coexist in the same application.

## Complete Minimal API Example

The following example shows a small but realistic ASP.NET Core API in one file.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddSingleton<IOrderStore, InMemoryOrderStore>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();

var orders = app.MapGroup("/api/orders")
    .WithTags("Orders");

orders.MapGet("/{id:int}", async (int id, IOrderStore store, CancellationToken ct) =>
{
    var order = await store.GetByIdAsync(id, ct);

    return order is null
        ? Results.NotFound()
        : Results.Ok(order);
});

orders.MapPost("/", async (
    CreateOrderRequest request,
    IOrderStore store,
    CancellationToken ct) =>
{
    if (request.CustomerId <= 0 || request.Items.Count == 0)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["request"] = ["CustomerId and at least one item are required."]
        });
    }

    var order = await store.CreateAsync(request, ct);

    return Results.Created($"/api/orders/{order.Id}", order);
});

app.Run();
```

Request and response models:

```csharp
public sealed record CreateOrderRequest(
    int CustomerId,
    List<CreateOrderItemRequest> Items);

public sealed record CreateOrderItemRequest(
    int ProductId,
    int Quantity,
    decimal UnitPrice);

public sealed record OrderDto(
    int Id,
    int CustomerId,
    decimal Total,
    string Status);
```

Simple store implementation:

```csharp
public interface IOrderStore
{
    Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct);
    Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken ct);
}

public sealed class InMemoryOrderStore : IOrderStore
{
    private readonly object _gate = new();
    private readonly Dictionary<int, OrderDto> _orders = new();
    private int _nextId = 1;

    public Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        lock (_gate)
        {
            _orders.TryGetValue(id, out var order);
            return Task.FromResult(order);
        }
    }

    public Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken ct)
    {
        var total = request.Items.Sum(item => item.Quantity * item.UnitPrice);

        lock (_gate)
        {
            var id = _nextId++;
            var order = new OrderDto(id, request.CustomerId, total, "Draft");
            _orders[id] = order;

            return Task.FromResult(order);
        }
    }
}
```

Run commands:

```powershell
dotnet new webapi -n Orders.Api
cd Orders.Api
dotnet run
```

If you want Swagger UI for this example, add the Swagger package and register `AddSwaggerGen`, `UseSwagger`, and `UseSwaggerUI`. The core API example above does not depend on Swagger.

Test with HTTP:

```http
POST https://localhost:5001/api/orders
Content-Type: application/json

{
  "customerId": 123,
  "items": [
    { "productId": 10, "quantity": 2, "unitPrice": 25.00 }
  ]
}
```

Learning points:

- `builder.Services` registers dependencies and framework services;
- `app.Use...` configures middleware;
- `app.MapGroup` organizes related endpoints;
- request DTOs describe input shape;
- response DTOs describe output shape;
- the endpoint validates HTTP input and delegates storage behavior to a service.

## Where Code Should Live

Common structure:

```text
MyApp.Api
  Controllers
  Middleware
  Program.cs

MyApp.Application
  Services
  Commands
  Queries
  DTOs

MyApp.Domain
  Entities
  ValueObjects
  DomainRules

MyApp.Infrastructure
  EF Core
  ExternalClients
  Repositories
```

Controller responsibility:

```text
HTTP in -> validate/auth/map -> call application service -> HTTP out
```

Avoid putting SQL queries, payment logic, or complex business workflows directly in controllers.

## Review Questions

### What is ASP.NET Core?

> ASP.NET Core is a modern cross-platform framework for building web APIs and web applications. It provides routing, middleware, DI, configuration, logging, authentication, authorization, and hosting features.

### What is Kestrel?

> Kestrel is the built-in cross-platform web server for ASP.NET Core. It can serve requests directly or run behind a reverse proxy.

### Minimal API vs Controller?

> Minimal APIs are lightweight and concise. Controllers provide more structure and are often better for larger APIs with filters, conventions, and complex organization.

### What should be in a controller?

> A controller should handle HTTP concerns: route parameters, request models, validation result, authorization metadata, calling application services, and returning responses. Business logic should usually live in application/domain services.

### Can Kestrel serve production traffic directly?

> Yes, but many production deployments place it behind a reverse proxy, load balancer, or ingress for TLS, routing, load balancing, edge policies, and operational consistency.

## Common Mistakes

### Mistake: Putting business logic in controllers.

Why it is wrong:

> Controllers become hard to test and reuse, and business rules get mixed with HTTP details.

Better answer:

> Keep controllers thin and move business workflows into application/domain services.

### Mistake: Not understanding middleware order.

Why it is wrong:

> Middleware runs in registration order. Authentication must happen before authorization, and exception handling must be early enough to catch downstream failures.

Better answer:

> Be able to explain the request pipeline from top to bottom.

### Mistake: No global error handling.

Why it is wrong:

> Unhandled exceptions can leak details or produce inconsistent responses.

Better answer:

> Use centralized exception handling and consistent `ProblemDetails` responses.

### Mistake: No health checks.

Why it is wrong:

> Deployment platforms and load balancers need a reliable way to know whether an instance should receive traffic.

Better answer:

> Add liveness/readiness style health checks appropriate for the hosting environment.

### Mistake: Treating Minimal API and controllers as mutually exclusive.

Why it is wrong:

> ASP.NET Core supports both. The choice can be per app or even per endpoint group.

Better answer:

> Choose based on complexity, team conventions, and maintainability.
