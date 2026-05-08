# Clean Architecture

## Core Idea

Clean Architecture is an approach that keeps business logic independent from frameworks, databases, and UI details.

The dependency rule:

```text
Outer layers depend on inner layers.
Inner layers do not depend on outer layers.
```

Typical layers:

```text
Presentation
Application
Domain
Infrastructure
```

## Layer Responsibilities

### Domain Layer

Contains core business rules.

Examples:

- entities;
- value objects;
- domain events;
- business invariants;
- domain services.

Domain should not depend on EF Core, ASP.NET Core, or React.

### Application Layer

Coordinates use cases.

Examples:

- command handlers;
- query handlers;
- DTOs;
- validation;
- interfaces for infrastructure;
- transaction boundaries.

### Infrastructure Layer

Implements technical details.

Examples:

- EF Core repositories;
- email sender;
- payment client;
- file storage;
- Kafka producer;
- Redis cache.

### Presentation Layer

Exposes the application to the outside world.

Examples:

- ASP.NET Core controllers;
- Minimal APIs;
- GraphQL endpoints;
- background job entry points.

## Example Folder Structure

```text
src
  MyApp.Api
  MyApp.Application
  MyApp.Domain
  MyApp.Infrastructure
tests
  MyApp.UnitTests
  MyApp.IntegrationTests
```

## Domain Example

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public int Id { get; private set; }
    public int CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public decimal Total => _items.Sum(i => i.Quantity * i.UnitPrice);

    private Order()
    {
    }

    public Order(int customerId)
    {
        CustomerId = customerId;
        Status = OrderStatus.Draft;
    }

    public void AddItem(int productId, int quantity, decimal unitPrice)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be changed.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("Quantity must be positive.");
        }

        _items.Add(new OrderItem(productId, quantity, unitPrice));
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

## Application Use Case

```csharp
public sealed record CreateOrderCommand(
    int CustomerId,
    IReadOnlyList<CreateOrderItem> Items);

public sealed record CreateOrderItem(
    int ProductId,
    int Quantity,
    decimal UnitPrice);

public sealed class CreateOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IUnitOfWork _unitOfWork;

    public CreateOrderHandler(IOrderRepository orders, IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _unitOfWork = unitOfWork;
    }

    public async Task<int> Handle(CreateOrderCommand command, CancellationToken ct)
    {
        var order = new Order(command.CustomerId);

        foreach (var item in command.Items)
        {
            order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
        }

        order.Submit();

        await _orders.AddAsync(order, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return order.Id;
    }
}
```

## Infrastructure Implementation

```csharp
public sealed class EfOrderRepository : IOrderRepository
{
    private readonly AppDbContext _dbContext;

    public EfOrderRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task AddAsync(Order order, CancellationToken ct)
    {
        _dbContext.Orders.Add(order);
        return Task.CompletedTask;
    }
}
```

## API Controller

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly CreateOrderHandler _handler;

    public OrdersController(CreateOrderHandler handler)
    {
        _handler = handler;
    }

    [HttpPost]
    public async Task<ActionResult> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var command = new CreateOrderCommand(
            request.CustomerId,
            request.Items.Select(i => new CreateOrderItem(
                i.ProductId,
                i.Quantity,
                i.UnitPrice)).ToList());

        var orderId = await _handler.Handle(command, ct);

        return CreatedAtAction(nameof(GetById), new { id = orderId }, null);
    }
}
```

## Benefits

- business logic is testable;
- infrastructure can be replaced;
- controllers stay thin;
- dependencies are clear;
- complex systems stay maintainable.

## Trade-offs

Clean Architecture is not free.

Costs:

- more projects/files;
- more abstractions;
- more mapping;
- slower initial development for small apps;
- risk of over-engineering.

Clean Architecture is most valuable when business complexity and long-term maintainability justify the structure. For small CRUD apps, a simpler layered architecture may be enough. The important principle is dependency direction and separation of concerns, not ceremony.

## Project References

Clean Architecture is easier to enforce when project references match the dependency rule.

Example:

```text
MyApp.Domain
  references: none

MyApp.Application
  references: MyApp.Domain

MyApp.Infrastructure
  references: MyApp.Application, MyApp.Domain

MyApp.Api
  references: MyApp.Application, MyApp.Infrastructure
```

The domain project should not reference:

```text
Microsoft.EntityFrameworkCore
Microsoft.AspNetCore.Mvc
StackExchange.Redis
Confluent.Kafka
```

If the domain needs persistence, messaging, or HTTP details, it usually means the boundary is leaking.

## Dependency Inversion Example

The application layer defines what it needs.

```csharp
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public sealed record EmailMessage(
    string To,
    string Subject,
    string Body);
