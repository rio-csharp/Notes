# Decorators And Scrutor

## Core Idea

The decorator pattern wraps a service to add behavior without changing the original implementation.

Chinese notes:

- `decorator`: 装饰器.
- `cross-cutting concern`: 横切关注点.
- `inner service`: 被包装的内部服务.
- `composition`: 组合.
- `cache invalidation`: 缓存失效.

Use decorators for:

- caching;
- logging;
- metrics;
- retries;
- validation;
- authorization;
- tracing;
- auditing.

Key takeaway:

> A decorator implements the same interface as the wrapped service and delegates to the inner service while adding behavior before, after, or around the call.

## Basic Service

Interface:

```csharp
public interface IProductService
{
    Task<ProductDto?> GetByIdAsync(int id, CancellationToken cancellationToken);
}
```

Core implementation:

```csharp
public sealed class ProductService : IProductService
{
    private readonly AppDbContext _dbContext;

    public ProductService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<ProductDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken)
    {
        return await _dbContext.Products
            .Where(x => x.Id == id)
            .Select(x => new ProductDto(x.Id, x.Name, x.Price))
            .SingleOrDefaultAsync(cancellationToken);
    }
}
```

The core service focuses on business/data access behavior.

## Caching Decorator

```csharp
public sealed class CachedProductService : IProductService
{
    private readonly IProductService _inner;
    private readonly IDistributedCache _cache;
    private readonly ILogger<CachedProductService> _logger;

    public CachedProductService(
        IProductService inner,
        IDistributedCache cache,
        ILogger<CachedProductService> logger)
    {
        _inner = inner;
        _cache = cache;
        _logger = logger;
    }

    public async Task<ProductDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken)
    {
        var key = $"product:{id}";
        var cached = await _cache.GetStringAsync(key, cancellationToken);

        if (cached is not null)
        {
            _logger.LogDebug("Cache hit for product {ProductId}", id);
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await _inner.GetByIdAsync(id, cancellationToken);

        if (product is not null)
        {
            var options = new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
            };

            await _cache.SetStringAsync(
                key,
                JsonSerializer.Serialize(product),
                options,
                cancellationToken);
        }

        return product;
    }
}
```

Why this helps:

- `ProductService` does not know about caching;
- caching can be tested separately;
- caching can be added or removed through DI;
- the public interface stays the same.

## Logging Decorator

```csharp
public sealed class LoggingProductService : IProductService
{
    private readonly IProductService _inner;
    private readonly ILogger<LoggingProductService> _logger;

    public LoggingProductService(
        IProductService inner,
        ILogger<LoggingProductService> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<ProductDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation("Loading product {ProductId}", id);

        var product = await _inner.GetByIdAsync(id, cancellationToken);

        _logger.LogInformation(
            "Loaded product {ProductId}. Found={Found}",
            id,
            product is not null);

        return product;
    }
}
```

## Manual Decoration Without Scrutor

Manual decoration is possible but can be awkward.

```csharp
builder.Services.AddScoped<ProductService>();

builder.Services.AddScoped<IProductService>(sp =>
{
    var inner = sp.GetRequiredService<ProductService>();
    var cache = sp.GetRequiredService<IDistributedCache>();
    var logger = sp.GetRequiredService<ILogger<CachedProductService>>();

    return new CachedProductService(inner, cache, logger);
});
```

This works for one decorator.

With multiple decorators, manual registration becomes harder to read.

## Scrutor

Scrutor is a .NET library that extends DI with assembly scanning and service decoration.

Concept:

```csharp
services.AddScoped<IProductService, ProductService>();
services.Decorate<IProductService, CachedProductService>();
services.Decorate<IProductService, LoggingProductService>();
```

Depending on registration order, the final chain is conceptually:

```text
LoggingProductService
  -> CachedProductService
     -> ProductService
```

Important warning:

