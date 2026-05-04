# Domain-Driven Design

## Core Idea

Domain-Driven Design (DDD) is an approach to building software around the business domain.

Chinese notes:

- `domain`: 业务领域.
- `bounded context`: 限界上下文.
- `aggregate`: 聚合.
- `ubiquitous language`: 统一语言.

DDD is most useful when business rules are complex.

It is not mainly about folder structure. It is about modeling the business accurately.

## When DDD Helps

DDD helps when:

- business rules are complex;
- teams misunderstand domain language;
- the system has many workflows and invariants;
- different departments use the same words differently;
- long-term maintainability matters.

DDD may be overkill for:

- simple CRUD admin pages;
- prototypes;
- small apps with little business logic.

## Ubiquitous Language

The team should use the same language in:

- conversations;
- code;
- tests;
- documentation;
- database concepts where reasonable.

Example:

If the business says "Order Approval", code should not call it "StatusChangeThing".

## Entity

An entity has identity.

```csharp
public sealed class Customer
{
    public int Id { get; private set; }
    public string Name { get; private set; }

    public Customer(int id, string name)
    {
        Id = id;
        Name = name;
    }
}
```

Two customers with the same name are not the same customer.

## Value Object

A value object is defined by its values, not identity.

```csharp
public sealed record Money(decimal Amount, string Currency)
{
    public Money Add(Money other)
    {
        if (Currency != other.Currency)
        {
            throw new DomainException("Currency mismatch.");
        }

        return new Money(Amount + other.Amount, Currency);
    }
}
```

Good value objects are usually immutable.

## Aggregate And Aggregate Root

An aggregate is a consistency boundary.

The aggregate root controls changes.

Example:

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public int Id { get; private set; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public void AddItem(int productId, int quantity, Money price)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be changed.");
        }

        _items.Add(new OrderItem(productId, quantity, price));
    }

    public void Submit()
    {
        if (!_items.Any())
        {
            throw new DomainException("Cannot submit an empty order.");
        }

        Status = OrderStatus.Submitted;
    }
}
```

Do not allow external code to freely modify `_items`.

## Aggregate Boundary Rules

Aggregate design is mostly about consistency.

Good aggregate rules:

- modify child entities only through the aggregate root;
- enforce invariants inside the aggregate;
- reference other aggregates by ID instead of object graph when possible;
- keep aggregate size small enough to load and save efficiently;
- use domain events for side effects outside the aggregate boundary.

Example:

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public OrderId Id { get; private set; }
    public CustomerId CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public void ChangeItemQuantity(ProductId productId, int quantity)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be changed.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("Quantity must be positive.");
        }

        var item = _items.SingleOrDefault(x => x.ProductId == productId);

        if (item is null)
        {
            throw new DomainException("Order item not found.");
        }

        item.ChangeQuantity(quantity);
    }
}
```

Outside code should not do this:

```csharp
order.Items.First().Quantity = -100;
```

The aggregate root exists to prevent invalid state.

## Strongly Typed IDs

Strongly typed IDs reduce accidental ID mix-ups.

```csharp
public readonly record struct OrderId(Guid Value);
public readonly record struct CustomerId(Guid Value);
public readonly record struct ProductId(Guid Value);
```

This prevents mistakes like passing a `CustomerId` where an `OrderId` is expected.

```csharp
public Task<Order?> GetByIdAsync(OrderId orderId, CancellationToken ct)
{
    // implementation
}
```

## Value Object With Validation

```csharp
public sealed record EmailAddress
{
    public string Value { get; }

    public EmailAddress(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException("Email is required.");
        }

        if (!value.Contains('@'))
        {
            throw new DomainException("Email format is invalid.");
        }

        Value = value.Trim().ToLowerInvariant();
    }

    public override string ToString() => Value;
}
```

A value object is a good place for rules that belong to a concept, not a specific use case.

## Domain Service

Use domain service when logic does not naturally belong to one entity.

