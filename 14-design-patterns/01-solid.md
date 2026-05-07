# SOLID Principles

## Core Idea

SOLID is a set of object-oriented design principles for keeping code understandable, changeable, and testable.

## S: Single Responsibility Principle

A class should have one reason to change.

This does not mean "one method per class." It means the class should represent one coherent responsibility.

### Single Responsibility Violation

```csharp
public sealed class OrderService
{
    public async Task<int> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct)
    {
        Validate(request);

        var order = new Order
        {
            CustomerId = request.CustomerId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await using var connection = new SqlConnection("...");
        await connection.ExecuteAsync("INSERT INTO Orders ...", order);

        var pdfBytes = GenerateInvoicePdf(order);

        using var smtpClient = new SmtpClient("smtp.example.com");
        await smtpClient.SendMailAsync(
            "sales@example.com",
            request.CustomerEmail,
            "Order created",
            "Your order was created.");

        return order.Id;
    }

    private void Validate(CreateOrderRequest request) { }
    private byte[] GenerateInvoicePdf(Order order) => Array.Empty<byte>();
}
```

This class changes when:

- order creation rules change;
- database access changes;
- email provider changes;
- invoice PDF layout changes;
- validation rules change.

### Separated Responsibilities

```csharp
public sealed class CreateOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IInvoiceGenerator _invoiceGenerator;
    private readonly IEmailSender _emailSender;
    private readonly ISystemClock _clock;

    public CreateOrderHandler(
        IOrderRepository orders,
        IInvoiceGenerator invoiceGenerator,
        IEmailSender emailSender,
        ISystemClock clock)
    {
        _orders = orders;
        _invoiceGenerator = invoiceGenerator;
        _emailSender = emailSender;
        _clock = clock;
    }

    public async Task<int> HandleAsync(CreateOrderCommand command, CancellationToken ct)
    {
        var order = Order.Create(command.CustomerId, _clock.UtcNow);

        foreach (var item in command.Items)
        {
            order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
        }

        await _orders.AddAsync(order, ct);
        await _orders.SaveChangesAsync(ct);

        var invoice = await _invoiceGenerator.GenerateAsync(order.Id, ct);

        await _emailSender.SendAsync(
            new EmailMessage(command.CustomerEmail, "Order created", invoice),
            ct);

        return order.Id;
    }
}
```

This handler still coordinates several things, but it delegates specialized responsibilities. Coordination is its responsibility.

## O: Open/Closed Principle

Code should be open for extension but closed for modification.

This means new behavior should often be added by adding a new implementation, not editing a large fragile method.

### Open/Closed Violation

```csharp
public sealed class DiscountCalculator
{
    public decimal Calculate(Order order, Customer customer)
    {
        if (customer.Type == CustomerType.Vip)
        {
            return order.Total * 0.10m;
        }

        if (customer.Type == CustomerType.Employee)
        {
            return order.Total * 0.20m;
        }

        if (customer.Type == CustomerType.Wholesale)
        {
            return order.Total * 0.15m;
        }

        return 0;
    }
}
```

Every new discount rule modifies this class.

### Strategy-Based Design

```csharp
public interface IDiscountPolicy
{
    bool CanApply(Customer customer);
    decimal CalculateDiscount(Order order, Customer customer);
}

public sealed class VipDiscountPolicy : IDiscountPolicy
{
    public bool CanApply(Customer customer)
    {
        return customer.Type == CustomerType.Vip;
    }

    public decimal CalculateDiscount(Order order, Customer customer)
    {
        return order.Total * 0.10m;
    }
}

public sealed class EmployeeDiscountPolicy : IDiscountPolicy
{
    public bool CanApply(Customer customer)
    {
        return customer.Type == CustomerType.Employee;
    }

    public decimal CalculateDiscount(Order order, Customer customer)
    {
        return order.Total * 0.20m;
    }
}
```

```csharp
public sealed class DiscountCalculator
{
    private readonly IReadOnlyCollection<IDiscountPolicy> _policies;

    public DiscountCalculator(IEnumerable<IDiscountPolicy> policies)
    {
        _policies = policies.ToList();
    }

    public decimal Calculate(Order order, Customer customer)
    {
        return _policies
            .Where(policy => policy.CanApply(customer))
            .Sum(policy => policy.CalculateDiscount(order, customer));
    }
}
```

DI registration:

```csharp
builder.Services.AddScoped<IDiscountPolicy, VipDiscountPolicy>();
builder.Services.AddScoped<IDiscountPolicy, EmployeeDiscountPolicy>();
builder.Services.AddScoped<DiscountCalculator>();
```

Now adding a new policy usually means adding a class and DI registration.

## L: Liskov Substitution Principle

Subtypes should be usable wherever their base types are expected without surprising behavior.

### Liskov Substitution Violation

```csharp
public abstract class ReportExporter
{
    public abstract byte[] Export(Report report);
}

public sealed class PdfReportExporter : ReportExporter
{
    public override byte[] Export(Report report)
    {
        return GeneratePdf(report);
    }
}

public sealed class LiveDashboardExporter : ReportExporter
{
    public override byte[] Export(Report report)
    {
        throw new NotSupportedException("Live dashboards cannot be exported.");
    }
}
```

`LiveDashboardExporter` violates the expectation of `ReportExporter`. Code that accepts `ReportExporter` expects `Export` to work.

### Separate Abstractions

