# Full-stack Project Case Study: Order Management Platform

This is a complete project case note you can adapt for engineering practice.

## 1. Project Summary

Project:

```text
B2B Order Management Platform
```

Business purpose:

> The platform helps internal sales and operations teams create orders, manage approvals, upload documents, track payment status, and monitor fulfillment.

Users:

- sales representatives;
- operation managers;
- finance users;
- administrators;
- support team.

Tech stack:

- Backend: ASP.NET Core Web API, C#, EF Core.
- Frontend: React, TypeScript, React Router, TanStack Query.
- Database: SQL Server.
- Cache: Redis.
- Messaging: Kafka or Azure Service Bus.
- Auth: JWT / OIDC provider.
- Storage: Azure Blob Storage.
- Observability: structured logging, Application Insights / OpenTelemetry.
- Deployment: Docker, Azure App Service or Kubernetes.

## 2. High-level Architecture

```text
React Frontend
  -> API Gateway / Reverse Proxy
  -> ASP.NET Core API
  -> SQL Server
  -> Redis
  -> Message Broker
  -> Background Workers
  -> Blob Storage
  -> Identity Provider
```

## 3. Main Modules

### Authentication And Authorization

Features:

- login through identity provider;
- JWT access token validation;
- role-based and permission-based authorization;
- route protection on frontend;
- backend policy checks;
- audit log for sensitive operations.

Security principle:

> Frontend permission checks were used only for user experience. Backend policies were the real security boundary.

### Order Management

Features:

- create order;
- edit draft order;
- submit order;
- approve order;
- cancel order;
- search orders;
- pagination, sorting, filtering;
- audit order state changes.

State machine:

```text
Draft -> Submitted -> Approved -> Fulfilled
Draft -> Cancelled
Submitted -> Rejected
Approved -> Cancelled
```

### Document Upload

Features:

- upload order documents;
- store metadata in SQL Server;
- store binary files in Blob Storage;
- file size/type validation;
- virus scanning worker;
- secure download URL.

### Notification

Features:

- notify approvers when order is submitted;
- notify sales user when order is approved/rejected;
- retry failed notifications;
- dead-letter handling.

### Reporting

Features:

- order dashboard;
- monthly order totals;
- approval time metrics;
- export to CSV/Excel.

## 4. Database Design

Core tables:

```sql
Orders
OrderItems
Customers
Users
Roles
Permissions
UserRoles
RolePermissions
OrderAuditLogs
Files
OutboxMessages
```

Order table:

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    CustomerId INT NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedByUserId INT NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL,
    RowVersion ROWVERSION NOT NULL
);
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (CustomerId, Total, CreatedByUserId);
```

Why:

- tenant filtering is required;
- status filtering is common;
- order list sorts by created date;
- included columns avoid extra lookups.

## 5. API Design

Search orders:

```http
GET /api/orders?status=Submitted&page=1&pageSize=20&sort=-createdAt
```

Create order:

```http
POST /api/orders
Idempotency-Key: create-order-user-123-cart-456
```

Approve order:

```http
POST /api/orders/123/approve
```

Upload document:

```http
POST /api/orders/123/files/upload-requests
```

## 6. Backend Implementation Highlights

### Thin Controller

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

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var order = await _orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }
}
```

### Service With Domain Logic

```csharp
public async Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken ct)
{
    var order = new Order(request.CustomerId, _currentUser.UserId, _tenant.TenantId);

    foreach (var item in request.Items)
    {
        order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
    }

    _dbContext.Orders.Add(order);
    await _dbContext.SaveChangesAsync(ct);

    return new OrderDto(order.Id, order.Status.ToString(), order.Total);
}
```

### Query Optimization

```csharp
var items = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.TenantId == tenantId)
    .Where(o => status == null || o.Status == status)
    .OrderByDescending(o => o.CreatedAt)
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerId = o.CustomerId,
        Status = o.Status.ToString(),
        Total = o.Total,
        CreatedAt = o.CreatedAt
    })
    .ToListAsync(ct);
```

## 7. Frontend Implementation Highlights

### Typed API Layer

```ts
export type OrderListItem = {
  id: number;
  customerId: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Cancelled";
  total: number;
  createdAt: string;
};

export async function fetchOrders(params: OrderSearchParams): Promise<PagedResult<OrderListItem>> {
  const response = await apiClient.get("/orders", { params });
  return response.data;
}
```

### React Query

```tsx
function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | undefined>();

  const query = useQuery({
    queryKey: ["orders", { page, status }],
    queryFn: () => fetchOrders({ page, pageSize: 20, status }),
    placeholderData: previous => previous
  });

  if (query.isLoading) return <PageSpinner />;
  if (query.isError) return <ErrorState />;

  return (
    <OrderTable
      orders={query.data.items}
      page={page}
      onPageChange={setPage}
    />
  );
}
```

## 8. Security Design

Security decisions:

- JWT validation on API;
- backend policy authorization;
- resource-level authorization for order approval;
- tenant isolation in all order queries;
- file download authorization;
- audit log for approvals and permission changes;
- no sensitive data in logs;
- rate limiting for login and public endpoints.

Key takeaway:

> I treated the frontend as untrusted. Every sensitive action was revalidated in the API using user claims, tenant context, and resource state.

## 9. Performance Optimization Story

Problem:

