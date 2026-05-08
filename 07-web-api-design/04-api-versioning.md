# Versioning And Contract Evolution

## Core Idea

API versioning exists because contracts outlive server deployments. Some clients cannot upgrade immediately, some are outside the team's operational control, and some depend on response shapes or behavior that would break if changed casually. Versioning is therefore not a badge of maturity by itself. It is a response to real contract longevity.

The contract should be evolved carefully enough that new versions are introduced only when compatibility can no longer be preserved.

## Conditions That Create Versioning Pressure

Versioning pressure usually rises when:

- the API is public or externally consumed;
- mobile or installed clients update slowly;
- multiple client versions coexist for long periods;
- independent deployment schedules prevent coordinated upgrades;
- breaking changes are unavoidable.

Internal APIs may also need versioning if teams deploy independently and consumer coordination is weak.

## Backward Compatibility First

The best versioning strategy is often to avoid versioning pressure through careful backward-compatible change.

Usually safe:

- add an optional response field;
- add an optional request field;
- add a new endpoint;
- expand behavior in a way old clients can ignore.

Usually breaking:

- remove or rename a field;
- change a field type;
- change semantic meaning;
- change requiredness;
- remove an endpoint;
- change status-code behavior in a way clients depend on.

This distinction matters because versioning should not become an excuse for careless contract change. It should be reserved for cases where compatibility has truly run out.

## Common Versioning Strategies

Several strategies are common:

URL versioning:

```http
GET /api/v1/orders
GET /api/v2/orders
```

Query-string versioning:

```http
GET /api/orders?api-version=1.0
```

Header versioning:

```http
GET /api/orders
X-API-Version: 1.0
```

Media-type versioning:

```http
Accept: application/vnd.company.orders.v1+json
```

Each is valid in the right environment. The choice depends less on ideology than on visibility, tooling support, caching implications, and how explicit the team wants version selection to be for clients.

## Versioning As Contract Narrative

A version is not just a routing token. It is a statement that the contract has diverged meaningfully.

For example, changing:

- `status` to `state`;
- `total` from a number to an object containing amount and currency;
- validation or state-transition behavior in incompatible ways

may justify a new version because the client must now reason about a materially different representation.

Version boundaries should correspond to real contract differences, not to arbitrary release numbers.

## Deprecation And Sunset

Versioning without deprecation discipline produces API sprawl. Once a new version exists, the old one needs a managed retirement path:

1. announce deprecation;
2. publish a migration guide;
3. measure client usage;
4. support both versions for a defined period;
5. retire the old version on a communicated sunset date.

The `Deprecation` and `Sunset` HTTP headers (RFC 8594) make the version lifecycle visible to clients programmatically:

```http
GET /api/v1/orders HTTP/1.1
---
Deprecation: true
Sunset: Sat, 01 Nov 2026 23:59:59 GMT
Link: </api/v2/orders>; rel="successor-version"
```

The `Deprecation` header signals that the version is deprecated. The `Sunset` header communicates when support ends. The `Link` header with `rel="successor-version"` directs clients to the replacement. Middleware or action filters can add these headers automatically for deprecated versions.

The `Asp.Versioning.Mvc` package can also report the current version through the `ReportApiVersions` option, which adds an `api-supported-versions` response header:

```csharp
options.ReportApiVersions = true;
```

This lets clients discover available versions through regular responses rather than through external documentation.

## Migration Guidance As Part Of The Contract

When an API changes meaningfully, clients need more than a version number. They need a narrative:

- what changed;
- what remains compatible;
- what client code must do differently;
- what the sunset date is;
- whether old and new versions can coexist temporarily.

This is one reason versioning is partly a documentation problem and not only a routing problem. A technically correct multi-version API can still fail in practice if clients cannot understand how to migrate safely.

## Tooling In ASP.NET Core

ASP.NET Core supports structured versioning approaches through packages such as `Asp.Versioning.Mvc` and `Asp.Versioning.Mvc.ApiExplorer`. These are community-maintained packages that replaced the earlier Microsoft-published versioning libraries and remain the recommended approach for controller-based APIs.

A typical configuration registers versioning with a reader strategy, default version, and API explorer integration:

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
}).AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

Controllers then declare which versions they support, and individual actions can specify their mapping:

```csharp
[ApiController]
[Route("api/v{version:apiVersion}/orders")]
[ApiVersion("1.0")]
[ApiVersion("2.0")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult GetV1(int id)
    {
        // Returns the v1 representation
        return Ok(new OrderResponseV1(/* ... */));
    }

    [HttpGet("{id:int}")]
    [MapToApiVersion("2.0")]
    public IActionResult GetV2(int id)
    {
        // Returns the v2 representation with additional fields
        return Ok(new OrderResponseV2(/* ... */));
    }
}
```

### Version-Neutral Controllers

Some controllers serve resources that are not expected to change across versions, such as health checks or reference data. These can be marked as version-neutral:

```csharp
[ApiController]
[Route("api/health")]
[ApiVersionNeutral]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "healthy" });
}
```

Version-neutral controllers are accessible regardless of the requested API version. This avoids forcing clients to specify a version for endpoints that have no meaningful version distinction.

### Minimal API Versioning

Minimal APIs can use the versioning package through `HasApiVersion` on route groups:

```csharp
var v1 = app.MapGroup("/api/orders")
    .HasApiVersion(1.0);

v1.MapGet("/", async (IOrderService service, CancellationToken ct) =>
{
    var orders = await service.GetAllAsync(ct);
    return Results.Ok(orders);
});

var v2 = app.MapGroup("/api/orders")
    .HasApiVersion(2.0);

v2.MapGet("/", async (IOrderService service, CancellationToken ct) =>
{
    var orders = await service.GetAllAsync(ct);
    return Results.Ok(orders.Select(o => new OrderResponseV2(o)));
});
```

This approach keeps versioning visible at the route registration level rather than buried in controller attributes, and it supports the same reader strategies and API explorer integration as controller-based versioning.

The result is a versioning surface that stays explicit in routing, discoverable through generated OpenAPI documentation, and separable per-endpoint or per-group. The tooling matters, but the architectural lesson matters more: versioning should be observable and tied to documentation generation so that each supported contract surface remains understandable.

## Design Consequences

Versioning is a consequence of contract longevity. The healthier the API is at backward-compatible evolution, the less often a new version is needed. When a new version is necessary, it should represent a clear contract divergence, come with a migration path, and fit into a managed deprecation lifecycle rather than becoming a permanent parallel universe.
