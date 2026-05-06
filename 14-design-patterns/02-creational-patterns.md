# Creational Design Patterns

## Core Idea

Creational patterns organize object creation.

They are useful when creation is more complex than calling `new`, such as when:

- creation depends on runtime data;
- object construction has many valid combinations;
- related objects must be created as a family;
- lifetime must be controlled by DI;
- test data setup needs to be readable.

## Factory Method

Factory Method creates an object through a method instead of direct construction.

Use it when creation depends on input or runtime conditions.

### Simple Factory

```csharp
public interface INotificationSender
{
    Task SendAsync(NotificationMessage message, CancellationToken ct);
}

public sealed class EmailNotificationSender : INotificationSender
{
    public Task SendAsync(NotificationMessage message, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}

public sealed class SmsNotificationSender : INotificationSender
{
    public Task SendAsync(NotificationMessage message, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

```csharp
public sealed class NotificationSenderFactory
{
    public INotificationSender Create(string channel)
    {
        return channel.ToLowerInvariant() switch
        {
            "email" => new EmailNotificationSender(),
            "sms" => new SmsNotificationSender(),
            _ => throw new NotSupportedException($"Channel '{channel}' is not supported.")
        };
    }
}
```

This is easy, but it does not use DI. If senders have dependencies, manual `new` becomes painful.

## Factory With DI

Register implementations:

```csharp
builder.Services.AddScoped<EmailNotificationSender>();
builder.Services.AddScoped<SmsNotificationSender>();
builder.Services.AddScoped<NotificationSenderFactory>();
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
            "email" => _serviceProvider.GetRequiredService<EmailNotificationSender>(),
            "sms" => _serviceProvider.GetRequiredService<SmsNotificationSender>(),
            _ => throw new NotSupportedException($"Channel '{channel}' is not supported.")
        };
    }
}
```

This is acceptable when the factory is the composition boundary. Avoid spreading `IServiceProvider` across application logic.

## Factory Without Service Locator

A cleaner option is to inject all implementations.

```csharp
public interface INotificationSender
{
    string Channel { get; }
    Task SendAsync(NotificationMessage message, CancellationToken ct);
}
```

```csharp
public sealed class EmailNotificationSender : INotificationSender
{
    public string Channel => "email";

