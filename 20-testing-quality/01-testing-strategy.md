# Testing Strategy

## Core Idea

Testing strategy decides what to test, at what level, and why.

The goal is not maximum test count. The goal is confidence with reasonable cost.

## The Test Pyramid

```text
          E2E tests
     Integration tests
        Unit tests
```

Unit tests:

- fast;
- stable;
- cheap to run;
- good for pure logic, rules, edge cases, and state transitions.

Integration tests:

- slower;
- verify boundaries between components;
- good for database, HTTP, DI, middleware, serialization, auth, and configuration.

E2E tests:

- realistic;
- expensive;
- good for critical user journeys;
- fewer in number.

## What To Test At Each Layer

### Unit Tests

Test:

- domain rules;
- calculations;
- validation;
- state transitions;
- branch logic;
- formatting rules;
- idempotency rules;
- small utilities.

Example:

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public int CustomerId { get; }
    public IReadOnlyList<OrderItem> Items => _items;
    public bool IsSubmitted { get; private set; }

    public Order(int customerId)
    {
        CustomerId = customerId;
    }

    public void AddItem(string sku, int quantity)
    {
        if (string.IsNullOrWhiteSpace(sku))
        {
            throw new DomainException("SKU is required.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("Quantity must be positive.");
        }

        _items.Add(new OrderItem(sku, quantity));
    }

    public void Submit()
    {
        if (_items.Count == 0)
        {
            throw new DomainException("Order cannot be empty.");
        }

        IsSubmitted = true;
    }
}
```

```csharp
public sealed class OrderTests
{
    [Fact]
    public void Submit_Should_Fail_When_Order_Is_Empty()
    {
        var order = new Order(customerId: 1);

        var ex = Assert.Throws<DomainException>(() => order.Submit());

        Assert.Contains("empty", ex.Message);
    }

    [Fact]
    public void AddItem_Should_Reject_Invalid_Quantity()
    {
        var order = new Order(customerId: 1);

        Assert.Throws<DomainException>(() => order.AddItem("SKU-1", 0));
    }
}
```

### Integration Tests

Test:

- HTTP endpoints;
- dependency injection;
- EF Core mapping;
- database behavior;
- authentication/authorization;
- serialization;
- middleware;
- background infrastructure wiring.

### E2E Tests

Test:

- sign in;
- create something important;
- approve or submit a workflow;
- upload files;
- payment or checkout paths;
- permission-sensitive flows;
- cross-page navigation.

## A Practical Rule Of Thumb

Use the smallest test level that can prove the behavior.

Examples:

- `validate discount math` -> unit test;
- `verify SQL query and transaction` -> integration test;
- `verify create-order flow in browser` -> E2E test.

## Test Design Heuristics

Good tests are:

- deterministic;
- independent;
- readable;
- fast enough to run often;
- focused on behavior, not implementation detail;
- easy to debug when failing.

Bad tests often:

- depend on execution order;
- rely on fixed sleep;
- mock everything;
- test private internals directly;
- duplicate implementation logic;
- are hard to understand when they fail.

## Arrange Act Assert

Use a clear structure.

```csharp
[Fact]
public void CalculateTotal_Should_Apply_Discount()
{
    // Arrange
    var calculator = new PriceCalculator();

    // Act
    var total = calculator.CalculateSubtotal(100, 0.1m);

    // Assert
    Assert.Equal(90m, total);
}
```

## Boundaries Worth Testing

High-value boundaries:

- user input validation;
- authorization checks;
- database queries and transactions;
- message publishing and processing;
- external API integration points;
- file upload/download rules;
- caching behavior;
- retry and fallback logic.

## What Not To Over-Test

Avoid spending too much energy on:

- trivial property getters and setters;
- framework code;
- generated code;
- pure plumbing that is already well covered by the platform;
- duplicated behavior that should be covered higher up.

## Test Coverage

Coverage is useful as a signal, not a goal.

Good coverage means:

- important branches are exercised;
- failure paths are tested;
- business rules are protected.

Bad coverage means:

- many lines executed but no real assertion value;
- tests that just call code without verifying outcomes;
- fragile tests written only to raise the number.

## Risk-Based Testing

Prioritize tests for:

- revenue-critical paths;
- security-sensitive paths;
- data-changing operations;
- complex logic;
- regressions from recent changes;
- modules with many bug reports.

Low-risk areas can use fewer tests.

## Example Test Matrix

For an order system:

| Area | Best Test Level |
| --- | --- |
| Amount calculation | Unit |
| Status transitions | Unit |
| Validation | Unit or integration |
| Database query correctness | Integration |
| Authenticated endpoint | Integration |
| Browser checkout flow | E2E |
| Payment provider callback | Integration |

## Test Naming

Use names that explain behavior.

Examples:

- `Submit_Should_Fail_When_Order_Is_Empty`
- `GetOrders_Should_Return_Paged_Results`
- `LoginForm_Should_Show_Error_When_Server_Returns_401`

Good names describe:

- the system behavior;
- the condition;
- the expected result.

## Practice Task

For a simple order workflow, decide which tests belong in:

1. unit tests.
2. integration tests.
3. E2E tests.

Write the answers for:

```text
order validation
order persistence
authorization
checkout flow
payment callback
error rendering in browser
```
