# Object-Oriented Programming In C#

## Core Idea

Object-oriented programming models software using objects that combine data and behavior.

Chinese notes:

- `encapsulation`: 封装.
- `inheritance`: 继承.
- `polymorphism`: 多态.
- `abstraction`: 抽象.

## Encapsulation

Encapsulation protects internal state.

Encapsulation does not mean "make everything private and inaccessible." It means the object controls how its state changes.

Bad:

```csharp
public sealed class Order
{
    public List<OrderItem> Items { get; set; } = new();
}
```

Why bad:

```csharp
var order = new Order();
order.Items.Add(new OrderItem());
order.Items.Clear();
```

Any caller can bypass order rules. If submitted orders should not change, this design cannot enforce that rule.

Better:

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public void AddItem(OrderItem item)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Cannot change submitted order.");
        }

        _items.Add(item);
    }
}
```

Better usage:

```csharp
var order = new Order();
order.AddItem(new OrderItem(productId: 1, quantity: 2));
```

Now all item changes go through `AddItem`, so the class can enforce order status, quantity rules, duplicate item rules, and total recalculation.

Practical explanation:

> Encapsulation is about protecting invariants. I expose operations that make sense for the domain instead of exposing internal collections and setters directly.

## Inheritance

```csharp
public abstract class NotificationSender
{
    public abstract Task SendAsync(string message, CancellationToken ct);
}

