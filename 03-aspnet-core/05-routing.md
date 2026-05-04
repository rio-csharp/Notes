# Routing In ASP.NET Core

## Core Idea

Routing maps incoming HTTP requests to endpoints.

Chinese notes:

- `routing`: 路由.
- `route parameter`: 路由参数.
- `endpoint routing`: 端点路由.

## Attribute Routing

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

Route:

```http
GET /api/orders/123
```

How matching works:

```text
Request method: GET
Request path:   /api/orders/123

Controller route: api/orders
Action route:     {id:int}

Matched endpoint:
  OrdersController.GetById(int id)
```

The route parameter `id` is bound to the action parameter.

```csharp
[HttpGet("{id:int}")]
public IActionResult GetById([FromRoute] int id)
{
    return Ok(id);
}
```

`[FromRoute]` is often inferred, but writing it can make teaching examples clearer.

## Route Constraints

```csharp
[HttpGet("{id:int}")]
```

Other examples:

- `{id:guid}`
- `{slug:alpha}`
- `{date:datetime}`

Examples:

```csharp
[HttpGet("{id:guid}")]
public IActionResult GetByGuid(Guid id)
{
    return Ok();
}

[HttpGet("by-slug/{slug:alpha}")]
public IActionResult GetBySlug(string slug)
{
    return Ok();
}
```

Why constraints matter:

> They reduce ambiguous matches and reject invalid route shapes before action logic runs.

Important:

> Route constraints are not business validation. `{id:int}` proves the route segment is an integer, not that the order exists or belongs to the user.

## Optional Parameters

```csharp
[HttpGet("{category?}")]
```

Use carefully. Query string is often clearer for optional filters.

Less clear:

```http
GET /api/products/electronics
GET /api/products
```

Often clearer:

```http
GET /api/products?category=electronics
GET /api/products
```

Rule:

> Use route parameters for resource identity. Use query parameters for optional filters.

## Query String For Filtering

```http
GET /api/orders?status=Paid&page=1&pageSize=20
```

Good for:

- filters;
- search;
- pagination;
- sorting.

Action example:

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

Benefits:

- clean endpoint;
- typed query parameters;
- easy to add filters without changing route structure.

## Route Design

Good:

```http
GET /api/orders/123/items
POST /api/orders/123/approve
```

Avoid:

```http
GET /api/getOrderItems?id=123
POST /api/doApproveOrder
```

Resource-oriented examples:

```http
GET    /api/orders
GET    /api/orders/123
GET    /api/orders/123/items
POST   /api/orders
POST   /api/orders/123/approve
DELETE /api/orders/123
```

Avoid putting verbs everywhere:

```http
GET /api/orders/getAll
POST /api/orders/create
POST /api/orders/delete
```

Exception:

> Business actions such as `approve`, `cancel`, `submit`, or `refund` can be modeled as subresource/action endpoints with `POST`.

## Complete Route Layout Example

For a small order API, a consistent route layout might look like this:

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

Controller example:

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

Request models:

```csharp
public sealed record OrderSearchRequest(
    OrderStatus? Status,
    int Page = 1,
    int PageSize = 20,
    string? Sort = null);

public sealed record CancelOrderRequest(string Reason);
```

Why this design is readable:

- `/api/orders/{id}` identifies one order;
- query string handles optional search and pagination;
- business transitions use `POST` sub-actions;
- route constraints prevent invalid `id` shapes;
- request bodies carry command-specific data such as cancellation reason.

## Route Conflicts

Ambiguous routes are easy to create.

Problem:

```csharp
[HttpGet("{id}")]
public IActionResult GetById(string id) => Ok();

[HttpGet("{slug}")]
public IActionResult GetBySlug(string slug) => Ok();
```

Both match the same shape.

Better:

```csharp
[HttpGet("{id:int}")]
public IActionResult GetById(int id) => Ok();

[HttpGet("by-slug/{slug}")]
public IActionResult GetBySlug(string slug) => Ok();
```

## Review Questions

### What is endpoint routing?

> Endpoint routing is ASP.NET Core's routing system that matches requests to endpoints such as controllers, Razor Pages, SignalR hubs, and Minimal APIs.

### Route parameter vs query parameter?

> Route parameters identify resources. Query parameters usually represent filtering, sorting, pagination, or optional modifiers.

### How do you version routes?

> Common options include URL versioning like `/api/v1/orders`, query string versioning, or header/media type versioning. Public APIs need stronger versioning discipline.

### Why use route constraints?

> They help routing choose the right endpoint and reject invalid route shapes early. They do not replace business validation.

### Should filters go in route or query string?

> Usually query string. Routes identify resources; query strings express optional filtering, sorting, pagination, and search.

## Common Mistakes

### Mistake: Putting filters into route path awkwardly.

Why it is wrong:

> Optional filters create many route shapes and make APIs harder to evolve.

Better answer:

> Use query parameters for filters and search.

### Mistake: No route constraints.

Why it is wrong:

> Routes become ambiguous and invalid values reach action logic.

Better answer:

> Use constraints such as `{id:int}` or `{id:guid}` for resource identifiers.

### Mistake: Inconsistent pluralization.

Why it is wrong:

> APIs feel unpredictable and are harder for clients to use.

Better answer:

> Pick a convention, usually plural nouns like `/api/orders`, and apply it consistently.

### Mistake: Action names in every URL.

Why it is wrong:

> It makes the API RPC-style even when resources would be clearer.

Better answer:

> Use resource-oriented URLs and reserve action names for real business actions.

### Mistake: Breaking clients without versioning.

Why it is wrong:

> Public clients may depend on old contracts.

Better answer:

> Use a versioning strategy and maintain backward compatibility where possible.
