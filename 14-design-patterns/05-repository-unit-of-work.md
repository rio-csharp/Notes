# Repository And Unit Of Work

## Core Idea

Repository abstracts access to aggregate persistence. Unit of Work coordinates committing changes as one transaction.

Chinese notes:

- `repository`: 仓储.
- `unit of work`: 工作单元.
- `aggregate`: 聚合.
- `transaction boundary`: 事务边界.

EF Core already provides:

- `DbSet<T>`: repository-like collection;
- `DbContext`: unit-of-work-like change tracking and `SaveChanges`.

So the question is not "should every EF Core app have repositories?" The better question is: "Does a repository protect a useful boundary here?"

## Repository Around Aggregates

DDD-style repositories usually work with aggregate roots.

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}
```

Implementation:

```csharp
public sealed class EfOrderRepository : IOrderRepository
{
    private readonly AppDbContext _dbContext;

    public EfOrderRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct)
    {
        return _dbContext.Orders
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
    }

    public Task AddAsync(Order order, CancellationToken ct)
    {
        _dbContext.Orders.Add(order);
        return Task.CompletedTask;
    }
}
```

Application use case:

```csharp
public sealed class CancelOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IUnitOfWork _unitOfWork;

    public CancelOrderHandler(IOrderRepository orders, IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _unitOfWork = unitOfWork;
    }

    public async Task HandleAsync(CancelOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Cancel(command.Reason);

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
```

The handler does not know how the aggregate is loaded.

## Unit Of Work

```csharp
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct);
}
```

EF implementation:

```csharp
public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _dbContext;

    public EfUnitOfWork(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<int> SaveChangesAsync(CancellationToken ct)
    {
        return _dbContext.SaveChangesAsync(ct);
    }
}
```

DI registration:

```csharp
builder.Services.AddScoped<IOrderRepository, EfOrderRepository>();
builder.Services.AddScoped<IUnitOfWork, EfUnitOfWork>();
```

Because both use the same scoped `AppDbContext`, they participate in the same unit of work.

## Repository For Complex Queries

For read-heavy queries, returning DTOs may be better than returning aggregates.

```csharp
public interface IOrderReadRepository
{
    Task<PagedResult<OrderListItemDto>> SearchAsync(
        OrderSearchCriteria criteria,
        CancellationToken ct);
}
```

```csharp
public sealed class EfOrderReadRepository : IOrderReadRepository
{
    private readonly AppDbContext _dbContext;

    public EfOrderReadRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PagedResult<OrderListItemDto>> SearchAsync(
        OrderSearchCriteria criteria,
        CancellationToken ct)
    {
        var query = _dbContext.Orders.AsNoTracking();

        if (criteria.Status is not null)
        {
            query = query.Where(x => x.Status == criteria.Status);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((criteria.Page - 1) * criteria.PageSize)
            .Take(criteria.PageSize)
            .Select(x => new OrderListItemDto(
                x.Id,
                x.OrderNumber,
                x.Status,
                x.TotalAmount,
                x.CreatedAt))
            .ToListAsync(ct);

        return new PagedResult<OrderListItemDto>(
            items,
            total,
            criteria.Page,
            criteria.PageSize);
    }
}
```

This is a read repository, not an aggregate repository. It is optimized for queries.

## Generic Repository Risk

Generic repository:

```csharp
public interface IRepository<T>
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct);
    Task AddAsync(T entity, CancellationToken ct);
    void Remove(T entity);
    IQueryable<T> Query();
}
```

Why this often hurts with EF Core:

- `DbSet<T>` already provides a generic repository-like API;
- `IQueryable<T>` leaks query composition outside the boundary;
- aggregate-specific loading rules are not represented;
- business intent disappears;
- EF Core features may be hidden badly.

Prefer specific repositories when they express meaningful persistence behavior.

## Returning `IQueryable`

Returning `IQueryable` from a repository can be useful in controlled infrastructure code, but it weakens the boundary if exposed widely.

Risky:

```csharp
public interface IOrderRepository
{
    IQueryable<Order> Query();
}
```

Now every caller can decide:

- whether to include items;
- whether to track;
- which filters are valid;
- which aggregate invariants matter.

Better for application boundaries:

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct);
    Task<IReadOnlyList<Order>> GetSubmittedOrdersOlderThanAsync(
        DateTimeOffset cutoff,
        CancellationToken ct);
}
```

## Transaction Boundary

Unit of Work is most important when multiple changes must commit together.

```csharp
public sealed class SubmitOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IOutboxRepository _outbox;
    private readonly IUnitOfWork _unitOfWork;

    public SubmitOrderHandler(
        IOrderRepository orders,
        IOutboxRepository outbox,
        IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _outbox = outbox;
        _unitOfWork = unitOfWork;
    }

    public async Task HandleAsync(SubmitOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Submit();

        await _outbox.AddAsync(
            OutboxMessage.From(new OrderSubmittedIntegrationEvent(order.Id)),
            ct);

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
```

Order update and outbox insert are committed together because they share the same `DbContext`.

## Testing With Repository

A fake repository can test application orchestration without a database.

```csharp
public sealed class FakeOrderRepository : IOrderRepository
{
    private readonly Dictionary<OrderId, Order> _orders = new();

    public Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct)
    {
        _orders.TryGetValue(id, out var order);
        return Task.FromResult(order);
    }

    public Task AddAsync(Order order, CancellationToken ct)
    {
        _orders[order.Id] = order;
        return Task.CompletedTask;
    }

    public void Seed(Order order)
    {
        _orders[order.Id] = order;
    }
}
```

Fake unit of work:

```csharp
public sealed class FakeUnitOfWork : IUnitOfWork
{
    public int SaveChangesCallCount { get; private set; }

    public Task<int> SaveChangesAsync(CancellationToken ct)
    {
        SaveChangesCallCount += 1;
        return Task.FromResult(1);
    }
}
```

Integration tests should still verify real EF Core mapping and queries.

## When Repository Helps

Useful when:

- protecting domain boundaries;
- aggregate-specific loading rules matter;
- persistence details are complex;
- Clean Architecture keeps application layer independent from EF Core;
- multiple persistence mechanisms may exist;
- tests benefit from replacing persistence.

## When Repository Hurts

Can hurt when:

- every method is just pass-through;
- a generic repository hides useful EF Core features;
- query flexibility is reduced without a real benefit;
- developers must create boilerplate for simple CRUD;
- repository becomes a place for business logic.

## Common Misconceptions

- EF Core always needs repository.
- Repository always makes testing easier.
- Generic repository is automatically cleaner.
- Unit of Work means manually opening a transaction for every request.
- Returning `IQueryable` is always wrong.

## Practical Checklist

```text
Does this repository protect an aggregate boundary?
Does it hide meaningful persistence complexity?
Does it avoid leaking EF Core into inner layers?
Is this just a pass-through wrapper over DbSet?
Does query code need projection instead of aggregate loading?
Are transaction boundaries explicit?
Do integration tests verify real database behavior?
```

## Knowledge Checks

### Do you need repository with EF Core?

Not always. EF Core already has repository and unit-of-work-like patterns. Use repositories when they protect domain boundaries or hide complex persistence. Avoid generic repositories that add no value.

### What is Unit of Work?

Unit of Work tracks changes and commits them as one transaction. In EF Core, `DbContext.SaveChanges` plays this role.

### Why can returning `IQueryable` be risky?

It lets callers compose persistence details from outside the repository boundary, which can leak tracking, includes, filters, and aggregate loading rules everywhere.

