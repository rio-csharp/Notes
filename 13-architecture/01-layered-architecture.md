# Layered Architecture

## Core Idea

Layered architecture organizes code into layers with different responsibilities.

Typical layers:

```text
Presentation
Application / Service
Domain / Business
Infrastructure / Data Access
```

## Common .NET Structure

```text
MyApp.Api
MyApp.Application
MyApp.Domain
MyApp.Infrastructure
```

## Presentation Layer

Responsibilities:

- HTTP endpoints;
- request/response DTOs;
- authentication entry point;
- model binding;
- status codes.

Should not contain complex business logic.

## Application Layer

Responsibilities:

- use cases;
- orchestration;
- transactions;
- validation;
- authorization coordination;
- calling domain and infrastructure abstractions.

## Domain Layer

Responsibilities:

- business rules;
- entities;
- value objects;
- domain services;
- domain events.

## Infrastructure Layer

Responsibilities:

- EF Core;
- external APIs;
- file storage;
- message broker;
- Redis;
- email provider.

## Dependency Direction

Simple layered architecture often has:

```text
API -> Application -> Infrastructure/Data
```

Clean Architecture and Onion Architecture invert this direction so inner layers do not depend on infrastructure. The mechanism is the Dependency Inversion Principle: the application and domain layers define abstractions (ports), and infrastructure depends on those abstractions rather than the other way around. This is covered in detail in Chapter 13.02 (Clean Architecture) and Chapter 13.03 (Onion and Hexagonal Architecture).

## A Complete Order Example

Consider one use case flowing through the layers:

```text
POST /api/orders/{orderId}/cancel
  -> OrdersController
  -> CancelOrderService
  -> Order aggregate
  -> IOrderRepository
  -> EF Core implementation
```

### Domain Layer

The domain object protects business rules.

```csharp
public enum OrderStatus
{
    Draft,
    Submitted,
    Paid,
    Cancelled
}

public sealed class Order
{
    public int Id { get; private set; }
    public OrderStatus Status { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public string? CancellationReason { get; private set; }

    public void Cancel(string reason, DateTimeOffset now)
    {
        if (Status == OrderStatus.Paid)
        {
            throw new DomainException("A paid order cannot be cancelled directly.");
        }

        if (Status == OrderStatus.Cancelled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new DomainException("Cancellation reason is required.");
        }

        Status = OrderStatus.Cancelled;
        CancelledAt = now;
        CancellationReason = reason.Trim();
    }
}
```

### Application Layer

The application layer coordinates the use case.

```csharp
public sealed record CancelOrderCommand(
    int OrderId,
    string Reason);

public sealed class CancelOrderService
{
    private readonly IOrderRepository _orders;
    private readonly ISystemClock _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CancelOrderService(
        IOrderRepository orders,
        ISystemClock clock,
        IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task CancelAsync(CancelOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Cancel(command.Reason, _clock.UtcNow);

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
```

The application service:

- loads required data;
- calls domain behavior;
- controls the transaction boundary;
- does not know HTTP status codes;
- does not know EF Core details.

### Infrastructure Layer

Infrastructure implements persistence.

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(int id, CancellationToken ct);
}

public sealed class EfOrderRepository : IOrderRepository
{
    private readonly AppDbContext _dbContext;

    public EfOrderRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<Order?> GetByIdAsync(int id, CancellationToken ct)
    {
        return _dbContext.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);
    }
}

public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _dbContext;

    public EfUnitOfWork(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<int> SaveChangesAsync(CancellationToken ct)
    {
        return _dbContext.SaveChangesAsync(ct);
    }
}
```

### Presentation Layer

The controller handles HTTP concerns.

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly CancelOrderService _cancelOrderService;

    public OrdersController(CancelOrderService cancelOrderService)
    {
        _cancelOrderService = cancelOrderService;
    }

    [HttpPost("{orderId:int}/cancel")]
    public async Task<IActionResult> Cancel(
        int orderId,
        CancelOrderRequest request,
        CancellationToken ct)
    {
        var command = new CancelOrderCommand(orderId, request.Reason);

        await _cancelOrderService.CancelAsync(command, ct);

        return NoContent();
    }
}

public sealed record CancelOrderRequest(string Reason);
```

The controller should not contain this:

```csharp
if (order.Status == OrderStatus.Paid)
{
    return BadRequest("Paid order cannot be cancelled.");
}
```

Why? Because the same rule may also be needed from a background job, message consumer, CLI command, or admin workflow. HTTP is only one entry point.

## Dependency Injection Registration

```csharp
builder.Services.AddScoped<CancelOrderService>();
builder.Services.AddScoped<IOrderRepository, EfOrderRepository>();
builder.Services.AddScoped<IUnitOfWork, EfUnitOfWork>();
builder.Services.AddSingleton<ISystemClock, SystemClock>();
```

```csharp
public interface ISystemClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : ISystemClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
```

Injecting time makes domain behavior easier to test.

## Testing The Layer Boundary

Domain behavior can be tested without ASP.NET Core or EF Core.

```csharp
public sealed class OrderTests
{
    [Fact]
    public void Cancel_Throws_WhenOrderIsPaid()
    {
        var order = OrderTestFactory.PaidOrder();

        var act = () => order.Cancel("Customer request", DateTimeOffset.UtcNow);

        act.Should().Throw<DomainException>()
            .WithMessage("A paid order cannot be cancelled directly.");
    }

    [Fact]
    public void Cancel_SetsCancellationDetails()
    {
        var now = new DateTimeOffset(2026, 5, 3, 10, 0, 0, TimeSpan.Zero);
        var order = OrderTestFactory.SubmittedOrder();

        order.Cancel("Customer request", now);

        order.Status.Should().Be(OrderStatus.Cancelled);
        order.CancelledAt.Should().Be(now);
        order.CancellationReason.Should().Be("Customer request");
    }
}
```

Application tests can verify orchestration:

```csharp
public sealed class CancelOrderServiceTests
{
    [Fact]
    public async Task CancelAsync_SavesChanges_WhenOrderExists()
    {
        var order = OrderTestFactory.SubmittedOrder();
        var repository = new FakeOrderRepository(order);
        var unitOfWork = new FakeUnitOfWork();
        var clock = new FixedClock(DateTimeOffset.UtcNow);
        var service = new CancelOrderService(repository, clock, unitOfWork);

        await service.CancelAsync(
            new CancelOrderCommand(order.Id, "Customer request"),
            CancellationToken.None);

        unitOfWork.SaveChangesCallCount.Should().Be(1);
    }
}
```

## Skipping A Layer

Layering should serve clarity, not ceremony.

For a small read-only lookup endpoint, this may be enough:

```text
Controller -> DbContext projection
```

For a workflow with business rules, side effects, and transaction boundaries, use the full structure:

```text
Controller -> Application Service -> Domain -> Repository/UnitOfWork
```

Good architecture is proportional to complexity.

Layered architecture is not measured by how many layers a project has; it is measured by whether the boundary between layers protects the right concerns. A well-structured order module separates HTTP negotiation, use-case orchestration, business rules, and persistence into distinct responsibilities. The decision to introduce or skip a layer depends on complexity, not dogma.
