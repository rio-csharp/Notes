# HTTP APIs, Resources, And Semantics

## Core Idea

A well-designed web API is not merely a set of endpoints that happen to return JSON. It is a contract built on HTTP semantics, resource boundaries, status codes, and predictable representations. Good API design reduces accidental ambiguity for clients and makes system behavior easier to evolve, observe, and secure.

## Resource-Oriented Thinking

An API becomes easier to understand when it models resources and their relationships clearly.

Good:

```http
GET /api/orders
GET /api/orders/123
POST /api/orders
DELETE /api/orders/123
```

Less clear:

```http
GET /api/getOrders
POST /api/createOrder
```

Resource-oriented naming gives the client a more stable mental model. The URI identifies the resource or collection, while the HTTP method expresses the action being attempted.

## HTTP Methods And Meaning

HTTP methods carry semantics that clients, intermediaries, and engineers rely on.

- `GET` reads a representation and should be safe.
- `POST` usually creates a resource or triggers a non-idempotent operation.
- `PUT` typically replaces a resource representation and is normally designed to be idempotent.
- `PATCH` applies a partial modification.
- `DELETE` removes a resource or marks it removed according to the system's deletion model.

Using these methods consistently matters because it affects retries, caching, debugging, and client expectations. An API that uses `POST` for every action may still function, but it loses much of the semantic structure HTTP already provides.

## Safe, Unsafe, And Idempotent Operations

Two distinctions matter early.

A safe operation does not change server state in the normal course of use. `GET` is the classic example.

An idempotent operation is one whose repeated application produces the same final effect as a single application. `PUT` and `DELETE` are often designed this way even though they are not safe.

These properties are not academic. They influence how clients retry requests, how intermediaries behave, and how infrastructure treats failures. Idempotency becomes especially important for non-idempotent workflows such as payments and order submission.

## Status Codes As Behavior Signals

Status codes are part of the contract, not decoration.

Some of the most important ones are:

- `200 OK` for successful reads or updates with a response body;
- `201 Created` when a new resource has been created;
- `202 Accepted` when processing is asynchronous and not yet complete;
- `204 No Content` when the operation succeeded and no response body is needed;
- `400 Bad Request` for malformed or structurally invalid input;
- `401 Unauthorized` when authentication is missing or invalid;
- `403 Forbidden` when the caller is authenticated but not allowed;
- `404 Not Found` when the addressed resource does not exist or is not visible;
- `409 Conflict` when the request conflicts with current resource state;
- `422 Unprocessable Entity` when the syntax is valid but the requested state change is semantically unacceptable;
- `429 Too Many Requests` for rate limiting;
- `500 Internal Server Error` for unexpected server-side failure.

A client should be able to learn what the API means from the status code without reverse-engineering endpoint-specific exception behavior.

## `201 Created`, `202 Accepted`, And Asynchronous Work

APIs often blur together "the request was accepted" and "the work is complete." Those are different states.

`201 Created` is appropriate when the resource has actually been created and can be referenced immediately.

`202 Accepted` is appropriate when the server has accepted the command but the real work will complete asynchronously. In those cases, the API should usually expose a resource or operation identifier the client can use to check progress later.

This distinction becomes important in workflows such as report generation, payment processing, or large file ingestion, where synchronous completion may be either too slow or operationally unsafe.

## Error Contracts

Error handling is one of the most neglected parts of many APIs. Random exception text is not a contract.

### Problem Details Standard

The `ProblemDetails` type implements RFC 9457 (formerly RFC 7807), the standard format for HTTP API error responses. ASP.NET Core supports this through the `IProblemDetailsService` interface, which can be registered globally:

```csharp
builder.Services.AddProblemDetails();
```

When registered, this service enables middleware components such as the Exception Handler Middleware and Status Code Pages Middleware to produce structured `ProblemDetails` responses automatically. The `[ApiController]` attribute also uses it to produce consistent error payloads for validation failures and other client errors.

A typical `ProblemDetails` response looks like this:

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

Customization is available through `ProblemDetailsOptions`:

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["instance"] = 
            $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}";
    };
});
```

This helps clients distinguish validation failures, authorization problems, state conflicts, and server errors without parsing arbitrary strings. It also gives operators better correlation between client-visible failures and server-side traces.

### Centralized Exception Handling

For unhandled exceptions, the Exception Handler Middleware provides a centralized error path that avoids scattering try-catch blocks across actions:

```csharp
var app = builder.Build();

