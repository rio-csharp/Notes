# Multi-tenant System Design

## Core Idea

Multi-tenancy means one software system serves multiple tenants, such as companies, organizations, departments, or customers.

The most important rule:

> Never allow one tenant to access another tenant's data.

Multi-tenancy is not only a database design problem. It affects authentication, authorization, queries, indexes, cache keys, background jobs, logs, metrics, billing, support tools, and operations.

## Common Tenant Models

### Database Per Tenant

Each tenant has its own database.

Pros:

- strongest data isolation;
- easier per-tenant backup and restore;
- easier data residency and compliance;
- tenant-specific scaling is possible;
- noisy tenants have less impact on others.

Cons:

- more operational complexity;
- schema migrations must run across many databases;
- connection string management is harder;
- cross-tenant reporting is harder;
- provisioning new tenants is slower.

Use when:

- compliance requires strong isolation;
- tenant size is large;
- customers need data residency;
- per-tenant restore is important.

### Schema Per Tenant

One database, separate schema per tenant.

Pros:

- stronger isolation than shared tables;
- fewer databases than database-per-tenant;
- some operational separation.

Cons:

- migrations are still complex;
- schema count can become large;
- not all tools handle this model smoothly;
- cross-tenant reporting is awkward.

### Shared Database, Shared Schema

All tenants share tables with `TenantId`.

```sql
CREATE TABLE Orders
(
    Id BIGINT IDENTITY PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    CustomerId BIGINT NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL
);

CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (CustomerId, Total);
```

Pros:

- simplest operations;
- easiest early scaling model;
- easy cross-tenant reporting;
- fewer databases;
- simpler deployment.

Cons:

- highest data leak risk;
- all queries must filter by tenant;
- noisy tenants can affect others;
- per-tenant restore is hard;
- mistakes in cache keys or background jobs can leak data.

Use when:

- team is early-stage or moderate scale;
- tenants are relatively small;
- compliance allows shared storage;
- operational simplicity matters.

## Tenant Identification

Common tenant identification sources:

- subdomain: `acme.example.com`;
- path: `/tenants/acme/orders`;
- header: `X-Tenant-ID`;
- token claim: `tenant_id`;
- selected organization in user profile;
- API key mapped to tenant.

A critical security principle is to never trust a tenant ID from the client until the authenticated user or credential is verified to belong to that tenant.

For browser apps, token claims and server-side membership checks are usually safer than trusting a request header alone.

## Tenant Context

A tenant context makes the current tenant available to application services.

```csharp
public interface ITenantContext
{
    Guid TenantId { get; }
    string TenantSlug { get; }
}
```

Implementation from claims:

```csharp
public sealed class HttpTenantContext : ITenantContext
{
    public Guid TenantId { get; }
    public string TenantSlug { get; }

    public HttpTenantContext(IHttpContextAccessor accessor)
    {
        var user = accessor.HttpContext?.User
            ?? throw new UnauthorizedAccessException("Missing user context.");

        var tenantIdValue = user.FindFirst("tenant_id")?.Value;
        var tenantSlug = user.FindFirst("tenant_slug")?.Value;

        if (!Guid.TryParse(tenantIdValue, out var tenantId))
        {
            throw new UnauthorizedAccessException("Missing tenant claim.");
        }

        if (string.IsNullOrWhiteSpace(tenantSlug))
        {
            throw new UnauthorizedAccessException("Missing tenant slug.");
        }

        TenantId = tenantId;
        TenantSlug = tenantSlug;
    }
}
```

Registration:

```csharp
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, HttpTenantContext>();
```

For background jobs, do not depend on `HttpContext`.

## EF Core Global Query Filter

(For a deeper discussion of DbContext lifetime, change tracking, and query translation, see Chapter 6, "DbContext And The Change Tracker" and "Query Translation And Read Models".)

Tenant-owned entities:

```csharp
public interface ITenantEntity
{
    Guid TenantId { get; set; }
}
```

Entity:

```csharp
public sealed class Order : ITenantEntity
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public long CustomerId { get; set; }
    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
```

