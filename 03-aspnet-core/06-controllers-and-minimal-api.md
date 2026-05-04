# Controllers And Minimal APIs

## Core Idea

ASP.NET Core supports both controller-based APIs and Minimal APIs.

Chinese notes:

- `controller`: 控制器.
- `action`: 控制器方法.
- `Minimal API`: 轻量 API 写法.

## Controller Example

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly IOrderService _orders;

    public OrdersController(IOrderService orders)
    {
        _orders = orders;
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }
}
```

## Minimal API Example

```csharp
app.MapGet("/api/orders/{id:int}", async (
    int id,
    IOrderService orders,
    CancellationToken ct) =>
{
    var order = await orders.GetByIdAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
```

## ActionResult<T>

```csharp
public async Task<ActionResult<OrderDto>> GetById(int id)
```

Allows:

- typed success response;
- status code results like `NotFound`.

Example:

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct)
{
    var order = await _orders.GetByIdAsync(id, ct);

    if (order is null)
    {
        return NotFound();
    }

    return Ok(order);
}
```

Why `ActionResult<T>` is useful:

> The success body is typed as `OrderDto`, but the action can still return HTTP results such as `404`.

## ApiController Attribute

`[ApiController]` provides:

- automatic model validation response;
- binding source inference;
- better API conventions.

Example request model:

```csharp
public sealed class CreateOrderRequest
{
    [Required]
    public int CustomerId { get; init; }

    [MinLength(1)]
    public List<CreateOrderItemRequest> Items { get; init; } = [];
}
```

Controller:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(CreateOrderRequest request)
    {
        return Ok();
    }
}
```

With `[ApiController]`, invalid model state usually returns `400` automatically before the action executes.

## Thin Controllers

Controllers should coordinate HTTP concerns, not contain complex business logic.

Good controller responsibilities:

- read route/query/body;
- call application/service layer;
- return HTTP result.

Avoid:

- large business workflows;
- direct SQL;
- complex authorization logic inline;
- huge mapping code.

Bad:

```csharp
[HttpPost]
public async Task<IActionResult> Create(CreateOrderRequest request)
{
    var customer = await _db.Customers.FindAsync(request.CustomerId);
    var order = new Order(customer!.Id);
    _db.Orders.Add(order);
    await _db.SaveChangesAsync();
    await _email.SendAsync(customer.Email, "Created", "...");
    return Ok(order);
}
```

Problems:

- controller owns persistence;
- controller owns business workflow;
- controller sends email directly;
- returns entity directly;
- hard to test.

Better:

```csharp
[HttpPost]
public async Task<ActionResult<OrderDto>> Create(
    CreateOrderRequest request,
    CancellationToken ct)
{
    var order = await _orders.CreateAsync(request, ct);

    return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
}
```

The application service owns the workflow.

## Complete Controller Example

This example shows a controller with route parameters, body binding, cancellation, status codes, and DTOs.

Request models:

```csharp
public sealed class CreateOrderRequest
{
    [Required]
    public int CustomerId { get; init; }

    [MinLength(1)]
    public List<CreateOrderItemRequest> Items { get; init; } = [];
}

public sealed class CreateOrderItemRequest
{
    [Required]
    public int ProductId { get; init; }

    [Range(1, 1000)]
    public int Quantity { get; init; }

    [Range(0.01, 100000)]
    public decimal UnitPrice { get; init; }
}
```

Response model:

```csharp
public sealed record OrderDto(
    int Id,
    int CustomerId,
    decimal Total,
    string Status);
```

Controller:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly IOrderService _orders;

    public OrdersController(IOrderService orders)
    {
        _orders = orders;
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);

        if (order is null)
        {
            return NotFound();
        }

        return Ok(order);
    }

    [HttpPost]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var order = await _orders.CreateAsync(request, ct);

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }
}
```

Service contract:

```csharp
public interface IOrderService
{
    Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct);
    Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken ct);
}
```

Why this design is useful:

- validation attributes describe input requirements;
- `[ApiController]` turns invalid model state into a `400` response;
- `ActionResult<OrderDto>` keeps the success response typed;
- status-code attributes improve OpenAPI documentation;
- the controller stays thin and delegates workflow logic.

## Minimal API Endpoint Groups

Minimal APIs can still be organized.

```csharp
var orders = app.MapGroup("/api/orders")
    .WithTags("Orders")
    .RequireAuthorization();

orders.MapGet("/{id:int}", async (
    int id,
    IOrderService orderService,
    CancellationToken ct) =>
{
    var order = await orderService.GetByIdAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
```

This keeps Minimal APIs from becoming a long unstructured `Program.cs`.

## Complete Minimal API Example

Minimal APIs can use endpoint groups and typed results to stay explicit.

```csharp
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/orders")
            .WithTags("Orders")
            .WithOpenApi();

        group.MapGet("/{id:int}", GetById)
            .WithName("GetOrderById")
            .Produces<OrderDto>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/", Create)
            .Produces<OrderDto>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<Results<Ok<OrderDto>, NotFound>> GetById(
        int id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(id, ct);

        return order is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(order);
    }

    private static async Task<Results<Created<OrderDto>, ValidationProblem>> Create(
        CreateOrderRequest request,
        IOrderService orders,
        CancellationToken ct)
    {
        if (request.CustomerId <= 0)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["customerId"] = ["CustomerId must be greater than zero."]
            });
        }

        var order = await orders.CreateAsync(request, ct);

        return TypedResults.Created($"/api/orders/{order.Id}", order);
    }
}
```

Program registration:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

app.MapOrderEndpoints();

app.Run();
```

Key point:

> Minimal API does not mean all code must stay in `Program.cs`. Endpoint extension methods keep routes discoverable and testable.

## Endpoint Filters

Endpoint filters can run before and after Minimal API handlers.

Example: require a client version header.

```csharp
public sealed class ClientVersionFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var httpContext = context.HttpContext;

        if (!httpContext.Request.Headers.ContainsKey("X-Client-Version"))
        {
            return TypedResults.BadRequest(new
            {
                error = "Missing X-Client-Version header"
            });
        }

        return await next(context);
    }
}
```

Usage:

```csharp
app.MapGroup("/api/orders")
    .AddEndpointFilter<ClientVersionFilter>()
    .MapGet("/{id:int}", async (int id, IOrderService orders, CancellationToken ct) =>
    {
        var order = await orders.GetByIdAsync(id, ct);
        return order is null ? Results.NotFound() : Results.Ok(order);
    });