> Decorator order matters. Logging outside caching measures total behavior. Logging inside caching may only measure cache misses.

## Assembly Scanning With Scrutor

Scrutor can register services by convention.

Example:

```csharp
services.Scan(scan => scan
    .FromAssemblyOf<IOrderService>()
    .AddClasses(classes => classes.Where(type => type.Name.EndsWith("Service")))
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

Use scanning carefully:

- conventions should be simple;
- avoid surprising registrations;
- review what gets registered;
- explicit registration is often clearer for critical services.

## Decorator vs Inheritance

Inheritance:

```csharp
public class CachedProductService : ProductService
{
}
```

Problems:

- tightly couples to base class implementation;
- can break encapsulation;
- one inheritance chain is rigid;
- combining behaviors becomes hard.

Decorator:

```text
IProductService
  LoggingProductService
    CachedProductService
      ProductService
```

Benefits:

- composition-based;
- behaviors can be stacked;
- core implementation stays focused;
- easier to test each behavior.

## Caching Decorator Design Issues

Caching looks simple, but this topic often comes up because deeper questions.

### What should be cached?

Good candidates:

- read-heavy queries;
- stable reference data;
- expensive external calls;
- product/category details with acceptable staleness.

Bad candidates:

- commands with side effects;
- highly sensitive user-specific data without careful key design;
- rapidly changing data that must be strongly consistent.

### Cache key design

Bad:

```csharp
var key = $"product";
```

Why it is wrong:

> Every product would share the same key.

Better:

```csharp
var key = $"product:{id}";
```

For tenant systems:

```csharp
var key = $"tenant:{tenantId}:product:{id}";
```

### Cache invalidation

If product data changes, cached data may become stale.

Options:

- short TTL;
- delete cache on update;
- publish invalidation messages;
- versioned cache keys;
- event-driven invalidation.

Practical explanation:

> Caching improves read performance, but I must define freshness requirements and invalidation strategy. Otherwise the cache can return stale or incorrect data.

## Complete Registration Example

Install Scrutor:

```powershell
dotnet add package Scrutor
```

Register the core service and decorators:

```csharp
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.Decorate<IProductService, CachedProductService>();
builder.Services.Decorate<IProductService, LoggingProductService>();
```

The resolved chain is:

```text
IProductService
  -> LoggingProductService
     -> CachedProductService
        -> ProductService
```

Controller usage does not change:

```csharp
[ApiController]
[Route("api/products")]
public sealed class ProductsController : ControllerBase
{
    private readonly IProductService _products;

    public ProductsController(IProductService products)
    {
        _products = products;
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductDto>> GetById(
        int id,
        CancellationToken ct)
    {
        var product = await _products.GetByIdAsync(id, ct);

        return product is null ? NotFound() : Ok(product);
    }
}
```

This is the main benefit: the controller depends on `IProductService`, while DI decides whether caching, logging, metrics, or tracing wraps the core implementation.

## Cache Invalidation Example

If reads are cached, writes need an invalidation strategy.

Separate read and write contracts keep the design clearer:

```csharp
public interface IProductQueryService
{
    Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct);
}

public interface IProductCommandService
{
    Task UpdatePriceAsync(int id, decimal price, CancellationToken ct);
}
```

Read decorator:

```csharp
public sealed class CachedProductQueryService : IProductQueryService
{
    private readonly IProductQueryService _inner;
    private readonly IDistributedCache _cache;

    public CachedProductQueryService(
        IProductQueryService inner,
        IDistributedCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        var key = ProductCacheKeys.ById(id);
        var cached = await _cache.GetStringAsync(key, ct);

        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await _inner.GetByIdAsync(id, ct);

        if (product is not null)
        {
            await _cache.SetStringAsync(
                key,
                JsonSerializer.Serialize(product),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
                },
                ct);
        }

