# EF Core Querying

## Core Idea

EF Core querying is about writing LINQ queries that are translated into SQL and executed by the database.

Chinese notes:

- `query translation`: 查询翻译.
- `expression tree`: 表达式树.
- `client evaluation`: 客户端计算.
- `projection`: 投影.
- `SARGable`: 可被索引有效利用的查询形式.

## IQueryable

EF Core queries usually start as `IQueryable<T>`.

```csharp
IQueryable<Order> query = _dbContext.Orders;
```

The query is not executed immediately. EF Core builds an expression tree and translates it to SQL when the query is enumerated.

Execution methods:

- `ToListAsync`
- `FirstOrDefaultAsync`
- `SingleAsync`
- `CountAsync`
- `AnyAsync`

Key takeaway:

> `IQueryable` is a query description that a provider can translate. `IEnumerable` is in-memory enumeration.

## Under The Hood: Query Translation Pipeline

EF Core query execution is not "LINQ runs in memory first".

For `IQueryable<T>`, LINQ builds an expression tree（表达式树）.

Conceptual pipeline:

```text
C# LINQ query
  -> expression tree
  -> EF Core query preprocessing
  -> provider translation
  -> SQL generation
  -> parameterization
  -> database execution
  -> materialization into objects/DTOs
  -> optional change tracking
```

Example:

```csharp
var query = _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        Total = o.Total
    });
```

Before `ToListAsync`, this is a query description, not a result list.

```csharp
var items = await query.ToListAsync(ct);
```

Only now EF Core translates and sends SQL.

## Expression Tree vs Delegate

This is a common review trap.

`IQueryable<T>` uses expression trees:

```csharp
Expression<Func<Order, bool>> predicate = o => o.Total > 100;
```

EF Core can inspect the expression and translate it to SQL.

`IEnumerable<T>` uses delegates:

```csharp
Func<Order, bool> predicate = o => o.Total > 100;
```

A delegate is executable .NET code, not something the database provider can translate.

Practical explanation:

> `IQueryable` represents a query expression that a provider can translate. `IEnumerable` represents in-memory enumeration. Calling `AsEnumerable` switches from provider translation to client-side LINQ.

## Provider Translation

EF Core is provider-based.

SQL Server, PostgreSQL, SQLite, and other providers translate expressions differently because their SQL dialects and database functions differ.

Example:

```csharp
query.Where(o => o.CreatedAt.Date == targetDate)
```

This may translate differently by provider, and it may hurt index usage.

Better:

```csharp
query.Where(o =>
    o.CreatedAt >= start &&
    o.CreatedAt < end);
```

This is easier to translate and more likely to be SARGable.

## Query Compilation And Caching

EF Core compiles the expression tree into an executable query plan and caches query plans by query shape.

Good:

```csharp
var order = await _dbContext.Orders
    .Where(o => o.Id == orderId)
    .FirstOrDefaultAsync(ct);
```

The value `orderId` becomes a parameter. The query shape can be reused.

For very hot paths, compiled queries can reduce overhead:

```csharp
private static readonly Func<AppDbContext, int, Task<Order?>> GetOrderById =
    EF.CompileAsyncQuery((AppDbContext db, int id) =>
        db.Orders.FirstOrDefault(o => o.Id == id));
```

Use compiled queries only after measuring. Most application queries are fine without them.

## Materialization And Tracking

After SQL returns rows, EF Core materializes results.

For entity queries:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);
```

EF Core creates entity instances and may track them.

For projection:

```csharp
var orders = await _dbContext.Orders
    .Select(o => new OrderListItemDto(o.Id, o.Total))
    .ToListAsync(ct);
```

EF Core creates DTOs and usually does less tracking work.

Engineering perspective:

> Query performance is affected not only by SQL execution, but also by translation, materialization, tracking, and how much data is transferred from the database.

## Basic Query

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        Total = o.Total,
        CreatedAt = o.CreatedAt
    })
    .ToListAsync(ct);
```

Generated SQL will roughly include:

- `WHERE`;
- `ORDER BY`;
- `TOP` or `OFFSET/FETCH`;
- selected columns only.

## Projection

Projection is one of the most important EF Core performance techniques.

Bad:

