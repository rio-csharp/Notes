# EF Core Performance Optimization

## Core Idea

EF Core performance is mostly about controlling:

- how much data you load;
- how many SQL queries you execute;
- whether EF tracks entities;
- whether the database can use indexes;
- whether your query is translated efficiently;
- how much work happens in application memory.

Chinese notes:

- `tracking`: 变更跟踪.
- `projection`: 投影，只查询需要的字段.
- `N+1 query`: N+1 查询问题.
- `cartesian explosion`: 笛卡尔爆炸.
- `keyset pagination`: 游标分页.

Key takeaway:

> I optimize EF Core by measuring first, inspecting generated SQL and execution plans, reducing loaded data, avoiding unnecessary tracking, preventing N+1 queries, and making sure the database can use indexes.

## Performance Diagnosis Flow

Good production workflow:

1. Check API metrics: latency, error rate, timeouts.
2. Check traces: is time spent in database?
3. Check logs: which query or endpoint is slow?
4. Inspect generated SQL with `ToQueryString`.
5. Check database execution plan.
6. Add or adjust indexes if needed.
7. Reduce data shape with projection/pagination.
8. Re-measure.

Avoid guessing.

## Use Projection

Bad:

```csharp
var users = await _dbContext.Users.ToListAsync(ct);

return users.Select(u => new UserListItemDto
{
    Id = u.Id,
    Name = u.Name
}).ToList();
```

This loads full user entities.

Better:

```csharp
var users = await _dbContext.Users
    .Where(u => u.IsActive)
    .Select(u => new UserListItemDto
    {
        Id = u.Id,
        Name = u.Name
    })
    .ToListAsync(ct);
```

This selects only required columns.

## Use AsNoTracking For Read-only Queries

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderSummaryDto
    {
        Id = o.Id,
        Total = o.Total,
        CreatedAt = o.CreatedAt
    })
    .ToListAsync(ct);
```

Use tracking when you plan to update entities.

Use no-tracking when you only read.

Why it helps:

- less memory;
- less CPU;
- fewer change tracker entries;
- less relationship fix-up work.

## Avoid N+1 Query

Bad:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

foreach (var order in orders)
{
    Console.WriteLine(order.Customer.Name);
}
```

If lazy loading is enabled, this may execute one query for orders plus one query per order's customer.

Better with projection:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        Total = o.Total
    })
    .ToListAsync(ct);
```

Or use `Include` only when you need full related entities:

```csharp
var orders = await _dbContext.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

## Pagination

Basic offset pagination:

```csharp
public async Task<PagedResult<OrderListItemDto>> GetOrdersAsync(
    int page,
    int pageSize,
    CancellationToken ct)
{
    page = Math.Max(page, 1);
    pageSize = Math.Clamp(pageSize, 1, 100);

    var query = _dbContext.Orders.AsNoTracking();

    var total = await query.CountAsync(ct);

    var items = await query
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(o => new OrderListItemDto
        {
            Id = o.Id,
            Total = o.Total,
            CreatedAt = o.CreatedAt
        })
        .ToListAsync(ct);

    return new PagedResult<OrderListItemDto>(items, total, page, pageSize);
}
```

For very large tables, consider keyset pagination（游标分页）:

```csharp
var items = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.CreatedAt < lastCreatedAt ||
        (o.CreatedAt == lastCreatedAt && o.Id < lastId))
    .OrderByDescending(o => o.CreatedAt)
    .ThenByDescending(o => o.Id)
    .Take(pageSize)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        Total = o.Total,
        CreatedAt = o.CreatedAt
    })
    .ToListAsync(ct);
```

Offset pagination problem:

> Large `Skip` values can become expensive because the database may still need to scan/sort skipped rows.

## Split Query

Large `Include` queries can create huge joins.

```csharp
var customers = await _dbContext.Customers
    .Include(c => c.Orders)
    .ThenInclude(o => o.Items)
    .AsSplitQuery()
    .ToListAsync(ct);
```