        return product;
    }
}
```

Write decorator that invalidates after a successful update:

```csharp
public sealed class CacheInvalidatingProductCommandService : IProductCommandService
{
    private readonly IProductCommandService _inner;
    private readonly IDistributedCache _cache;

    public CacheInvalidatingProductCommandService(
        IProductCommandService inner,
        IDistributedCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task UpdatePriceAsync(int id, decimal price, CancellationToken ct)
    {
        await _inner.UpdatePriceAsync(id, price, ct);
        await _cache.RemoveAsync(ProductCacheKeys.ById(id), ct);
    }
}
```

Shared key helper:

```csharp
public static class ProductCacheKeys
{
    public static string ById(int id) => $"product:{id}";
}
```

Registration:

```csharp
builder.Services.AddScoped<IProductQueryService, ProductQueryService>();
builder.Services.Decorate<IProductQueryService, CachedProductQueryService>();

builder.Services.AddScoped<IProductCommandService, ProductCommandService>();
builder.Services.Decorate<IProductCommandService, CacheInvalidatingProductCommandService>();
```

Key point:

> A cache decorator should not be only about faster reads. It must also fit the write path, freshness rules, and failure behavior.

## Retry Decorator Warning

Retries are useful for transient failures, but dangerous around non-idempotent operations.

Bad:

```text
Retry payment charge without idempotency key.
```

Why it is dangerous:

> The customer may be charged twice if the first request succeeded but the response was lost.

Better:

> Retry only safe/idempotent operations, or use idempotency keys for commands.

## Review Questions

### What is decorator pattern?

Decorator wraps an implementation with another implementation of the same interface to add behavior without modifying the original class.

### Decorator vs inheritance?

Decorator uses composition and is more flexible. Inheritance creates a static hierarchy and can become fragile when combining behaviors.

### What is Scrutor?

Scrutor is a .NET library that extends Microsoft DI with assembly scanning and service decoration.

### Why use decorators instead of adding logging/caching directly?

Decorators keep cross-cutting concerns separate from core business logic. They make behaviors reusable, testable, and configurable through DI.

### Why does decorator order matter?

Because each decorator wraps the previous service. For example, logging outside caching sees cache hits and misses, while logging inside caching may only see cache misses.

### What is a cache invalidation problem?

It is the problem of keeping cached data consistent enough after the source data changes. Solutions include TTL, explicit invalidation, event-driven invalidation, and versioned keys.

## Common Mistakes

### Mistake: Decorator order confusion

Why it is wrong:

> Different order changes behavior, logging, metrics, retry scope, and caching semantics.

Better answer:

> Decide the intended behavior and register decorators in a deliberate order.

### Mistake: Circular dependencies

Why it is wrong:

> A decorator must receive the inner implementation, not resolve itself again.

Better answer:

> Use Scrutor or careful manual registration so the decorator wraps the previous implementation.

### Mistake: Too much business logic in decorators

Why it is wrong:

> Decorators should handle cross-cutting concerns. Business rules hidden in decorators are hard to discover.

Better answer:

> Keep domain behavior in services/domain objects and use decorators for infrastructure concerns.

### Mistake: Caching commands with side effects

Why it is wrong:

> Commands change state. Caching them can skip required side effects or return misleading results.

Better answer:

> Cache read queries, not state-changing commands, unless there is a very deliberate design.

### Mistake: No cache invalidation

Why it is wrong:

> Users may receive stale or incorrect data after updates.

Better answer:

> Define TTL and invalidation strategy based on business freshness requirements.

### Mistake: Retrying non-idempotent operations without protection

Why it is wrong:

> Duplicate side effects can happen, such as double charging or duplicate order creation.

Better answer:

> Use retries for safe operations or add idempotency keys for commands.

## Practice Task

Create:

1. `IProductService`;
2. `ProductService`;
3. `CachedProductService`;
4. `LoggingProductService`;
5. Scrutor registration for both decorators;
6. a note explaining the decorator order;
7. a cache invalidation strategy for product updates.
