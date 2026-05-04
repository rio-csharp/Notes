# Behavioral Design Patterns

## Core Idea

Behavioral patterns organize communication and responsibility between objects.

They are useful when:

- behavior varies by rule or context;
- objects should react to events;
- requests need to pass through a pipeline;
- state transitions must be controlled;
- direct dependencies between many components become hard to manage.

Chinese notes:

- `behavioral pattern`: 行为型模式.
- `strategy`: 策略.
- `observer`: 观察者.
- `command`: 命令.
- `mediator`: 中介者.
- `chain of responsibility`: 职责链.
- `state`: 状态模式.
- `template method`: 模板方法.

## Strategy

Strategy selects an algorithm or behavior at runtime.

Use it when behavior varies independently.

### Pricing Strategy Example

```csharp
public interface IPricingStrategy
{
    bool CanPrice(PricingContext context);
    Money CalculatePrice(PricingContext context);
}

public sealed class RegularPricingStrategy : IPricingStrategy
{
    public bool CanPrice(PricingContext context)
    {
        return context.CustomerType == CustomerType.Regular;
    }

    public Money CalculatePrice(PricingContext context)
    {
        return context.BasePrice;
    }
}

public sealed class VipPricingStrategy : IPricingStrategy
{
    public bool CanPrice(PricingContext context)
    {
        return context.CustomerType == CustomerType.Vip;
    }

    public Money CalculatePrice(PricingContext context)
    {
        return context.BasePrice.Multiply(0.9m);
    }
}
```

Selector:

```csharp
public sealed class PricingService
{
    private readonly IReadOnlyCollection<IPricingStrategy> _strategies;

    public PricingService(IEnumerable<IPricingStrategy> strategies)
    {
        _strategies = strategies.ToList();
    }

    public Money Calculate(PricingContext context)
    {
        var strategy = _strategies.FirstOrDefault(x => x.CanPrice(context));

        if (strategy is null)
        {
            throw new InvalidOperationException("No pricing strategy was found.");
        }

        return strategy.CalculatePrice(context);
    }
}
```

Use a simple `switch` when there are only two tiny branches and no meaningful growth. Use Strategy when rules grow independently, need tests, or need DI dependencies.

## Observer

Observer lets one object notify many interested subscribers.

C# events are observer-like:

```csharp
public sealed class OrderProcessor
{
    public event EventHandler<OrderSubmittedEventArgs>? OrderSubmitted;

    public void Submit(Order order)
    {
        order.Submit();
        OrderSubmitted?.Invoke(this, new OrderSubmittedEventArgs(order.Id));
    }
}
```

```csharp
public sealed class OrderSubmittedEventArgs : EventArgs
{
    public int OrderId { get; }

    public OrderSubmittedEventArgs(int orderId)
    {
        OrderId = orderId;
    }
}
```

In backend systems, domain events and integration events are often better than raw C# events because they can be persisted, dispatched, retried, and observed.

Domain event example:

```csharp
public sealed record OrderSubmittedDomainEvent(
    int OrderId,
    DateTimeOffset SubmittedAt);
```

Integration event example:

```csharp
public sealed record OrderSubmittedIntegrationEvent(
    Guid MessageId,
    int OrderId,
    decimal Total,
    DateTimeOffset SubmittedAt);
```

## Command

Command encapsulates a requested action as an object.

```csharp
public sealed record ApproveOrderCommand(
    int OrderId,
    int ApproverId,
    string Comment);
```

Handler:

```csharp
public sealed class ApproveOrderHandler
{
    private readonly AppDbContext _dbContext;

    public ApproveOrderHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task HandleAsync(ApproveOrderCommand command, CancellationToken ct)
    {
        var order = await _dbContext.Orders
            .FirstOrDefaultAsync(x => x.Id == command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Approve(command.ApproverId, command.Comment);

        await _dbContext.SaveChangesAsync(ct);
    }
}
```

Command works well with:

- CQRS;
- audit logging;
- validation pipeline;
- retry-safe workflows;
- background processing.

## Mediator

Mediator reduces direct dependencies between senders and handlers.

With MediatR:

```csharp
public sealed record CreateOrderCommand(int CustomerId)
    : IRequest<int>;

public sealed class CreateOrderHandler
    : IRequestHandler<CreateOrderCommand, int>
{
    public Task<int> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        return Task.FromResult(123);
    }
}
```

Controller:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly IMediator _mediator;

    public OrdersController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<ActionResult<int>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var orderId = await _mediator.Send(
            new CreateOrderCommand(request.CustomerId),
            ct);

        return CreatedAtAction(nameof(GetById), new { id = orderId }, orderId);
    }
}
```

Mediator is most useful when the pipeline has cross-cutting behavior such as validation, logging, transactions, or metrics. If every handler is just one line, it may only add navigation cost.

## Chain Of Responsibility

Chain of Responsibility passes a request through a chain of handlers.

ASP.NET Core middleware is a practical example.

```csharp
public sealed class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(
        RequestDelegate next,
        ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();

        await _next(context);

        var elapsed = Stopwatch.GetElapsedTime(startedAt);
        _logger.LogInformation(
            "Request {Path} completed in {ElapsedMs} ms",
            context.Request.Path,
            elapsed.TotalMilliseconds);
    }
}
```

Pipeline:

```csharp
app.UseMiddleware<RequestTimingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Each middleware decides what to do before and after calling the next component.