```csharp
public sealed class OrderPricingService
{
    public Money CalculateTotal(Order order, DiscountPolicy policy)
    {
        var subtotal = order.Items
            .Select(i => i.Price.Amount * i.Quantity)
            .Sum();

        var discounted = policy.Apply(subtotal);
        return new Money(discounted, "USD");
    }
}
```

## Domain Event

Domain events describe something meaningful that happened.

```csharp
public sealed record OrderSubmittedDomainEvent(
    int OrderId,
    DateTimeOffset SubmittedAt);
```

Use domain events for:

- decoupling side effects;
- audit;
- integration event creation;
- notification triggers.

## Repository In DDD

A repository represents collection-like access to aggregates.

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}
```

Avoid repositories that expose every database operation.

Risky:

```csharp
public interface IGenericRepository<T>
{
    IQueryable<T> Query();
    Task<T?> FindAsync(object id);
    void Add(T entity);
    void Delete(T entity);
}
```

Why risky:

- leaks query composition everywhere;
- does not express domain intent;
- often becomes a thin wrapper around EF Core;
- makes aggregate boundaries less clear.

Prefer repositories that speak in aggregate terms.

## EF Core Mapping Example

DDD domain models can still be mapped with EF Core.

```csharp
public sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasConversion(
                id => id.Value,
                value => new OrderId(value));

        builder.Property(x => x.CustomerId)
            .HasConversion(
                id => id.Value,
                value => new CustomerId(value));

        builder.OwnsMany(x => x.Items, item =>
        {
            item.ToTable("OrderItems");
            item.WithOwner().HasForeignKey("OrderId");
            item.HasKey("Id");

            item.Property(x => x.ProductId)
                .HasConversion(
                    id => id.Value,
                    value => new ProductId(value));

            item.OwnsOne(x => x.Price, money =>
            {
                money.Property(x => x.Amount).HasColumnName("UnitPrice");
                money.Property(x => x.Currency).HasColumnName("Currency");
            });
        });
    }
}
```

Mapping belongs in infrastructure. The domain model does not need to know the table layout.

## Bounded Context

A bounded context defines where a model is valid.

Example:

`Customer` in Sales:

- lead status;
- sales owner;
- pipeline stage.

`Customer` in Billing:

- invoice address;
- payment terms;
- tax ID.

They may not be the same model.

## Context Mapping

Different bounded contexts still need to communicate.

Common relationships:

| Relationship | Meaning |
|---|---|
| Customer/Supplier | one context depends on another context's contract |
| Conformist | downstream accepts upstream model as-is |
| Anti-corruption layer | downstream protects its model through translation |
| Shared kernel | two contexts share a small common model |

Example anti-corruption layer:

```csharp
public sealed class BillingCustomerTranslator
{
    public BillingCustomer ToBillingCustomer(SalesCustomerDto customer)
    {
        return new BillingCustomer(
            new BillingCustomerId(customer.Id),
            customer.LegalName,
            customer.InvoiceEmail,
            customer.TaxNumber);
    }
}
```

The Billing context does not blindly reuse the Sales customer model.

## Knowledge Checks

### What is DDD?

DDD is an approach to software design that focuses on modeling complex business domains using shared language, bounded contexts, entities, value objects, aggregates, repositories, and domain events.

### What is an aggregate?

An aggregate is a consistency boundary. It groups related entities and value objects, and the aggregate root controls changes to protect business invariants.

### Entity vs Value Object?

Entity has identity and lifecycle. Value object is defined by its values and is usually immutable.

### When should you not use DDD?

If the application is mostly simple CRUD with little business complexity, full DDD may add unnecessary ceremony.

## Common Mistakes

- Treating DDD as folder naming only.
- Anemic domain model with all rules in services.
- Huge aggregates that load too much data.
- Ignoring bounded contexts.
- Using generic repository everywhere.
- Over-engineering simple CRUD.

## Practice Task

Model an order domain:

1. `Order` aggregate root;
2. `OrderItem` entity;
3. `Money` value object;
4. `OrderSubmittedDomainEvent`;
5. rule: cannot submit empty order;
6. rule: cannot change submitted order;
7. unit tests for domain behavior.
