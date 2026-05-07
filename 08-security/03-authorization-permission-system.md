# Authorization Models, Permissions, And Resource Access

## Core Idea

Authentication identifies the caller. Authorization decides what that caller may do. Systems often fail not because authentication is absent, but because authorization is too coarse, too static, or too disconnected from the actual resource being accessed.

## Authentication Versus Authorization

The distinction is simple but operationally essential.

Authentication asks:

```text
Who are you?
```

Authorization asks:

```text
What are you allowed to do here?
```

Many insecure systems answer only the first question and accidentally assume the second.

## Role-Based Access Control

Role-based access control, or RBAC, groups permissions through roles. It works well when permission sets are fairly stable and the organization already thinks in role categories such as administrator, manager, support agent, or auditor.

RBAC is attractive because it simplifies assignment and explanation. Its weakness is that real authorization often becomes more contextual than roles alone can express.

## Attribute- And Resource-Based Authorization

Attribute-based approaches use properties of:

- the user;
- the resource;
- the action;
- the surrounding context.

This becomes necessary when authorization depends on tenant ownership, department alignment, workflow state, approval stage, or other conditions beyond coarse role membership.

Resource-based authorization is especially important because many real decisions are not about whether someone is an admin in the abstract. They are about whether this user may perform this action on this exact object.

## Coarse Access Versus Resource Ownership

A route-level role check can be necessary, but it is rarely sufficient for sensitive operations.

Allowing "Managers" to approve orders may still be too broad if approvals should be limited by:

- tenant;
- department;
- order status;
- ownership or escalation rules.

This is why resource-level handlers or domain-aware authorization services are often necessary. The decision surface lives where business facts live, not only where HTTP routes live.

## Permissions As Stable Capability Names

Fine-grained permission strings such as `orders.approve` or `payments.refund` can provide a stable capability vocabulary across backend policies, audit logs, and frontend UX hints.

This is useful because it gives the system a more explicit authorization language than role names alone. Roles can then become one way of assigning permissions rather than the only abstraction the system understands.

### Policy Registration And Enforcement

In ASP.NET Core, permission-based authorization is typically expressed through policies that map permissions to claims or requirements. Policies are registered during startup and then applied declaratively on controller actions or endpoints:

```csharp
// Program.cs — register policies backed by permission claims
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Orders.Approve", policy =>
        policy.RequireClaim("permission", "orders.approve"));
    options.AddPolicy("Payments.Refund", policy =>
        policy.RequireClaim("permission", "payments.refund"));
    options.AddPolicy("Orders.Create", policy =>
        policy.RequireClaim("permission", "orders.create"));
});
```

A controller action applies the relevant policy through the `[Authorize]` attribute:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpPost("{id:int}/approve")]
    [Authorize(Policy = "Orders.Approve")]
    public async Task<IActionResult> Approve(int id, CancellationToken ct)
    {
        // The policy check guarantees the caller holds orders.approve
        var result = await _orderService.ApproveAsync(id, ct);
        return result ? Ok() : NotFound();
    }
}
```

### Resource-Level Authorization

When authorization depends on properties of the specific resource being accessed, policy attributes on the controller are insufficient. The system must evaluate the resource at runtime. ASP.NET Core supports this through `IAuthorizationService` and custom `AuthorizationHandler<TRequirement, TResource>`:

```csharp
// Requirement type
public sealed record OrderOwnerRequirement : IAuthorizationRequirement;

// Handler that evaluates ownership
public sealed class OrderOwnerHandler
    : AuthorizationHandler<OrderOwnerRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OrderOwnerRequirement requirement,
        Order resource)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (resource.OwnerId == userId)
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}
```

The handler is registered in DI and invoked from within the action:

```csharp
builder.Services.AddScoped<IAuthorizationHandler, OrderOwnerHandler>();
```

```csharp
[HttpDelete("{id:int}")]
public async Task<IActionResult> Cancel(int id, CancellationToken ct)
{
    var order = await _orderService.GetByIdAsync(id, ct);
    if (order is null) return NotFound();

    var authResult = await _authorizationService
        .AuthorizeAsync(User, order, "OrderOwnerPolicy");

    if (!authResult.Succeeded) return Forbid();

    await _orderService.CancelAsync(order, ct);
    return NoContent();
}
```

This pattern matters because many real authorization decisions are not about whether the caller is an admin in the abstract. They are about whether this specific user may act on this exact resource in this particular state.

## Frontend Checks And Their Limits

Frontend permission checks are useful for user experience. They can hide buttons, simplify flows, and reduce failed requests. They are not security boundaries.

Any authorization decision that matters must be enforceable on the backend where the protected resource or state transition actually exists.

## Permission Freshness And Caching

Authorization data is often cached because looking up full permission state on every request may be expensive. That introduces freshness trade-offs.

Permissions may be:

- embedded in short-lived tokens;
- loaded from a database;
- cached in a distributed store;
- combined with token or permission-version invalidation.

The right choice depends on how frequently permissions change, how sensitive the action is, and how much latency budget the system has. Highly sensitive actions often justify fresher server-side checks even when ordinary reads use cached claim data.

## Auditing Authorization Changes

Permission and role changes are themselves security-relevant events. A mature authorization system therefore treats assignment and revocation as auditable state changes, not just as configuration toggles.

This matters because incident investigation often depends not only on knowing who performed an action, but also on knowing when a user gained the permission that made the action possible.

## Design Consequences

Strong authorization design usually layers several ideas together:

- coarse authentication and entry control;
- stable permission vocabulary;
- role or policy grouping where useful;
- resource-level checks where business context matters;
- audit trails for sensitive permission changes;
- freshness strategy for claims and permissions.

Authorization becomes brittle when treated as a single framework attribute. It becomes reliable when treated as a decision system whose data model, cache model, and resource model all align.
