# Mediator, Strategy, And Decorator In .NET

## Core Idea

Mediator, Strategy, and Decorator appear often in .NET backend systems because they solve common application-service problems:

- Mediator organizes request/handler workflows.
- Strategy handles behavior variation.
- Decorator adds behavior around services without changing the service.

## Mediator

Mediator decouples request senders from request handlers.

Common uses:

- CQRS commands and queries;
- validation pipeline;
- logging pipeline;
- transaction pipeline;
- authorization checks;
- metrics.

## MediatR Command Example

```csharp
public sealed record CreateOrderCommand(
    int CustomerId,
    IReadOnlyList<CreateOrderItem> Items) : IRequest<int>;

public sealed record CreateOrderItem(
    int ProductId,
    int Quantity,
    decimal UnitPrice);
```

Handler:

```csharp
public sealed class CreateOrderHandler
    : IRequestHandler<CreateOrderCommand, int>
{
    private readonly AppDbContext _dbContext;

    public CreateOrderHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<int> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        var order = new Order(request.CustomerId);

        foreach (var item in request.Items)
        {
            order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
        }

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync(ct);

        return order.Id;
    }
}
```

Controller:

```csharp
[HttpPost]
public async Task<ActionResult<int>> Create(
    CreateOrderRequest request,
    CancellationToken ct)
{
    var command = new CreateOrderCommand(
        request.CustomerId,
        request.Items.Select(x => new CreateOrderItem(
            x.ProductId,
            x.Quantity,
            x.UnitPrice)).ToList());

    var orderId = await _mediator.Send(command, ct);

    return CreatedAtAction(nameof(GetById), new { id = orderId }, orderId);
}
```

## MediatR Query Example

```csharp
public sealed record GetOrderByIdQuery(int OrderId)
    : IRequest<OrderDetailsDto?>;

public sealed class GetOrderByIdHandler
    : IRequestHandler<GetOrderByIdQuery, OrderDetailsDto?>
{
    private readonly AppDbContext _dbContext;

    public GetOrderByIdHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<OrderDetailsDto?> Handle(GetOrderByIdQuery request, CancellationToken ct)
    {
        return _dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Id == request.OrderId)
            .Select(x => new OrderDetailsDto(
                x.Id,
                x.OrderNumber,
                x.Status,
                x.TotalAmount))
            .FirstOrDefaultAsync(ct);
    }
}
```

## Pipeline Behavior

Pipeline behavior is the main reason Mediator becomes powerful.

Validation:

```csharp
public sealed class ValidationBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var context = new ValidationContext<TRequest>(request);

        var failures = _validators
            .Select(validator => validator.Validate(context))
            .SelectMany(result => result.Errors)
            .Where(error => error is not null)
            .ToList();

        if (failures.Count > 0)
        {
            throw new ValidationException(failures);
        }

        return await next();
    }
}
```

Registration:

```csharp
builder.Services.AddMediatR(config =>
{
    config.RegisterServicesFromAssembly(typeof(CreateOrderCommand).Assembly);
    config.AddOpenBehavior(typeof(ValidationBehavior<,>));
});
```

## Strategy

Strategy selects behavior.

Example: shipping cost calculation.

```csharp
public interface IShippingCostStrategy
{
    string Method { get; }
    Money Calculate(Shipment shipment);
}
```

```csharp
public sealed class StandardShippingCostStrategy : IShippingCostStrategy
{
    public string Method => "standard";

    public Money Calculate(Shipment shipment)
    {
        return new Money(5 + shipment.WeightKg * 0.5m, "USD");
    }
}

public sealed class ExpressShippingCostStrategy : IShippingCostStrategy
{
    public string Method => "express";

    public Money Calculate(Shipment shipment)
    {
        return new Money(15 + shipment.WeightKg * 1.2m, "USD");
    }
}
```

Selector:

```csharp
public sealed class ShippingCostCalculator
{
    private readonly IReadOnlyDictionary<string, IShippingCostStrategy> _strategies;

    public ShippingCostCalculator(IEnumerable<IShippingCostStrategy> strategies)
    {
        _strategies = strategies.ToDictionary(
            strategy => strategy.Method,
            StringComparer.OrdinalIgnoreCase);
    }

    public Money Calculate(Shipment shipment, string method)
    {
        if (!_strategies.TryGetValue(method, out var strategy))
        {
            throw new NotSupportedException($"Shipping method '{method}' is not supported.");
        }

        return strategy.Calculate(shipment);
    }
}
```

DI:

```csharp
builder.Services.AddScoped<IShippingCostStrategy, StandardShippingCostStrategy>();
builder.Services.AddScoped<IShippingCostStrategy, ExpressShippingCostStrategy>();
builder.Services.AddScoped<ShippingCostCalculator>();
```

