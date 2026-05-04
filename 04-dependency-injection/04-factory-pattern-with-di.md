# Factory Pattern With Dependency Injection

## Core Idea

Factories create objects when construction requires runtime data, selection logic, or parameters that are not known at DI registration time.

Chinese notes:

- `factory`: 工厂.
- `runtime data`: 运行时数据.
- `selection logic`: 选择逻辑.
- `service locator`: 服务定位器, an anti-pattern when overused.
- `keyed service`: 带 key 的服务.

DI creates services. Factories help when you need dynamic creation.

Key takeaway:

> I use a factory when the caller needs to choose an implementation based on runtime input, but I keep the factory focused so it does not become a service locator.

## When DI Alone Is Enough

If the dependency is fixed, use normal constructor injection.

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
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<OrderService>();
```

No factory is needed because there is one clear implementation.

## When A Factory Is Useful

Use a factory when:

- implementation depends on runtime data;
- object creation needs runtime parameters;
- multiple implementations are valid;
- creation logic is complex but should be centralized;
- you want to hide keyed-service or selection details.

Examples:

```text
channel = "email" -> EmailSender
channel = "sms"   -> SmsSender

reportType = "pdf"  -> PdfReportGenerator
reportType = "xlsx" -> ExcelReportGenerator
```

## Simple Factory

Service interface:

```csharp
public interface INotificationSender
{
    Task SendAsync(string message, CancellationToken cancellationToken);
}
```

Implementations:

```csharp
public sealed class EmailSender : INotificationSender
{
    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        Console.WriteLine($"Email: {message}");
        return Task.CompletedTask;
    }
}
```

```csharp
public sealed class SmsSender : INotificationSender
{
    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        Console.WriteLine($"SMS: {message}");
        return Task.CompletedTask;
    }
}
```

Factory:

```csharp
public sealed class NotificationSenderFactory
{
    private readonly IServiceProvider _serviceProvider;

    public NotificationSenderFactory(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public INotificationSender Create(string channel)
    {
        return channel.ToLowerInvariant() switch
        {
            "email" => _serviceProvider.GetRequiredService<EmailSender>(),
            "sms" => _serviceProvider.GetRequiredService<SmsSender>(),
            _ => throw new NotSupportedException($"Channel '{channel}' is not supported.")
        };
    }
}
```

Registration:

```csharp
builder.Services.AddTransient<EmailSender>();
builder.Services.AddTransient<SmsSender>();
builder.Services.AddScoped<NotificationSenderFactory>();
```

Usage:

```csharp
public sealed class NotificationService
{
    private readonly NotificationSenderFactory _factory;

    public NotificationService(NotificationSenderFactory factory)
    {
        _factory = factory;
    }

    public async Task NotifyAsync(
        string channel,
        string message,
        CancellationToken cancellationToken)
    {
        var sender = _factory.Create(channel);
        await sender.SendAsync(message, cancellationToken);
    }
}
```

Why this is acceptable:

> `IServiceProvider` is hidden inside a focused factory. Application services still depend on a meaningful domain abstraction, not on the whole container.

## Avoid Runtime Strings Everywhere

Scattered strings are fragile.

Bad:

```csharp
factory.Create("EMAIL");
factory.Create("email");
factory.Create("Email");
```

Better:

```csharp
public enum NotificationChannel
{
    Email,
    Sms
}
```

```csharp
public INotificationSender Create(NotificationChannel channel)
{
    return channel switch
    {
        NotificationChannel.Email => _serviceProvider.GetRequiredService<EmailSender>(),
        NotificationChannel.Sms => _serviceProvider.GetRequiredService<SmsSender>(),
        _ => throw new ArgumentOutOfRangeException(nameof(channel), channel, null)
    };
}
```

## Factory Delegate

A factory delegate can be registered directly.

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

Usage:

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

Trade-off:

> Delegate factories are compact, but a named factory class is easier to test and document when selection logic grows.

## Keyed Services

Modern .NET supports keyed services.

Registration:

```csharp
builder.Services.AddKeyedTransient<INotificationSender, EmailSender>("email");
builder.Services.AddKeyedTransient<INotificationSender, SmsSender>("sms");
```

Usage through provider:

```csharp
var sender = serviceProvider.GetRequiredKeyedService<INotificationSender>("email");
```

Attribute injection can also be used in supported scenarios:

```csharp
public sealed class WelcomeService
{
    private readonly INotificationSender _emailSender;