Trade-off:

- single query: fewer round trips, but can duplicate lots of data;
- split query: more round trips, but avoids cartesian explosion（笛卡尔爆炸）.

Use split query when:

- including multiple collections;
- result has duplicated parent data;
- SQL result set becomes huge.

## Compiled Queries

For very hot queries:

```csharp
private static readonly Func<AppDbContext, int, Task<UserDto?>> GetUserByIdQuery =
    EF.CompileAsyncQuery((AppDbContext db, int id) =>
        db.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto(u.Id, u.Name))
            .FirstOrDefault());
```

Use only when profiling shows query compilation overhead matters.

Most EF performance issues are caused by:

- bad SQL shape;
- missing indexes;
- too much data loaded;
- too many round trips;
- unnecessary tracking.

Compiled queries do not fix those.

## Batch Operations

Modern EF Core supports set-based updates:

```csharp
await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Pending &&
        o.CreatedAt < DateTimeOffset.UtcNow.AddDays(-7))
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(o => o.Status, OrderStatus.Expired),
        ct);
```

This avoids loading all entities into memory.

Set-based delete:

```csharp
await _dbContext.Sessions
    .Where(s => s.ExpiresAt < DateTimeOffset.UtcNow)
    .ExecuteDeleteAsync(ct);
```

Important:

> Set-based operations bypass normal change tracking and entity domain methods. Use them for infrastructure/bulk operations where this is acceptable.

## Index Awareness

EF Core queries still rely on database indexes.

Example query:

```csharp
var orders = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .ToListAsync(ct);
```

Useful index:

```csharp
modelBuilder.Entity<Order>()
    .HasIndex(o => new { o.Status, o.CreatedAt, o.Id });
```

Key point:

> EF Core does not remove the need to understand database indexes. LINQ shape and index design must work together.

## Avoid Non-SARGable Filters

Bad:

```csharp
var orders = await _dbContext.Orders
    .Where(o => o.CreatedAt.Date == targetDate)
    .ToListAsync(ct);
```

Better:

```csharp
var start = targetDate;
var end = targetDate.AddDays(1);

var orders = await _dbContext.Orders
    .Where(o => o.CreatedAt >= start && o.CreatedAt < end)
    .ToListAsync(ct);
```

Why:

> Applying functions to a column can prevent efficient index usage. Range predicates are usually more index-friendly.

## Complete Optimized List API Example

Request model:

```csharp
public sealed record OrderListRequest(
    OrderStatus? Status,
    DateTimeOffset? From,
    DateTimeOffset? To,
    int Page = 1,
    int PageSize = 20);
```

Response models:

```csharp
public sealed record OrderListItemDto(
    int Id,
    string CustomerName,
    string Status,
    decimal Total,
    DateTimeOffset CreatedAt);

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Total,
    int Page,
    int PageSize);
```

Query service:

```csharp
public sealed class OrderQueryService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<OrderQueryService> _logger;

    public OrderQueryService(
        AppDbContext dbContext,
        ILogger<OrderQueryService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<PagedResult<OrderListItemDto>> SearchAsync(
        OrderListRequest request,
        CancellationToken ct)
    {
        var page = Math.Max(request.Page, 1);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        IQueryable<Order> query = _dbContext.Orders.AsNoTracking();

        if (request.Status is not null)
        {
            query = query.Where(order => order.Status == request.Status);
        }

        if (request.From is not null)
        {
            var from = request.From.Value;
            query = query.Where(order => order.CreatedAt >= from);
        }

        if (request.To is not null)
        {
            var to = request.To.Value;
            query = query.Where(order => order.CreatedAt < to);
        }

        var total = await query.CountAsync(ct);

        var itemsQuery = query
            .OrderByDescending(order => order.CreatedAt)
            .ThenByDescending(order => order.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(order => new OrderListItemDto(
                order.Id,
                order.Customer.Name,
                order.Status.ToString(),
                order.Total,
                order.CreatedAt));

        _logger.LogDebug("Order list SQL: {Sql}", itemsQuery.ToQueryString());

        var items = await itemsQuery.ToListAsync(ct);

        return new PagedResult<OrderListItemDto>(items, total, page, pageSize);
    }
}
```

