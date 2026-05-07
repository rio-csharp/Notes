# Modular Monolith

## Core Idea

A modular monolith is a single deployable application organized into strong internal modules.

It keeps the operational simplicity of a monolith while improving code boundaries.

## Conditions For A Modular Monolith

Good when:

- team is not huge;
- domain boundaries are still evolving;
- transactions are important;
- deployment simplicity matters;
- microservices would add too much overhead.

## Example Modules

```text
Identity
Catalog
Ordering
Billing
Shipping
Notification
Reporting
```

## Code Structure

```text
src
  MyApp.Api
  Modules
    Ordering
      Application
      Domain
      Infrastructure
    Billing
      Application
      Domain
      Infrastructure
    Notification
      Application
      Infrastructure
```

## Module Project Structure

A modular monolith can use separate projects to enforce boundaries.

```text
src
  MyApp.Api
  MyApp.SharedKernel
  Modules
    Ordering
      MyApp.Modules.Ordering.Application
      MyApp.Modules.Ordering.Domain
      MyApp.Modules.Ordering.Infrastructure
      MyApp.Modules.Ordering.Contracts
    Billing
      MyApp.Modules.Billing.Application
      MyApp.Modules.Billing.Domain
      MyApp.Modules.Billing.Infrastructure
      MyApp.Modules.Billing.Contracts
```

`Contracts` contains the small public surface that other modules may use.

Example:

```csharp
namespace MyApp.Modules.Ordering.Contracts;

public interface IOrderingModule
{
    Task<OrderSummary?> GetOrderSummaryAsync(int orderId, CancellationToken ct);
}

public sealed record OrderSummary(
    int OrderId,
    string OrderNumber,
    decimal Total,
    string Currency);
```

The Billing module can depend on `Ordering.Contracts`, but not on `Ordering.Infrastructure`.

## Module Registration

Each module can expose one registration method.

```csharp
public static class OrderingModule
{
    public static IServiceCollection AddOrderingModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddDbContext<OrderingDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("Default")));

        services.AddScoped<IOrderingModule, OrderingModuleFacade>();
        services.AddScoped<CreateOrderHandler>();
        services.AddScoped<CancelOrderHandler>();

        return services;
    }
}
```

API startup composes modules:

```csharp
builder.Services.AddOrderingModule(builder.Configuration);
builder.Services.AddBillingModule(builder.Configuration);
builder.Services.AddNotificationModule(builder.Configuration);
```

## Module Facade

A facade exposes allowed operations.

```csharp
public sealed class OrderingModuleFacade : IOrderingModule
{
    private readonly OrderingDbContext _dbContext;

    public OrderingModuleFacade(OrderingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<OrderSummary?> GetOrderSummaryAsync(int orderId, CancellationToken ct)
    {
        return _dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Id == orderId)
            .Select(x => new OrderSummary(
                x.Id,
                x.OrderNumber,
                x.TotalAmount,
                x.Currency))
            .FirstOrDefaultAsync(ct);
    }
}
```

This is better than allowing Billing to query `OrderingDbContext` directly.

## Module Rules

Good module rules:

- each module owns its domain logic;
- avoid direct access to another module's internal tables;
- communicate through public contracts or events;
- keep dependencies explicit;
- test module boundaries.

## Internal Events

Modules can communicate through in-process events.

```csharp
public sealed record OrderSubmittedInternalEvent(
    int OrderId,
    decimal Total,
    string Currency);
```

```csharp
public interface IInternalEventBus
{
    Task PublishAsync<T>(T message, CancellationToken ct)
        where T : notnull;
}
```

```csharp
public sealed class InMemoryInternalEventBus : IInternalEventBus
{
    private readonly IServiceProvider _serviceProvider;

    public InMemoryInternalEventBus(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task PublishAsync<T>(T message, CancellationToken ct)
        where T : notnull
    {
        var handlers = _serviceProvider.GetServices<IInternalEventHandler<T>>();

        foreach (var handler in handlers)
        {
            await handler.HandleAsync(message, ct);
        }
    }
}
```

This is not a distributed message broker. It is a clean way for modules inside one process to avoid direct coupling.

## Boundary Tests

Architecture tests can prevent accidental references.

```csharp
public sealed class ModuleBoundaryTests
{
    [Fact]
    public void Billing_Should_Not_Depend_On_Ordering_Infrastructure()
    {
        var billingAssembly = typeof(BillingModule).Assembly;
        var orderingInfrastructureAssemblyName =
            "MyApp.Modules.Ordering.Infrastructure";

        var result = Types.InAssembly(billingAssembly)
            .Should()
            .NotHaveDependencyOn(orderingInfrastructureAssemblyName)
            .GetResult();

        result.IsSuccessful.Should().BeTrue();
    }
}
```

This example uses NetArchTest-style rules. The same idea can be implemented with other architecture testing tools.

## Cross-Module Transactions

A modular monolith shares a database, which means a single transaction can span multiple modules. This is one of the strongest advantages over microservices: if Ordering needs to create an order and Billing needs to record a payment in the same atomic boundary, a shared `DbContext` or a transaction scope makes it trivial.

The facade pattern still applies: the Ordering module should not manipulate Billing tables directly. Instead, the orchestrating code (typically in the API or a workflow handler) calls both module facades within one transaction:

```csharp
public sealed class CheckoutHandler
{
    private readonly IOrderingModule _ordering;
    private readonly IBillingModule _billing;

    public async Task Handle(CheckoutCommand command, CancellationToken ct)
    {
        using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        await _ordering.ConfirmOrderAsync(command.OrderId, ct);
        await _billing.CreateInvoiceAsync(command.OrderId, ct);

        await transaction.CommitAsync(ct);
    }
}
```

This pattern works because both modules share the same database connection and transaction. When modules are later extracted into separate services, this code must be replaced with a saga — which is why cross-module transactions should be documented as extraction points.

If each module uses its own `DbContext` class against the same physical database, `TransactionScope` or `IDbContextTransaction` with shared connections can still coordinate them. If modules have truly separate databases, cross-module transactions are no longer possible without distributed transactions (which carry their own costs).

## Database Strategy

Options:

- shared database with schema per module;
- shared database with table ownership;
- separate database later if extracted.

Example:

```text
ordering.Orders
billing.Payments
notification.Messages
```

## Extracting To Microservice Later

Extraction is easier when:

- module has clear boundary;
- module owns data;
- communication is already through contracts/events;
- no direct cross-module database access;
- tests cover behavior.

A modular monolith provides the operational simplicity of a single deployment with the structural discipline of separated module boundaries. Each module owns its domain logic, communicates through explicit contracts or in-process events, and shares transactional consistency when needed. When a module's boundary is clear enough and its scaling requirements diverge, it becomes a candidate for extraction into an independent service.
