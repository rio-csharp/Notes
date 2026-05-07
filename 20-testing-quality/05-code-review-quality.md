# Code Review Quality

## Core Idea

Code review is a quality practice, not just an approval step.

Good review protects:

- correctness;
- security;
- data integrity;
- production reliability;
- maintainability;
- shared understanding.

## What To Review First

Review priority:

1. Correctness.
2. Security.
3. Data loss or migration risk.
4. Authorization and tenant boundaries.
5. Error handling and reliability.
6. Tests.
7. Performance.
8. Maintainability.
9. Naming and style.

Formatting should usually be automated. Human review time is better spent on behavior and risk.

## Pull Request Size

Small PRs are easier to review.

Good PR:

```text
Adds keyset pagination to GET /api/orders.
Adds composite index on TenantId, CreatedAt, Id.
Adds integration tests for first page and next page.
```

Risky PR:

```text
Refactors order service, changes auth, renames tables, updates UI, changes caching, and fixes unrelated bugs.
```

Large PRs are sometimes unavoidable, but the author should explain the structure and risk.

## Good PR Description

```text
Summary:
- Adds server-side order filtering and keyset pagination.
- Adds composite index for TenantId, CreatedAt, Id.
- Updates React table to request next page by cursor.

Behavior:
- Default page size is 50.
- Maximum page size is 200.
- Cursor is opaque to the frontend.

Tests:
- Unit tests for cursor encoding.
- Integration tests for pagination order and tenant isolation.
- Component test for next-page button.

Risk:
- Migration adds a new nonclustered index on Orders.
- Query plan should be checked on production-like data.
```

This helps reviewers understand what changed and where to focus.

## Reviewing Correctness

Ask:

```text
Does the code do what the feature requires?
Are edge cases handled?
Are null/empty/invalid inputs handled?
Are state transitions valid?
Are duplicate requests safe?
Are errors returned with the right status/contract?
```

Example issue:

```csharp
public async Task ApproveAsync(int orderId, int userId, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync([orderId], ct);

    order.Status = OrderStatus.Approved;
    await _db.SaveChangesAsync(ct);

    await _permissionService.EnsureCanApproveAsync(userId, order.TenantId, ct);
}
```

The order is updated before permission is checked.

Better:

```csharp
public async Task ApproveAsync(int orderId, int userId, CancellationToken ct)
{
    var order = await _db.Orders
        .SingleOrDefaultAsync(o => o.Id == orderId, ct);

    if (order is null)
    {
        throw new NotFoundException("Order not found.");
    }

    await _permissionService.EnsureCanApproveAsync(userId, order.TenantId, ct);

    if (order.Status != OrderStatus.Submitted)
    {
        throw new ConflictException("Only submitted orders can be approved.");
    }

    order.Status = OrderStatus.Approved;
    await _db.SaveChangesAsync(ct);
}
```

## Reviewing Authorization

Authorization bugs are often subtle.

Check:

- tenant filtering;
- resource ownership;
- role vs permission logic;
- user-controlled IDs;
- admin-only paths;
- object-level authorization;
- `401` vs `403`;
- frontend hiding controls is not enough.

Risky query:

```csharp
var order = await _db.Orders
    .SingleOrDefaultAsync(o => o.Id == orderId, ct);
```

Safer tenant-scoped query:

```csharp
var order = await _db.Orders
    .SingleOrDefaultAsync(o => o.Id == orderId && o.TenantId == currentTenantId, ct);
```

If a system is multi-tenant, tenant scope should be difficult to forget.

## Reviewing Data Changes

Database changes need special care.

Check:

- destructive migrations;
- table locks;
- backfill strategy;
- index build cost;
- nullable to non-nullable changes;
- default values;
- foreign keys;
- rollback/roll-forward plan;
- compatibility during rolling deployment.

Risky migration:

```csharp
migrationBuilder.DropColumn(
    name: "FullName",
    table: "Customers");
```

Safer approach:

```text
Release 1:
  - Add DisplayName.
  - Write both FullName and DisplayName.
  - Backfill DisplayName.

Release 2:
  - Read DisplayName.

Release 3:
  - Drop FullName after old versions are gone.
```

## Reviewing Error Handling

Check:

- exceptions are not swallowed silently;
- user-facing errors do not leak internals;
- logs include useful context;
- retries are bounded;
- cancellation tokens are passed;
- partial failures are handled;
- external calls have timeouts.

Bad:

```csharp
try
{
    await _paymentClient.ChargeAsync(request, ct);
}
catch
{
    return true;
}
```

Better:

```csharp
try
{
    await _paymentClient.ChargeAsync(request, ct);
    return PaymentResult.Success();
}
catch (PaymentProviderException ex)
{
    _logger.LogWarning(ex, "Payment provider rejected order {OrderId}", request.OrderId);
    return PaymentResult.Failed("Payment could not be completed.");
}
```

## Reviewing Performance

Check:

- N+1 queries;
- missing pagination;
- unbounded result sets;
- unnecessary allocations;
- synchronous blocking;
- missing database indexes;
- chatty external API calls;
- inefficient React rendering;
- large bundle changes.

N+1 example:

```csharp
var orders = await _db.Orders.ToListAsync(ct);

foreach (var order in orders)
{
    order.Items = await _db.OrderItems
        .Where(i => i.OrderId == order.Id)
        .ToListAsync(ct);
}
```

Better projection:

```csharp
var orders = await _db.Orders
    .Where(o => o.TenantId == tenantId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderSummaryDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        ItemCount = o.Items.Count
    })
    .Take(50)
    .ToListAsync(ct);
```

## Reviewing Frontend Changes

Check:

- loading state;
- empty state;
- error state;
- disabled state;
- keyboard accessibility;
- labels and roles;
- form validation;
- API error handling;
- race conditions;
- large dependency additions;
- unnecessary re-renders.

Example concern:

```tsx
useEffect(() => {
  fetch(`/api/orders?query=${query}`)
    .then((response) => response.json())
    .then(setOrders);
}, [query]);
```

Multiple requests can resolve out of order when query changes quickly.

Improved version:

```tsx
useEffect(() => {
  const controller = new AbortController();

  async function loadOrders() {
    const response = await fetch(`/api/orders?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Failed to load orders.");
    }

    setOrders(await response.json());
  }

  loadOrders().catch((error) => {
    if (error.name !== "AbortError") {
      setError("Could not load orders.");
    }
  });

  return () => controller.abort();
}, [query]);
```

## Reviewing Tests

Check:

- important behavior is covered;
- failure paths are tested;
- tests are deterministic;
- integration tests cover database/API boundaries;
- frontend tests cover loading/error/empty states;
- E2E tests cover critical flows only;
- test names explain behavior.

Weak test:

```csharp
[Fact]
public void Test1()
{
    var service = new OrderService();
    service.Create();
}
```

Better:

```csharp
[Fact]
public void Create_Should_Reject_Order_Without_Items()
{
    var service = new OrderService();

    var result = service.Create(new CreateOrderRequest
    {
        Items = []
    });

    result.IsSuccess.Should().BeFalse();
    result.Error.Code.Should().Be("ORDER_EMPTY");
}
```

## Writing Good Review Comments

Good comments are:

- specific;
- respectful;
- tied to behavior;
- clear about risk;
- actionable.

Good:

```text
This query loads orders by ID without tenant filtering. If order IDs are guessable,
a user from tenant A could access tenant B's order. Could we include TenantId in
the query or enforce tenant scope in the repository?
```

Not useful:

```text
This is bad.
```

## Comment Types

Use different tones for different needs:

```text
Blocking:
This can expose cross-tenant data. We need to fix it before merging.

Suggestion:
This helper could make the validation easier to read, but the current version is correct.

Question:
Is this endpoint expected to allow archived orders?

Nit:
Small naming suggestion; no need to block on this.
```

## Author Responsibilities

Before requesting review, the author should:

- self-review the diff;
- remove unrelated changes;
- write a clear PR description;
- include test evidence;
- call out risky areas;
- explain migrations;
- mention feature flags;
- keep the PR reasonably small.

## Reviewer Responsibilities

The reviewer should:

- understand the goal;
- read risky areas carefully;
- focus on behavior and risk;
- avoid personal tone;
- separate blocking issues from suggestions;
- approve only when comfortable with the risk;
- ask for context when unclear.
