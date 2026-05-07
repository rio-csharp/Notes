# Repository And Unit Of Work

## Core Idea

Repository abstracts access to aggregate persistence. Unit of Work coordinates committing changes as one transaction.

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

## Where Repository Adds Value

Useful when:

- protecting domain boundaries;
- aggregate-specific loading rules matter;
- persistence details are complex;
- Clean Architecture keeps application layer independent from EF Core;
- multiple persistence mechanisms may exist;
- tests benefit from replacing persistence.

## Where Repository Creates Overhead

Can hurt when:

- every method is just pass-through;
- a generic repository hides useful EF Core features;
- query flexibility is reduced without a real benefit;
- developers must create boilerplate for simple CRUD;
- repository becomes a place for business logic.

Several misconceptions surround Repository and Unit of Work:

- EF Core does not always need a repository wrapper; `DbSet<T>` already provides repository-like behavior.
- A repository does not automatically make testing easier; an in-memory database or fake may be simpler.
- A generic repository is not automatically cleaner; it often hides useful EF Core features.
- Unit of Work does not mean manually opening a transaction for every request; `SaveChanges` already provides transactional semantics.
- Returning `IQueryable` is not always wrong; it is acceptable in controlled infrastructure code when the boundary is explicitly managed.

When deciding whether to introduce these patterns, ask whether the repository protects an aggregate boundary, whether it hides meaningful persistence complexity, whether it avoids leaking EF Core into inner layers, whether it is only a pass-through wrapper over `DbSet`, whether query code needs projection instead of aggregate loading, whether transaction boundaries are explicit, and whether integration tests verify real database behavior.
