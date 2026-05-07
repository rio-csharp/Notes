# ASP.NET Core Authentication And Authorization

## Core Idea

Authentication establishes who the caller is. Authorization decides what that authenticated caller is allowed to do. In ASP.NET Core, these are distinct but closely connected parts of the request pipeline, and many security bugs come from confusing one for the other or from oversimplifying where each decision should happen.

Security is an application boundary concern. Understanding how identity enters the system, how access decisions are evaluated, and where static policy checks stop being enough is essential.

## Identity In The Request Pipeline

In a typical API pipeline, routing selects an endpoint, authentication attempts to establish the caller's identity, and authorization evaluates whether that caller may access the selected endpoint.

```text
HTTP request
  -> routing
  -> authentication middleware
  -> authorization middleware
  -> endpoint execution
```

```csharp
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
```

That order matters because authorization depends on two things that must already exist:

- an authenticated or anonymous `HttpContext.User`;
- endpoint metadata such as `[Authorize]`, policies, or scheme requirements.

If authorization runs before authentication, the system often evaluates the request as anonymous. If routing has not yet selected an endpoint, endpoint-specific authorization metadata is unavailable.

## Authentication Schemes

An authentication scheme tells ASP.NET Core how to interpret and validate credentials for a request.

Common schemes include:

- JWT bearer tokens for APIs;
- cookies for browser-oriented server-side applications;
- OpenID Connect for interactive external sign-in flows;
- API keys for certain internal integrations;
- multiple schemes within the same application.

JWT bearer authentication is common in APIs:

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://identity.example.com";
        options.Audience = "orders-api";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();
```

What matters here is not the registration syntax alone, but the trust model. The token is not accepted because it looks like JSON or contains plausible claims. It is accepted only if the configured authentication handler can validate it according to the expected issuer, audience, signature, and lifetime rules.

## `ClaimsPrincipal` And Identity Data

Once authentication succeeds, ASP.NET Core assigns a `ClaimsPrincipal` to `HttpContext.User`.

That principal may contain claims such as:

```text
sub: 9f31b2
email: alice@example.com
role: Admin
permission: orders.manage
tenant_id: tenant-123
```

Code can then read those claims:

```csharp
using System.Security.Claims;

var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
    ?? User.FindFirstValue("sub");

var email = User.FindFirstValue(ClaimTypes.Email);
var tenantId = User.FindFirstValue("tenant_id");
var permissions = User.FindAll("permission").Select(c => c.Value).ToHashSet();
```

Claims are useful because they allow access decisions to be expressed without querying storage on every request. They are not, however, a perfect substitute for live authorization data. Claims can become stale, token size can grow, and some decisions depend on current server-side state rather than on static token content.

## Roles And Their Limits

Role-based authorization is simple and often useful for coarse-grained access control.

```csharp
[Authorize(Roles = "Admin")]
[HttpDelete("{id:int}")]
public async Task<IActionResult> DeleteUser(int id)
{
    return NoContent();
}
```

Roles work well for broad groupings such as:

- `Admin`
- `Manager`
- `Support`
- `ReadOnly`

They become less effective when a system tries to encode every fine-grained business rule as another role. Role explosion is a common result:

```text
OrderAdmin
OrderApprover
OrderRefundApprover
OrderEURefundApprover
OrderUSRefundApprover
```

At that point, roles stop being broad identity groupings and start becoming a brittle permission system disguised as one. ASP.NET Core's policy system exists partly to avoid that collapse.

## Policy-Based Authorization

Policy-based authorization lets the application define named access rules in a more expressive and centralized way.

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanManageOrders", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("permission", "orders.manage");
    });
});
```

```csharp
[Authorize(Policy = "CanManageOrders")]
[HttpPut("{id:int}")]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

Policies improve maintainability because they separate endpoint declarations from the details of the rule being enforced. They also scale more naturally when several endpoints depend on the same access model.

## Custom Requirements And Handlers

When authorization logic goes beyond simple claim checks, ASP.NET Core supports custom requirements and handlers.

```csharp
public sealed class MinimumAgeRequirement : IAuthorizationRequirement
{
    public int MinimumAge { get; }

