# Object-Oriented Programming In C#

## Core Idea

Object-oriented programming in C# is best understood as a way to organize behavior around clear boundaries. Objects hold state, but more importantly they define what operations are valid, where invariants are protected, and which collaborators are responsible for which parts of the work.

In modern .NET systems, object-oriented design rarely means building deep inheritance trees for their own sake. It more often means choosing whether logic belongs inside a domain object, inside a coordinating service, behind an interface, or in a composed policy or adapter.

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

The private list is only part of the design. The type now owns the rules of mutation. Once state transitions must respect business conditions, encapsulation becomes the difference between a robust model and a fragile bag of properties.

### Operational Consequences Of Broken Encapsulation

Encapsulation failures are not theoretical. Consider a production system where an `Order` exposes `List<OrderItem>` as a public property. A reporting module iterates the collection while a parallel promotion-application task adds a bonus item. The collection is modified during enumeration, and the `InvalidOperationException` terminates the report generation mid-flight. The root cause is not the concurrent modification itself — it is that the design allowed uncontrolled access to internal state.

A system that exposes `IReadOnlyCollection<OrderItem>` backed by `List<T>.AsReadOnly()` provides a live view over the underlying list rather than a snapshot. This distinction matters at runtime. When the read-only wrapper is created via `AsReadOnly()`, it does not copy the elements — it wraps the same backing array. Callers who hold the read-only reference observe mutations made through the owning type's methods, but they cannot initiate those mutations themselves. The encapsulation boundary is preserved: only the owning type controls the timing and validity of changes.

The live-view behavior also carries a thread-safety implication. If one thread calls `AddItem` while another enumerates `Items`, the read-only wrapper provides no synchronization. The enumeration fails with the same concurrent-modification exception. Encapsulation controls access; it does not provide thread safety. Adding thread safety requires synchronization, immutable snapshots, or concurrent collections — each a separate design decision layered on top of encapsulation.

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

The model should be strong enough to own the rules that truly define its correctness. That does not require every class to be rich or every operation to live inside a domain object — it requires the rules that constitute correctness to have a clear owner.

## Abstraction And Dependency Boundaries

Object-oriented design also appears at the level of collaboration between components. Interfaces define the boundaries that other code can depend on without knowing implementation detail.

```csharp
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct);
}
```

This abstraction allows the rest of the application to depend on the capability "send an email" rather than on SMTP commands, an SDK, or a vendor-specific API. That boundary becomes especially valuable in testing, infrastructure substitution, and long-term maintenance.

The abstraction only becomes operational once the application composes it with a concrete implementation:

```csharp
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
```

That registration step matters because an interface by itself is only a design boundary. In a dependency-injected application, the activation path is the service registration plus successful resolution at runtime or in an integration test.

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

An abstraction is useful when it preserves a meaningful boundary. An interface that exists only to wrap a single trivial implementation with no expected variability can add indirection without improving design. The value lies in the boundary, not in the interface keyword itself.

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

An equally important counterexample looks like this:

```csharp
public class SqlOrderRepository : List<Order>
{
}
```

A repository is not a kind of list. This design inherits operations that do not belong to the abstraction and creates a misleading mental model for every caller. Inheritance should communicate truth about the domain, not merely provide convenient methods.

### The Fragile Base Class Problem

A subtler and more dangerous failure occurs when a base class calls a virtual method from its constructor.

```csharp
public abstract class ReportGenerator
{
    protected ReportGenerator()
    {
        // Virtual member call in constructor — dangerous.
        Template = LoadTemplate();
    }

    protected abstract string LoadTemplate();

    public string Template { get; }
}

public sealed class PdfReportGenerator : ReportGenerator
{
    private readonly string _templatePath;

    public PdfReportGenerator(string templatePath)
    {
        _templatePath = templatePath;
    }

    protected override string LoadTemplate()
    {
        return File.ReadAllText(_templatePath);
    }
}
```

When `PdfReportGenerator` is instantiated, the base constructor runs first and calls `LoadTemplate()`. But the derived constructor has not yet executed, so `_templatePath` is still `null`. The call to `File.ReadAllText` receives a null path and throws `ArgumentNullException`. The failure is non-obvious: the derived class appears to initialize its state before the base class uses it, but the constructor execution order violates that expectation.

The runtime behavior is deterministic but surprising. Virtual dispatch resolves to the most derived override, even during base-class construction. The derived override depends on state that the derived constructor has not yet initialized. This is the fragile base class problem in its most common form: a base class that depends on derived behavior at a time when derived state is not yet valid.

A safer design removes the virtual call from the constructor:

```csharp
public abstract class ReportGenerator
{
    protected ReportGenerator(string template)
    {
        Template = template;
    }

    public string Template { get; }
}

public sealed class PdfReportGenerator : ReportGenerator
{
    public PdfReportGenerator(string templatePath)
        : base(File.ReadAllText(templatePath))
    {
    }
}
```

The derived class now resolves the template before the base constructor runs. The base class never calls virtual members on an uninitialized derived instance.

A second form of fragility occurs when a derived class breaks a base class invariant. Consider a base type that guarantees a collection is never null:

```csharp
public abstract class EntityCollection<T>
{
    protected readonly List<T> _items = new();

    public IReadOnlyList<T> Items => _items;

    public virtual void Add(T item)
    {
        _items.Add(item);
    }
}

public sealed class LoggingEntityCollection<T> : EntityCollection<T>
{
    private readonly ILogger _logger;

    public LoggingEntityCollection(ILogger logger)
    {
        _logger = logger;
    }

    public override void Add(T item)
    {
        _items.Add(item);
        _items.Add(item); // Duplicate insertion breaks the expected cardinality.
        _logger.LogInformation("Added {Item}", item);
    }
}
```

Callers of `EntityCollection<T>` expect `Add` to insert one item. The derived override inserts two. Code written against the base contract silently behaves incorrectly when passed the derived type. The Liskov substitution principle captures this requirement formally, but the operational lesson is simpler: a derived type must not weaken a base class invariant that callers rely on. `sealed` prevents this entire class of defect by prohibiting derived types from overriding behavior in the first place.

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

A fuller application slice makes that easier to see:

```csharp
public interface IPaymentClient
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct);
}

public sealed record PaymentRequest(string IdempotencyKey, decimal Amount, string Currency);
public sealed record PaymentResult(bool IsSuccess, string TransactionId, string? Error);

public sealed class StripePaymentClient : IPaymentClient
{
    public Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct)
    {
        return Task.FromResult(new PaymentResult(true, "txn_123", null));
    }
}

public sealed class LoggingPaymentClient : IPaymentClient
{
    private readonly IPaymentClient _inner;
    private readonly ILogger<LoggingPaymentClient> _logger;

    public LoggingPaymentClient(
        IPaymentClient inner,
        ILogger<LoggingPaymentClient> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct)
    {
        _logger.LogInformation(
            "Charging payment {IdempotencyKey} for {Amount} {Currency}.",
            request.IdempotencyKey,
            request.Amount,
            request.Currency);

        var result = await _inner.ChargeAsync(request, ct);

        if (!result.IsSuccess)
        {
            _logger.LogWarning(
                "Payment {IdempotencyKey} failed: {Error}.",
                request.IdempotencyKey,
                result.Error);
        }

        return result;
    }
}
```

This is still object-oriented design, but the variability sits in collaborating types rather than in a fragile inheritance hierarchy. One class owns the payment capability, another adds logging behavior, and neither has to pretend that logging is part of the core domain concept of a payment provider.

### Strategy Composition For Payment Routing

Composition supports patterns beyond simple decoration. When payment routing depends on multiple factors — transaction amount, currency, merchant risk profile — a composite router assembled from smaller strategies can replace a monolithic conditional block.

```csharp
public interface IPaymentRouter
{
    IPaymentClient Route(PaymentRequest request);
}

public sealed class AmountBasedRouter : IPaymentRouter
{
    private readonly IPaymentClient _premium;
    private readonly IPaymentClient _standard;
    private readonly decimal _threshold;

    public AmountBasedRouter(
        IPaymentClient premium,
        IPaymentClient standard,
        decimal threshold)
    {
        _premium = premium;
        _standard = standard;
        _threshold = threshold;
    }

    public IPaymentClient Route(PaymentRequest request)
    {
        return request.Amount > _threshold ? _premium : _standard;
    }
}
```

Each router implements the same contract, which means routers can be combined:

```csharp
public sealed class FallbackRouter : IPaymentRouter
{
    private readonly IPaymentRouter _primary;
    private readonly IPaymentRouter _fallback;

    public FallbackRouter(IPaymentRouter primary, IPaymentRouter fallback)
    {
        _primary = primary;
        _fallback = fallback;
    }

    public IPaymentClient Route(PaymentRequest request)
    {
        return _primary.Route(request);
        // Fallback logic invoked by caller on failure
    }
}
```

This design keeps routing rules isolated and independently testable. Adding a currency-based router or a risk-scoring router does not require modifying existing routing code — the new strategy is composed into the graph where needed.

