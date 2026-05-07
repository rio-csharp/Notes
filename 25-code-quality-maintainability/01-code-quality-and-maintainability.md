# Code Quality And Maintainability

## Core Idea

Code quality is not about making code look clever. It is about making software easier to understand, change, test, debug, and operate.

Good code supports future work. It helps the next engineer understand the intention, change behavior safely, and diagnose problems when production behaves differently from expectations.

## Characteristics of Maintainable Code

Maintainable code is:

- easy to read;
- explicit about dependencies;
- consistent with project patterns;
- testable;
- small enough to reason about;
- clear about business rules;
- clear about error handling;
- safe to change;
- observable in production;
- boring in a good way.

Maintainability is not only local style. It also includes architecture boundaries, database contracts, API compatibility, testing, deployment, and operational behavior.

## Naming

Names should reveal intent.

Weak:

```csharp
public void DoIt(int x)
{
    // ...
}
```

Better:

```csharp
public void ApproveOrder(int orderId)
{
    // ...
}
```

Better with domain language:

```csharp
public void ApproveSubmittedOrder(int orderId, int approverUserId)
{
    // ...
}
```

Naming principles:

- use domain terms;
- avoid vague names like `data`, `info`, `manager`, `helper`, `process`;
- name booleans as questions or states;
- avoid abbreviations unless common in the project;
- prefer clarity over shortness.

Boolean examples:

```csharp
bool isApproved;
bool canApproveOrder;
bool hasExceededCreditLimit;
bool shouldSendNotification;
```

## Function Size And Responsibility

A function should have one clear reason to change.

Long methods often mix:

- validation;
- authorization;
- data access;
- business rules;
- side effects;
- logging;
- response mapping.

Risky:

```csharp
public async Task<IActionResult> ApproveOrder(int id, CancellationToken ct)
{
    var order = await _db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id, ct);

    if (order == null)
    {
        return NotFound();
    }

    if (order.TenantId != _currentUser.TenantId)
    {
        return Forbid();
    }

    if (!_currentUser.Permissions.Contains("orders.approve"))
    {
        return Forbid();
    }

    if (order.Status != "Submitted")
    {
        return Conflict("Only submitted orders can be approved.");
    }

    order.Status = "Approved";
    order.ApprovedByUserId = _currentUser.UserId;
    order.ApprovedAt = DateTimeOffset.UtcNow;

    _db.AuditLogs.Add(new AuditLog
    {
        Action = "order.approved",
        ResourceId = id.ToString(),
        ActorUserId = _currentUser.UserId,
        CreatedAt = DateTimeOffset.UtcNow
    });

    await _emailSender.SendAsync(order.CreatedByUserId, "Order approved", ct);
    await _db.SaveChangesAsync(ct);

    return Ok();
}
```

This approach has several problems:

- controller owns business rules;
- email is sent before database commit;
- string status values are fragile;
- authorization and state transition are mixed with HTTP response logic;
- difficult to test.

Improved shape:

```csharp
[Authorize(Policy = "orders.approve")]
[HttpPost("{id:long}/approve")]
public async Task<IActionResult> ApproveOrder(long id, CancellationToken ct)
{
    await _orderApprovalService.ApproveAsync(id, ct);
    return NoContent();
}
```

Service:

```csharp
public sealed class OrderApprovalService
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;

    public OrderApprovalService(
        AppDbContext db,
        ITenantContext tenant,
        ICurrentUser currentUser)
    {
        _db = db;
        _tenant = tenant;
        _currentUser = currentUser;
    }

    public async Task ApproveAsync(long orderId, CancellationToken ct)
    {
        var order = await _db.Orders
            .SingleOrDefaultAsync(
                o => o.Id == orderId && o.TenantId == _tenant.TenantId,
                ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Approve(_currentUser.UserId, DateTimeOffset.UtcNow);

        _db.AuditLogs.Add(AuditLog.OrderApproved(
            order.Id,
            _currentUser.UserId,
            DateTimeOffset.UtcNow));

        _db.OutboxMessages.Add(OutboxMessage.From(
            "OrderApproved",
            new OrderApprovedEvent(order.Id, order.CreatedByUserId)));

        await _db.SaveChangesAsync(ct);
    }
}
```

Domain method:

```csharp
public void Approve(int approverUserId, DateTimeOffset approvedAt)
{
    if (Status != OrderStatus.Submitted)
    {
        throw new DomainException("Only submitted orders can be approved.");
    }

    Status = OrderStatus.Approved;
    ApprovedByUserId = approverUserId;
    ApprovedAt = approvedAt;
}
```

Now the controller handles HTTP, the service coordinates the use case, and the entity protects state rules.

## Guard Clauses

Guard clauses reduce nesting.

Nested:

```csharp
public void Submit(Order order)
{
    if (order is not null)
    {
        if (order.Items.Any())
        {
            if (order.Status == OrderStatus.Draft)
            {
                order.Submit();
            }
        }
    }
}
```

Clearer:

