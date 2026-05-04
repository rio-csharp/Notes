# Modular Monolith

## Core Idea

A modular monolith is a single deployable application organized into strong internal modules.

Chinese notes:

- `modular monolith`: 模块化单体.
- `module boundary`: 模块边界.
- `single deployment`: 单体部署.

It keeps the operational simplicity of a monolith while improving code boundaries.

## Why Modular Monolith?

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

## Knowledge Checks

### What is a modular monolith?

A modular monolith is one deployable application with clear internal module boundaries. It avoids distributed complexity while keeping code organized around business capabilities.

### Modular monolith vs microservices?

Modular monolith is simpler to deploy and transact within. Microservices allow independent deployment and scaling but add distributed systems complexity.

### How do you enforce module boundaries?

Through project structure, internal visibility, architecture tests, module contracts, and avoiding direct database access across modules.

## Common Mistakes

- Calling it modular but allowing every module to access everything.
- Shared tables without ownership.
- No boundary tests.
- Too many synchronous cross-module calls.
- Extracting too early.

## Practice Task

Design modules for:

1. ordering;
2. billing;
3. notification;
4. reporting;
5. define allowed communication;
6. define extraction criteria.
