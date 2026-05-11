# Controllers And Minimal APIs

## Core Idea

ASP.NET Core exposes two major endpoint programming models for HTTP APIs: controllers and Minimal APIs. Both ultimately participate in the same hosting environment, routing system, authorization pipeline, dependency injection model, and response-writing infrastructure. The question is therefore not which one is "real" ASP.NET Core. The question is which model best expresses the endpoint surface a particular application needs.

The design choice matters because endpoint code must own specific concerns while delegating others, and request and response models must be shaped so that the HTTP layer remains explicit without absorbing the entire application.

## Endpoints As The HTTP Application Boundary

Whether an endpoint is written as a controller action or as a Minimal API delegate, it occupies the same architectural position: it is the code that turns HTTP concepts into application calls and application results back into HTTP.

That means endpoint code usually owns concerns such as:

- route and query inputs;
- request body models;
- response status codes and headers;
- authorization metadata;
- API-oriented validation behavior;
- delegation to application services.

It usually should not own:

- persistence orchestration;
- business workflow decisions;
- direct infrastructure integration details;
- ad hoc transaction coordination across multiple dependencies.

This boundary is one of the most important quality checks in web code. Once endpoint methods become the place where business rules, database access, and integration side effects all accumulate, the framework surface has grown too large.

## Controller-Based Endpoints

Controllers provide a structured programming model built around classes, actions, and attributes.

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

This model is often valuable when an API is large enough to benefit from:

- conventional organization by controller;
- attribute-based metadata;
- filters;
- stronger discoverability for teams familiar with MVC-style structure;
- a more explicit separation between endpoint classes and startup code.

Controllers introduce more ceremony, but that ceremony often buys clarity in larger systems.

## Minimal APIs

Minimal APIs provide a lighter-weight endpoint model centered on route mapping delegates.

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

This style is often appealing for focused services, small APIs, and teams that prefer endpoint-first composition over controller classes. It can also make the route surface easy to see at a glance, especially when grouped deliberately.

Minimal APIs are not inherently less structured than controllers. They only become structurally weak when everything stays inline in `Program.cs` and no effort is made to group routes, extract handlers, or define explicit request and response models.

## Choosing Between The Two Models

The trade-off is mostly about how much structure the HTTP surface benefits from.

Controllers often fit better when:

- the API is broad and long-lived;
- filters and attribute metadata are central;
- the team prefers class-based organization;
- the codebase already uses established MVC conventions.

Minimal APIs often fit better when:

- the service surface is narrow or deliberately lightweight;
- route groups provide enough organization;
- the team wants lower ceremony without sacrificing typed dependencies;
- endpoint code can remain explicit and disciplined without controller scaffolding.

The two models can coexist in the same application. The real architectural mistake is not mixing them. It is allowing either one to grow without clear conventions.

## `ActionResult<T>` And Typed HTTP Outcomes

Controller actions often benefit from `ActionResult<T>` because it expresses both a typed success body and alternative HTTP outcomes.

```csharp
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

This is more informative than returning `IActionResult` everywhere, because the successful shape remains visible in the method signature while still allowing results such as `404 Not Found` or `400 Bad Request`.

Minimal APIs express a similar idea through typed result unions:

```csharp
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
```

In both models, the goal is the same: the endpoint signature should communicate something meaningful about the HTTP contract instead of reducing every outcome to an untyped abstraction.

## `[ApiController]` And API-Oriented Behavior

The `[ApiController]` attribute adds behavior that is particularly useful for HTTP APIs.

It commonly provides:

- automatic model validation responses;
- binding-source inference for action parameters (e.g., `[FromBody]` is inferred for complex types without explicit attributes);
- more consistent API conventions.

```csharp
public sealed class CreateOrderRequest
{
    [Required]
    public int CustomerId { get; init; }

