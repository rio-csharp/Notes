# API Versioning

## Core Idea

API versioning helps evolve APIs without breaking existing clients.

Chinese notes:

- `versioning`: 版本管理.
- `breaking change`: 破坏性变更.
- `backward compatible`: 向后兼容.

## When Versioning Is Needed

Use versioning when:

- external clients depend on your API;
- mobile apps cannot update immediately;
- multiple frontend versions exist;
- breaking changes are unavoidable.

Internal APIs may still need versioning if consumers deploy independently.

## Versioning Strategies

### URL Versioning

```http
GET /api/v1/orders
GET /api/v2/orders
```

Pros:

- obvious;
- easy to route;
- easy to document.

Cons:

- version is in URL, not resource concept.

### Query String Versioning

```http
GET /api/orders?api-version=1.0
```

### Header Versioning

```http
GET /api/orders
X-API-Version: 1.0
```

### Media Type Versioning

```http
Accept: application/vnd.company.orders.v1+json
```

## ASP.NET Core URL Versioning Example

Package commonly used:

```powershell
dotnet add package Asp.Versioning.Mvc
dotnet add package Asp.Versioning.Mvc.ApiExplorer
```

Registration:

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
})
.AddMvc()
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

V1 controller:

```csharp
[ApiController]
[ApiVersion(1.0)]
[Route("api/v{version:apiVersion}/orders")]
public sealed class OrdersV1Controller : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<OrderV1Response> GetById(int id)
    {
        return Ok(new OrderV1Response(id, "Paid", 99.99m));
    }
}

public sealed record OrderV1Response(
    int Id,
    string Status,
    decimal Total);
```

V2 controller:

```csharp
[ApiController]
[ApiVersion(2.0)]
[Route("api/v{version:apiVersion}/orders")]
public sealed class OrdersV2Controller : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<OrderV2Response> GetById(int id)
    {
        return Ok(new OrderV2Response(
            id,
            new MoneyResponse(99.99m, "USD"),
            "paid"));
    }
}

public sealed record OrderV2Response(
    int Id,
    MoneyResponse Total,
    string State);

public sealed record MoneyResponse(decimal Amount, string Currency);
```

This is a breaking change because `Total` changed from a number to an object and `Status` changed to `State`.

## Backward-Compatible Evolution Example

V1 response:

```json
{
  "id": 1001,
  "status": "Paid",
  "total": 99.99
}
```

Usually safe addition:

```json
{
  "id": 1001,
  "status": "Paid",
  "total": 99.99,
  "createdAt": "2026-05-03T10:00:00Z"
}
```

Clients that ignore unknown fields keep working.

Risky change:

```json
{
  "id": 1001,
  "state": "paid",
  "total": {
    "amount": 99.99,
    "currency": "USD"
  }
}
```

That should usually be a new version.

## Breaking Changes

Breaking:

- remove field;
- rename field;
- change field type;
- change requiredness;
- change semantic meaning;
- remove endpoint;
- change status code contract;
- change enum values unexpectedly.

Usually non-breaking:

- add optional response field;
- add optional request field;
- add new endpoint.

## Deprecation

Good deprecation process:

1. announce version deprecation;
2. provide migration guide;
3. monitor usage;
4. support both versions temporarily;
5. remove old version after agreed date.

Deprecation headers:

```csharp
public sealed class DeprecationHeaderMiddleware
{
    private readonly RequestDelegate _next;

    public DeprecationHeaderMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/api/v1"))
        {
            context.Response.Headers["Deprecation"] = "true";
            context.Response.Headers["Sunset"] = "Wed, 31 Dec 2026 23:59:59 GMT";
            context.Response.Headers["Link"] =
                "<https://docs.example.com/api/v2-migration>; rel=\"deprecation\"";
        }

        await _next(context);
    }
}
```

Migration guide outline:

```text
V1 -> V2 migration

Changed:
- `status` renamed to `state`.
- `total` is now `{ amount, currency }`.

Required client changes:
- read `state` instead of `status`;
- read `total.amount` and `total.currency`;
- update tests for new response shape.

Timeline:
- V1 deprecated: 2026-06-01
- V1 sunset: 2026-12-31
```

## Review Questions

### How do you version APIs?

> It depends on clients. For public APIs, I often prefer explicit URL or header versioning with OpenAPI docs. I avoid breaking changes when possible and only create a new version when compatibility cannot be maintained.

### What is a breaking change?

> A breaking change is any change that can cause existing clients to fail or behave incorrectly without code changes.

### How do you avoid versioning too often?

> Design extensible contracts, add optional fields, avoid changing semantics, and use backward-compatible evolution where possible.

## Common Mistakes

- No versioning for public APIs.
- Breaking mobile clients.
- Versioning every tiny change.
- No deprecation policy.
- No usage monitoring.
- Inconsistent docs across versions.

## Practice Task

Design:

1. v1 order response;
2. backward-compatible v1 addition;
3. breaking v2 change;
4. migration guide;
5. deprecation header.
