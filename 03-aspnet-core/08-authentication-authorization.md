# ASP.NET Core Authentication And Authorization

## Core Idea

Authentication identifies who the caller is.

Authorization decides what the caller is allowed to do.

Chinese notes:

- `authentication`: 认证.
- `authorization`: 授权.
- `claims`: 声明.
- `policy`: 策略.
- `scheme`: 认证方案.
- `principal`: 用户主体.
- `tenant`: 租户.

A Key takeaway:

> Authentication builds `HttpContext.User`. Authorization uses `HttpContext.User` plus policies, roles, claims, or resource rules to decide whether access is allowed.

Frontend checks are not security. They only improve user experience. The backend is the real security boundary.

## Request Flow

Typical API request flow:

```text
HTTP request
  -> routing
  -> authentication middleware
       validates token/cookie/API key
       sets HttpContext.User
  -> authorization middleware
       checks endpoint metadata such as [Authorize]
       evaluates roles, claims, policies, requirements
  -> controller / Minimal API endpoint
```

Order matters:

```csharp
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
```

If `UseAuthorization` runs before `UseAuthentication`, authorization may see an anonymous user and reject requests incorrectly.

## Authentication Schemes

An authentication scheme tells ASP.NET Core how to authenticate a request.

Common schemes:

- JWT bearer tokens for APIs;
- cookies for browser-based server-rendered apps;
- OpenID Connect for interactive login;
- API keys for internal integrations;
- multiple schemes in the same application.

JWT example:

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

What JWT bearer authentication does:

1. Reads the `Authorization: Bearer <token>` header.
2. Validates the token format.
3. Validates the signature.
4. Validates issuer (`iss`).
5. Validates audience (`aud`).
6. Validates expiration (`exp`) and not-before (`nbf`).
7. Creates a `ClaimsPrincipal`.
8. Assigns it to `HttpContext.User`.

Important warning:

> A JWT is not trusted just because it is valid JSON. It must be cryptographically validated.

## ClaimsPrincipal

After authentication succeeds, ASP.NET Core sets:

```csharp
HttpContext.User
```

It is a `ClaimsPrincipal`. A principal contains one or more identities. Each identity contains claims.

Example claims:

```text
sub: 9f31b2
email: alice@example.com
role: Admin
permission: orders.manage
tenant_id: tenant-123
```

Reading claims:

```csharp
using System.Security.Claims;

var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
    ?? User.FindFirstValue("sub");

var email = User.FindFirstValue(ClaimTypes.Email);
var tenantId = User.FindFirstValue("tenant_id");
var permissions = User.FindAll("permission").Select(c => c.Value).ToHashSet();
```

Important:

> Claims are statements from the identity provider. They are not always fresh. Do not put large, sensitive, or frequently changing authorization data only inside tokens.

## Role-Based Authorization

Role checks are simple:

```csharp
[Authorize(Roles = "Admin")]
[HttpDelete("{id:int}")]
public async Task<IActionResult> DeleteUser(int id)
{
    return NoContent();
}
```

Use roles for coarse-grained permissions:

- `Admin`;
- `Manager`;
- `Support`;
- `ReadOnly`.

Do not use roles for every fine-grained business rule. Role explosion becomes hard to maintain:

```text
OrderAdmin
OrderApprover
OrderRefundApprover
OrderEURefundApprover
OrderUSRefundApprover
```

Better:

> Use roles for broad grouping and policies/permissions for fine-grained access.

## Policy-Based Authorization

Policy-based authorization defines named rules.

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

Usage:

```csharp
[Authorize(Policy = "CanManageOrders")]
[HttpPut("{id:int}")]
public async Task<IActionResult> UpdateOrder(int id, UpdateOrderRequest request)
{
    return Ok();
}
```

Why policies are review-friendly:

- they centralize access rules;
- they are more expressive than roles;
- they are testable;
- they support custom requirements and handlers.

## Custom Requirement And Handler

Requirement:

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

Handler:

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

Registration:

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

Usage:

```csharp
[Authorize(Policy = "AtLeast18")]
public IActionResult AdultsOnly()
{
    return Ok();
}
```

Important detail:

> Authorization handlers can call `context.Succeed(requirement)`. If no handler succeeds for required requirements, authorization fails.

## Resource-Based Authorization

Use resource-based authorization when the decision depends on the specific resource.

Examples:

- user can view only their own order;
- manager can approve only orders in their region;
- tenant admin can manage users only within their tenant;
- owner can edit a document unless it is locked.

Example resource:

```csharp
public sealed class Order
{
    public int Id { get; init; }
    public string OwnerUserId { get; init; } = "";
    public string TenantId { get; init; } = "";
    public OrderStatus Status { get; init; }
}
```

Handler:

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

Policy:

```csharp
builder.Services.AddSingleton<IAuthorizationHandler, SameTenantOrderHandler>();

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SameTenantOrder", policy =>
    {
        policy.Requirements.Add(new SameTenantOrderRequirement());
    });
});
```

Controller:

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

Why resource-based authorization matters:

> `[Authorize(Roles = "Customer")]` can prove the user is a customer, but it cannot prove this user owns this specific order.

## 401 vs 403

`401 Unauthorized` means the caller is not authenticated.

Examples:

- missing token;
- invalid token;
- expired token;
- invalid signature;
- wrong issuer or audience.

