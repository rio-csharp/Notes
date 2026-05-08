# Dependency Injection And IoC Basics

## Core Idea

Dependency injection is a design technique in which a class receives the collaborators it needs from outside instead of constructing them internally. In ASP.NET Core, this technique is supported by the built-in dependency injection container, but the underlying architectural value is broader than the framework feature itself. DI makes object relationships explicit, reduces coupling to concrete implementations, and moves object graph construction into a dedicated composition mechanism.

The later files examine lifetimes, lifetime mismatches, factories, and decorators in more detail.

## From Direct Construction To Injected Dependencies

The simplest way to see the difference is to compare a class that creates its own collaborator with one that receives it.

```csharp
public sealed class OrderService
{
    private readonly EmailSender _emailSender = new();
}
```

This design hardcodes the dependency choice inside the class. That increases coupling because the class now decides both its own behavior and the construction of one of its collaborators.

With dependency injection:

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

```csharp
builder.Services.AddScoped<IEmailSender, EmailSender>();
builder.Services.AddScoped<OrderService>();
```

The class now describes what it needs, while another part of the application decides which implementation should satisfy that need. This is the core separation that makes dependency injection valuable.

## Constructor Injection As The Default

Constructor injection is the standard form of DI in ASP.NET Core because it keeps dependencies explicit and required.

A constructor communicates several useful things at once:

- which collaborators the type depends on;
- which dependencies are mandatory for the type to function;
- what object graph the container must be able to construct.

This is one reason constructor injection is usually preferable to hiding service resolution behind properties or broad `IServiceProvider` access. The type advertises its requirements directly rather than forcing readers to discover them by reading method bodies.

## Inversion Of Control And Composition

Dependency injection is one practical form of a broader idea: inversion of control.

Without IoC, application code often creates and wires objects manually in many different places. With IoC, object creation and wiring are delegated to the application's composition mechanism. In ASP.NET Core, that mechanism is the DI container configured through `IServiceCollection` and exposed through `IServiceProvider`.

This changes where object-graph decisions live. Business types focus on behavior. Application composition decides how concrete implementations are assembled.

## Container Responsibilities

ASP.NET Core's built-in container is intentionally simple. It does not attempt to be an all-powerful runtime framework. At a high level, it does four things:

1. collect service registrations;
2. build a resolver;
3. construct object graphs;
4. cache and dispose services according to lifetime rules.

Those responsibilities are enough for most applications, and understanding them is more useful than treating the container as magic.

## `IServiceCollection` As Registration Data

When code registers services:

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddSingleton<IClock, SystemClock>();
```

it is adding service descriptors to `IServiceCollection`.

Conceptually, the registration data looks like this:

```text
IServiceCollection
  ServiceType: IOrderService
  ImplementationType: OrderService
  Lifetime: Scoped

  ServiceType: IClock
  ImplementationType: SystemClock
  Lifetime: Singleton
```

Registrations can point to:

- an implementation type;
- a factory delegate;
- an already-created instance.

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();

builder.Services.AddSingleton<IClock>(new SystemClock());

builder.Services.AddScoped<IEmailSender>(sp =>
{
    var options = sp.GetRequiredService<IOptions<EmailOptions>>();
    return new SmtpEmailSender(options.Value);
});
```

This registration phase defines what the container is allowed to build later. It does not usually create the full graph immediately.

When multiple registration sources may compete for the same service type, `TryAdd` variants prevent duplicate registrations from silently replacing earlier ones:

```csharp
services.TryAddScoped<IOrderService, OrderService>();
```

`TryAdd` registers the service only if no registration for the same service type already exists. This is useful in library code where the consumer should be able to override the default implementation, or when convention-based scanning may encounter duplicate matches.

`TryAddEnumerable` extends this to `IEnumerable<T>` resolution: it registers an additional implementation only if no existing registration has both the same service type and the same implementation type. This prevents duplicate entries in composite resolution while still allowing multiple distinct implementations of the same interface:

```csharp
services.TryAddEnumerable(ServiceDescriptor.Scoped<INotificationSender, EmailSender>());
services.TryAddEnumerable(ServiceDescriptor.Scoped<INotificationSender, SmsSender>());
// A second call to TryAddEnumerable for EmailSender is a no-op.
```

## Building The Service Provider

At startup, ASP.NET Core builds an `IServiceProvider` from the collected registrations.

```text
IServiceCollection
  -> BuildServiceProvider
  -> IServiceProvider
```

