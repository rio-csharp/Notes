# Authorization And Permission System Design

## Core Idea

Authorization decides whether an authenticated user can perform an action.

Chinese notes:

- `authorization`: 授权.
- `permission`: 权限.
- `role`: 角色.
- `resource-level authorization`: 资源级授权.
- `RBAC`: Role-Based Access Control, 基于角色的访问控制.
- `ABAC`: Attribute-Based Access Control, 基于属性的访问控制.

## Authentication vs Authorization

Authentication:

```text
Who are you?
```

Authorization:

```text
What are you allowed to do?
```

Example:

- user is authenticated as Alice;
- Alice can view her own orders;
- Alice cannot approve refunds unless she has permission.

## RBAC

Role-Based Access Control assigns permissions through roles.

Tables:

```sql
CREATE TABLE Roles
(
    Id INT PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL
);

CREATE TABLE Permissions
(
    Id INT PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL
);

CREATE TABLE RolePermissions
(
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    PRIMARY KEY (RoleId, PermissionId)
);

CREATE TABLE UserRoles
(
    UserId INT NOT NULL,
    RoleId INT NOT NULL,
    PRIMARY KEY (UserId, RoleId)
);
```

Good for:

- admin systems;
- enterprise apps;
- stable permission sets.

## ABAC

Attribute-Based Access Control uses attributes.

Example:

```text
User.Department == Order.Department
Order.Status == "Pending"
User.Level >= 3
```

Good for:

- complex enterprise rules;
- resource ownership;
- multi-tenant systems;
- approval workflows.

## Resource-level Authorization

Example rule:

```text
Users can view only orders from their tenant.
Managers can approve only orders under their department.
```

This cannot be solved safely by route-level role checks only.

Bad:

```csharp
[Authorize(Roles = "Manager")]
public async Task<IActionResult> Approve(int orderId)
{
    await _orderService.ApproveAsync(orderId);
    return Ok();
}
```

Better:

```csharp
[Authorize]
public async Task<IActionResult> Approve(int orderId, CancellationToken ct)
{
    var result = await _authorizationService.AuthorizeAsync(
        User,
        orderId,
        "CanApproveOrder");

    if (!result.Succeeded)
    {
        return Forbid();
    }

    await _orderService.ApproveAsync(orderId, ct);
    return Ok();
}
```

## ASP.NET Core Authorization Handler

Requirement:

```csharp
public sealed class CanApproveOrderRequirement : IAuthorizationRequirement
{
}
```

Handler:

```csharp
public sealed class CanApproveOrderHandler
    : AuthorizationHandler<CanApproveOrderRequirement, int>
{
    private readonly AppDbContext _dbContext;

    public CanApproveOrderHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        CanApproveOrderRequirement requirement,
        int orderId)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is null)
        {
            return;
        }

        var canApprove = await _dbContext.Orders
            .AnyAsync(o =>
                o.Id == orderId &&
                o.Status == OrderStatus.Pending &&
                o.Department.Managers.Any(m => m.UserId == int.Parse(userId)));

        if (canApprove)
        {
            context.Succeed(requirement);
        }
    }
}
```

Registration:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanApproveOrder", policy =>
        policy.Requirements.Add(new CanApproveOrderRequirement()));
});

builder.Services.AddScoped<IAuthorizationHandler, CanApproveOrderHandler>();
```

## Frontend Permission Usage

Frontend permission checks improve UX but do not secure data.

```tsx
function OrderActions({ order }: { order: Order }) {
  const permissions = useCurrentUserPermissions();

  return (
    <>
      {permissions.includes("orders.approve") && order.status === "Pending" && (
        <button>Approve</button>
      )}
    </>
  );
}
```

The API must still check permission.

## Permission Caching

Permissions may be cached for performance.

Options:

- include permissions in access token;
- query permissions from database per request;
- cache permissions in Redis;
- use token version to invalidate.

Trade-off:

- token permissions are fast but can be stale;
- database lookup is fresh but slower;
- Redis is balanced but adds operational dependency.

## Loading Permissions From Database

Permission query:

```csharp
public sealed class PermissionService
{
    private readonly AppDbContext _dbContext;

    public PermissionService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlySet<string>> GetPermissionsAsync(
        int userId,
        CancellationToken ct)
    {
        var permissions = await _dbContext.UserRoles
            .Where(userRole => userRole.UserId == userId)
            .SelectMany(userRole => userRole.Role.RolePermissions)
            .Select(rolePermission => rolePermission.Permission.Name)
            .Distinct()
            .ToListAsync(ct);

        return permissions.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
```

Policy requirement for a permission:

```csharp
public sealed class PermissionRequirement : IAuthorizationRequirement
{
    public PermissionRequirement(string permission)
    {
        Permission = permission;
    }

    public string Permission { get; }
}
```

Handler:

```csharp
public sealed class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly PermissionService _permissions;

    public PermissionHandler(PermissionService permissions)
    {
        _permissions = permissions;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(userIdValue, out var userId))
        {
            return;
        }

        var permissions = await _permissions.GetPermissionsAsync(
            userId,
            CancellationToken.None);

        if (permissions.Contains(requirement.Permission))
        {
            context.Succeed(requirement);
        }
    }
}
```

Registration:

```csharp
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionHandler>();

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders.approve", policy =>
        policy.Requirements.Add(new PermissionRequirement("orders.approve")));
});
```

Usage:

```csharp
[Authorize(Policy = "orders.approve")]
[HttpPost("{id:int}/approve")]
public async Task<IActionResult> Approve(int id, CancellationToken ct)
{
    await _orders.ApproveAsync(id, ct);
    return NoContent();
}
```

## Permission Change Audit

Permission changes are sensitive and should be auditable.

```csharp
public sealed class PermissionAuditLog
{
    public long Id { get; set; }
    public int ActorUserId { get; set; }
    public int TargetUserId { get; set; }
    public string Action { get; set; } = "";
    public string PermissionOrRole { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
```

Example:

```csharp
public async Task AssignRoleAsync(
    int actorUserId,
    int targetUserId,
    int roleId,
    CancellationToken ct)
{
    _dbContext.UserRoles.Add(new UserRole
    {
        UserId = targetUserId,
        RoleId = roleId
    });

    _dbContext.PermissionAuditLogs.Add(new PermissionAuditLog
    {
        ActorUserId = actorUserId,
        TargetUserId = targetUserId,
        Action = "RoleAssigned",
        PermissionOrRole = roleId.ToString(),
        CreatedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);
}
```

Key point:

> Authorization design is not only about allowing or denying requests. It also includes permission data modeling, cache invalidation, auditability, and tenant/resource boundaries.

## Review Questions

### RBAC vs ABAC?

> RBAC grants permissions through roles. ABAC evaluates attributes of user, resource, action, and context. RBAC is simpler; ABAC is more flexible for complex rules.

### Why is frontend permission check not enough?

> Frontend code can be modified or bypassed. Authorization must be enforced on the backend where protected resources are accessed.

### How do you handle permission changes if permissions are inside JWT?

> Use short-lived access tokens, refresh token flow, token version, permission version, or server-side permission checks for sensitive operations.

## Common Mistakes

- Only hiding buttons in frontend.
- Only checking user role, not resource ownership.
- Putting too many dynamic permissions in long-lived JWTs.
- No audit log for sensitive actions.
- No tenant isolation in permission queries.
- Using `404` and `403` inconsistently without a security strategy.

## Practice Task

Design:

1. roles table;
2. permissions table;
3. user-role mapping;
4. role-permission mapping;
5. resource-level approval policy;
6. frontend permission-based action rendering;
7. audit log for permission changes.
