# CQRS

## Core Idea

CQRS means Command Query Responsibility Segregation.

CQRS separates write operations from read operations.

## Basic Idea

Command:

```text
CreateOrder
ApproveOrder
CancelOrder
```

Query:

```text
GetOrderById
SearchOrders
GetDashboardMetrics
```

Commands change state.

Queries return data.

## Simple CQRS In One Database

You do not need separate databases to use CQRS.

```text
API
  -> Command Handler -> EF Core -> SQL
  -> Query Handler   -> EF Core/Dapper -> SQL
```

This is often enough for normal applications.

Simple CQRS (same database, separate handler classes) improves code clarity without introducing distributed complexity. It is a modest refactoring: commands and queries still share the same database connection, same transaction scope, and same consistency guarantees. The main benefit is that each handler has a single responsibility, making the code easier to test and modify.

## Command Example

```csharp
public sealed record ApproveOrderCommand(int OrderId, int ApproverId);

public sealed class ApproveOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IUnitOfWork _unitOfWork;

    public ApproveOrderHandler(IOrderRepository orders, IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(ApproveOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Approve(command.ApproverId);

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
```

The handler depends on abstractions (`IOrderRepository`, `IUnitOfWork`), not directly on EF Core. This keeps the application layer consistent with the Clean Architecture dependency rule described in Chapter 13.02: inner layers define interfaces; outer layers implement them.

## Query Example

```csharp
public sealed record SearchOrdersQuery(
    string? Status,
    int Page,
    int PageSize);

public sealed class SearchOrdersHandler
{
    private readonly IOrderRepository _orders;

    public SearchOrdersHandler(IOrderRepository orders)
    {
        _orders = orders;
    }

    public async Task<PagedResult<OrderListItemDto>> Handle(
        SearchOrdersQuery query,
        CancellationToken ct)
    {
        return await _orders.SearchAsync(
            query.Status,
            query.Page,
            query.PageSize,
            ct);
    }
}
```

The query handler also depends on an abstraction. The repository interface exposes methods that express query intent rather than generic `IQueryable` access (see Chapter 14.05 for more on repository design).

## CQRS With Separate Read Model

For complex systems:

```text
Write Database -> Events -> Projection Worker -> Read Database
```

Benefits:

- optimized read models;
- independent scaling;
- simpler queries for UI;
- event-driven integration.

Costs:

- more moving parts;
- projection rebuild complexity;
- operational overhead.

When the write and read databases are separate, there is an inherent delay between a command completing and the read model reflecting the change. This eventual consistency window may be milliseconds (with synchronous projection) or seconds (with polled outbox). The UI must handle this: after creating an order, the order list page may briefly not show it. Techniques include redirecting to a detail page that reads from the write model, or polling until the read model catches up.

Separate read models are valuable when read patterns differ materially from write patterns — for example, a search page that joins data from multiple aggregates, or a dashboard that aggregates across many records. For a simple CRUD screen that looks like the write model, separate read storage adds complexity without proportional benefit.

## MediatR Example

```csharp
public sealed record CreateOrderCommand(int CustomerId)
    : IRequest<int>;

public sealed class CreateOrderHandler
    : IRequestHandler<CreateOrderCommand, int>
{
    public Task<int> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        // create order
        return Task.FromResult(123);
    }
}
```

Controller:

```csharp
[HttpPost]
public async Task<ActionResult<int>> Create(CreateOrderRequest request)
{
    var orderId = await _mediator.Send(new CreateOrderCommand(request.CustomerId));
    return CreatedAtAction(nameof(GetById), new { id = orderId }, orderId);
}
```

## Command Validation Pipeline

CQRS pairs well with pipeline behaviors because commands and queries have explicit request types.

```csharp
public sealed class ValidationBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var context = new ValidationContext<TRequest>(request);
        var failures = _validators
            .Select(validator => validator.Validate(context))
            .SelectMany(result => result.Errors)
            .Where(error => error is not null)
            .ToList();

        if (failures.Count > 0)
        {
            throw new ValidationException(failures);
        }

        return await next();
    }
}
```

Registration:

```csharp
builder.Services.AddMediatR(config =>
{
    config.RegisterServicesFromAssembly(typeof(CreateOrderCommand).Assembly);
    config.AddOpenBehavior(typeof(ValidationBehavior<,>));
});

builder.Services.AddValidatorsFromAssembly(typeof(CreateOrderCommand).Assembly);
```