`403 Forbidden` means the caller is authenticated but not allowed.

Examples:

- authenticated user lacks required role;
- authenticated user lacks permission claim;
- authenticated user tries to access another tenant's resource;
- authenticated user tries an action not allowed by resource state.

In controllers:

```csharp
if (User.Identity?.IsAuthenticated != true)
{
    return Unauthorized();
}

return Forbid();
```

Strong Practical explanation:

> 401 asks the client to authenticate. 403 says authentication succeeded, but authorization failed.

## Multiple Authentication Schemes

A real app may support multiple schemes:

- JWT for public APIs;
- cookies for admin UI;
- API key for internal services.

Example:

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

Choose a scheme on an endpoint:

```csharp
[Authorize(AuthenticationSchemes = "Bearer")]
public IActionResult ApiOnly()
{
    return Ok();
}
```

Policy with scheme:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ApiUser", policy =>
    {
        policy.AuthenticationSchemes.Add("Bearer");
        policy.RequireAuthenticatedUser();
    });
});
```

## JWT Security Details

### What should you validate in a JWT?

Validate:

- signature;
- issuer;
- audience;
- expiration;
- not-before time;
- signing key;
- algorithm expectations.

### Can the frontend decode a JWT?

Yes, but decoding is not validation.

The frontend can decode token claims for display logic. The backend must validate the token cryptographically.

### Should you store permissions in JWT?

It depends.

Benefits:

- fast authorization checks;
- fewer database calls;
- works well for stable permissions.

Risks:

- token may contain stale permissions until it expires;
- large tokens increase request size;
- sensitive information may leak if stored in readable claims.

Better answer:

> I put stable identity and coarse permission data in tokens. For sensitive or frequently changing authorization decisions, I query server-side data or use short token lifetimes and refresh strategies.

### What is claim mapping?

Different identity providers use different claim names.

Examples:

```text
sub
nameid
roles
role
permissions
scope
```

In .NET, role and name claim types can be configured:

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    NameClaimType = "sub",
    RoleClaimType = "role"
};
```

Common issue:

> The token contains a role claim, but `[Authorize(Roles = "Admin")]` does not work because the role claim type does not match ASP.NET Core's expected role claim type.

## API Key Authentication Sketch

For internal integrations, an API key may be acceptable if secured properly.

Simple endpoint filter or middleware can check a header, but a production-quality solution should:

- store only hashed API keys;
- rotate keys;
- scope keys to permissions;
- log key usage;
- avoid putting keys in query strings;
- use HTTPS only.

Example middleware sketch:

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

## Review Questions

### Authentication vs authorization?

Authentication verifies identity. Authorization checks access rights after identity is known.

### What does `UseAuthentication` do?

It runs the configured authentication handlers, validates credentials such as JWTs or cookies, and sets `HttpContext.User` when authentication succeeds.

### What does `UseAuthorization` do?

It reads endpoint authorization metadata such as `[Authorize]`, evaluates policies, roles, claims, and requirements, and allows or rejects the request.

### What is policy-based authorization?

Policy-based authorization defines named access rules made of requirements. Handlers evaluate those requirements. It is more flexible than simple role checks.

### When do you use resource-based authorization?

Use it when access depends on a specific object loaded from storage, such as order owner, tenant, department, or workflow state.

### Why is frontend authorization not enough?

Because users can call APIs directly with tools like curl, Postman, browser dev tools, or custom scripts. The backend must enforce authorization.

### How do you handle multi-tenant authorization?

Store tenant identity in trusted server-side data or validated claims, filter queries by tenant, and still check resource ownership before returning or modifying data. Never trust tenant IDs sent from the frontend without validation.

## Common Mistakes

### Mistake: `UseAuthorization` before `UseAuthentication`

Why it is wrong:

> Authorization needs an authenticated principal. If authentication has not run, the user may appear anonymous.

Better answer:

> Run `UseAuthentication()` before `UseAuthorization()`.

### Mistake: Trusting frontend permission checks

Why it is wrong:

> Frontend code is controlled by the user. Hidden buttons do not stop direct API calls.

Better answer:

> Enforce all authorization on the backend. Use frontend checks only for UX.

### Mistake: Only using roles for resource-level rules

Why it is wrong:

> A role can say a user is a customer, but it cannot say the user owns order `123`.

Better answer:

> Use resource-based authorization for ownership, tenant, department, or state-dependent access.

### Mistake: Returning wrong status codes

Why it is wrong:

> `401` and `403` communicate different problems to clients and security tools.

Better answer:

> Return `401` when authentication is missing or invalid. Return `403` when the authenticated user lacks permission.

### Mistake: Not validating token issuer or audience

Why it is wrong:

> A token issued for another API or from another issuer may be accepted incorrectly.

Better answer:

> Validate issuer, audience, lifetime, signature, and signing key.

### Mistake: Putting sensitive data in claims

Why it is wrong:

> JWT payloads are usually base64url-encoded, not encrypted. Clients can read them.

Better answer:

> Keep tokens small and avoid sensitive data. Store sensitive information server-side.

## Practice Task

Implement:

1. JWT bearer authentication;
2. role-based admin endpoint;
3. permission-based policy;
4. custom requirement and handler;
5. resource-based order ownership check;
6. correct `401` vs `403` behavior;
7. a short explanation of why frontend checks are not a security boundary.
