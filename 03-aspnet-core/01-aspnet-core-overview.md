# ASP.NET Core Overview

## Core Idea

ASP.NET Core is the modern .NET framework for building HTTP-facing applications: web APIs, server-rendered web applications, real-time endpoints, and background-hosted processes that live alongside them. Its significance is not just that it can serve requests. It provides a coherent hosting model in which HTTP transport, endpoint dispatch, dependency injection, configuration, logging, security, and application startup all work together as one platform.

The later files examine the request pipeline, middleware, routing, endpoint styles, security, configuration, observability, and background processing in more detail.

## ASP.NET Core As The Web Boundary

An ASP.NET Core application is usually the boundary between external callers and internal application logic. It accepts HTTP requests, authenticates and authorizes them, binds input into .NET types, invokes application services, and converts outcomes back into HTTP responses.

```text
Client
  -> reverse proxy / load balancer
  -> Kestrel
  -> middleware pipeline
  -> routing
  -> authentication / authorization
  -> endpoint execution
  -> application services
  -> data stores / caches / external systems
  -> response
```

This boundary model matters because it clarifies where code should live. ASP.NET Core code should remain responsible for HTTP-facing concerns such as transport, routing, security metadata, request and response handling, and startup composition. Core business rules, workflow decisions, and persistence policies should usually live below that boundary in application, domain, or infrastructure layers.

## Framework Capabilities

ASP.NET Core combines a number of capabilities that earlier frameworks or custom stacks often treated separately:

- hosting and server integration;
- middleware composition;
- routing and endpoint dispatch;
- controller and Minimal API models;
- dependency injection;
- configuration;
- logging and diagnostics;
- authentication and authorization;
- model binding and validation;
- health checks and background hosting.

The value of this integration is architectural consistency. A request does not move through unrelated subsystems stitched together by convention. It flows through one coordinated hosting and execution model.

## The Modern Hosting Model

Current ASP.NET Core applications usually use the minimal hosting model centered on `Program.cs`.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var app = builder.Build();

app.MapControllers();

app.Run();
```

That small example already shows the core lifecycle:

- create the builder;
- register services and framework features;
- build the application;
- configure the request pipeline and endpoints;
- start the host.

A more realistic setup looks like this:

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

The hosting model is "minimal" in ceremony, not in capability. Older applications may still use `Startup.cs`, but the underlying ideas remain the same: configuration is built, services are registered, middleware is ordered, endpoints are mapped, and the host is started.

## Kestrel And Deployment Topology

Kestrel is the built-in cross-platform web server used by ASP.NET Core.

In many production systems, Kestrel is not the outermost network boundary. It often sits behind:

- IIS;
- Nginx;
- Apache;
- a cloud load balancer;
- an ingress controller in Kubernetes;
- an application gateway or reverse proxy such as YARP.

```text
Browser / API client
  -> HTTPS load balancer or reverse proxy
  -> Kestrel
  -> ASP.NET Core application
```

This arrangement is common because edge infrastructure often handles TLS termination, public traffic policy, request size limits, centralized routing, and load balancing. Kestrel can serve traffic directly, but understanding the distinction between edge concerns and in-process ASP.NET Core concerns is important for deployment and troubleshooting.

## Endpoint Styles: Controllers And Minimal APIs

ASP.NET Core supports more than one endpoint programming model. The two most common styles are controllers and Minimal APIs.

Controller-based endpoints are more structured:

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

Minimal APIs are more direct:

```csharp
app.MapGet("/api/orders/{id:int}", (int id) =>
{
    return Results.Ok(new OrderDto(id, "Draft"));
});
```

Both styles ultimately participate in the same routing, authorization, dependency injection, and response pipeline. The difference is one of structure and programming model rather than platform capability.

Controllers are often a good fit for larger APIs that benefit from conventions, filters, and stronger structural organization. Minimal APIs are often a good fit for smaller services, focused endpoint groups, and lower-ceremony HTTP surfaces.

## Application Composition And Layering

Because ASP.NET Core is the web boundary rather than the whole application, code organization matters.

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

This is only one possible layout, but it illustrates an important principle: endpoint code should not absorb the entire system. When controllers or Minimal API handlers begin to own SQL queries, payment workflow, business rules, and integration logic directly, the framework boundary has grown too large and the codebase becomes harder to test and evolve.

## A Small End-To-End Example

The following Minimal API example is intentionally compact, but it shows the platform shape clearly.

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

```csharp
public interface IOrderStore
{
    Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct);
    Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken ct);
}
```

Even in this small sample, the main platform ideas are visible: service registration, pipeline composition, grouped endpoints, request DTOs, response DTOs, validation at the HTTP edge, and delegation of data access behind an abstraction.