DbContext:

```csharp
public sealed class AppDbContext : DbContext
{
    private readonly ITenantContext _tenantContext;

    public AppDbContext(
        DbContextOptions<AppDbContext> options,
        ITenantContext tenantContext)
        : base(options)
    {
        _tenantContext = tenantContext;
    }

    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>()
            .HasQueryFilter(o => o.TenantId == _tenantContext.TenantId);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyTenantId();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyTenantId()
    {
        foreach (var entry in ChangeTracker.Entries<ITenantEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.TenantId = _tenantContext.TenantId;
            }

            if (entry.State == EntityState.Modified &&
                entry.Property(e => e.TenantId).IsModified)
            {
                throw new InvalidOperationException("TenantId cannot be changed.");
            }
        }
    }
}
```

Global filters reduce accidental leaks, but they are not a replacement for authorization and tests.

**Query filter caveats.** When a global filter is applied to an entity that has a required navigation to another entity with a filter, EF Core uses an `INNER JOIN`, which can silently filter out rows from the parent entity. This is particularly relevant for multi-tenant systems where a `TenantId` filter on one table may unexpectedly reduce results from a related query. Making the navigation optional (or applying consistent filters on both entities) avoids this issue.

**Multiple filters.** Before EF Core 10, `HasQueryFilter` overwrites previous calls. Multiple conditions must be combined with `&&`:

```csharp
modelBuilder.Entity<Order>()
    .HasQueryFilter(o => o.TenantId == _tenantContext.TenantId && !o.IsDeleted);
```

In EF Core 10 and later, named query filters allow separate registration and selective disabling:

```csharp
modelBuilder.Entity<Order>()
    .HasQueryFilter("TenantFilter", o => o.TenantId == _tenantContext.TenantId)
    .HasQueryFilter("SoftDeleteFilter", o => !o.IsDeleted);
```

**Disabling filters.** Use `IgnoreQueryFilters()` to bypass all filters, which is necessary for admin cross-tenant operations. In EF Core 10, specific named filters can be disabled individually.

## Resource-Level Authorization

Checking a permission is not enough. The resource must also belong to the current tenant. (For a detailed explanation of authorization models, permission policies, and resource-level handlers, see Chapter 8, "Authorization Models, Permissions, And Resource Access".)

```csharp
public async Task<OrderDto> GetOrderAsync(long orderId, CancellationToken ct)
{
    var order = await _db.Orders
        .AsNoTracking()
        .Where(o => o.Id == orderId)
        .Select(o => new OrderDto
        {
            Id = o.Id,
            Total = o.Total,
            CreatedAt = o.CreatedAt
        })
        .SingleOrDefaultAsync(ct);

    if (order is null)
    {
        throw new NotFoundException("Order not found.");
    }

    return order;
}
```

Because of the global query filter, orders from another tenant are invisible.

Some teams still explicitly include tenant filters in critical queries for readability:

```csharp
var order = await _db.Orders
    .AsNoTracking()
    .SingleOrDefaultAsync(
        o => o.Id == orderId && o.TenantId == _tenant.TenantId,
        ct);
```

## Cache Keys Must Include Tenant

Bad:

```csharp
var key = $"product:{productId}";
```

This can return another tenant's cached value.

Better:

```csharp
var key = $"tenant:{tenantId}:product:{productId}";
```

Helper:

```csharp
public static class TenantCacheKeys
{
    public static string Product(Guid tenantId, long productId)
    {
        return $"tenant:{tenantId:N}:product:{productId}";
    }

    public static string Permissions(Guid tenantId, string userId)
    {
        return $"tenant:{tenantId:N}:user:{userId}:permissions";
    }
}
```

## Background Jobs Need Explicit Tenant Context

Background jobs do not have an HTTP request.

Bad job message:

```json
{
  "orderId": 123
}
```

Better:

```json
{
  "tenantId": "9f60d6f2-5bb2-4c6e-a4a8-61da5a89dfcc",
  "orderId": 123
}
```

Tenant context for jobs:

