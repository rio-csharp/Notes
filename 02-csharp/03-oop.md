# Object-Oriented Programming In C#

## Core Idea

Object-oriented programming in C# is best understood as a way to organize behavior around clear boundaries. Objects hold state, but more importantly they define what operations are valid, where invariants are protected, and which collaborators are responsible for which parts of the work.

In modern .NET systems, object-oriented design rarely means building deep inheritance trees for their own sake. It more often means choosing whether logic belongs inside a domain object, inside a coordinating service, behind an interface, or in a composed policy or adapter. This chapter focuses on those practical design decisions.

## Encapsulation And Invariants

Encapsulation is the core discipline of object-oriented design. It means a type controls how its state changes so that invalid transitions are difficult or impossible to perform accidentally.

```csharp
public sealed class Order
{
    public List<OrderItem> Items { get; set; } = new();
}
```

This design exposes raw mutation. Any caller can add, remove, or replace items without regard to order status, pricing rules, or consistency checks.

```csharp
var order = new Order();
order.Items.Add(new OrderItem());
order.Items.Clear();
```

A more object-oriented design exposes business operations instead of uncontrolled structure:

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public OrderStatus Status { get; private set; } = OrderStatus.Draft;
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public void AddItem(OrderItem item)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Cannot change a submitted order.");
        }

        _items.Add(item);
    }
}
```

The private list is not the important part. The important part is that the type now owns the rules of mutation. Once state transitions must respect real business conditions, encapsulation becomes the difference between a robust model and a fragile bag of properties.

## Objects As Behavioral Models

A recurring problem in application code is the anemic model: classes hold data while essential rules are scattered across services, handlers, controllers, and repositories. That style can be acceptable for thin CRUD applications, but it becomes harder to manage as business rules accumulate.

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public OrderStatus Status { get; set; }
    public decimal Total { get; set; }
}
```

With this shape, any caller can set `Status` or `Total` independently, and the codebase must rely on convention rather than the type system to preserve meaning.

A richer model localizes the critical rules:

```csharp
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

This does not mean every class must be rich or domain-driven. It means the model should be strong enough to own the rules that truly define its correctness.

## Abstraction And Dependency Boundaries

Object-oriented design also appears at the level of collaboration between components. Interfaces define the boundaries that other code can depend on without knowing implementation detail.

```csharp
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct);
}
```

This abstraction allows the rest of the application to depend on the capability "send an email" rather than on SMTP commands, an SDK, or a vendor-specific API. That boundary becomes especially valuable in testing, infrastructure substitution, and long-term maintenance.

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

An abstraction is useful when it preserves a meaningful boundary. It is not useful merely because a code style prefers "everything behind an interface." An interface that exists only to wrap a single trivial implementation with no variability can add indirection without improving design.

## Polymorphism As Replaceable Behavior

Polymorphism is the ability to interact with different implementations through a common contract.

```csharp
public interface IDiscountStrategy
{
    CustomerType CustomerType { get; }
    decimal Apply(decimal total);
}
```

```csharp
public sealed class VipDiscountStrategy : IDiscountStrategy
{
    public CustomerType CustomerType => CustomerType.Vip;

    public decimal Apply(decimal total)
    {
        return total * 0.9m;
    }
}
```

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
```

This is a good use of polymorphism because the behavior genuinely varies and may grow over time. It avoids a central conditional block that expands every time a new customer category is introduced. The trade-off is additional types and indirection, so polymorphism is most valuable where behavior changes independently and extension is expected.

## Inheritance And Its Limits

Inheritance remains part of C#, but it is often overused by developers who are really trying to achieve reuse rather than model a true subtype relationship.

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

This is mechanically valid, but it is not automatically the best design. An interface may be a better fit if the goal is simply to express a capability. Inheritance becomes more natural when the base type represents a real shared concept with meaningful common state or behavior:

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

The common timestamp belongs naturally to all domain events, so the base type expresses a real conceptual family.

The counterexample is just as important:

```csharp
public class SqlOrderRepository : List<Order>
{
}
```

A repository is not a kind of list. This design inherits operations that do not belong to the abstraction and creates a misleading mental model for every caller. Inheritance should communicate truth about the domain, not merely provide convenient methods.

## Interface Versus Abstract Class

Interfaces and abstract classes solve different problems.

Interfaces are usually the right choice when the goal is to define a capability, boundary, or extension point:

```csharp
public interface IPaymentClient
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct);
}
```

Abstract classes are more appropriate when several derived types genuinely share base implementation, protected helpers, or state:

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

The choice matters because inheritance is a long-term commitment. An abstract base class fixes part of the hierarchy permanently and consumes the type's one base-class slot. Interfaces remain more flexible when the purpose is collaboration rather than shared implementation.

## Composition Over Inheritance

Composition means building behavior by combining collaborators instead of subclassing existing types.

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

This decorator-style design adds caching without pretending that a cached client is a special subtype of a concrete payment client implementation. Composition is often easier to test, easier to rearrange, and less likely to create brittle hierarchies.

It is also a good fit for cross-cutting concerns such as caching, retries, metrics, authorization, and tracing, because those concerns often need to wrap behavior rather than redefine a base concept.

## Coordinating Services Versus Domain Objects

Not all important logic belongs inside domain objects. Many applications need coordinating services that load data, orchestrate dependencies, persist changes, and invoke external systems. The design question is not whether services are good or bad. The question is which layer should own which rule.

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

This service coordinates the use case, but it does not decide the core rule for when an order may be submitted. That rule remains inside `Order`. This separation is often the healthiest balance in business applications: domain objects protect their invariants, while services compose workflows across dependencies and boundaries.

## Practical Design Judgment

Good object-oriented design in C# is less about obeying slogans and more about placing responsibility carefully.

If a rule exists only to protect one object's state, the object itself is often the right home. If behavior varies by policy, provider, or environment, an interface plus composition may be more appropriate. If several types genuinely share state or semantics, an abstract base can be justified. If the main problem is orchestration across persistence, messaging, and external APIs, an application service is usually the right unit of composition.

This perspective also explains why some common patterns fail. Deep inheritance hierarchies often grow because they promise reuse, but they frequently obscure ownership and make change harder. Pure data classes paired with oversized services centralize logic in the wrong place. Blanket interface usage can create unnecessary indirection. None of these mistakes come from using too much or too little object orientation in the abstract. They come from placing responsibility without regard to the actual shape of the problem.