app.UseExceptionHandler("/error");

// ...

app.MapControllers();
app.Run();
```

The error handler action should not use HTTP method attributes and should be excluded from OpenAPI documentation:

```csharp
[ApiExplorerSettings(IgnoreApi = true)]
[Route("/error")]
public IActionResult HandleError() =>
    Problem();
```

Since .NET 8, custom `IExceptionHandler` implementations offer an alternative that keeps the error handling logic self-contained:

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken ct)
    {
        _logger.LogError(exception, "Unhandled exception occurred.");

        var problemDetails = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Type = "https://httpstatuses.com/500"
        };

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, ct);
        return true;
    }
}
```

Registration:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
```

The `TryHandleAsync` method returns `true` to signal that the exception was handled and the response is complete. Multiple handlers can be registered, and they are tried in order until one returns `true`.

### Content Negotiation

ASP.NET Core uses content negotiation to select the response format based on the client's `Accept` header. The built-in formatters support JSON (default) and optionally XML. Custom formatters can be added for media types such as Protocol Buffers or vCard. The `[Produces]` attribute on an action constrains the response formats it supports:

```csharp
[HttpGet]
[Produces("application/json")]
public IActionResult Get() { /* ... */ }
```

Format negotiation matters because clients may request different representations of the same resource.

## URI Stability And Resource Identity

Good API design benefits from stable URIs. If clients must constantly reinterpret endpoint structure, the API contract is weak even if the payloads are correct.

Resource identity should therefore be explicit and durable enough that clients can safely reference:

- one specific resource;
- one collection;
- one subresource;
- one operation outcome.

This is also why API design overlaps with domain design. A weak domain boundary often produces weak URI structure because the system is unsure what the client is really addressing.

## The `[ApiController]` Attribute

The `[ApiController]` attribute enables several automatic behaviors that reduce boilerplate and enforce consistent contract structure.

First, it requires attribute routing. A controller without `[ApiController]` can still use conventional routing, but once the attribute is applied, every action must have a `[Route]`, `[HttpGet]`, or similar attribute. This prevents accidental exposure of methods through convention-based matching.

Second, it enables automatic model validation. When model binding fails, the framework returns a `400 Bad Request` with a `ValidationProblemDetails` response without any explicit check in the action body. This behavior can be suppressed through `SuppressModelStateInvalidFilter` if needed, but it provides a consistent validation surface by default.

Third, it infers the source of action parameters. Complex types are automatically bound from the request body, while simple types are bound from the query string. This reduces the need for explicit `[FromBody]` and `[FromQuery]` attributes in most cases, though explicit annotations remain valuable for clarity and for edge cases where the inference is ambiguous.

Fourth, it adds automatic `ProblemDetails` responses for error status codes returned by controller actions. Any result with a status code of 400 or higher is transformed into a `ProblemDetails` payload, making error responses consistent without per-endpoint configuration.

### Configuring `ApiBehaviorOptions`

The `[ApiController]` behaviors can be customized through `ApiBehaviorOptions`:

```csharp
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.SuppressModelStateInvalidFilter = false;
        options.ClientErrorMapping[StatusCodes.Status404NotFound].Link =
            "https://httpstatuses.com/404";
    });
```

`ClientErrorMapping` controls the `type` and `title` fields in the `ProblemDetails` response for standard client error status codes.

## Controllers As Contract Boundaries

A controller action illustrates the relationship among resource addressing, status code semantics, and DTOs:

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
    [ProducesResponseType<PagedResult<OrderResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<OrderResponse>>> Search(
        [FromQuery] OrderSearchRequest request,
        CancellationToken ct)
    {
        var result = await _orders.SearchAsync(request, ct);
        return Ok(result);
    }

    [HttpPost]
    [ProducesResponseType<OrderResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<OrderResponse>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var order = await _orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<OrderResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderResponse>> GetById(int id, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }
}
```

The value of code like this is not only that it compiles. It makes the API contract legible: the collection is searchable, creation returns a location for the new resource, missing resources become `404`, and the `ProducesResponseType` attributes ensure the OpenAPI document reflects the full range of possible responses rather than only the success path.

## Design Consequences

Good HTTP API design starts with stable resources, meaningful methods, explicit status codes, and structured errors. Once those foundations are solid, later concerns such as DTO shape, pagination, versioning, retries, and documentation have a place to attach.

Without that foundation, the later topics become patchwork. With it, the API begins to behave like a durable contract instead of a controller-shaped transport layer.