    [MinLength(1)]
    public List<CreateOrderItemRequest> Items { get; init; } = [];
}
```

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

With `[ApiController]`, invalid model state typically produces a `400 Bad Request` response before the action runs. That reduces boilerplate, but it does not remove the need for architectural judgment. Automatic validation is a convenience at the HTTP boundary, not a replacement for deeper application or domain invariants.

One binding behavior deserves explicit attention: when a parameter is decorated with `[FromBody]`, all binding source attributes on its properties are ignored. The input formatter reads the body as a single stream and does not inspect property-level `[FromQuery]` or `[FromRoute]` annotations. A `[FromBody]` model cannot mix body and query binding — the body is consumed entirely by the input formatter. If an endpoint needs values from both the body and the URL, split them into separate parameters rather than annotating properties inside the body model.

## Thin Controllers And Thin Endpoint Handlers

The principle of thin controllers applies just as much to Minimal API handlers.

This is a poor controller:

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

Its problem is not merely size. It mixes endpoint concerns, persistence, domain creation, and external notification in one HTTP method.

A healthier shape delegates workflow to an application service:

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

The same rule applies to Minimal APIs. Concise syntax should not become an excuse to hide orchestration, persistence, and integration logic inside route delegates.

## A Structured Controller Example

Controllers become especially effective when the surrounding HTTP contract is explicit.

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

public sealed record OrderDto(
    int Id,
    int CustomerId,
    decimal Total,
    string Status);
```

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

The value here is not just that the code compiles. The route shape, validation behavior, result typing, and documentation hints all contribute to a clearer and more stable API surface.

## Organizing Minimal APIs Deliberately

Minimal APIs remain maintainable when they are grouped and extracted instead of left as a long startup script.

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

A more deliberate extraction keeps the endpoint surface discoverable without overloading `Program.cs`:

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

The discipline is the same as with controllers: route handlers should stay focused on HTTP behavior and delegate business work appropriately.

## Endpoint Filters In Minimal APIs

Minimal APIs have their own filter mechanism for endpoint-specific cross-cutting behavior.

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

```csharp
app.MapGroup("/api/orders")
    .AddEndpointFilter<ClientVersionFilter>()
    .MapGet("/{id:int}", async (int id, IOrderService orders, CancellationToken ct) =>
    {
        var order = await orders.GetByIdAsync(id, ct);
        return order is null ? Results.NotFound() : Results.Ok(order);
    });
```

This is one of the places where Minimal APIs develop their own local structure rather than simply imitating controllers. Middleware remains the right choice for broad HTTP concerns. Endpoint filters are useful when the concern is specific to a particular Minimal API surface.

### Built-in Validation For Minimal APIs (.NET 10)

Starting in .NET 10, Minimal APIs include built-in validation support via `AddValidation()`. Rather than relying on `[ApiController]`'s automatic model-state validation (which is controller-only) or writing manual validation in every handler, this registers validation services and lets ASP.NET Core add endpoint validation filters for supported Minimal API parameters:

```csharp
// In .NET 10, the unified validation APIs live in Microsoft.Extensions.Validation.
builder.Services.AddValidation();

var app = builder.Build();

app.MapPost("/orders", (CreateOrderRequest request) =>
{
    // If request fails validation, the filter short-circuits
    // with a 400 + ValidationProblemDetails before this handler runs.
    return Results.Created($"/orders/{Guid.NewGuid()}", request);
});

app.Run();
```

The built-in Minimal API validation path is based on `System.ComponentModel.DataAnnotations` attributes and `IValidatableObject`. ASP.NET Core discovers types used by Minimal API handlers and adds endpoint filters that validate query, header, and request-body data before the handler runs. Handlers receive only pre-validated input when validation succeeds. Validation can be disabled for specific endpoints with `DisableValidation()`. Third-party validators such as FluentValidation can still be integrated, but they are not what `AddValidation()` automatically discovers by default.

## Returning DTOs Instead Of Persistence Models

Endpoints should usually return DTOs or explicitly shaped response models rather than persistence entities.

```csharp
return Ok(orderEntity);
```

That kind of direct entity return is risky because persistence models are often not stable API contracts. They may expose internal fields, navigation properties, serialization loops, or versioning liabilities that the public API should not inherit automatically.

```csharp
return Ok(new OrderDto(
    order.Id,
    order.Status.ToString(),
    order.Total));
```

Using DTOs keeps the API contract intentional. It also gives the application freedom to evolve internal persistence design without accidentally changing the public HTTP surface.
