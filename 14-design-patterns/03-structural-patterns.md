# Structural Design Patterns

## Core Idea

Structural patterns organize classes and objects into larger structures.

They are useful when you need to:

- adapt third-party APIs;
- add behavior around services;
- simplify complex subsystems;
- represent trees;
- control access to another object.

Chinese notes:

- `structural pattern`: 结构型模式.
- `adapter`: 适配器.
- `decorator`: 装饰器.
- `facade`: 外观.
- `proxy`: 代理.
- `composite`: 组合.

## Adapter

Adapter converts one interface to another.

Use it when your application wants a stable internal interface but an external library has a different shape.

### Payment Adapter Example

Application port:

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken ct);
}
```

Third-party client:

```csharp
public sealed class StripeClient
{
    public Task<StripeChargeResponse> CreateChargeAsync(
        long amountInCents,
        string currency,
        string sourceToken,
        CancellationToken ct)
    {
        return Task.FromResult(new StripeChargeResponse("ch_123", "succeeded"));
    }
}
```

Adapter:

```csharp
public sealed class StripePaymentAdapter : IPaymentGateway
{
    private readonly StripeClient _client;

    public StripePaymentAdapter(StripeClient client)
    {
        _client = client;
    }

    public async Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken ct)
    {
        var response = await _client.CreateChargeAsync(
            amountInCents: (long)(request.Amount * 100),
            currency: request.Currency,
            sourceToken: request.PaymentToken,
            ct);

        return new PaymentResult(
            response.Status == "succeeded",
            response.ChargeId);
    }
}
```

The rest of the application does not depend on Stripe types.

## Decorator

Decorator adds behavior around an existing implementation while keeping the same interface.

Use it for:

- caching;
- logging;
- retries;
- metrics;
- authorization;
- validation;
- tracing.

### Logging Decorator

```csharp
public sealed class LoggingPaymentGateway : IPaymentGateway
{
    private readonly IPaymentGateway _inner;
    private readonly ILogger<LoggingPaymentGateway> _logger;

    public LoggingPaymentGateway(
        IPaymentGateway inner,
        ILogger<LoggingPaymentGateway> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken ct)
    {
        _logger.LogInformation(
            "Charging payment for order {OrderId}, amount {Amount}",
            request.OrderId,
            request.Amount);

        var result = await _inner.ChargeAsync(request, ct);

        _logger.LogInformation(
            "Payment charge result for order {OrderId}: {Succeeded}",
            request.OrderId,
            result.Succeeded);

        return result;
    }
}
```

### Caching Decorator

```csharp
public interface IProductReader
{
    Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct);
}

public sealed class CachedProductReader : IProductReader
{
    private readonly IProductReader _inner;
    private readonly IDistributedCache _cache;

    public CachedProductReader(IProductReader inner, IDistributedCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        var cacheKey = $"products:{id}";
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
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
                },
                ct);
        }

        return product;
    }
}
```

Decorator order matters:

```text
Controller
  -> LoggingProductReader
  -> CachedProductReader
  -> EfProductReader
```

This logs both cache hits and misses. If logging is inside caching, cache hits may not be logged.

## Facade

Facade provides a simplified interface over a complex subsystem.

Example checkout flow:

```csharp
public sealed class CheckoutFacade
{
    private readonly ICartService _cart;
    private readonly IInventoryService _inventory;
    private readonly IPaymentGateway _payment;
    private readonly IOrderService _orders;

    public CheckoutFacade(
        ICartService cart,
        IInventoryService inventory,
        IPaymentGateway payment,
        IOrderService orders)
    {
        _cart = cart;
        _inventory = inventory;
        _payment = payment;
        _orders = orders;
    }