```

Infrastructure implements it.

```csharp
using MailKit.Net.Smtp;
using MimeKit;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly SmtpOptions _options;

    public SmtpEmailSender(IOptions<SmtpOptions> options)
    {
        _options = options.Value;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        using var client = new SmtpClient();
        await client.ConnectAsync(
            _options.Host, _options.Port,
            MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable, ct);
        await client.AuthenticateAsync(
            _options.Username, _options.Password, ct);

        var mimeMessage = new MimeMessage();
        mimeMessage.From.Add(new MailboxAddress(_options.From));
        mimeMessage.To.Add(new MailboxAddress(message.To));
        mimeMessage.Subject = message.Subject;
        mimeMessage.Body = new TextPart("plain") { Text = message.Body };

        await client.SendAsync(mimeMessage, ct);
        await client.DisconnectAsync(true, ct);
    }
}
```

The .NET `SmtpClient` class is deprecated and does not support modern protocols (TLS 1.2+, OAuth2). The recommended alternative is `MailKit` (NuGet: `MailKit`), as shown here. The dependency inversion principle remains unchanged: the application layer still depends only on `IEmailSender`.

API composes the implementation:

The MailKit-based sender requires SMTP credentials. Configuration is bound from `appsettings.json`:

```json
{
  "Smtp": {
    "Host": "smtp.example.com",
    "Port": 587,
    "Username": "service@example.com",
    "Password": ""
  }
}
```

```csharp
builder.Services.Configure<SmtpOptions>(
    builder.Configuration.GetSection("Smtp"));

builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
```

The `SmtpOptions` class is a simple options POCO with `Host`, `Port`, `Username`, and `Password` properties. The composition root wires everything together; the application layer never sees these details.

The application layer depends on `IEmailSender`, not SMTP.

## Use Case With Validation

Validation that belongs to input shape can live in the application layer.

```csharp
public sealed record CreateOrderCommand(
    int CustomerId,
    IReadOnlyList<CreateOrderItem> Items);

public sealed class CreateOrderCommandValidator
    : AbstractValidator<CreateOrderCommand>
{
    public CreateOrderCommandValidator()
    {
        RuleFor(x => x.CustomerId).GreaterThan(0);

        RuleFor(x => x.Items)
            .NotEmpty()
            .WithMessage("At least one item is required.");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(x => x.ProductId).GreaterThan(0);
            item.RuleFor(x => x.Quantity).GreaterThan(0);
            item.RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        });
    }
}
```

Domain still protects business invariants. Application validation improves input feedback; domain validation protects correctness.

## Domain Events Without Framework Coupling

Domain entities can record domain events without depending on MediatR or a message broker.

```csharp
public interface IDomainEvent
{
    DateTimeOffset OccurredAt { get; }
}

public abstract class Entity
{
    private readonly List<IDomainEvent> _domainEvents = new();

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }

    public void ClearDomainEvents()
    {
        _domainEvents.Clear();
    }
}
```

```csharp
public sealed record OrderSubmittedDomainEvent(
    int OrderId,
    DateTimeOffset OccurredAt) : IDomainEvent;
```

```csharp
public sealed class Order : Entity
{
    public int Id { get; private set; }
    public OrderStatus Status { get; private set; }

    public void Submit(DateTimeOffset now)
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be submitted.");
        }

        Status = OrderStatus.Submitted;
        AddDomainEvent(new OrderSubmittedDomainEvent(Id, now));
    }
}
```

Infrastructure or application code can dispatch those events after `SaveChanges`.

## Mapping At Boundaries

Mapping keeps external contracts separate from internal models.

```csharp
public sealed record CreateOrderRequest(
    int CustomerId,
    IReadOnlyList<CreateOrderItemRequest> Items);

public sealed record CreateOrderItemRequest(
    int ProductId,
    int Quantity,
    decimal UnitPrice);
```

```csharp
public static class OrderRequestMapper
{
    public static CreateOrderCommand ToCommand(this CreateOrderRequest request)
    {
        return new CreateOrderCommand(
            request.CustomerId,
            request.Items
                .Select(item => new CreateOrderItem(
                    item.ProductId,
                    item.Quantity,
                    item.UnitPrice))
                .ToList());
    }
}
```

Do not expose EF entities directly as API contracts. API contracts change for clients; entities change for persistence and business rules.

Clean Architecture provides a structure that keeps business rules independent of infrastructure concerns. The value is not in the number of projects but in the dependency rule: inner layers define interfaces; outer layers implement them. Applied with judgment, this structure allows the core business logic to remain testable, framework-independent, and insulated from change in external systems.