Controller:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly OrderQueryService _orders;

    public OrdersController(OrderQueryService orders)
    {
        _orders = orders;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<OrderListItemDto>>> Search(
        [FromQuery] OrderListRequest request,
        CancellationToken ct)
    {
        var result = await _orders.SearchAsync(request, ct);
        return Ok(result);
    }
}
```

Model index:

```csharp
modelBuilder.Entity<Order>()
    .HasIndex(order => new { order.Status, order.CreatedAt, order.Id });
```

What this example applies:

- query composition stays as `IQueryable` until the end;
- `AsNoTracking` is used for read-only data;
- projection avoids loading full entities;
- pagination protects the endpoint;
- sorting is deterministic with `CreatedAt` and `Id`;
- generated SQL can be inspected during development;
- the index matches the common filter/order shape.

## Review Questions

### How do you improve EF Core query performance?

Answer structure:

> I first check generated SQL and execution plan. Then I reduce loaded columns using projection, use `AsNoTracking` for read-only queries, avoid N+1 queries, apply proper indexes, paginate results, avoid unnecessary `Include`, consider split queries for large graphs, and use compiled queries only for hot paths after measurement.

### What is the N+1 problem?

N+1 means one query loads a list, then each item causes another query for related data. It often happens with lazy loading. It increases round trips and can destroy performance.

### When should you use `Include`?

Use `Include` when you need full related entities. For list pages and API DTOs, projection is often better because it loads only required columns.

### What is cartesian explosion?

It happens when joins over multiple collections multiply rows and duplicate parent data. Split queries or projection can help.

### When should you use compiled queries?

Only for very hot paths where profiling shows query compilation overhead is meaningful. Compiled queries do not fix bad SQL or missing indexes.

### Why can `AsNoTracking` improve performance?

It avoids change tracker overhead for read-only data.

## Common Mistakes

### Mistake: Calling `ToList()` too early

Why it is wrong:

> It materializes data before all filters/projections are applied.

Better answer:

> Compose the query first and materialize at the boundary.

### Mistake: Returning `IQueryable` from repository to controller without boundaries

Why it is wrong:

> It spreads data access concerns and makes query execution harder to reason about.

Better answer:

> Keep query composition in the application/data layer and return DTOs or results.

### Mistake: Loading entire tables

Why it is wrong:

> It increases database, network, memory, and serialization cost.

Better answer:

> Filter, paginate, and project.

### Mistake: Using `Include` for every relationship

Why it is wrong:

> It can load huge graphs and create cartesian explosion.

Better answer:

> Include only what is needed. Prefer projection for read endpoints.

### Mistake: Forgetting `AsNoTracking` for read-only queries

Why it is wrong:

> EF spends CPU and memory tracking entities that will not be updated.

Better answer:

> Use `AsNoTracking` for read-only queries.

### Mistake: Ignoring indexes

Why it is wrong:

> Even well-written LINQ can be slow without suitable indexes.

Better answer:

> Review execution plans and align indexes with filters, joins, and ordering.

### Mistake: Using offset pagination for huge datasets without considering keyset pagination

Why it is wrong:

> Large offsets can become increasingly slow.

Better answer:

> Use keyset pagination for high-volume infinite-scroll or timeline-style endpoints.

## Practice Task

Build an orders list API with:

1. filtering by status;
2. sorting by created date;
3. pagination;
4. DTO projection;
5. `AsNoTracking`;
6. index on `(Status, CreatedAt, Id)`;
7. `ToQueryString` inspection;
8. one N+1 example and fix;
9. offset vs keyset pagination comparison.
