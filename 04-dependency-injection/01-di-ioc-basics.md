# Dependency Injection And IoC Basics

## Core Idea

Dependency Injection is a technique where a class receives its dependencies from outside instead of creating them itself.

Chinese notes:

- `DI`: Dependency Injection, 依赖注入.
- `IoC`: Inversion of Control, 控制反转.
- `container`: 容器.

## Without DI

```csharp
public sealed class OrderService
{
    private readonly EmailSender _emailSender = new();
}
```

Problems:

- hard to test;
- tightly coupled;
- hard to replace implementation.

## With DI

```csharp
public sealed class OrderService
{
    private readonly IEmailSender _emailSender;

    public OrderService(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }
}
```

Registration:

```csharp
builder.Services.AddScoped<IEmailSender, EmailSender>();
builder.Services.AddScoped<OrderService>();
```

## Constructor Injection

Most common and recommended.

Benefits:

- dependencies are explicit;
- object cannot be created without required dependencies;
- easy to test.

## Service Container

The DI container:

- stores registrations;
- creates objects;
- resolves dependency graphs;
- manages lifetimes;
- disposes services.

## Under The Hood: How ASP.NET Core DI Works

ASP.NET Core's built-in DI container is intentionally simple and fast. It is not magic. It mainly does four things:

1. Collect service registrations.
2. Build a resolver.
3. Create object graphs.
4. Cache and dispose objects according to lifetime.

Chinese notes:

- `service descriptor`: 服务描述.
- `object graph`: 对象依赖图.
- `resolution`: 解析服务.
- `call site`: 可以理解为容器内部的创建计划.

## IServiceCollection Is A List Of Registrations

When you write:

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddSingleton<IClock, SystemClock>();
```

you are adding service descriptors to `IServiceCollection`.

Conceptually:

```text
IServiceCollection
  ServiceType: IOrderService
  ImplementationType: OrderService
  Lifetime: Scoped

  ServiceType: IClock
  ImplementationType: SystemClock
  Lifetime: Singleton
```

A service registration can be based on:

- implementation type;
- factory delegate;
- existing instance.

Examples:

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();

builder.Services.AddSingleton<IClock>(new SystemClock());

builder.Services.AddScoped<IEmailSender>(sp =>
{
    var options = sp.GetRequiredService<IOptions<EmailOptions>>();
    return new SmtpEmailSender(options.Value);
});
```

## BuildServiceProvider Creates The Runtime Resolver

At startup, ASP.NET Core builds an `IServiceProvider`.

Conceptually:

```text
IServiceCollection
  -> BuildServiceProvider
  -> IServiceProvider
  -> GetRequiredService<T>
```

The container analyzes registrations and creates an internal plan for constructing services.

For example:

```csharp
public sealed class OrderService
{
    public OrderService(
        IOrderRepository repository,
        IEmailSender emailSender,
        ILogger<OrderService> logger)
    {
    }
}
```

The container must know:

```text
To create OrderService:
  create/resolve IOrderRepository
  create/resolve IEmailSender
  create/resolve ILogger<OrderService>
  call OrderService constructor
```

That dependency tree is the object graph（对象依赖图）.

## Constructor Selection

The container uses public constructors.

If there are multiple constructors, it chooses the constructor it can satisfy, typically the one with the most parameters that can be resolved.

Example:

```csharp
public sealed class ReportService
{
    public ReportService(IReportRepository repository)
    {
    }

    public ReportService(
        IReportRepository repository,
        ILogger<ReportService> logger)
    {
    }
}
```

If both dependencies are registered, the second constructor is preferred.

Common mistake:

```csharp
public sealed class ReportService
{
    public ReportService(IReportRepository repository) {}
    public ReportService(IEmailSender emailSender) {}
}
```

If both constructors are valid and neither is clearly better, the container may fail because the choice is ambiguous.

Practical advice:

> Prefer one public constructor for application services. It makes dependencies explicit and avoids ambiguous resolution.

## Lifetime Caches

DI lifetime is mostly about caching.

### Singleton

