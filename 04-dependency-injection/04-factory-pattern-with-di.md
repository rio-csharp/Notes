# Factory Pattern With Dependency Injection

## Core Idea

Dependency injection works best when the container can decide the full object graph at composition time. Factories become useful when that is not enough: when object creation depends on runtime values, when multiple implementations are valid and the choice depends on input, or when a service must create a short-lived object with parameters the container cannot know in advance.

Factories are not an alternative to dependency injection. They are one of the ways DI remains explicit even when object creation becomes dynamic. The central design question is whether the factory preserves visible dependencies or collapses into a disguised service locator.

## Constructor Injection As The Default

Many situations that seem to invite a factory do not actually need one.

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
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<OrderService>();
```

No factory is required here because the dependency is fixed. The consumer does not choose the implementation at runtime, and the container can construct the graph directly.

Factories are most useful when there is a genuine creation decision left unresolved until runtime.

## Factories As Runtime Selection Boundaries

Factories are appropriate when:

- implementation choice depends on runtime input;
- construction requires runtime parameters;
- several implementations of the same role exist and selection should be centralized;
- object creation is dynamic but should still remain explicit and testable.

Typical examples include:

```text
channel = email -> EmailSender
channel = sms   -> SmsSender

reportType = pdf  -> PdfReportGenerator
reportType = xlsx -> ExcelReportGenerator
```

The factory's purpose is to keep that decision in one place rather than distributing it across callers.

That boundary matters for more than cleanliness. Once runtime selection logic is duplicated across controllers, handlers, or background jobs, the application no longer has one consistent composition rule for that family of services. Validation, fallback behavior, telemetry, and policy checks begin to drift apart. A factory is therefore valuable not only because it creates objects, but because it centralizes one specific creation policy.

## A Focused Selection Factory

A simple example is notification-channel selection.

```csharp
public interface INotificationSender
{
    Task SendAsync(string message, CancellationToken cancellationToken);
}
```

```csharp
public sealed class EmailSender : INotificationSender
{
    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        Console.WriteLine($"Email: {message}");
        return Task.CompletedTask;
    }
}

public sealed class SmsSender : INotificationSender
{
    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        Console.WriteLine($"SMS: {message}");
        return Task.CompletedTask;
    }
}
```

```csharp
public enum NotificationChannel
{
    Email,
    Sms
}
```

```csharp
public sealed class NotificationSenderFactory
{
    private readonly IServiceProvider _serviceProvider;

    public NotificationSenderFactory(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public INotificationSender Create(NotificationChannel channel)
    {
        return channel switch
        {
            NotificationChannel.Email => _serviceProvider.GetRequiredService<EmailSender>(),
            NotificationChannel.Sms => _serviceProvider.GetRequiredService<SmsSender>(),
            _ => throw new ArgumentOutOfRangeException(nameof(channel), channel, null)
        };
    }
}
```

```csharp
builder.Services.AddTransient<EmailSender>();
builder.Services.AddTransient<SmsSender>();
builder.Services.AddScoped<NotificationSenderFactory>();
```

```csharp
public sealed class NotificationService
{
    private readonly NotificationSenderFactory _factory;

    public NotificationService(NotificationSenderFactory factory)
    {
        _factory = factory;
    }

    public async Task NotifyAsync(
        NotificationChannel channel,
        string message,
        CancellationToken cancellationToken)
    {
        var sender = _factory.Create(channel);
        await sender.SendAsync(message, cancellationToken);
    }
}
```

This works because the factory has a narrow and meaningful purpose. The application service still depends on a domain-relevant abstraction rather than on arbitrary runtime access to the container.

The deeper point is that the factory API exposes a business decision, not a container capability. `Create(NotificationChannel channel)` says that the application chooses a sender by channel. It does not expose registration mechanics, named strings, or generic runtime resolution as part of the domain model.

## Narrow Factory Boundaries Versus Service Location

The presence of `IServiceProvider` inside a factory does not automatically make the design a service locator. The difference lies in scope and purpose.

If a class injects `IServiceProvider` merely to resolve any service it feels like at runtime, the container has leaked into ordinary application code and dependencies are hidden. If a factory uses the provider only to construct one family of related choices behind an explicit method, the design remains focused and understandable.

The container is hidden inside the factory, but the decision boundary is still visible in the factory's public API.

## Delegate Factories

For smaller cases, a delegate factory can be enough.

```csharp
builder.Services.AddTransient<EmailSender>();
builder.Services.AddTransient<SmsSender>();

builder.Services.AddScoped<Func<NotificationChannel, INotificationSender>>(sp => channel =>
{
    return channel switch
    {
        NotificationChannel.Email => sp.GetRequiredService<EmailSender>(),
        NotificationChannel.Sms => sp.GetRequiredService<SmsSender>(),
        _ => throw new ArgumentOutOfRangeException(nameof(channel), channel, null)
    };
});
```

```csharp
public sealed class NotificationService
{
    private readonly Func<NotificationChannel, INotificationSender> _senderFactory;

    public NotificationService(Func<NotificationChannel, INotificationSender> senderFactory)
    {
        _senderFactory = senderFactory;
    }

