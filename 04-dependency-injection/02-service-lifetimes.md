# Dependency Injection Service Lifetimes

## Core Idea

Service lifetime determines how long the DI container reuses a resolved instance and therefore how widely that instance's state, resources, and ownership are shared. In ASP.NET Core, lifetime choice is not a minor registration detail. It is one of the main ways object design becomes runtime behavior.

The three standard lifetimes are singleton, scoped, and transient. On paper they are simple. In practice, they shape correctness, thread safety, disposal behavior, caching, and the boundaries between request-specific and application-wide state.

## Lifetime As Reuse And Ownership

Lifetimes can be understood in terms of caching and scope ownership.

```text
Application root provider
  Singleton cache
    ISystemClock -> SystemClock instance

HTTP request scope A
  Scoped cache
    AppDbContext -> DbContext A
    IOrderService -> OrderService A

HTTP request scope B
  Scoped cache
    AppDbContext -> DbContext B
    IOrderService -> OrderService B

Transient
  Created each time it is requested
```

This model immediately explains several important behaviors. Singleton state is shared by the whole application. Scoped state is shared only inside a particular scope, which in web applications usually means a request. Transient state is not reused by design.

## Singleton

Singleton services are created once and then reused for the lifetime of the application.

```csharp
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

Singleton is a good fit when the service is:

- stateless;
- thread-safe;
- intentionally shared;
- expensive enough that reuse is desirable;
- free of request-specific assumptions.

The most important warning is that singleton lifetime makes shared state global to the process. If the service contains mutable state, that state is now potentially visible across users, requests, and threads.

```csharp
public sealed class CurrentUserCache
{
    public string? UserId { get; set; }
}
```

A type like this is dangerous as a singleton because it turns one user's request data into application-wide shared mutable state.

## Scoped

Scoped services are created once per scope. In ASP.NET Core web applications, one HTTP request normally creates one scope.

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddDbContext<AppDbContext>();
```

```csharp
public sealed class OrderService : IOrderService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<OrderService> _logger;

    public OrderService(AppDbContext dbContext, ILogger<OrderService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<OrderDto> CreateAsync(
        CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var order = new Order
        {
            CustomerId = request.CustomerId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Created order {OrderId}", order.Id);

        return new OrderDto(order.Id, order.CustomerId);
    }
}
```

Scoped lifetime is a natural fit for business services, repositories, and EF Core `DbContext` because these often participate in a request-shaped unit of work. The main idea is not merely "per request." It is that the reused instance belongs to a meaningful operational boundary.

## Transient

Transient services are created each time the container resolves them.

```csharp
builder.Services.AddTransient<IEmailTemplateRenderer, EmailTemplateRenderer>();
```

```csharp
public interface IEmailTemplateRenderer
{
    string RenderWelcomeEmail(string displayName);
}

public sealed class EmailTemplateRenderer : IEmailTemplateRenderer
{
    public string RenderWelcomeEmail(string displayName)
    {
        return $"Welcome, {displayName}!";
    }
}
```

Transient lifetime works best for small, stateless, low-cost services that do not need reuse across resolutions.

It is tempting to think of transient as the "safe default," but that is only partly true. A transient can still be expensive to create, can own disposable resources, or can become effectively long-lived if it is captured by a longer-lived service. Lifetime labels alone do not guarantee correctness.

## Lifetime Direction And Dependency Flow

A central principle of lifetime design is that longer-lived services should not depend directly on shorter-lived ones in a way that captures them for too long.

The dangerous case is usually:

```text
singleton -> scoped
```

because the singleton outlives the scoped service's intended boundary.

Even when the container technically allows certain patterns, the real design question is whether the dependency relationship preserves the shorter-lived service's assumptions about scope, freshness, and thread safety.

## `DbContext` As A Lifetime Example

EF Core `DbContext` is one of the clearest examples of why scoped lifetime matters.

`DbContext` is usually scoped because:

- it represents a unit of work;
- it tracks entity instances;
- it is not thread-safe;
- it should not be shared across unrelated requests;
- stale tracked state becomes dangerous if reused too broadly.

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
```

Registering it as a singleton would be incorrect because it would stretch unit-of-work state across the application lifetime and across concurrent requests.

## `HttpClient` And Misleading Lifetime Intuition

Lifetime design is not always obvious from type shape alone. `HttpClient` is a well-known example.

The naive pattern creates a new client repeatedly:

```csharp
public async Task<string> GetAsync()
{
    using var client = new HttpClient();
    return await client.GetStringAsync("https://api.example.com/status");
}
```

That looks tidy, but repeated short-lived clients can cause connection-management problems. In ASP.NET Core, `IHttpClientFactory` is the usual abstraction because it decouples logical client usage from underlying handler lifetime management.

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri("https://api.payment.example");
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

This example is useful because it shows that lifetime design is sometimes about resource management behavior that is not immediately visible from the consumer's perspective.

## Disposal And Scope Ownership

The container disposes services it creates according to the owning scope or provider.

- singleton disposables are disposed when the root provider shuts down;
- scoped disposables are disposed when the scope ends;
- transient disposables are tracked and disposed by the scope that created them — the container always owns disposal for services it creates, regardless of lifetime.

This is one reason lifetime is also about ownership. The container is not simply memoizing objects. It is managing the boundary within which those objects remain valid and the point at which they should be cleaned up.

Resolving disposable services from the root provider can therefore be risky when they were meant to be short-lived:

```csharp
using var scope = app.Services.CreateScope();
var service = scope.ServiceProvider.GetRequiredService<MyDisposableTransient>();
```

Creating a scope aligns resolution with intended disposal behavior.

## Factory Registrations And Lifetime Still Apply

Factory registrations can make construction more explicit, but they do not escape lifetime rules.

```csharp
builder.Services.AddScoped<IReportGenerator>(sp =>
{
    var db = sp.GetRequiredService<AppDbContext>();
    var logger = sp.GetRequiredService<ILogger<PdfReportGenerator>>();
    return new PdfReportGenerator(db, logger, pageSize: 50);
});
```

The fact that a factory constructs the object does not make the lifetime less important. If a singleton factory-created service captures scoped dependencies, the problem is still a lifetime mismatch. Registration style does not change ownership reality.

## Lifetime As A Design Decision

Lifetime is often described as a performance concern, but correctness is usually the more important dimension.

Choosing singleton when the object should really be scoped can create cross-request leakage, stale state, and threading hazards. Choosing transient when the object is expensive and stateless can create unnecessary churn. Choosing scoped for request-specific coordination can make business behavior clearer because the lifetime now matches the operational boundary.

This is why lifetime should not be chosen mechanically. It should follow the shape of the service's state, ownership, thread-safety expectations, and intended unit of work.