    public WelcomeService([FromKeyedServices("email")] INotificationSender emailSender)
    {
        _emailSender = emailSender;
    }
}
```

Note:

> Keyed services are useful, but I still avoid spreading raw keys everywhere. A focused factory or constants can keep the code maintainable.

## Factory For Runtime Parameters

DI cannot know values that exist only at runtime.

Example:

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

Factory:

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

This is not service locator because:

- dependencies are explicit in the factory constructor;
- runtime values are explicit method parameters;
- the factory has one focused purpose.

## Factory Lifetime Rules

Factory lifetime still matters.

Bad:

```csharp
builder.Services.AddScoped<AppDbContext>();
builder.Services.AddSingleton<ReportExportJobFactory>();
```

If `ReportExportJobFactory` injects `AppDbContext`, it creates a captive dependency.

Better:

```csharp
builder.Services.AddScoped<ReportExportJobFactory>();
```

Or for background work:

```csharp
public sealed class ReportWorker
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ReportWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var factory = scope.ServiceProvider.GetRequiredService<ReportExportJobFactory>();
        var job = factory.Create(reportId: 123, requestedBy: "system");

        await Task.CompletedTask;
    }
}
```

## Factory vs Service Locator

Service locator anti-pattern:

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

Why it is bad:

- dependencies are hidden;
- tests are harder;
- missing registrations fail at runtime;
- class can resolve anything;
- responsibility is unclear.

Focused factory:

```csharp
public interface INotificationSenderFactory
{
    INotificationSender Create(NotificationChannel channel);
}
```

Why it is better:

- purpose is clear;
- selection logic is centralized;
- application service depends on a meaningful abstraction;
- the factory can be tested directly.

## Review Questions

### When do you use factory with DI?

Use a factory when the implementation choice depends on runtime data, or when object creation needs runtime parameters not known at registration time.

### Is factory the same as service locator?

Not always. A focused factory for one domain concept is acceptable. It becomes service locator when application code injects `IServiceProvider` broadly and resolves arbitrary dependencies.

### How do keyed services help?

Keyed services allow multiple implementations of the same interface to be registered and resolved by key. They are useful for provider/channel selection, but raw keys should be managed carefully.

### What lifetime should a factory have?

The factory lifetime must be compatible with its dependencies. If it depends on scoped services, it should usually be scoped. A singleton factory should not capture scoped dependencies.

### How do you test a factory?

Test supported keys/channels, unsupported cases, lifetime assumptions if relevant, and whether the correct implementation is returned.

## Common Mistakes

### Mistake: Injecting `IServiceProvider` everywhere

Why it is wrong:

> It turns DI into service locator and hides dependencies.

Better answer:

> Use constructor injection by default. Put dynamic resolution behind focused factories.

### Mistake: Factories that know too much

Why it is wrong:

> A giant factory becomes a central dependency hub and violates separation of concerns.

Better answer:

> Keep factories focused by domain concept, such as notification sender factory or report generator factory.

### Mistake: Runtime strings scattered everywhere

Why it is wrong:

> Typos become runtime failures and refactoring becomes risky.

Better answer:

> Use enums, constants, typed keys, or a focused factory API.

### Mistake: Not testing unsupported cases

Why it is wrong:

> Unknown runtime input may fail in production with unclear errors.

Better answer:

> Test unsupported keys/channels and return clear exceptions or validation errors.

### Mistake: Singleton factory captures scoped services

Why it is wrong:

> This is still a captive dependency even if the scoped service is inside a factory.

Better answer:

> Match the factory lifetime to its dependencies or create scopes explicitly in background infrastructure.

## Practice Task

Create:

1. `INotificationSender`;
2. `EmailSender`;
3. `SmsSender`;
4. `NotificationSenderFactory`;
5. an enum-based channel selection;
6. a test case for unsupported channel;
7. a short explanation of why the factory is not service locator.