> The order list API became slow when the table grew.

Investigation:

- checked API latency metrics;
- trace showed most time in SQL query;
- inspected generated SQL;
- execution plan showed scan and sort;
- query returned more columns than needed.

Actions:

- added DTO projection;
- added `AsNoTracking`;
- added pagination limit;
- added composite covering index;
- reduced response payload.

Result:

> The p95 latency for the order list dropped significantly in testing, and database CPU usage decreased during peak usage.

Engineering principle:

> I did not start by adding cache. I first fixed the query and index because caching a bad query can hide the problem but not remove it.

## 10. Reliability Story

Problem:

> Order approval needed to send notifications, but email provider failures should not break order approval.

Design:

- save approval and outbox event in same transaction;
- background worker publishes notification message;
- notification worker sends email;
- retry with backoff;
- dead-letter after max attempts.

Trade-off:

> Notifications became eventually consistent, but order approval became more reliable because it no longer depended on the email provider being available during the request.

## 11. Production Incident Story

Scenario:

> After a deployment, some users saw 403 errors when approving orders.

Investigation:

- checked logs using correlation ID;
- confirmed authentication succeeded;
- authorization policy failed;
- traced permission claim mapping;
- found new permission name did not match seeded role permission.

Mitigation:

- updated permission seed data;
- added integration test for approval permission;
- added startup validation for required permissions.

Learning note:

> The issue was not JWT itself. It was a mismatch between policy name and permission data. The fix included both data correction and a regression test.

## 12. Architecture Trade-offs

### Modular Monolith vs Microservices

Decision:

> Start as modular monolith.

Reason:

- team size was moderate;
- domain boundaries were still evolving;
- transactions were simpler;
- deployment was easier;
- modules could later be extracted if needed.

### Redis Cache

Used for:

- relatively stable lookup data;
- permission cache;
- rate limiting.

Avoided for:

- strongly consistent order state;
- payment status source of truth.

### Message Broker

Used for:

- notification events;
- audit processing;
- integration events.

## 13. Architecture Narrative

```text
This case study describes a B2B order management platform built with ASP.NET Core, EF Core, SQL Server, React, TypeScript, Redis, and a message broker.

The platform includes order APIs, database design, React list and form pages, authorization, file upload, performance optimization, and background processing.

One important challenge is order-list performance as data grows. A good engineering response is to measure latency, inspect traces, review generated SQL, inspect execution plans, reduce loaded columns through DTO projection, use AsNoTracking, enforce pagination, and add a composite covering index that matches the query pattern.

Another design challenge is order approval notifications. Sending email directly inside the request path couples approval success to provider availability. The outbox pattern and background workers make approval reliable while notifications become eventually consistent.

The broader lesson is that feature implementation is only one part of the system. Security, tenant isolation, performance, observability, and failure handling all shape whether the platform works well in production.
```

## 14. Knowledge Checks

### Why can a modular monolith be a good starting point?

> The team was not large enough to justify microservices, and the domain boundaries were still changing. A modular monolith gave us simpler deployment, simpler transactions, and clear internal boundaries while keeping a future path to extract services if needed.

### How can permissions be designed?

> I separated roles from permissions. Roles grouped users for administration, while permissions represented concrete actions like `orders.approve`. The backend enforced policies and resource-level checks, including tenant and order status.

### How can cross-tenant data access be prevented?

> Every tenant-owned table included `TenantId`, backend queries filtered by the current tenant, indexes started with `TenantId` for common queries, and authorization checks validated both permission and resource ownership.

### How can a slow order-list query be optimized?

> I measured the endpoint, checked traces and generated SQL, reviewed the execution plan, reduced loaded columns using DTO projection, added `AsNoTracking`, enforced pagination, and added a composite covering index matching the filter and sort pattern.

### Why use outbox?

> The outbox pattern makes database changes and event recording part of the same local transaction. A background publisher can retry event delivery later, which avoids losing messages if the broker is temporarily unavailable.

### How can authorization be tested?

> I tested allowed and denied cases: missing token, wrong role, missing permission, wrong tenant, invalid order state, and success path. I also added integration tests around the actual API policies.

### What improvements are useful in a more mature version?

> I would add stronger OpenTelemetry tracing, more authorization regression tests, keyset pagination for deep pages, feature flags for risky releases, and dashboards for background worker retries and dead-letter messages.

### How could this system scale to 10x traffic?

> First I would measure bottlenecks. Likely steps include horizontal API scaling, SQL query/index tuning, caching read-heavy reference data, moving slow work to background jobs, adding queue-based processing, optimizing frontend bundle size, and eventually considering read replicas or sharding only if proven necessary.

### How can a permission-related production issue be analyzed?

> Use the 403 approval issue: authentication succeeded, but authorization failed because permission seed data did not match the policy name. The fix was data correction plus integration tests and startup validation.

### How can frontend state management work?

> Server state such as order lists came from React Query. Local UI state handled filters, modals, and form inputs. Shared client state was kept minimal, and URL state was used for shareable filters or pagination when appropriate.

## 15. What To Improve In A Real Version

- add more integration tests;
- add OpenTelemetry tracing;
- add feature flags;
- improve audit log search;
- add keyset pagination for deep pages;
- add reconciliation for external integrations;
- add dashboard for worker retries and dead-letter messages.
