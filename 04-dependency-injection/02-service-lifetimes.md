# Dependency Injection Service Lifetimes

## Core Idea

A DI service lifetime controls how long a resolved service instance is reused.

Chinese notes:

- `lifetime`: 生命周期.
- `singleton`: 单例, one instance for the application.
- `scoped`: 作用域, usually one instance per HTTP request.
- `transient`: 瞬态, new instance per resolution.
- `captive dependency`: 生命周期捕获.

In ASP.NET Core, common lifetimes are:

- `Singleton`;
- `Scoped`;
- `Transient`.

Key takeaway:

> Lifetime is mainly about caching and ownership: singleton is cached in the root provider, scoped is cached in a scope, and transient is created for each resolution.

## Mental Model

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

## Singleton

One instance is created and reused for the entire application lifetime.

```csharp
builder.Services.AddSingleton<ISystemClock, SystemClock>();
```

Use singleton for:

- stateless services;
- thread-safe shared services;
- configuration helpers;
- app-wide in-memory caches;
- expensive objects designed for reuse.

Example:

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

Why singleton is safe here:

- no request-specific state;
- no mutable shared state;
- thread-safe;
- no scoped dependency.

Be careful:

- singleton services must be thread-safe;
- singleton services cannot directly depend on scoped services;
- singleton services should not store user-specific data;
- singleton mutable state can create race conditions.

Bad singleton:

```csharp
public sealed class CurrentUserCache
{
    public string? UserId { get; set; } // bad in singleton
}
```

Why it is bad:

> All users share the same singleton instance, so one request can overwrite another request's user data.

## Scoped

One instance is created per scope. In ASP.NET Core web apps, a scope usually means one HTTP request.

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddDbContext<AppDbContext>();
```

Use scoped for:

- business services;
- repositories;
- EF Core `DbContext`;
- per-request state;
- unit-of-work style operations.

Example:

```csharp
public interface IOrderService
{
    Task<OrderDto> CreateAsync(CreateOrderRequest request, CancellationToken cancellationToken);
}

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

Registration:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<IOrderService, OrderService>();
```

Why scoped?

> `OrderService` depends on `AppDbContext`. `DbContext` tracks changes for a unit of work and is not thread-safe. A request scope is a natural unit of work for many APIs.

## Transient

A new instance is created every time it is requested.

```csharp
builder.Services.AddTransient<IEmailTemplateRenderer, EmailTemplateRenderer>();
```

Use transient for:

- lightweight stateless services;
- short-lived calculations;
- formatting/rendering helpers;
- services with no shared state.

Example:

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

Transient does not mean "always safe."

Be careful when:

- transient service is expensive to create;
- transient service owns unmanaged resources;
- transient service is disposable;
- transient service is captured by a singleton;
- transient service has mutable state.

## Lifetime Rules

Shorter-lived services should not be captured by longer-lived services.

Safe direction:

```text
Scoped -> Singleton dependency: usually OK
Transient -> Singleton dependency: usually OK
Scoped -> Transient dependency: OK if transient is safe
Singleton -> Scoped dependency: dangerous
```

Why singleton depending on scoped is dangerous:

```text
Singleton lives for the app lifetime.
Scoped service lives for one request.
```

If the singleton captures the scoped service, it may reuse request-specific data after the request is gone.

## Captive Dependency Example

Bad:

```csharp
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<AuditWriter>();

public sealed class AuditWriter
{
    private readonly ICurrentUser _currentUser;