## Decorator

Decorator wraps an existing service.

Base service:

```csharp
public interface IProductService
{
    Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct);
}

public sealed class ProductService : IProductService
{
    private readonly AppDbContext _dbContext;

    public ProductService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        return _dbContext.Products
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new ProductDto(x.Id, x.Name, x.Price))
            .FirstOrDefaultAsync(ct);
    }
}
```

Caching decorator:

```csharp
public sealed class CachedProductService : IProductService
{
    private readonly IProductService _inner;
    private readonly IDistributedCache _cache;

    public CachedProductService(IProductService inner, IDistributedCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        var cacheKey = $"product:{id}";
        var cached = await _cache.GetStringAsync(cacheKey, ct);

        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await _inner.GetByIdAsync(id, ct);

        if (product is not null)
        {
            await _cache.SetStringAsync(
                cacheKey,
                JsonSerializer.Serialize(product),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10)
                },
                ct);
        }

        return product;
    }
}
```

Manual DI decoration:

```csharp
builder.Services.AddScoped<ProductService>();

builder.Services.AddScoped<IProductService>(sp =>
{
    var inner = sp.GetRequiredService<ProductService>();
    var cache = sp.GetRequiredService<IDistributedCache>();
    return new CachedProductService(inner, cache);
});
```

With Scrutor:

```csharp
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.Decorate<IProductService, CachedProductService>();
```

> The Decorator pattern is also discussed in Chapter 14.03 (Structural Patterns), which covers the general pattern with logging and caching decorator examples using `IProductReader`. The structural pattern chapter focuses on the difference between Decorator, Proxy, and Adapter, while this chapter focuses on DI registration strategies.

## Combining The Three

A realistic request can use all three:

```text
OrdersController
  -> IMediator.Send(CreateShipmentCommand)
  -> CreateShipmentHandler
  -> ShippingCostCalculator
  -> IShippingCostStrategy
  -> Decorated IProductService for product lookup/cache
```

Example handler:

```csharp
public sealed class CreateShipmentHandler
    : IRequestHandler<CreateShipmentCommand, int>
{
    private readonly IProductService _products;
    private readonly ShippingCostCalculator _shippingCostCalculator;
    private readonly AppDbContext _dbContext;

    public CreateShipmentHandler(
        IProductService products,
        ShippingCostCalculator shippingCostCalculator,
        AppDbContext dbContext)
    {
        _products = products;
        _shippingCostCalculator = shippingCostCalculator;
        _dbContext = dbContext;
    }

    public async Task<int> Handle(CreateShipmentCommand request, CancellationToken ct)
    {
        var product = await _products.GetByIdAsync(request.ProductId, ct);

        if (product is null)
        {
            throw new NotFoundException("Product not found.");
        }

        var shipment = Shipment.Create(request.OrderId, request.ProductId, request.WeightKg);
        shipment.SetCost(_shippingCostCalculator.Calculate(shipment, request.Method));

        _dbContext.Shipments.Add(shipment);
        await _dbContext.SaveChangesAsync(ct);

        return shipment.Id;
    }
}
```

## React Equivalents

### Mediator-Like Event Callback

```tsx
function OrdersPage() {
  function handleOrderCreated(orderId: string) {
    navigate(`/orders/${orderId}`);
  }

  return <CreateOrderForm onCreated={handleOrderCreated} />;
}
```

The form does not know routing details. It reports an event to its parent.

### Strategy Through Props

```tsx
type PriceFormatter = (value: number) => string;

function PriceCell({
  value,
  format
}: {
  value: number;
  format: PriceFormatter;
}) {
  return <td>{format(value)}</td>;
}
```

Usage:

```tsx
<PriceCell value={order.total} format={(value) => `$${value.toFixed(2)}`} />
```

### Decorator Through Wrapper Component

```tsx
import type { ReactNode } from "react";

function WithPermission({
  permission,
  children
}: {
  permission: string;
  children: ReactNode;
}) {
  const currentUser = useCurrentUser();

  if (!currentUser.permissions.includes(permission)) {
    return null;
  }

  return <>{children}</>;
}
```

Usage:

```tsx
<WithPermission permission="orders.cancel">
  <CancelOrderButton orderId={order.id} />
</WithPermission>
```

## Avoiding Unnecessary Abstraction

Do not use Mediator when:

- the project has only simple CRUD endpoints;
- the pipeline has no cross-cutting value;
- navigation becomes harder than direct service calls.

Do not use Strategy when:

- there are only one or two tiny stable branches;
- a simple switch is clearer;
- strategies have no real independent reason to change.

Do not use Decorator when:

- hidden behavior surprises callers;
- order of decorators is unclear;
- the wrapper changes the meaning of the original contract.