```csharp
var orders = await _dbContext.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

Better for list page:

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

## Dynamic Filtering

```csharp
public async Task<PagedResult<OrderListItemDto>> SearchAsync(
    OrderSearchRequest request,
    CancellationToken ct)
{
    var query = _dbContext.Orders.AsNoTracking().AsQueryable();

    if (request.Status is not null)
    {
        query = query.Where(o => o.Status == request.Status);
    }

    if (request.CustomerId is not null)
    {
        query = query.Where(o => o.CustomerId == request.CustomerId);
    }

    if (request.CreatedFrom is not null)
    {
        query = query.Where(o => o.CreatedAt >= request.CreatedFrom.Value);
    }

    if (request.CreatedTo is not null)
    {
        query = query.Where(o => o.CreatedAt < request.CreatedTo.Value);
    }

    var total = await query.CountAsync(ct);

    var items = await query
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Skip((request.Page - 1) * request.PageSize)
        .Take(request.PageSize)
        .Select(o => new OrderListItemDto
        {
            Id = o.Id,
            Total = o.Total,
            CreatedAt = o.CreatedAt
        })
        .ToListAsync(ct);

    return new PagedResult<OrderListItemDto>(items, total, request.Page, request.PageSize);
}
```

Suggested request model:

```csharp
public sealed class OrderSearchRequest
{
    public OrderStatus? Status { get; init; }
    public int? CustomerId { get; init; }
    public DateTimeOffset? CreatedFrom { get; init; }
    public DateTimeOffset? CreatedTo { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}
```

## Client Evaluation

Bad:

```csharp
var orders = await _dbContext.Orders
    .Where(o => IsImportant(o.Status))
    .ToListAsync(ct);
```

EF Core may not translate `IsImportant` to SQL.

Better:

```csharp
var importantStatuses = new[] { OrderStatus.Paid, OrderStatus.PendingReview };

var orders = await _dbContext.Orders
    .Where(o => importantStatuses.Contains(o.Status))
    .ToListAsync(ct);
```

## First vs Single

`First`:

- returns first row;
- does not require uniqueness.

`Single`:

- expects exactly one row;
- throws if more than one.

Use `Single` when uniqueness is a business/data invariant.

## Any vs Count

Good:

```csharp
var exists = await _dbContext.Users
    .AnyAsync(u => u.Email == email, ct);
```

Avoid:

```csharp
var exists = await _dbContext.Users
    .CountAsync(u => u.Email == email, ct) > 0;
```

`Any` can stop earlier.

## Inspect Generated SQL

```csharp
var sql = _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .ToQueryString();
```

Use this during debugging and performance review.

## Review Questions

### How does EF Core translate LINQ to SQL?

> EF Core builds an expression tree from the LINQ query, then the database provider translates supported expressions into SQL. The query is executed when enumerated by methods like `ToListAsync` or `FirstOrDefaultAsync`.

### Why is projection important?

> Projection selects only the columns needed by the API response. It reduces I/O, memory usage, serialization cost, and change tracking overhead.

### What causes client-side evaluation problems?

> Using local methods or unsupported expressions inside queries can prevent translation. It may either throw or cause too much data to be loaded before filtering.

### Why is `IQueryable` dangerous to leak from repository to controller?

> It leaks persistence concerns upward, can cause query composition in unexpected layers, and makes it harder to reason about execution boundaries. I prefer to keep query construction in the data-access/application layer and materialize at a clear boundary.

## Common Mistakes

### Mistake: Calling `ToListAsync` before applying filters

Why it is wrong:

> It loads too much data into memory and shifts filtering from the database to the application.

Better answer:

> Compose the query first, then materialize at the boundary.

### Mistake: Returning `IQueryable` from controller

Why it is wrong:

> It leaks query composition outside the data layer and can create hidden runtime query behavior.

Better answer:

> Return materialized DTOs from the API boundary.

### Mistake: Using unsupported local methods in queries

Why it is wrong:

> EF Core may not translate them, causing client-side evaluation or runtime exceptions.

Better answer:

> Rewrite the logic in translatable expressions or move the logic before or after the query boundary when appropriate.

### Mistake: Loading full entities for list DTOs

Why it is wrong:

> It transfers more data than needed and may track unnecessary entities.

Better answer:

> Use projection to shape data directly into DTOs.

### Mistake: Using `Include` when projection is enough

Why it is wrong:

> `Include` loads full entity graphs, which can be heavier than needed for read endpoints.

Better answer:

> Use `Include` only when you actually need tracked related entities. For read models, projection is often better.

### Mistake: Not checking generated SQL

Why it is wrong:

> LINQ can look elegant while producing inefficient SQL.

Better answer:

> Inspect `ToQueryString`, query plans, and runtime metrics when performance matters.

## Practice Task

Build an order search endpoint with:

1. optional filters;
2. sorting;
3. pagination;
4. DTO projection;
5. `ToQueryString` inspection;
6. comparison between entity loading and projection.