    public AuditWriter(ICurrentUser currentUser)
    {
        _currentUser = currentUser;
    }
}
```

Problem:

> `AuditWriter` is singleton. It may hold onto one scoped `ICurrentUser`, which is request-specific.

Better option 1: make service scoped.

```csharp
builder.Services.AddScoped<AuditWriter>();
```

Better option 2: pass required data.

```csharp
public sealed class AuditWriter
{
    public Task WriteAsync(string userId, string action, CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
```

Better option 3: create a scope for background/infrastructure work.

```csharp
public sealed class AuditWorker
{
    private readonly IServiceScopeFactory _scopeFactory;

    public AuditWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task WriteAsync(string message, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        dbContext.AuditLogs.Add(new AuditLog
        {
            Message = message,
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
```

## DbContext Lifetime

`DbContext` is usually scoped because:

- it tracks changes for a unit of work;
- it maintains an identity map;
- it is not thread-safe;
- sharing it globally would cause state and concurrency bugs;
- one request often maps naturally to one unit of work.

Bad:

```csharp
builder.Services.AddSingleton<AppDbContext>();
```

Why it is wrong:

> A singleton `DbContext` would be shared across requests, accumulate tracked entities, and be used concurrently by multiple threads.

## HttpClient Lifetime

Do not create `new HttpClient()` per request.

Bad:

```csharp
public async Task<string> GetAsync()
{
    using var client = new HttpClient();
    return await client.GetStringAsync("https://api.example.com/status");
}
```

Why it is wrong:

> Creating many short-lived clients can exhaust sockets because underlying connections may remain open in `TIME_WAIT`.

Use `IHttpClientFactory`:

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri("https://api.payment.example");
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

Client:

```csharp
public sealed class PaymentClient : IPaymentClient
{
    private readonly HttpClient _httpClient;

    public PaymentClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _httpClient.PostAsJsonAsync(
            "/charges",
            request,
            cancellationToken);

        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<PaymentResult>(
            cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("Empty payment response.");
    }
}
```

## Disposable Services

The container disposes services it creates.

Rules:

- scoped disposable services are disposed when the scope ends;
- singleton disposable services are disposed when the root provider shuts down;
- disposable transients resolved from a scope may be tracked and disposed with that scope;
- disposable transients resolved from the root provider can live too long.

Bad:

```csharp
var service = app.Services.GetRequiredService<MyDisposableTransient>();
```

Why it can be bad:

> Resolving disposable transients from the root provider can keep them alive until application shutdown.

Better:

```csharp
using var scope = app.Services.CreateScope();
var service = scope.ServiceProvider.GetRequiredService<MyDisposableTransient>();
```

## Factory Registration

Factory registration is useful when construction needs configuration or special setup.

```csharp
builder.Services.AddScoped<IReportGenerator>(sp =>
{
    var db = sp.GetRequiredService<AppDbContext>();
    var logger = sp.GetRequiredService<ILogger<PdfReportGenerator>>();
    return new PdfReportGenerator(db, logger, pageSize: 50);
});
```

Be careful:

> The lifetime of the factory registration still matters. A singleton factory-created service still cannot safely capture scoped dependencies.

## Review Questions

### What is the difference between Singleton, Scoped, and Transient?

Singleton is one instance for the application lifetime. Scoped is one instance per scope, usually per HTTP request. Transient creates a new instance every time it is resolved.

### Why is injecting Scoped into Singleton dangerous?

The singleton lives longer than the scoped service. It may capture request-specific state and reuse it across requests, causing data leaks, incorrect behavior, disposed object access, and thread-safety issues.

### Why is `DbContext` scoped?

`DbContext` represents a unit of work and tracks entity changes. It is not thread-safe and should not be shared globally. Scoped lifetime matches the request/unit-of-work model.

### Is Transient always safe?

No. If a transient service is expensive to create, owns resources, is disposable, stores mutable state, or is captured by a singleton, it can still cause problems.

### Can a scoped service depend on a singleton?

Yes, usually. A shorter-lived service can depend on a longer-lived stateless/thread-safe service.

### Can a singleton depend on a transient?

Technically yes, but be careful. If the singleton stores the transient in a field, the transient effectively becomes singleton-like. That may be fine for stateless services but dangerous for stateful or disposable services.

## Common Mistakes

### Mistake: Injecting scoped service into singleton

Why it is wrong:

> The singleton may keep request-specific state beyond the request lifetime.

Better answer:

> Change the singleton to scoped, pass data into methods, or create a scope only in infrastructure/background scenarios.

### Mistake: Storing user-specific data in singleton

Why it is wrong:

> All requests share the same singleton instance, so user data can leak across requests.

Better answer:

> Store user data in scoped services, claims, request context, or persistent storage.

### Mistake: Manually building `ServiceProvider`

Why it is wrong:

> It creates a second container and can duplicate singleton instances.

Better answer:

> Let ASP.NET Core build the provider. Use factory registrations or options binding instead.

### Mistake: Registering stateful services as singleton

Why it is wrong:

> Mutable shared state must be thread-safe and can create cross-request bugs.

Better answer:

> Use scoped or transient lifetime unless the state is intentionally shared and protected.

### Mistake: Creating `HttpClient` manually per request

Why it is wrong:

> It can cause socket exhaustion and does not centralize timeout/resilience configuration.

Better answer:

> Use `IHttpClientFactory` with typed or named clients.

## Practice Task

Create:

1. `IOrderService` as scoped;
2. `IEmailTemplateRenderer` as transient;
3. `IClock` as singleton;
4. `IPaymentClient` using `IHttpClientFactory`;
5. one intentional captive dependency example and explain why it is wrong.

