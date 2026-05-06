# Decorators And Scrutor

## Core Idea

Decorators allow a service to be wrapped with additional behavior without changing the core implementation or the interface seen by callers. In DI-heavy applications, this is one of the cleanest ways to attach cross-cutting concerns such as logging, caching, metrics, retries, tracing, or auditing around an existing service.

This chapter treats decorators as part of service composition rather than as a design-pattern sidebar. The important architectural question is not merely how to wrap one service. It is how to keep business behavior focused while still allowing infrastructure behavior to be layered on through the container.

## The Core Service And The Wrapped Interface

Decorator design begins with a stable interface and a core implementation that focuses on its primary responsibility.

```csharp
public interface IProductService
{
    Task<ProductDto?> GetByIdAsync(int id, CancellationToken cancellationToken);
}
```

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

The point of the core implementation is that it should remain about product retrieval. Once caching, logging, retry logic, metrics, and tracing all move directly into this class, the core behavior becomes harder to read and evolve.

## Decorator Structure

A decorator implements the same interface as the wrapped service and delegates to an inner instance while adding behavior before, after, or around the call.

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

From the caller's perspective, nothing changes. The controller still depends on `IProductService`. The difference is in how the container composes the service chain.

## Caching As A Decorator

Caching is one of the most natural decorator use cases because it wraps a read-oriented service without forcing the core implementation to know about caching infrastructure directly.

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

This keeps the caching concern explicit and replaceable. It also makes testing easier because the core service and the caching policy can be reasoned about separately.

It also clarifies where performance behavior actually lives. Without decoration, cache policy often becomes entangled with query shape, persistence concerns, and business naming. With a decorator, the system can express that "this read path is cached" as a compositional decision rather than as hidden internal behavior of the core service.

## Separation Of Concerns Through Decoration

Embedding logging or caching directly into the core service seems simple at first, but it often weakens separation of concerns. The class that should answer the business question "how do we get a product?" slowly becomes the place where cache-key design, telemetry decisions, retry policy, and infrastructure integration also live.

Decorators preserve a cleaner split:

- the core implementation handles the primary behavior;
- each decorator handles one cross-cutting concern;
- the DI container determines how the layers are combined.

This makes the object graph more expressive. Composition becomes part of the architecture instead of being hidden inside method bodies.

That improvement is especially valuable once systems grow. A service with direct logging, retries, metrics, authorization checks, and caching may still work, but its primary behavior becomes harder to identify. Decorators keep the business path legible by moving orthogonal concerns into layers that can be inspected independently.

## Manual Decoration And Its Limitations

Manual decoration is possible through explicit registration factories.

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

This is acceptable for simple cases, but it becomes harder to read and maintain once several decorators must be layered or when the service graph becomes large. At that point, the registration code itself starts to obscure the design.

Manual decoration also tends to age poorly when teams need to reorder layers or apply the same pattern across many services. The code still works, but composition stops being declarative and starts becoming a fragile block of wiring logic.

## Scrutor And Declarative Decoration

Scrutor extends the built-in container with decoration and assembly-scanning support, making this style of composition much clearer.

```csharp
services.AddScoped<IProductService, ProductService>();
services.Decorate<IProductService, CachedProductService>();
services.Decorate<IProductService, LoggingProductService>();
```

Conceptually, the chain becomes:

```text
LoggingProductService
  -> CachedProductService
     -> ProductService
```

The value is not only brevity. The registrations now express architectural layering directly instead of hiding it inside factory code.

That directness matters during maintenance. When a production issue involves stale cache entries, duplicated retries, or missing telemetry, teams often need to reason about composition order quickly. Declarative decoration makes those relationships easier to inspect than a series of nested registration delegates.

## Decorator Order As Behavior

Decorator order matters because each decorator wraps the service produced by the previous registration step.

If logging wraps caching, the logs may observe cache hits and misses. If caching wraps logging, the logging decorator may see only cache misses. The same principle applies to metrics, retry policies, tracing, and authorization wrappers.

This is one of the reasons decorators are powerful: they make behavior ordering explicit. It is also one of the reasons they must be designed carefully. Composition order is not incidental detail. It changes what the application does.

For the same reason, decorators should stay small and conceptually single-purpose. A wrapper that both caches, rewrites exceptions, emits metrics, and performs authorization checks is no longer improving separation of concerns. It is merely relocating a tangled implementation into another class.

## Assembly Scanning And Registration Conventions

Scrutor also supports assembly scanning for convention-based registration.

```csharp
services.Scan(scan => scan
    .FromAssemblyOf<IOrderService>()
    .AddClasses(classes => classes.Where(type => type.Name.EndsWith("Service")))
    .AsImplementedInterfaces()
    .WithScopedLifetime());
```

This can be useful when conventions are simple and well understood. It can also become a source of hidden behavior if registration rules are too broad or surprising. The design trade-off is therefore similar to many DI features: less ceremony can be helpful, but only if it does not make the dependency graph harder to inspect.

In book terms, assembly scanning belongs to the same family of convenience mechanisms as keyed services and delegate factories. It reduces registration noise, but it should not be allowed to hide architectural intent. If a reader cannot tell why a service exists in the graph or which implementation was selected, the convenience has gone too far.

## Decorator Versus Inheritance

Inheritance is sometimes used as an alternative way to "add behavior," but it is usually a weaker fit for this kind of service composition.

```csharp
public class CachedProductService : ProductService
{
}
```

This creates tight coupling to the base implementation and makes behavior stacking awkward. Composition through decorators is generally more flexible because it allows several independent wrappers to be combined while leaving the core implementation focused and isolated.

The difference is architectural. Inheritance extends one class hierarchy. Decoration composes several orthogonal behaviors around a stable interface.

## Caching Design Still Has To Be Correct

A cache decorator is not automatically a good cache design. Several deeper decisions still matter.

The cache key must be meaningful:

```csharp
var key = $"product:{id}";
```

In multi-tenant systems, tenant or scope identity may also matter:

```csharp
var key = $"tenant:{tenantId}:product:{id}";
```

Cache candidate selection matters as well. Read-heavy, moderately stable data is often a good fit. Highly volatile data or side-effecting operations are often poor candidates. Freshness expectations matter just as much as read performance.

Most importantly, invalidation cannot be ignored. If cached reads exist, the write path must have a strategy for keeping the cache acceptably fresh.

## Read/Write Separation And Invalidation

One clean way to handle invalidation is to separate read and write contracts.

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

```csharp
public static class ProductCacheKeys
{
    public static string ById(int id) => $"product:{id}";
}
```

This design is a good example of decorators remaining architectural rather than cosmetic. The read path and the write path both participate in the cache strategy.

That is an important correction to a common mistake. Caching is not a read-side optimization alone. It is a consistency policy. Once decorators are introduced, the surrounding design has to account for invalidation, freshness, and scope identity with the same seriousness as latency.

## Retry Decorators And Idempotency

Retry behavior is another strong candidate for decoration, but it has to respect the semantics of the wrapped operation.

Retrying an idempotent read or a transient dependency call may be reasonable. Retrying a non-idempotent command, such as charging a payment without an idempotency key, may create duplicate side effects.

Decorators make retry composition easy. They do not remove the need to understand the safety of the wrapped operation.

This illustrates the broader limit of the pattern. Decorators are excellent for attaching orthogonal behavior, but they cannot repair a poor underlying contract. If the wrapped interface does not distinguish idempotent reads from state-changing commands, the decoration layer has less information than it needs to apply safe policy.