    public Task SendAsync(NotificationMessage message, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

```csharp
public sealed class NotificationSenderFactory
{
    private readonly IReadOnlyDictionary<string, INotificationSender> _senders;

    public NotificationSenderFactory(IEnumerable<INotificationSender> senders)
    {
        _senders = senders.ToDictionary(
            sender => sender.Channel,
            StringComparer.OrdinalIgnoreCase);
    }

    public INotificationSender Create(string channel)
    {
        if (_senders.TryGetValue(channel, out var sender))
        {
            return sender;
        }

        throw new NotSupportedException($"Channel '{channel}' is not supported.");
    }
}
```

DI:

```csharp
builder.Services.AddScoped<INotificationSender, EmailNotificationSender>();
builder.Services.AddScoped<INotificationSender, SmsNotificationSender>();
builder.Services.AddScoped<NotificationSenderFactory>();
```

This keeps dependencies visible.

## Keyed Services

Modern .NET supports keyed services.

```csharp
builder.Services.AddKeyedScoped<INotificationSender, EmailNotificationSender>("email");
builder.Services.AddKeyedScoped<INotificationSender, SmsNotificationSender>("sms");
```

Factory:

```csharp
public sealed class KeyedNotificationSenderFactory
{
    private readonly IServiceProvider _serviceProvider;

    public KeyedNotificationSenderFactory(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public INotificationSender Create(string channel)
    {
        return _serviceProvider.GetRequiredKeyedService<INotificationSender>(channel);
    }
}
```

Keyed services are useful when runtime selection is explicit and limited.

## Abstract Factory

Abstract Factory creates families of related objects.

Example: different payment providers create related objects for authorization, capture, and refund.

```csharp
public interface IPaymentProviderFactory
{
    IPaymentAuthorizer CreateAuthorizer();
    IPaymentCapturer CreateCapturer();
    IRefundProcessor CreateRefundProcessor();
}
```

Stripe factory:

```csharp
public sealed class StripePaymentProviderFactory : IPaymentProviderFactory
{
    private readonly StripeClient _client;

    public StripePaymentProviderFactory(StripeClient client)
    {
        _client = client;
    }

    public IPaymentAuthorizer CreateAuthorizer()
    {
        return new StripePaymentAuthorizer(_client);
    }

    public IPaymentCapturer CreateCapturer()
    {
        return new StripePaymentCapturer(_client);
    }

    public IRefundProcessor CreateRefundProcessor()
    {
        return new StripeRefundProcessor(_client);
    }
}
```

Use Abstract Factory when the family must stay consistent. Do not mix Stripe authorization with PayPal refund by accident.

## Builder

Builder creates complex objects step by step.

It is especially useful for:

- test data;
- objects with many optional values;
- immutable objects;
- request objects with readable setup.

### Test Data Builder

```csharp
public sealed class OrderBuilder
{
    private int _customerId = 100;
    private readonly List<OrderItem> _items = new();
    private OrderStatus _status = OrderStatus.Draft;

    public OrderBuilder ForCustomer(int customerId)
    {
        _customerId = customerId;
        return this;
    }

    public OrderBuilder WithItem(int productId = 1, int quantity = 1, decimal unitPrice = 10)
    {
        _items.Add(new OrderItem(productId, quantity, unitPrice));
        return this;
    }

    public OrderBuilder Submitted()
    {
        _status = OrderStatus.Submitted;
        return this;
    }

    public Order Build()
    {
        var order = new Order(_customerId);

        foreach (var item in _items)
        {
            order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
        }

        if (_status == OrderStatus.Submitted)
        {
            order.Submit();
        }

        return order;
    }
}
```

Test usage:

```csharp
var order = new OrderBuilder()
    .ForCustomer(42)
    .WithItem(productId: 10, quantity: 2, unitPrice: 25)
    .Submitted()
    .Build();
```

## Fluent Builder For Request Objects

```csharp
public sealed class CreateOrderRequestBuilder
{
    private int _customerId = 1;
    private readonly List<CreateOrderItemRequest> _items = new();

    public CreateOrderRequestBuilder ForCustomer(int customerId)
    {
        _customerId = customerId;
        return this;
    }

    public CreateOrderRequestBuilder AddItem(int productId, int quantity)
    {
        _items.Add(new CreateOrderItemRequest(productId, quantity));
        return this;
    }

    public CreateOrderRequest Build()
    {
        return new CreateOrderRequest(_customerId, _items);
    }
}
```

This keeps tests readable without repeating large object setup.

## Singleton

Singleton means one instance for the application lifetime.

In .NET, prefer DI-managed singleton:

```csharp
builder.Services.AddSingleton<ISystemClock, SystemClock>();
builder.Services.AddSingleton<IProductCodeGenerator, ProductCodeGenerator>();
```

A singleton must be thread-safe if it has mutable state.

Safe singleton:

```csharp
public sealed class SystemClock : ISystemClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
```

Risky singleton:

```csharp
public sealed class CurrentUserCache
{
    public int? CurrentUserId { get; set; }
}
```

`CurrentUserCache` should not be singleton because per-request user state would leak across users.

## Prototype

Prototype creates objects by cloning existing objects.

C# records support copy expressions:

```csharp
public sealed record UserProfile(
    int Id,
    string DisplayName,
    string Email,
    bool IsActive);

var activeProfile = new UserProfile(1, "Ava", "ava@example.com", true);
var disabledProfile = activeProfile with { IsActive = false };
```

This is useful for immutable updates.

In React, immutable object copying is a common prototype-like operation:

```tsx
setUser((current) =>
  current === null
    ? current
    : {
        ...current,
        displayName: "New Name"
      }
);
```

## Common Misconceptions

- Factory always means a separate factory class.
- DI and Factory solve the same problem.
- Builder is only for production code.
- Singleton is always bad.
- DI singleton is safe even with mutable per-request state.
- Prototype means deep clone by default.

## Practical Checklist

```text
Does creation depend on runtime data?
Does the object need many optional construction steps?
Do related objects need to be created consistently?
Can DI manage the lifetime instead of manual singleton code?
Is the factory hiding dependencies like a service locator?
Is the builder making setup clearer or just adding ceremony?
```