public sealed class EmailSender : NotificationSender
{
    public override Task SendAsync(string message, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

Use inheritance carefully. Prefer composition when behavior varies independently.

Good inheritance example:

```csharp
public abstract class DomainEvent
{
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

public sealed class OrderCreatedEvent : DomainEvent
{
    public int OrderId { get; }

    public OrderCreatedEvent(int orderId)
    {
        OrderId = orderId;
    }
}
```

This can be reasonable because all domain events share a real base concept.

Risky inheritance example:

```csharp
public class SqlOrderRepository : List<Order>
{
}
```

This is wrong because a repository is not a kind of list. It may reuse methods, but it creates a false relationship.

## Polymorphism

```csharp
public interface IDiscountStrategy
{
    decimal Apply(decimal total);
}

public sealed class VipDiscountStrategy : IDiscountStrategy
{
    public decimal Apply(decimal total) => total * 0.9m;
}
```

Calling code depends on abstraction:

```csharp
public decimal Calculate(decimal total, IDiscountStrategy strategy)
{
    return strategy.Apply(total);
}
```

More complete example:

```csharp
public sealed class DiscountService
{
    private readonly IReadOnlyDictionary<CustomerType, IDiscountStrategy> _strategies;

    public DiscountService(IEnumerable<IDiscountStrategy> strategies)
    {
        _strategies = strategies.ToDictionary(x => x.CustomerType);
    }

    public decimal ApplyDiscount(CustomerType customerType, decimal total)
    {
        return _strategies[customerType].Apply(total);
    }
}

public interface IDiscountStrategy
{
    CustomerType CustomerType { get; }
    decimal Apply(decimal total);
}
```

Why it matters:

> Polymorphism lets you add a new discount strategy without rewriting a large `switch` in the service. The trade-off is more types and indirection, so it is worth it when behavior genuinely varies.

## Interface vs Abstract Class

Interface:

- defines capability;
- supports multiple interfaces;
- good for contracts and DI.

Abstract class:

- can share base implementation;
- can hold state;
- single inheritance only.

Interface example for DI:

```csharp
public interface IPaymentClient
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct);
}
```

Abstract class example for shared base behavior:

```csharp
public abstract class Entity
{
    private readonly List<IDomainEvent> _domainEvents = new();

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents;

    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }
}
```

Decision rule:

> Use an interface for a capability or dependency boundary. Use an abstract class when derived types truly share state or implementation.

## Composition Over Inheritance

Instead of:

```csharp
public class CachedPaymentClient : PaymentClient
{
}
```

Prefer:

```csharp
public sealed class CachedPaymentClient : IPaymentClient
{
    private readonly IPaymentClient _inner;
}
```

This enables decorator pattern.

Complete decorator example:

```csharp
public sealed class CachedPaymentClient : IPaymentClient
{
    private readonly IPaymentClient _inner;
    private readonly IMemoryCache _cache;

    public CachedPaymentClient(IPaymentClient inner, IMemoryCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct)
    {
        var key = $"payment:{request.IdempotencyKey}";

        if (_cache.TryGetValue(key, out PaymentResult? cached))
        {
            return cached!;
        }

        var result = await _inner.ChargeAsync(request, ct);
        _cache.Set(key, result, TimeSpan.FromMinutes(10));
        return result;
    }
}
```

This wraps behavior around another implementation without subclassing it.

## Abstraction

Abstraction means exposing the essential idea and hiding unnecessary details.

Example:

```csharp
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct);
}
```

The application service does not need to know whether email is sent by SMTP, SendGrid, Azure Communication Services, or a fake test sender.

Usage:

```csharp
public sealed class OrderNotificationService
{
    private readonly IEmailSender _emailSender;

    public OrderNotificationService(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }

    public Task NotifyApprovedAsync(Order order, CancellationToken ct)
    {
        return _emailSender.SendAsync(
            order.CustomerEmail,
            "Order approved",
            $"Order {order.Id} was approved.",
            ct);
    }
}
```

Key point:

> Abstraction is valuable when it reduces coupling or hides details that should not matter to the caller. It is harmful when it creates generic layers with no real purpose.

## Complete Example: Order Domain Model

This example combines encapsulation, abstraction, and polymorphism in one small domain model.

```csharp
public enum OrderStatus
{
    Draft,
    Submitted,
    Cancelled
}

public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public int Id { get; }
    public OrderStatus Status { get; private set; } = OrderStatus.Draft;
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public Order(int id)
    {
        Id = id;
    }

    public void AddItem(int productId, int quantity, decimal unitPrice)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be changed.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("Quantity must be greater than zero.");
        }

        _items.Add(new OrderItem(productId, quantity, unitPrice));
    }

    public void Submit(IPricingPolicy pricingPolicy)
    {
        if (_items.Count == 0)
        {
            throw new DomainException("Cannot submit an empty order.");
        }

        var total = pricingPolicy.CalculateTotal(_items);

        if (total <= 0)
        {
            throw new DomainException("Order total must be greater than zero.");
        }

        Status = OrderStatus.Submitted;
    }
}

public sealed record OrderItem(int ProductId, int Quantity, decimal UnitPrice)
{
    public decimal LineTotal => Quantity * UnitPrice;
}
```

The pricing rule is an abstraction:

```csharp
public interface IPricingPolicy
{
    decimal CalculateTotal(IEnumerable<OrderItem> items);
}
```

Different implementations can represent different business rules:

```csharp
public sealed class StandardPricingPolicy : IPricingPolicy
{
    public decimal CalculateTotal(IEnumerable<OrderItem> items)
    {
        return items.Sum(item => item.LineTotal);
    }
}

public sealed class DiscountPricingPolicy : IPricingPolicy
{
    private readonly decimal _discountRate;

    public DiscountPricingPolicy(decimal discountRate)
    {
        _discountRate = discountRate;
    }

    public decimal CalculateTotal(IEnumerable<OrderItem> items)
    {
        var subtotal = items.Sum(item => item.LineTotal);
        return subtotal * (1 - _discountRate);
    }
}
```

Usage:

```csharp
var order = new Order(id: 1001);
order.AddItem(productId: 10, quantity: 2, unitPrice: 25m);
order.AddItem(productId: 20, quantity: 1, unitPrice: 50m);

IPricingPolicy pricingPolicy = new DiscountPricingPolicy(0.1m);
order.Submit(pricingPolicy);

Console.WriteLine(order.Status); // Submitted
```

What this example demonstrates:

- `Order` protects its own invariants;
- callers cannot mutate `_items` directly;
- pricing behavior can change without changing `Order`;
- exceptions represent broken domain rules;
- the model uses behavior, not only data containers.

## Complete Example: Application Service With Dependencies

Object-oriented design is not only about domain objects. It also appears in application services that coordinate dependencies.

```csharp
public sealed class SubmitOrderService
{
    private readonly IOrderRepository _orders;
    private readonly IPricingPolicy _pricingPolicy;
    private readonly IEmailSender _emailSender;

    public SubmitOrderService(
        IOrderRepository orders,
        IPricingPolicy pricingPolicy,
        IEmailSender emailSender)
    {
        _orders = orders;
        _pricingPolicy = pricingPolicy;
        _emailSender = emailSender;
    }

    public async Task SubmitAsync(int orderId, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(orderId, ct);

        if (order is null)
        {
            throw new NotFoundException($"Order {orderId} was not found.");
        }

        order.Submit(_pricingPolicy);

        await _orders.SaveAsync(order, ct);
        await _emailSender.SendAsync(
            to: "customer@example.com",
            subject: "Order submitted",
            body: $"Order {order.Id} was submitted.",
            ct);
    }
}
```

Dependency contracts:

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(int id, CancellationToken ct);
    Task SaveAsync(Order order, CancellationToken ct);
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct);
}
```

This service coordinates a use case, but the order still owns the rule "when can an order be submitted?"

## Review Questions

### What are the four OOP principles?

> Encapsulation, inheritance, polymorphism, and abstraction.

### Interface vs abstract class?

> Interface defines a contract/capability. Abstract class can provide shared state and implementation. I use interfaces for dependency boundaries and abstract classes when there is a real shared base behavior.

### Why composition over inheritance?

> Composition is usually more flexible and avoids fragile inheritance hierarchies. It lets behavior be combined through dependencies.

### What is encapsulation in a real project?

> In an order system, I do not expose `List<OrderItem>` publicly. I expose methods like `AddItem`, `Submit`, or `Cancel`, so the `Order` class can enforce business rules.

### When is inheritance appropriate?

> Inheritance is appropriate when there is a true "is-a" relationship and shared behavior belongs in a base type. If the goal is only code reuse, composition is usually safer.

### What is an anemic domain model?

> It is a model where classes mostly contain data and little behavior, while business rules are scattered in services. It can be acceptable for simple CRUD, but risky for complex domains because invariants are easy to bypass.

## Common Mistakes

### Mistake: Deep inheritance hierarchy.

Why it is wrong:

> Deep inheritance makes behavior hard to trace and changes risky because a base-class change can affect many subclasses.

Better answer:

> Prefer shallow inheritance and composition when behavior varies.

### Mistake: Anemic classes with no behavior.

Why it is wrong:

> If domain classes only contain data and all rules live in services, business invariants can be scattered and easy to bypass.

Better answer:

> Put core invariants and behavior close to the domain model when it improves correctness.

### Mistake: Public mutable collections.

Why it is wrong:

> External code can modify the collection without enforcing business rules.

Better answer:

> Expose read-only views and provide methods like `AddItem` or `RemoveItem` that protect invariants.

### Mistake: Interfaces with too many responsibilities.

Why it is wrong:

> Large interfaces force implementers to depend on methods they do not need, violating interface segregation.

Better answer:

> Keep interfaces focused on one role or use case.

### Mistake: Using inheritance just for code reuse.

Why it is wrong:

> Inheritance creates an "is-a" relationship and tight coupling. If the relationship is only shared code, composition is often clearer.

Better answer:

> Use inheritance for true polymorphism; use composition for reusable behavior.