```

Use endpoint filters for endpoint-specific cross-cutting behavior. Use middleware for application-wide HTTP pipeline behavior.

## Returning DTOs

Avoid returning EF entities directly:

```csharp
return Ok(orderEntity); // risky
```

Use DTOs:

```csharp
return Ok(new OrderDto(
    order.Id,
    order.Status.ToString(),
    order.Total));
```

Why:

- stable API contract;
- avoid exposing internal fields;
- avoid circular references;
- easier versioning;
- smaller payloads.

## Review Questions

### Controller vs Minimal API?

> Controllers provide structure, conventions, and MVC features. Minimal APIs are concise and good for small services or simple endpoints. Both can be used in the same application.

### What does `[ApiController]` do?

> It enables API-specific behaviors like automatic model validation responses and binding source inference.

### What should be in controllers?

> HTTP orchestration: input binding, calling services, and returning responses. Business rules should live in application/domain services.

### Why avoid returning EF entities?

> EF entities are persistence models, not API contracts. Returning them can expose internal fields, create circular JSON issues, and couple clients to database design.

### How do you keep Minimal APIs maintainable?

> Use endpoint groups, extension methods, typed request/response models, services, validation, and consistent result handling.

## Common Mistakes

### Mistake: Fat controllers.

Why it is wrong:

> Controllers become hard to test and mix HTTP, business, persistence, and integration concerns.

Better answer:

> Keep controllers thin and delegate workflows to services.

### Mistake: Returning EF entities directly.

Why it is wrong:

> It leaks database shape and can expose unintended data.

Better answer:

> Return DTOs designed for the API contract.

### Mistake: Inconsistent response codes.

Why it is wrong:

> Clients cannot reliably handle results.

Better answer:

> Define response conventions for success, validation, not found, conflict, auth failure, and unexpected errors.

### Mistake: No cancellation token.

Why it is wrong:

> Work may continue after client disconnect or request timeout.

Better answer:

> Accept `CancellationToken` and pass it to async services, EF Core, and external calls.

### Mistake: Business logic mixed with HTTP logic.

Why it is wrong:

> Business rules become tied to controllers and cannot be reused or tested cleanly.

Better answer:

> Put business rules in application/domain services.