```csharp
public sealed class JobTenantContext : ITenantContext
{
    public Guid TenantId { get; private set; }
    public string TenantSlug { get; private set; } = "";

    public void Set(Guid tenantId, string tenantSlug)
    {
        TenantId = tenantId;
        TenantSlug = tenantSlug;
    }
}
```

Worker:

```csharp
public async Task ProcessAsync(OrderSubmittedMessage message, CancellationToken ct)
{
    _tenantContext.Set(message.TenantId, message.TenantSlug);

    var order = await _db.Orders
        .SingleOrDefaultAsync(o => o.Id == message.OrderId, ct);

    if (order is null)
    {
        _logger.LogWarning(
            "Order {OrderId} not found for tenant {TenantId}",
            message.OrderId,
            message.TenantId);
        return;
    }

    await _notificationService.NotifyApproverAsync(order, ct);
}
```

## Admin Cross-Tenant Access

Some support users may need cross-tenant access. In such cases, bypass the global query filter explicitly:

```csharp
var orders = await _db.Orders
    .IgnoreQueryFilters()
    .Where(o => o.Id == orderId)
    .ToListAsync(ct);
```

`IgnoreQueryFilters()` disables all filters on the query, so it must only be used in code paths gated by an explicit admin permission check.

Rules:

- require a separate permission;
- require reason code for access;
- audit every access;
- show clear tenant context in UI;
- avoid accidental tenant switching;
- never make cross-tenant mode the default.

Audit table:

```sql
CREATE TABLE AdminTenantAccessLogs
(
    Id BIGINT IDENTITY PRIMARY KEY,
    ActorUserId NVARCHAR(100) NOT NULL,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    Reason NVARCHAR(500) NOT NULL,
    Action NVARCHAR(100) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

## Index Design

In shared-table tenancy, common indexes should usually start with `TenantId`.

Example:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (Total, CustomerId);
```

The index structure supports:

- most queries filter by tenant;
- it improves isolation of tenant-specific scans;
- it supports pagination and sorting;
- it reduces reading unrelated tenant rows.

If one tenant is much larger than others, query plans may still need careful review.

## Logging And Metrics

Logs should include tenant ID for investigation, but not sensitive tenant data.

```csharp
using (_logger.BeginScope(new Dictionary<string, object>
{
    ["TenantId"] = _tenant.TenantId
}))
{
    _logger.LogInformation("Order {OrderId} submitted", order.Id);
}
```

Metrics should allow tenant-level debugging without creating too much cardinality.

Do not label every metric with tenant ID in high-traffic systems unless the monitoring platform can handle it.

## Testing Tenant Isolation

Integration test example:

```csharp
[Fact]
public async Task GetOrder_Should_Not_Return_Order_From_Another_Tenant()
{
    var tenantA = Guid.NewGuid();
    var tenantB = Guid.NewGuid();

    await SeedOrderAsync(tenantB, orderId: 100);

    using var client = _factory.CreateClientForTenant(tenantA);

    var response = await client.GetAsync("/api/orders/100");

    response.StatusCode.Should().Be(HttpStatusCode.NotFound);
}
```

Test cases:

- tenant A cannot read tenant B data;
- tenant A cannot update tenant B data;
- cache does not leak across tenants;
- background job runs with correct tenant;
- admin access creates audit log;
- exports contain only current tenant data.

## Security Checklist

- Tenant ID is part of authorization.
- Every tenant-owned table has `TenantId`.
- Common indexes include `TenantId`.
- Cache keys include tenant ID.
- Logs include tenant ID safely.
- Background messages include tenant ID.
- Admin cross-tenant access is audited.
- File storage paths include tenant ID.
- Search indexes include tenant filters.
- Tests cover cross-tenant access.

Blob path example:

```csharp
var blobName = $"tenants/{tenantId:N}/orders/{orderId}/files/{fileId:N}.pdf";
```

(For a comprehensive treatment of authentication and authorization, see Chapter 8. For API contract patterns including pagination, filtering, and DTO design, see Chapter 7.)