    public async Task<CheckoutResult> CheckoutAsync(
        CheckoutRequest request,
        CancellationToken ct)
    {
        var cart = await _cart.GetAsync(request.CartId, ct);
        await _inventory.ReserveAsync(cart.Items, ct);

        var payment = await _payment.ChargeAsync(
            new PaymentRequest(cart.Id, cart.Total, cart.Currency, request.PaymentToken),
            ct);

        if (!payment.Succeeded)
        {
            await _inventory.ReleaseAsync(cart.Items, ct);
            return CheckoutResult.Failed("Payment failed.");
        }

        var orderId = await _orders.CreateFromCartAsync(cart, ct);
        return CheckoutResult.Succeeded(orderId);
    }
}
```

Facade is useful for orchestration, but it can become a god service if it owns too many business rules.

## Proxy

Proxy controls access to another object.

Examples:

- lazy-loading proxy;
- remote proxy;
- authorization proxy;
- caching proxy;
- rate-limiting proxy.

### Authorization Proxy

```csharp
public sealed class AuthorizedReportService : IReportService
{
    private readonly IReportService _inner;
    private readonly ICurrentUser _currentUser;

    public AuthorizedReportService(
        IReportService inner,
        ICurrentUser currentUser)
    {
        _inner = inner;
        _currentUser = currentUser;
    }

    public Task<ReportDto> GetReportAsync(int reportId, CancellationToken ct)
    {
        if (!_currentUser.HasPermission("reports.read"))
        {
            throw new ForbiddenException("User cannot read reports.");
        }

        return _inner.GetReportAsync(reportId, ct);
    }
}
```

Proxy and decorator are similar. The difference is emphasis:

- decorator adds behavior;
- proxy controls access or represents another object.

## Composite

Composite treats individual objects and groups uniformly.

Useful for:

- menu trees;
- category trees;
- file systems;
- organization hierarchy;
- permission trees.

### Menu Tree Example

```csharp
public interface IMenuNode
{
    string Label { get; }
    IReadOnlyCollection<IMenuNode> Children { get; }
}

public sealed class MenuItem : IMenuNode
{
    public string Label { get; }
    public string Url { get; }
    public IReadOnlyCollection<IMenuNode> Children => Array.Empty<IMenuNode>();

    public MenuItem(string label, string url)
    {
        Label = label;
        Url = url;
    }
}

public sealed class MenuGroup : IMenuNode
{
    private readonly List<IMenuNode> _children = new();

    public string Label { get; }
    public IReadOnlyCollection<IMenuNode> Children => _children.AsReadOnly();

    public MenuGroup(string label)
    {
        Label = label;
    }

    public void Add(IMenuNode node)
    {
        _children.Add(node);
    }
}
```

Render recursively:

```csharp
public static void PrintMenu(IMenuNode node, int depth = 0)
{
    Console.WriteLine($"{new string(' ', depth * 2)}- {node.Label}");

    foreach (var child in node.Children)
    {
        PrintMenu(child, depth + 1);
    }
}
```

React naturally uses composite composition:

```tsx
type MenuNode = {
  label: string;
  url?: string;
  children?: MenuNode[];
};

function MenuTree({ nodes }: { nodes: MenuNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.label}>
          {node.url ? <a href={node.url}>{node.label}</a> : node.label}
          {node.children ? <MenuTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
```

## Common Misconceptions

- Adapter and facade are the same.
- Decorator requires inheritance.
- Proxy is only for remote calls.
- Facade should contain all business logic.
- Composite is only useful for UI.

## Practical Checklist

```text
Do we need to hide third-party API details?
Are we adding behavior around an existing service?
Is a subsystem too complex for callers?
Do we need to control access to an object?
Are we representing a tree structure?
Does the wrapper add clarity or just another layer?
```

## Knowledge Checks

### Adapter vs facade?

Adapter changes an interface to match what the application expects. Facade simplifies a complex subsystem behind a higher-level interface.

### Decorator vs inheritance?

Decorator uses composition and can add behavior without changing the original class or creating deep inheritance chains.

### Proxy vs decorator?

Proxy focuses on controlling access or representing another object. Decorator focuses on adding behavior around an object.