The provider is the runtime object responsible for resolution. When a service is requested, the provider consults the registrations, determines how to construct the graph, applies lifetime rules, and either creates or reuses instances as required.

Resolution has two forms with different failure behavior. `GetRequiredService<T>()` throws `InvalidOperationException` when the service is not registered — the correct choice when the dependency is mandatory. `GetService<T>()` returns `null` for unregistered reference types — useful for optional dependencies where the caller handles the absent case:

```csharp
var logger = provider.GetService<ILogger<OrderService>>();
if (logger is not null)
{
    logger.LogInformation("Optional logging path.");
}
```

`GetRequiredService<T>` is the dominant form in constructor injection because the container resolves constructor parameters through it. A constructor parameter that cannot be resolved fails at graph construction time, not at first use.

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

The provider must be able to satisfy all three constructor dependencies before it can create `OrderService`. In effect, the service's constructor defines a piece of the application graph, and the container recursively walks that graph during resolution.

## Constructor Selection And Graph Resolution

The built-in container resolves services through public constructors. When multiple public constructors exist, the container attempts to use the constructor with the most parameters that it can fully resolve from registered services. If two constructors are equally viable and ambiguity remains, resolution throws an `InvalidOperationException`.

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

If both `IReportRepository` and `ILogger<ReportService>` are registered, the second constructor is chosen. If `ILogger<ReportService>` is not registered, the first constructor is used.

For that reason, ordinary application services are usually better with one public constructor. The goal is not merely to satisfy the container. It is to make the dependency model of the type obvious.

## Lifetimes As Reuse Rules

The container does not simply create objects blindly. It also applies reuse rules based on lifetime. Singleton, scoped, and transient are therefore not mere labels. They define how long resolved objects remain valid and how widely they are shared.

Lifetime is treated in depth in the next file, but it helps to preview the central idea here:

- singleton services are reused for the application lifetime;
- scoped services are reused within a scope;
- transient services are created on demand.

This is why DI design is inseparable from runtime behavior. A registration is also a statement about ownership and reuse.

## Disposal And Ownership

The container also owns disposal for services it creates.

If a service implements `IDisposable` or `IAsyncDisposable`, the container tracks and disposes it according to the owning scope or provider. This matters because service resolution is not just object creation. It is also lifetime ownership.

That ownership model is one reason manually constructing some dependencies while allowing the container to construct others can lead to confusion unless the design is deliberate about who owns disposal responsibility.

## Open Generics, Collections, And Composite Graphs

The built-in container supports more than one-to-one simple type resolution.

Open generic registration is a common example:

```csharp
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
```

If a consumer depends on `IRepository<Order>`, the container can close the generic type to `EfRepository<Order>` at resolution time.

The container can also resolve all registrations of the same service type through `IEnumerable<T>`:

```csharp
builder.Services.AddScoped<INotificationSender, EmailSender>();
builder.Services.AddScoped<INotificationSender, SmsSender>();
builder.Services.AddScoped<INotificationSender, PushSender>();
```

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

This ability to build composite graphs is part of why the built-in container is powerful enough for many application architectures even without exotic features.

## Circular Dependencies And Boundary Problems

The container cannot resolve cycles such as:

```text
OrderService -> PaymentService -> OrderService
```

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

This kind of failure is usually more than a registration issue. It often indicates that the service boundaries themselves are wrong. The best fix is often to extract shared behavior, introduce messaging or domain events, or separate responsibilities more clearly rather than trying to hide the cycle behind `IServiceProvider`.

## The Service Locator Temptation

One of the fastest ways to weaken DI's benefits is to inject `IServiceProvider` broadly into application code and resolve arbitrary services at runtime.

```csharp
var service = serviceProvider.GetRequiredService<IOrderService>();
```

This style hides dependencies, delays missing-registration failures until runtime, and makes types harder to reason about because their real requirements are no longer visible in their constructors.

There are legitimate uses of `IServiceProvider` and `IServiceScopeFactory`, especially in infrastructure code, factories, or background-service scope creation. But in ordinary application services, constructor injection remains the clearer and more stable default.

## The Built-In Container's Intentional Simplicity

ASP.NET Core's built-in container is designed to be fast, predictable, and sufficient for common scenarios. It is not intended to provide every advanced IoC feature ever invented.

Its built-in support for property injection, interception, advanced decorator wiring, and convention-heavy assembly scanning is deliberately limited. When those needs are real, libraries such as Scrutor can extend the model in targeted ways. This is often preferable to replacing the whole container prematurely, because a simpler container tends to make dependency graphs easier to understand and debug.