```csharp
public interface IReportExporter
{
    byte[] Export(Report report);
}

public interface ILiveDashboard
{
    Task<DashboardSnapshot> GetSnapshotAsync(CancellationToken ct);
}
```

Do not force unrelated behaviors into one inheritance hierarchy.

### Classic Shape Example

This is a common LSP trap:

```csharp
public class Rectangle
{
    public virtual int Width { get; set; }
    public virtual int Height { get; set; }
}

public sealed class Square : Rectangle
{
    public override int Width
    {
        set
        {
            base.Width = value;
            base.Height = value;
        }
    }

    public override int Height
    {
        set
        {
            base.Width = value;
            base.Height = value;
        }
    }
}
```

If code expects width and height to be independently changeable, `Square` breaks that expectation. In many systems, composition or separate types are clearer.

## I: Interface Segregation Principle

Clients should not be forced to depend on methods they do not use.

### Interface Segregation Violation

```csharp
public interface IUserService
{
    Task<UserDto?> GetByIdAsync(int id, CancellationToken ct);
    Task<int> CreateAsync(CreateUserRequest request, CancellationToken ct);
    Task ExportUsersToExcelAsync(Stream output, CancellationToken ct);
    Task DisableAsync(int id, CancellationToken ct);
}
```

A controller that only reads users now depends on write and export operations too.

### Focused Interfaces

```csharp
public interface IUserReader
{
    Task<UserDto?> GetByIdAsync(int id, CancellationToken ct);
}

public interface IUserWriter
{
    Task<int> CreateAsync(CreateUserRequest request, CancellationToken ct);
    Task DisableAsync(int id, CancellationToken ct);
}

public interface IUserExporter
{
    Task ExportUsersToExcelAsync(Stream output, CancellationToken ct);
}
```

Usage:

```csharp
public sealed class UsersController : ControllerBase
{
    private readonly IUserReader _users;

    public UsersController(IUserReader users)
    {
        _users = users;
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserDto>> GetById(int id, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }
}
```

Focused interfaces reduce unnecessary coupling.

## D: Dependency Inversion Principle

High-level modules should not depend on low-level modules. Both should depend on abstractions.

### Dependency Inversion Violation

```csharp
public sealed class OrderPaymentService
{
    public async Task PayAsync(Order order, CancellationToken ct)
    {
        var client = new StripeClient("secret-key");
        await client.ChargeAsync(order.Total, ct);
    }
}
```

The business workflow depends directly on Stripe construction and configuration.

### Dependency Inversion Applied

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken ct);
}

public sealed class OrderPaymentService
{
    private readonly IPaymentGateway _paymentGateway;

    public OrderPaymentService(IPaymentGateway paymentGateway)
    {
        _paymentGateway = paymentGateway;
    }

    public Task<PaymentResult> PayAsync(Order order, CancellationToken ct)
    {
        return _paymentGateway.ChargeAsync(
            new PaymentRequest(order.Id, order.Total, order.Currency),
            ct);
    }
}
```

Infrastructure implementation:

```csharp
public sealed class StripePaymentGateway : IPaymentGateway
{
    private readonly StripeClient _client;

    public StripePaymentGateway(StripeClient client)
    {
        _client = client;
    }

    public Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken ct)
    {
        return _client.ChargeAsync(request.Amount, request.Currency, ct);
    }
}
```

DI:

```csharp
builder.Services.AddScoped<IPaymentGateway, StripePaymentGateway>();
builder.Services.AddScoped<OrderPaymentService>();
```

## SOLID In React

SOLID ideas also apply to frontend code, even though React is not class-oriented.

### Single Responsibility

Risky component:

```tsx
function OrdersPage() {
  // reads URL
  // fetches API
  // renders table
  // opens modal
  // formats CSV
  // handles permissions
  return null;
}
```

Better split:

```tsx
function OrdersPage() {
  const filters = useOrderFiltersFromUrl();
  const ordersQuery = useOrdersQuery(filters);

  return (
    <OrdersLayout>
      <OrderFilters filters={filters} />
      <OrderTable orders={ordersQuery.data?.items ?? []} />
      <ExportOrdersButton filters={filters} />
    </OrdersLayout>
  );
}
```

### Dependency Inversion

Instead of hard-coding `fetch` inside many components, depend on an API function or hook.

```tsx
export function useOrdersQuery(filters: OrderFilters) {
  return useQuery({
    queryKey: ["orders", filters],
    queryFn: ({ signal }) => fetchOrders(filters, signal)
  });
}
```

Components depend on the hook contract, not low-level HTTP details.

These principles are frequently misunderstood:

- SRP means one method per class &mdash; it actually means one reason to change.
- OCP means never modify existing code &mdash; it means new behavior should usually be added through new implementations rather than editing fragile methods.
- LSP only matters for inheritance-heavy code &mdash; it applies wherever subtypes are expected to be substitutable.
- ISP means every method needs its own interface &mdash; it means clients should not depend on methods they do not use.
- DIP means every class must have an interface &mdash; it means high-level policy should not depend on low-level details.
- SOLID always requires more abstractions &mdash; it requires the right abstractions at the right boundaries.

Each of the five principles can be applied as a diagnostic question during design and review. Does a class have a single clear reason to change? Is new variation handled by adding code rather than editing a fragile switch? Can implementations be substituted without surprising behavior? Do consumers depend only on methods they need? Does high-level policy depend on low-level technical details? Does the abstraction remove real coupling or only add ceremony? Asking these questions regularly produces more maintainable code.
