# Routing In ASP.NET Core

## Core Idea

Routing is the mechanism that matches an incoming HTTP request to an executable endpoint. In ASP.NET Core, that match is not only about choosing a method or delegate. Routing also attaches metadata that later pipeline stages use for authorization, filters, and endpoint-specific behavior.

For that reason, routing should be understood as a core part of application design rather than a mere URL convenience feature. Clear routing makes APIs predictable for clients, reduces ambiguity in the framework, and creates a stable public surface for the system.

## Endpoint Matching And Route Shape

At a basic level, routing considers request path, HTTP method, and route template shape.

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        return Ok();
    }
}
```

This endpoint matches requests such as:

```http
GET /api/orders/123
```

The route parameter becomes part of endpoint selection and is then bound into the action parameter:

```csharp
[HttpGet("{id:int}")]
public IActionResult GetById([FromRoute] int id)
{
    return Ok(id);
}
```

The important point is that route design shapes both the external API and the framework's ability to choose the correct endpoint unambiguously.

## Route Parameters Versus Query Parameters

One of the most useful design distinctions is between resource identity and query modifiers.

Route parameters usually identify resources or nested resources:

```http
GET /api/orders/123
GET /api/orders/123/items
```

Query parameters usually express filtering, search, pagination, or sorting:

```http
GET /api/orders?status=Paid&page=1&pageSize=20
```

That distinction is not absolute, but it is one of the clearest habits for readable API design. When optional filters are forced into the route structure, endpoints often become harder to extend and less obvious to clients.

```csharp
public sealed record OrderSearchRequest(
    OrderStatus? Status,
    int Page = 1,
    int PageSize = 20,
    string? Sort = null);

[HttpGet]
public async Task<ActionResult<PagedResult<OrderDto>>> Search(
    [FromQuery] OrderSearchRequest request,
    CancellationToken ct)
{
    var result = await _orders.SearchAsync(request, ct);
    return Ok(result);
}
```

## Route Constraints And Early Shape Validation

Route constraints help the routing system reject invalid shapes and choose the correct endpoint.

```csharp
[HttpGet("{id:int}")]
```

Other common constraints include:

- `{id:guid}`
- `{slug:alpha}`
- `{date:datetime}`

```csharp
[HttpGet("{id:guid}")]
public IActionResult GetByGuid(Guid id)
{
    return Ok();
}
```

Constraints improve routing precision, but they are not business validation. `{id:int}` proves that the segment is an integer, not that the referenced order exists or that the caller may access it. This distinction helps avoid confusing transport-level shape checks with application-level correctness.

Constraints also influence endpoint selection priority. When multiple routes match a request, the routing system prefers the route with more specific constraints. A route with `{id:int}` is ranked higher than one with `{id}` because the constraint narrows the set of matching requests. This priority mechanism is one reason route design should use constraints deliberately rather than relying on parameter types alone for disambiguation.

## Resource-Oriented Route Design

A good route structure usually expresses resources and subresources rather than action names disguised as URLs.

Readable resource-oriented examples:

```http
GET    /api/orders
GET    /api/orders/123
GET    /api/orders/123/items
POST   /api/orders
DELETE /api/orders/123
```

Less expressive designs often rely on verb-heavy route names:

```http
GET /api/getOrderItems?id=123
POST /api/orders/create
POST /api/orders/delete
```

The resource-oriented style is usually easier to learn, document, and version because it aligns route shape with domain structure rather than with arbitrary method naming.

There is, however, a useful exception. Business actions that are not simple CRUD replacement are often modeled as sub-actions:

```http
POST /api/orders/123/approve
POST /api/orders/123/cancel
POST /api/orders/123/submit
```

These routes remain understandable because the resource is still explicit and the action reflects a domain transition rather than a transport verb.

## A Consistent Route Layout

A coherent route layout makes larger APIs easier to navigate and evolve.

```text
GET    /api/orders
GET    /api/orders/{id:int}
POST   /api/orders
PATCH  /api/orders/{id:int}/shipping-address
POST   /api/orders/{id:int}/submit
POST   /api/orders/{id:int}/cancel
GET    /api/orders/{id:int}/items
POST   /api/orders/{id:int}/items
DELETE /api/orders/{id:int}/items/{itemId:int}
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

    [HttpGet]
    public async Task<ActionResult<PagedResult<OrderDto>>> Search(
        [FromQuery] OrderSearchRequest request,
        CancellationToken ct)
    {
        var result = await _orders.SearchAsync(request, ct);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> GetById(
        [FromRoute] int id,
        CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpPost("{id:int}/submit")]
    public async Task<IActionResult> Submit(
        [FromRoute] int id,
        CancellationToken ct)
    {
        await _orders.SubmitAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(
        [FromRoute] int id,
        [FromBody] CancelOrderRequest request,
        CancellationToken ct)
    {
        await _orders.CancelAsync(id, request.Reason, ct);
        return NoContent();
    }
}
```

This kind of layout is valuable because the route hierarchy communicates the mental model of the API directly.

## Ambiguity And Route Conflicts

Routing becomes fragile when two endpoints describe the same effective shape.

```csharp
[HttpGet("{id}")]
public IActionResult GetById(string id) => Ok();

[HttpGet("{slug}")]
public IActionResult GetBySlug(string slug) => Ok();
```

These templates are indistinguishable to the routing system. A better design makes the distinction structural:

```csharp
[HttpGet("{id:int}")]
public IActionResult GetById(int id) => Ok();

[HttpGet("by-slug/{slug}")]
public IActionResult GetBySlug(string slug) => Ok();
```

This is one reason route constraints and explicit prefixes matter. They are not just implementation tricks. They protect the clarity and predictability of the endpoint surface.

## Routing As Metadata Attachment

In modern ASP.NET Core, routing does more than choose the endpoint delegate. It also attaches endpoint metadata that later pipeline stages consume.

That is why authorization attributes, filters, OpenAPI metadata, endpoint names, and similar behaviors are often described "on the endpoint" rather than in unrelated registration code. Once routing has selected an endpoint, later middleware and execution layers can inspect that endpoint's metadata to decide what should happen next.

This deeper role explains why routing appears so early in the request pipeline and why endpoint design affects more than URL matching alone.