Command validator:

```csharp
public sealed class ApproveOrderCommandValidator
    : AbstractValidator<ApproveOrderCommand>
{
    public ApproveOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).GreaterThan(0);
        RuleFor(x => x.ApproverId).GreaterThan(0);
    }
}
```

## Logging Pipeline

Cross-cutting behavior can be added without putting logging into every handler.

```csharp
public sealed class LoggingBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    {
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var requestName = typeof(TRequest).Name;
        var startedAt = Stopwatch.GetTimestamp();

        try
        {
            _logger.LogInformation("Handling {RequestName}", requestName);

            var response = await next();

            var elapsedMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            _logger.LogInformation(
                "Handled {RequestName} in {ElapsedMs} ms",
                requestName,
                elapsedMs);

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed handling {RequestName}", requestName);
            throw;
        }
    }
}
```

## Separate Read Model Example

For heavy read pages, create a read model optimized for the UI.

```sql
CREATE TABLE reporting.OrderSummaryReadModels
(
    OrderId int NOT NULL PRIMARY KEY,
    OrderNumber nvarchar(50) NOT NULL,
    CustomerName nvarchar(200) NOT NULL,
    Status nvarchar(40) NOT NULL,
    TotalAmount decimal(18, 2) NOT NULL,
    ItemCount int NOT NULL,
    LastUpdatedAt datetimeoffset NOT NULL
);
```

Query handler:

```csharp
public sealed record SearchOrderSummariesQuery(
    string? Status,
    string? Search,
    int Page,
    int PageSize) : IRequest<PagedResult<OrderSummaryDto>>;

public sealed class SearchOrderSummariesHandler
    : IRequestHandler<SearchOrderSummariesQuery, PagedResult<OrderSummaryDto>>
{
    private readonly ReportingDbContext _dbContext;

    public SearchOrderSummariesHandler(ReportingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PagedResult<OrderSummaryDto>> Handle(
        SearchOrderSummariesQuery query,
        CancellationToken ct)
    {
        var source = _dbContext.OrderSummaryReadModels.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            source = source.Where(x => x.Status == query.Status);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            source = source.Where(x =>
                x.OrderNumber.Contains(query.Search) ||
                x.CustomerName.Contains(query.Search));
        }

        var total = await source.CountAsync(ct);

        var items = await source
            .OrderByDescending(x => x.LastUpdatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(x => new OrderSummaryDto(
                x.OrderId,
                x.OrderNumber,
                x.CustomerName,
                x.Status,
                x.TotalAmount,
                x.ItemCount))
            .ToListAsync(ct);

        return new PagedResult<OrderSummaryDto>(
            items,
            total,
            query.Page,
            query.PageSize);
    }
}
```

The read model can be denormalized because it is optimized for reading.

## Projection Worker

When using events, a projection updates the read model.

```csharp
public sealed class OrderSubmittedProjection
{
    private readonly ReportingDbContext _dbContext;

    public OrderSubmittedProjection(ReportingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task HandleAsync(OrderSubmittedIntegrationEvent message, CancellationToken ct)
    {
        var existing = await _dbContext.OrderSummaryReadModels
            .FirstOrDefaultAsync(x => x.OrderId == message.OrderId, ct);

        if (existing is null)
        {
            _dbContext.OrderSummaryReadModels.Add(new OrderSummaryReadModel
            {
                OrderId = message.OrderId,
                OrderNumber = message.OrderNumber,
                CustomerName = message.CustomerName,
                Status = "Submitted",
                TotalAmount = message.TotalAmount,
                ItemCount = message.ItemCount,
                LastUpdatedAt = message.SubmittedAt
            });
        }
        else
        {
            existing.Status = "Submitted";
            existing.TotalAmount = message.TotalAmount;
            existing.ItemCount = message.ItemCount;
            existing.LastUpdatedAt = message.SubmittedAt;
        }

        await _dbContext.SaveChangesAsync(ct);
    }
}
```

CQRS is a practical separation of read and write responsibilities that can be applied incrementally. Starting with separate handler classes against a shared database provides clarity without distributed complexity. When read and write patterns diverge significantly, separate read models with projection workers unlock further performance and organizational benefits. The key is recognizing when the separation serves the codebase and when it adds unnecessary ceremony.