Created once and cached in the root provider.

```text
Root IServiceProvider
  Singleton cache:
    IClock -> SystemClock instance
```

Every request gets the same singleton instance.

### Scoped

Created once per scope.

In ASP.NET Core, an HTTP request usually creates a scope.

```text
Request scope A
  AppDbContext -> instance A

Request scope B
  AppDbContext -> instance B
```

This is why `DbContext` is usually scoped.

### Transient

Created every time it is requested.

```text
Resolve IFormatter -> new JsonFormatter
Resolve IFormatter -> another new JsonFormatter
```

Transient services are not cached for reuse, but disposable transient services resolved from the container can still be tracked for disposal.

## Disposal

The container disposes services it creates if they implement `IDisposable` or `IAsyncDisposable`.

Important:

- scoped disposables are usually disposed at the end of the request scope;
- singleton disposables are disposed when the application shuts down;
- manually created objects are your responsibility unless passed as container-managed instances carefully.

Example:

```csharp
public sealed class FileExportService : IDisposable
{
    public void Dispose()
    {
        // release unmanaged or external resources
    }
}
```

Common mistake:

```csharp
using var service = serviceProvider.GetRequiredService<MyScopedService>();
```

Avoid disposing container-resolved scoped services manually in normal request code. The scope owns them.

## Open Generics

ASP.NET Core DI can register open generic types.

```csharp
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
```

Then this can be resolved:

```csharp
public sealed class OrderService
{
    public OrderService(IRepository<Order> orders)
    {
    }
}
```

The container closes the generic type:

```text
IRepository<Order> -> EfRepository<Order>
```

## IEnumerable<T> Resolution

If multiple implementations are registered:

```csharp
builder.Services.AddScoped<INotificationSender, EmailSender>();
builder.Services.AddScoped<INotificationSender, SmsSender>();
builder.Services.AddScoped<INotificationSender, PushSender>();
```

You can inject:

```csharp
public sealed class NotificationService
{
    private readonly IEnumerable<INotificationSender> _senders;

    public NotificationService(IEnumerable<INotificationSender> senders)
    {
        _senders = senders;
    }
}
```

The container returns all registered implementations in registration order.

If you inject a single `INotificationSender`, the last registration usually wins.

## Circular Dependencies

A circular dependency happens when services depend on each other.

```text
OrderService -> PaymentService -> OrderService
```

Example:

```csharp
public sealed class OrderService
{
    public OrderService(PaymentService paymentService) {}
}

public sealed class PaymentService
{
    public PaymentService(OrderService orderService) {}
}
```

The container cannot build this graph.

Fixes:

- extract shared logic into a third service;
- introduce a domain event or message;
- rethink the boundary;
- avoid using `IServiceProvider` to hide the cycle.

Engineering perspective:

> A circular dependency usually means the design boundary is wrong. I would not fix it by injecting `IServiceProvider` everywhere. I would split responsibilities or introduce an event/mediator depending on the domain.

## ValidateScopes And ValidateOnBuild

In development, validate DI configuration:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

`ValidateScopes` can catch scoped services resolved from the root provider or injected into singletons.

`ValidateOnBuild` tries to validate service graphs when building the provider.

These checks help catch configuration errors early.

## Why Manually Calling BuildServiceProvider Is Risky

Bad:

```csharp
var provider = builder.Services.BuildServiceProvider();
var options = provider.GetRequiredService<IOptions<MyOptions>>();
```

Problems:

- creates a second service provider;
- singleton services may be created twice;
- scoped lifetime validation can be bypassed;
- disposal can become confusing.

Better:

```csharp
builder.Services.AddOptions<MyOptions>()
    .BindConfiguration("MyOptions")
    .ValidateDataAnnotations();
```

Or use a factory registration if runtime service access is needed.

## What The Built-in Container Does Not Try To Be

The built-in container is enough for most ASP.NET Core applications, but it is not a full advanced IoC container.

It has limited support for:

- property injection;
- convention-based assembly scanning without extensions;
- complex decorators without helper libraries;
- advanced interception;
- named/keyed patterns in older .NET versions.