MediatR pipeline behavior is another example:

```csharp
public sealed class TransactionBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly AppDbContext _dbContext;

    public TransactionBehavior(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        var response = await next();

        await _dbContext.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return response;
    }
}
```

## State

State pattern encapsulates behavior based on object state.

For many domain models, explicit transition methods are enough:

```csharp
public sealed class Order
{
    public OrderStatus Status { get; private set; } = OrderStatus.Draft;

    public void Submit()
    {
        if (Status != OrderStatus.Draft)
        {
            throw new DomainException("Only draft orders can be submitted.");
        }

        Status = OrderStatus.Submitted;
    }

    public void Cancel()
    {
        if (Status == OrderStatus.Paid)
        {
            throw new DomainException("Paid orders cannot be cancelled directly.");
        }

        Status = OrderStatus.Cancelled;
    }
}
```

When behavior becomes large and state-specific, separate state classes may help.

```csharp
public interface IOrderState
{
    OrderStatus Status { get; }
    void Submit(Order order);
    void Cancel(Order order);
}

public sealed class DraftOrderState : IOrderState
{
    public OrderStatus Status => OrderStatus.Draft;

    public void Submit(Order order)
    {
        order.ChangeState(new SubmittedOrderState());
    }

    public void Cancel(Order order)
    {
        order.ChangeState(new CancelledOrderState());
    }
}

public sealed class PaidOrderState : IOrderState
{
    public OrderStatus Status => OrderStatus.Paid;

    public void Submit(Order order)
    {
        throw new DomainException("Paid order was already submitted.");
    }

    public void Cancel(Order order)
    {
        throw new DomainException("Paid orders cannot be cancelled directly.");
    }
}
```

Do not introduce state classes until the transition logic is complex enough to justify them.

## Template Method

Template Method defines the skeleton of an algorithm and lets subclasses fill in steps.

```csharp
public abstract class ImportJob
{
    public async Task RunAsync(Stream file, CancellationToken ct)
    {
        var rows = await ReadRowsAsync(file, ct);
        var validRows = ValidateRows(rows);
        await SaveRowsAsync(validRows, ct);
        await AfterImportAsync(validRows, ct);
    }

    protected abstract Task<IReadOnlyList<string[]>> ReadRowsAsync(
        Stream file,
        CancellationToken ct);

    protected abstract IReadOnlyList<string[]> ValidateRows(
        IReadOnlyList<string[]> rows);

    protected abstract Task SaveRowsAsync(
        IReadOnlyList<string[]> rows,
        CancellationToken ct);

    protected virtual Task AfterImportAsync(
        IReadOnlyList<string[]> rows,
        CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

Use Template Method carefully. In modern C#, composition with strategies is often more flexible than deep inheritance.

## React Behavioral Patterns

### Custom Hook As Strategy

```tsx
type SortMode = "name" | "createdAt";

function useSortedOrders(orders: Order[], sortMode: SortMode) {
  return useMemo(() => {
    const copy = [...orders];

    if (sortMode === "name") {
      return copy.sort((a, b) => a.customerName.localeCompare(b.customerName));
    }

    return copy.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders, sortMode]);
}
```

### Component Composition As Behavioral Variation

```tsx
import type { ReactNode } from "react";

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({
  title,
  children,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>
      {children}
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onConfirm}>Confirm</button>
    </div>
  );
}
```

Usage:

```tsx
<ConfirmDialog
  title="Cancel order"
  onCancel={closeDialog}
  onConfirm={cancelOrder}
>
  <p>This order will move to Cancelled status.</p>
</ConfirmDialog>
```

The dialog behavior is reused while content varies.

## Common Misconceptions

- Strategy is always better than `switch`.
- Observer guarantees reliable event delivery.
- Command means CQRS must be used.
- Mediator automatically improves architecture.
- Chain of Responsibility is only a backend pattern.
- State pattern is required for every enum state.

## Practical Checklist

```text
Does behavior vary independently?
Do many subscribers need to react to an event?
Does the request need validation/logging/transaction pipeline behavior?
Are state transitions scattered across the codebase?
Would a simple method or switch be clearer?
```

## Knowledge Checks

### Strategy vs switch statement?

Strategy is useful when behaviors vary and grow independently. A small switch can be fine when the logic is simple and stable.

### What pattern is ASP.NET Core middleware?

It resembles Chain of Responsibility. Each middleware can handle work and decide whether to pass the request to the next component.

### How does CQRS use Command pattern?

Commands represent requested state changes, such as `CreateOrder` or `ApproveOrder`, and handlers execute them.