    public Task NotifyAsync(
        NotificationChannel channel,
        string message,
        CancellationToken cancellationToken)
    {
        var sender = _senderFactory(channel);
        return sender.SendAsync(message, cancellationToken);
    }
}
```

This pattern is compact, but named factory classes often age better when logic becomes richer, validation becomes more complex, or the factory itself needs tests and documentation.

Delegate factories also have a discoverability cost. A named type communicates intent in the object graph and gives the selection rule a natural home for explanation and testing. A bare `Func<...>` stays lightweight, but it is easier for that lightweight pattern to become opaque once the decision logic stops being trivial.

## Keyed Services And Selection By Identity

Modern .NET also supports keyed services, which can be useful when several implementations of the same interface are distinguished by names or keys.

```csharp
builder.Services.AddKeyedTransient<INotificationSender, EmailSender>("email");
builder.Services.AddKeyedTransient<INotificationSender, SmsSender>("sms");
```

```csharp
var sender = serviceProvider.GetRequiredKeyedService<INotificationSender>("email");
```

Keyed services reduce the need for some manual selection plumbing, but they do not remove the design question. Raw string keys scattered throughout the application can become their own loosely typed protocol. A focused factory or a shared key abstraction often remains clearer when selection is a meaningful part of the domain.

For that reason, keyed services are often most effective as infrastructure support rather than as the entire public design. They can simplify registration and resolution internally while a factory, policy object, or dedicated abstraction still presents a more stable API to the rest of the application.

`KeyedService.AnyKey` (.NET 8+) provides a fallback registration that matches any key not explicitly registered. A common use case is a default implementation with specific overrides:

```csharp
// Premium accounts get a dedicated cache.
builder.Services.AddKeyedSingleton<ICache>("premium", new PremiumCache());
// All other keys resolve to the default.
builder.Services.AddKeyedSingleton<ICache>(KeyedService.AnyKey, (sp, key) => new DefaultCache(key?.ToString()));
```

Requesting `ICache` with key `"premium"` returns the dedicated instance; requesting with any other key creates a `DefaultCache` via the fallback factory that receives the key as context.

## Factories For Runtime Parameters

Some object creation cannot be handled by the container alone because part of the constructor data exists only at runtime.

```csharp
public sealed class ReportExportJob
{
    public ReportExportJob(
        int reportId,
        string requestedBy,
        IReportRepository repository,
        ILogger<ReportExportJob> logger)
    {
        ReportId = reportId;
        RequestedBy = requestedBy;
        Repository = repository;
        Logger = logger;
    }

    public int ReportId { get; }
    public string RequestedBy { get; }
    private IReportRepository Repository { get; }
    private ILogger<ReportExportJob> Logger { get; }
}
```

```csharp
public sealed class ReportExportJobFactory
{
    private readonly IReportRepository _repository;
    private readonly ILogger<ReportExportJob> _logger;

    public ReportExportJobFactory(
        IReportRepository repository,
        ILogger<ReportExportJob> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public ReportExportJob Create(int reportId, string requestedBy)
    {
        return new ReportExportJob(reportId, requestedBy, _repository, _logger);
    }
}
```

This is one of the most legitimate uses of a factory in DI-heavy code. The static dependencies remain injected. The dynamic values become explicit method parameters. The factory bridges the gap without hiding what the created object actually needs.

This use case also shows why factories are often preferable to overloading the container with data it should not own. A report identifier, tenant identifier, file path, or user-selected export format belongs to a specific operation. Treating such values as method parameters keeps them at the correct boundary instead of smearing request-specific data into registration code.

## Factory Lifetime Still Matters

Factories do not escape lifetime rules any more than factory registrations do.

```csharp
builder.Services.AddScoped<AppDbContext>();
builder.Services.AddSingleton<ReportExportJobFactory>();
```

If the factory captures `AppDbContext`, the design now has the same lifetime problem as any other singleton depending on scoped infrastructure.

A factory's lifetime must therefore remain compatible with the lifetimes of the dependencies it stores. If it depends on scoped services, it is usually scoped as well.

```csharp
builder.Services.AddScoped<ReportExportJobFactory>();
```

In long-lived infrastructure such as background services, the usual solution is to create a scope and resolve the factory inside that scope rather than stretching the factory's dependencies into singleton lifetime.

### Async Factory Deadlocks

A factory registration delegate must not perform asynchronous work synchronously. The DI container calls the factory synchronously during resolution. Using `Task.Result` or `GetAwaiter().GetResult()` inside a factory lambda blocks the resolving thread and can deadlock when the resolution itself occurs on a thread with a captured `SynchronizationContext`:

```csharp
// ANTI-PATTERN — causes deadlocks.
builder.Services.AddSingleton<IPaymentClient>(sp =>
{
    var options = sp.GetRequiredService<IOptions<PaymentOptions>>();
    return CreateClientAsync(options.Value).Result; // blocks, risks deadlock
});
```

The correct approach is to keep factory delegates synchronous. If asynchronous initialization is required, defer it to an `InitializeAsync` method called after resolution, use a factory pattern with a separate async creation step, or register a wrapper that lazily initializes the underlying async resource on first use.

In practice, this means factory design should be reviewed with the same discipline as any other service. A factory is not automatically "just glue code." If it stores collaborators, coordinates policy, or creates disposable runtime objects, its lifetime and ownership model need to be explicit.

## The Real Service Locator Problem

The service locator anti-pattern appears when arbitrary runtime resolution replaces explicit dependencies.

```csharp
public sealed class OrderService
{
    private readonly IServiceProvider _serviceProvider;

    public OrderService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task CreateAsync()
    {
        var repository = _serviceProvider.GetRequiredService<IOrderRepository>();
        var sender = _serviceProvider.GetRequiredService<IEmailSender>();
    }
}
```

This hides the true requirements of the class, makes failures more implicit, and turns the object into a runtime composition root of its own. That is very different from a narrow factory such as:

```csharp
public interface INotificationSenderFactory
{
    INotificationSender Create(NotificationChannel channel);
}
```

The difference is not merely stylistic. One preserves visible intent. The other makes dependency structure harder to see and test.

The practical test is straightforward. If the factory can be described as a stable creation policy in the language of the domain or the infrastructure boundary, it is usually legitimate. If it mainly exists to give a class ad hoc access to the container, it is probably a service locator in disguise.
