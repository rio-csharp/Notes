# REST API Design

## Core Idea

REST API design is about modeling resources and operations using HTTP correctly and consistently.

Chinese notes:

- `resource`: 资源.
- `idempotent`: 幂等.
- `contract`: 契约.

Good APIs are:

- predictable;
- consistent;
- secure;
- versionable;
- easy to debug;
- hard to misuse.

## Resource Naming

Use nouns, not verbs.

Good:

```http
GET /api/orders
GET /api/orders/123
POST /api/orders
PUT /api/orders/123
DELETE /api/orders/123
```

Avoid:

```http
GET /api/getOrders
POST /api/createOrder
```

## HTTP Methods

### GET

Read resource.

Safe and idempotent.

```http
GET /api/orders/123
```

### POST

Create resource or perform non-idempotent action.

```http
POST /api/orders
```

### PUT

Replace full resource.

```http
PUT /api/orders/123
```

### PATCH

Partial update.

```http
PATCH /api/orders/123
```

### DELETE

Delete resource.

```http
DELETE /api/orders/123
```

## Status Codes

- `200 OK`: successful read/update with response body.
- `201 Created`: resource created.
- `202 Accepted`: accepted for async processing.
- `204 No Content`: successful with no body.
- `400 Bad Request`: invalid input.
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: authenticated but not allowed.
- `404 Not Found`: resource not found.
- `409 Conflict`: conflict with current state.
- `422 Unprocessable Entity`: semantic validation error.
- `429 Too Many Requests`: rate limited.
- `500 Internal Server Error`: unexpected server error.

## DTOs

Do not expose EF entities directly.

Request:

```csharp
public sealed record CreateOrderRequest(
    int CustomerId,
    IReadOnlyList<CreateOrderItemRequest> Items);
```

Response:

```csharp
public sealed record OrderResponse(
    int Id,
    int CustomerId,
    decimal Total,
    string Status,
    DateTimeOffset CreatedAt);
```

Why:

- prevents over-posting;
- protects internal schema;
- supports API versioning;
- allows frontend-friendly shape.

## Pagination

Request:

```http
GET /api/orders?page=1&pageSize=20&status=Paid&sort=-createdAt
```

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 1250
}
```

For large datasets, consider cursor pagination:

```http
GET /api/orders?cursor=eyJjcmVhdGVkQXQiOiIyMDI2...&limit=50
```

## Validation Error Format

Use `ProblemDetails`.

```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Validation failed",
  "status": 400,
  "errors": {
    "email": ["Email is required."]
  },
  "traceId": "00-abcd..."
}
```

## Idempotency

For payment or order creation, client retries can create duplicates.

Use an idempotency key:

```http
POST /api/payments
Idempotency-Key: payment-order-123
```

Server stores key and result.

If the same key is used again, return the original result.

## Versioning

Options:

```http
/api/v1/orders
/api/orders?api-version=1.0
Accept: application/vnd.company.orders.v1+json
```

Engineering perspective:

> I choose versioning strategy based on client control and compatibility needs. Public APIs need stricter versioning. Internal APIs may evolve with consumer coordination.

## Example Controller

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
    public async Task<ActionResult<PagedResult<OrderResponse>>> Search(
        [FromQuery] OrderSearchRequest request,
        CancellationToken ct)
    {
        var result = await _orders.SearchAsync(request, ct);
        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<OrderResponse>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var order = await _orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderResponse>> GetById(int id, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }
}
```

## Review Questions

### What makes an API RESTful?

> It models resources with stable URIs, uses HTTP methods according to their semantics, returns meaningful status codes, and uses representations like JSON to transfer resource state.

### PUT vs PATCH?

> PUT usually replaces the whole resource and is idempotent. PATCH partially updates a resource and may be idempotent depending on design.

### 401 vs 403?

> 401 means authentication is missing or invalid. 403 means the user is authenticated but does not have permission.

## Common Mistakes

- Returning `200 OK` for every result.
- Exposing database entities directly.
- No pagination on list APIs.
- No consistent error format.
- Ignoring idempotency for payment/order APIs.
- Breaking API contracts without versioning.