```csharp
public void Submit(Order order)
{
    ArgumentNullException.ThrowIfNull(order);

    if (!order.Items.Any())
    {
        throw new DomainException("Cannot submit an empty order.");
    }

    if (order.Status != OrderStatus.Draft)
    {
        throw new DomainException("Only draft orders can be submitted.");
    }

    order.Submit();
}
```

Guard clauses are especially useful for validation and invalid states.

## Cohesion

Cohesion means related behavior belongs together.

Low cohesion:

```csharp
public sealed class OrderUtility
{
    public decimal CalculateTotal(Order order) => // ...
    public string FormatPhoneNumber(string phone) => // ...
    public Task SendEmailAsync(string to) => // ...
    public bool ValidateJwt(string token) => // ...
}
```

This class has unrelated responsibilities.

Higher cohesion:

```csharp
public sealed class OrderPriceCalculator
{
    public decimal CalculateTotal(IEnumerable<OrderItem> items)
    {
        return items.Sum(i => i.Quantity * i.UnitPrice);
    }
}
```

Related behavior is easier to test and reason about.

## Coupling

Coupling means how much one part of the system depends on another.

Tight coupling:

```csharp
public sealed class OrderService
{
    private readonly SmtpEmailSender _emailSender = new();
}
```

The service decides the concrete email implementation.

Lower coupling:

```csharp
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}
```

```csharp
public sealed class OrderService
{
    private readonly IEmailSender _emailSender;

    public OrderService(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }
}
```

Lower coupling makes code easier to test, replace, and evolve.

## Avoid Primitive Obsession

Primitive obsession means representing meaningful domain concepts with raw strings, integers, or decimals everywhere.

Risky:

```csharp
public Task PayAsync(string orderId, decimal amount, string currency)
```

Better:

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public Money(decimal amount, string currency) : this()
    {
        if (amount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount));
        }

        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new ArgumentException("Currency is required.", nameof(currency));
        }

        Amount = amount;
        Currency = currency.ToUpperInvariant();
    }
}
```

Use domain types when they prevent repeated validation and make invalid states harder to create.

## Make Invalid States Hard To Represent

Weak:

```csharp
public sealed class Payment
{
    public string Status { get; set; } = "";
    public DateTimeOffset? CapturedAt { get; set; }
}
```

Any code can set impossible combinations.

Better:

```csharp
public sealed class Payment
{
    public PaymentStatus Status { get; private set; } = PaymentStatus.Pending;
    public DateTimeOffset? CapturedAt { get; private set; }

    public void MarkCaptured(DateTimeOffset capturedAt)
    {
        if (Status is PaymentStatus.Cancelled or PaymentStatus.Refunded)
        {
            throw new DomainException($"Cannot capture payment from status {Status}.");
        }

        Status = PaymentStatus.Captured;
        CapturedAt = capturedAt;
    }
}
```

The domain object controls valid transitions.

## Error Handling Quality

Good error handling is:

- explicit;
- consistent;
- observable;
- safe for users;
- useful for operators;
- not hiding failures.

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
    _logger.LogWarning(
        ex,
        "Payment provider failed for OrderId {OrderId}",
        request.OrderId);

    return PaymentResult.Failed("Payment could not be completed.");
}
```

Do not swallow exceptions unless the failure is expected and safely handled.

## Observability As Code Quality

Production maintainability depends on logs, metrics, and traces.

Useful logging:

```csharp
_logger.LogInformation(
    "Order {OrderId} approved by UserId {UserId}",
    order.Id,
    currentUser.UserId);
```

Weak logging:

```csharp
_logger.LogInformation("done");
```

Good logs include:

- important identifiers;
- correlation ID through logging scope;
- safe context;
- no secrets or sensitive payloads.

## Testing As Maintainability

Tests make future changes safer. (For a detailed discussion of testing strategy, the test pyramid, test double types, and risk-based testing, see Chapter 20, "Testing Strategy". For integration testing patterns in .NET, see Chapter 20, "Integration Testing In .NET".)

Unit test domain rule:

```csharp
[Fact]
public void Approve_Should_Fail_When_Order_Is_Not_Submitted()
{
    var order = Order.CreateDraft(customerId: 1);

    var ex = Assert.Throws<DomainException>(() =>
        order.Approve(approverUserId: 10, DateTimeOffset.UtcNow));

    ex.Message.Should().Contain("submitted");
}
```

Integration test boundary:

```csharp
[Fact]
public async Task ApproveOrder_Should_Return_NotFound_For_Other_Tenant_Order()
{
    await SeedOrderAsync(tenantId: TenantB, orderId: 100);

    using var client = _factory.CreateClientForTenant(TenantA);

    var response = await client.PostAsync("/api/orders/100/approve", null);

    response.StatusCode.Should().Be(HttpStatusCode.NotFound);
}
```

Tests are part of design. Hard-to-test code often signals unclear boundaries.

## Refactoring

Refactoring changes code structure without changing external behavior.

Safe refactoring steps:

```text
1. Add or identify tests around current behavior.
2. Make one small structural change.
3. Run tests.
4. Commit or checkpoint.
5. Repeat.
```