### Composite Validation

Validation is another domain where composition frequently outperforms inheritance. Individual validation rules become composable objects rather than methods on a base class.

```csharp
public interface IValidationRule<T>
{
    ValidationError? Validate(T target);
}

public sealed record ValidationError(string Code, string Description);

public sealed class CompositeValidator<T> : IValidationRule<T>
{
    private readonly IReadOnlyList<IValidationRule<T>> _rules;

    public CompositeValidator(IEnumerable<IValidationRule<T>> rules)
    {
        _rules = rules.ToList();
    }

    public ValidationError? Validate(T target)
    {
        foreach (var rule in _rules)
        {
            var error = rule.Validate(target);
            if (error is not null)
            {
                return error;
            }
        }

        return null;
    }
}

public sealed class OrderTotalPositiveRule : IValidationRule<Order>
{
    public ValidationError? Validate(Order target)
    {
        return target.Total <= 0
            ? new ValidationError("TOTAL_NOT_POSITIVE", "Order total must exceed zero.")
            : null;
    }
}

public sealed class OrderItemsNotEmptyRule : IValidationRule<Order>
{
    public ValidationError? Validate(Order target)
    {
        return target.Items.Count == 0
            ? new ValidationError("NO_ITEMS", "Order must contain at least one item.")
            : null;
    }
}
```

Each rule is a small, testable unit. Composite validators nest to build multi-layered checks. Replacing inheritance-based validation with composed rules avoids the tension between base-class default behavior and derived-class overrides that plagues many validation hierarchies.

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

## The Sealed Keyword: Design Safety And Runtime Performance

The `sealed` keyword in C# prevents further inheritance. It is both a design tool and, increasingly, a performance mechanism.

### Sealed As A Design Default

Marking a class `sealed` communicates that the type is not designed for inheritance. This is not pessimism about future extension — it is an honest statement about the design surface. Inheritance is a contract, and types not explicitly designed for it rarely uphold that contract by accident. Virtual methods, protected state, constructor behavior, and `Dispose` semantics all interact with inheritance in ways that require deliberate design. A class that is not designed for derivation should be sealed.

The .NET team has moved in this direction: `record struct` types cannot be inherited, and the broader ecosystem increasingly treats unsealed classes as an explicit design choice rather than a default.

### JIT Devirtualization

In .NET 8 and later, `sealed` provides a measurable runtime benefit through JIT devirtualization (covered in the IL, JIT, and Native AOT chapter). When the JIT compiler sees a virtual method call on an instance of a sealed type, it can sometimes resolve the call at compile time and emit a direct call instruction rather than a virtual dispatch.

```csharp
public interface IPaymentClient
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct);
}

public sealed class StripePaymentClient : IPaymentClient
{
    public Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct)
    {
        // Implementation.
    }
}

// Usage site:
var client = new StripePaymentClient();
await client.ChargeAsync(request, ct); // JIT can devirtualize.
```

The JIT knows the concrete type is `StripePaymentClient` and that the class is sealed, so no further derived override can exist. A direct call replaces the virtual dispatch, reducing indirection and enabling further inlining. This optimization is most impactful in hot paths — tight loops, high-throughput middleware, or performance-sensitive library code. The benefit is modest in most application code but accumulates across a large codebase.

Devirtualization also applies to interface calls when the concrete type is known and sealed. The combination of sealed types and modern JIT capabilities means that abstraction no longer carries an automatic performance penalty.

### Limits Of Sealing

Sealing prevents subclassing that may be needed for testing. Some test frameworks rely on the ability to derive from a class to create test doubles, though modern .NET testing increasingly favors interface-based mocking. A class exposed as a public API in a library may legitimately need to remain unsealed if callers are expected to customize behavior through inheritance. The decision to seal is a judgment about the type's intended role: is this a leaf type that implements a contract, or a base type that defines a family?

## Practical Design Judgment

Good object-oriented design in C# places responsibility according to the shape of the problem.

If a rule exists only to protect one object's state, the object itself is often the right home. If behavior varies by policy, provider, or environment, an interface plus composition may be more appropriate. If several types genuinely share state or semantics, an abstract base can be justified. If the main problem is orchestration across persistence, messaging, and external APIs, an application service is usually the right unit of composition.

This perspective explains why certain common patterns fail. Deep inheritance hierarchies promise reuse but frequently obscure ownership and make change harder. Pure data classes paired with oversized services centralize logic in the wrong place. Blanket interface usage can create unnecessary indirection. These failures are not about using too much or too little object orientation — they are about placing responsibility without regard to the problem's shape.