    public MinimumAgeRequirement(int minimumAge)
    {
        MinimumAge = minimumAge;
    }
}
```

```csharp
public sealed class MinimumAgeHandler
    : AuthorizationHandler<MinimumAgeRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MinimumAgeRequirement requirement)
    {
        var value = context.User.FindFirst("birthdate")?.Value;

        if (!DateOnly.TryParse(value, out var birthDate))
        {
            return Task.CompletedTask;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - birthDate.Year;

        if (birthDate > today.AddYears(-age))
        {
            age--;
        }

        if (age >= requirement.MinimumAge)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

```csharp
builder.Services.AddSingleton<IAuthorizationHandler, MinimumAgeHandler>();

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AtLeast18", policy =>
    {
        policy.Requirements.Add(new MinimumAgeRequirement(18));
    });
});
```

This model is valuable because it keeps authorization logic as first-class policy logic rather than scattering complex access decisions across controller methods.

## Resource-Based Authorization

Static endpoint metadata is not always enough. Many real access decisions depend on the specific resource being requested.

Examples include:

- a user may view only their own order;
- a tenant administrator may manage users only in their tenant;
- a manager may approve only orders in their region;
- a document may be editable only if the caller owns it and it is not locked.

```csharp
public sealed class Order
{
    public int Id { get; init; }
    public string OwnerUserId { get; init; } = "";
    public string TenantId { get; init; } = "";
    public OrderStatus Status { get; init; }
}
```

```csharp
public sealed class SameTenantOrderRequirement : IAuthorizationRequirement
{
}
```

```csharp
public sealed class SameTenantOrderHandler
    : AuthorizationHandler<SameTenantOrderRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        SameTenantOrderRequirement requirement,
        Order resource)
    {
        var tenantId = context.User.FindFirstValue("tenant_id");

        if (tenantId is not null && tenantId == resource.TenantId)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

```csharp
[Authorize]
[HttpGet("{id:int}")]
public async Task<IActionResult> GetOrder(int id)
{
    var order = await _orderRepository.GetByIdAsync(id);

    if (order is null)
    {
        return NotFound();
    }

    var result = await _authorizationService.AuthorizeAsync(
        User,
        order,
        "SameTenantOrder");

    if (!result.Succeeded)
    {
        return Forbid();
    }

    return Ok(order);
}
```

This pattern is essential because a role or claim may show that the caller belongs to a broad category, while resource-based authorization determines whether the caller may access this particular resource.

## `401` Versus `403`

One of the most important HTTP distinctions in security handling is the difference between `401 Unauthorized` and `403 Forbidden`.

`401` means the request is not authenticated successfully. Typical causes include missing credentials, invalid signatures, expired tokens, or wrong issuer or audience.

`403` means the caller is authenticated but still not permitted to perform the action.

This distinction matters because it communicates a different remediation path to the client. A `401` response asks the client to authenticate. A `403` response says that authentication succeeded but access is still denied.

## Multiple Schemes And Mixed Surfaces

Real applications sometimes expose more than one kind of surface. A system may serve JWT-protected APIs, cookie-protected admin pages, and internal API-key-protected integrations all at once.

```csharp
builder.Services
    .AddAuthentication()
    .AddJwtBearer("Bearer", options =>
    {
        options.Authority = "https://identity.example.com";
        options.Audience = "orders-api";
    })
    .AddCookie("AdminCookie");
```

Endpoints can then require particular schemes explicitly:

```csharp
[Authorize(AuthenticationSchemes = "Bearer")]
public IActionResult ApiOnly()
{
    return Ok();
}
```

The presence of multiple schemes is another reason to treat authentication and authorization as explicit architectural concerns rather than as invisible defaults.

## JWT Trust, Claim Mapping, And Staleness

JWT-based systems deserve a few specific cautions.

Validation should include signature checking, issuer validation, audience validation, lifetime validation, and appropriate signing-key expectations. Without those checks, a token is merely untrusted client input.

Claim mapping also matters because identity providers do not all name claims the same way. If the provider emits `role`, `roles`, `sub`, or custom permission claims under different names, ASP.NET Core may need explicit configuration to interpret them correctly.

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    NameClaimType = "sub",
    RoleClaimType = "role"
};
```

Finally, claims in tokens are only as fresh as the token itself. Stable identity and coarse authorization data often fit tokens well. Highly sensitive or frequently changing authorization decisions often still require server-side state, shorter token lifetimes, or refresh mechanisms.

## API Keys And Internal Integrations

API keys can still be appropriate for some internal or machine-oriented integrations, but they should be treated as credentials, not as a lightweight shortcut that avoids security design.

A production-ready API-key system usually requires:

- HTTPS-only transport;
- hashed storage of keys rather than plaintext persistence;
- rotation capability;
- scoped permissions;
- auditability and usage logging.

```csharp
public sealed class ApiKeyMiddleware
{
    private const string HeaderName = "X-API-Key";
    private readonly RequestDelegate _next;

    public ApiKeyMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IApiKeyValidator validator)
    {
        if (!context.Request.Headers.TryGetValue(HeaderName, out var apiKey) ||
            !await validator.IsValidAsync(apiKey.ToString()))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        await _next(context);
    }
}
```

Even this simple example illustrates the broader principle that API keys belong inside the same explicit authentication and authorization boundary as any other credential type.

## Security Boundary Discipline

Frontend checks are not the security boundary. They may improve user experience, but they do not enforce anything once a client can call the API directly.

The real boundary is always the server-side pipeline that validates credentials, constructs identity, evaluates policy, and verifies access against both endpoint rules and resource state. Multi-tenant systems especially must keep tenant scope, ownership checks, and resource authorization on the server, regardless of what the frontend UI suggests the user should or should not be able to do.