For decorators and scanning, teams often use libraries such as Scrutor.

Engineering perspective:

> I prefer the built-in container unless I have a real requirement it cannot handle. A simpler container reduces magic and makes dependency graphs easier to reason about.

## DI vs Service Locator

Service locator:

```csharp
var service = serviceProvider.GetRequiredService<IOrderService>();
```

This hides dependencies.

Use direct constructor injection for normal application code.

## Review Questions

### What is dependency injection?

> DI is a technique where dependencies are provided to a class from outside, usually by a container, instead of the class constructing them itself.

### What is IoC?

> Inversion of Control means the framework/container controls object creation and dependency wiring instead of application code doing it manually.

### Why use DI?

> It reduces coupling, improves testability, makes dependencies explicit, and allows implementations to be replaced.

### How does the DI container create an object?

> It looks up the service registration, chooses a constructor it can satisfy, resolves all constructor dependencies recursively, creates the object, then caches or disposes it according to its lifetime.

### What is the difference between registration and resolution?

> Registration is adding service descriptors to `IServiceCollection`. Resolution is asking `IServiceProvider` for an instance, which causes the container to build or retrieve the object graph.

### Why is injecting IServiceProvider everywhere a smell?

> It hides real dependencies, makes the class harder to test, and often turns DI into a service locator. It is acceptable in infrastructure-level factories or scope creation scenarios, but not as a default application pattern.

## Common Mistakes

### Mistake: Injecting `IServiceProvider` everywhere

Why it is wrong:

> It hides the real dependencies of the class. The constructor no longer tells readers what the class needs.

Better answer:

> Use constructor injection for normal application services. Use `IServiceProvider` only in infrastructure code such as factories, background scope creation, or integration points where dynamic resolution is genuinely needed.

### Mistake: Hidden dependencies

Why it is wrong:

> Hidden dependencies make tests harder and make runtime failures more likely because missing services are discovered only when a code path executes.

Better answer:

> Make required dependencies explicit through constructor parameters.

### Mistake: Too many dependencies in one class

Why it is wrong:

> A large constructor often means the class has too many responsibilities.

Better answer:

> Split orchestration, domain logic, persistence, external integration, and formatting responsibilities where appropriate.

### Mistake: Registering the wrong lifetime

Why it is wrong:

> Lifetime bugs can create stale state, cross-request data leaks, thread-safety problems, and disposed object errors.

Better answer:

> Choose lifetime based on state, thread safety, resource ownership, and dependency lifetimes.

### Mistake: Using DI to hide poor design

Why it is wrong:

> DI can wire a complicated graph, but it does not make the design clean. A messy dependency graph is still messy.

Better answer:

> Use DI to make boundaries explicit, then improve the boundaries when the graph becomes hard to reason about.

### Mistake: Creating a second provider with `BuildServiceProvider`

Why it is wrong:

> It can create duplicate singleton instances, bypass validation, and make disposal confusing.

Better answer:

> Let ASP.NET Core build the provider. Use options binding, factory registrations, or hosted services instead of manually building another provider.

### Mistake: Hiding circular dependencies with service locator

Why it is wrong:

> The circular design still exists, but the container can no longer warn you clearly at construction time.

Better answer:

> Break the cycle by extracting a third service, publishing a domain event, or moving orchestration to a higher-level service.

### Mistake: Forgetting disposal behavior

Why it is wrong:

> Services created by the container are normally disposed by the owning scope/provider. Manual disposal can break other consumers, while resolving disposable transients from the root provider can hold them too long.

Better answer:

> Let the DI scope manage services it creates. Be careful with disposable transients and root-provider resolution.

## Practice Task

Create a small dependency graph:

1. `OrdersController`;
2. `IOrderService`;
3. `IOrderRepository`;
4. `IEmailSender`;
5. `IClock`.

Then write down:

- each service registration;
- each lifetime choice;
- which object is created once per request;
- which object is safe as singleton;
- what would go wrong if `OrderService` injected `IServiceProvider` and resolved dependencies manually.