Common refactorings:

- extract method;
- extract class;
- replace primitive with value object;
- replace conditionals with polymorphism or state methods;
- move business rule into domain object;
- introduce interface at boundary;
- split large service by use case.

Do not refactor unrelated code during risky feature work unless it is necessary for the change.

## Technical Debt

Technical debt is a design or implementation compromise that increases future cost.

Not all debt is bad. Sometimes a temporary shortcut is reasonable if it is visible and managed.

Bad debt is:

- unknown;
- untracked;
- repeatedly causing bugs;
- blocking delivery;
- increasing incident risk;
- hiding security or data integrity problems.

Debt note template:

```text
Debt:
Impact:
Risk:
Where it appears:
Possible fix:
When to address:
Owner:
```

Example:

```text
Debt:
Order search uses offset pagination for all pages.

Impact:
Deep pages become slow for large tenants.

Risk:
High database CPU during heavy reporting usage.

Possible fix:
Use keyset pagination for operational browsing and async export for full data extraction.
```

## Abstraction Quality

Good abstraction removes meaningful complexity.

Bad abstraction hides simple code behind vague names.

Weak:

```csharp
public interface IProcessor
{
    Task ProcessAsync(object input);
}
```

Better:

```csharp
public interface IOrderApprovalService
{
    Task ApproveAsync(long orderId, CancellationToken ct);
}
```

Before adding abstraction, ask:

- Does it reduce duplication?
- Does it express a real boundary?
- Does it improve testing?
- Does it match existing project style?
- Does it make change easier?

## API Maintainability

API contracts should be stable and explicit.

Good DTO:

```csharp
public sealed record OrderListItemDto(
    long Id,
    string CustomerName,
    string Status,
    decimal Total,
    DateTimeOffset CreatedAt);
```

Avoid returning EF entities directly:

```csharp
return await _db.Orders.ToListAsync(ct);
```

DTOs protect API contracts from persistence details.

## Frontend Maintainability

Frontend code quality includes:

- clear component boundaries;
- typed API layer;
- accessible UI;
- explicit loading/error/empty states;
- reusable but not over-generalized components;
- predictable state ownership;
- URL state for shareable filters;
- tests for important behavior.

Feature folder example:

```text
features/orders/
  api/
    ordersApi.ts
  components/
    OrderTable.tsx
    OrderStatusBadge.tsx
  pages/
    OrdersPage.tsx
  hooks/
    useOrderFilters.ts
  types.ts
```

Page component:

```tsx
export function OrdersPage() {
  const filters = useOrderFilters();

  const query = useQuery({
    queryKey: ["orders", filters.value],
    queryFn: () => fetchOrders(filters.value),
  });

  return (
    <OrderTable
      orders={query.data?.items ?? []}
      isLoading={query.isLoading}
      isError={query.isError}
      filters={filters.value}
      onFiltersChange={filters.setValue}
    />
  );
}
```

Keep data fetching and UI rendering responsibilities understandable.

## Code Review Checklist

Review for:

- correctness;
- authorization and tenant boundaries;
- data integrity;
- error handling;
- test coverage;
- readability;
- API compatibility;
- database migration risk;
- performance;
- logging and observability;
- maintainability;
- consistency with project patterns.

Style matters, but behavior and risk matter first.

## Quality Metrics

Useful signals:

- test reliability;
- production incident frequency;
- change failure rate;
- time to understand a module;
- time to safely modify a feature;
- number of recurring bugs;
- code review cycle time;
- complexity hotspots;
- flaky tests;
- unsupported old abstractions.

Metrics should guide investigation, not replace judgment.

## Iterative Improvement Cycle

Improving code quality is an iterative process. When working with an existing codebase, a systematic approach helps avoid overwhelming changes while making meaningful progress:

1. **Identify responsibilities** in the target method or class. Understand what each code path does and which concerns it mixes (validation, authorization, data access, business rules, side effects, logging, response mapping).

2. **Extract validation** into guard clauses or dedicated validation steps. This separates precondition checks from core logic.

3. **Move business rules into domain methods** so that entities and value objects protect their own invariants. A method like `order.Approve(userId, timestamp)` is safer than setting `order.Status = "Approved"` externally.

4. **Replace primitive values with domain types** where the type prevents repeated validation and makes invalid states harder to represent. For example, `Money` instead of `decimal`, `EmailAddress` instead of `string`.

5. **Add unit tests for domain rules** to document and protect the behavior of extracted methods.

6. **Add integration tests for API boundaries** to verify that the overall endpoint behavior, authorization, and error handling work correctly together.

7. **Improve names** to reveal intent. A method called `ProcessData` communicates less than `ApproveSubmittedOrder`.

8. **Add safe logs** with structured context (identifiers, correlation ID) to make production behavior observable.

9. **Document remaining debt** so future engineers know what trade-offs remain and when to revisit them.

This cycle keeps improvement measurable and incremental. Each step builds on the previous one, and each checkpoint is independently testable and deployable.
