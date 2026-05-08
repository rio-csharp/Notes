# Performance And Operational Tuning

## Core Idea

Most EF Core performance work is not about clever micro-optimizations. It is about making the read and write path reflect how the database actually works: selecting less data, tracking fewer objects, reducing round trips, preserving index-friendly predicates, and choosing set-based operations when object-by-object updates are unnecessary. The earlier concepts around context lifetime, tracking, query translation, and set-based operations together form an operational tuning framework.

## Diagnose Before Tuning

The first rule of EF Core performance work is to measure before changing behavior. A practical diagnosis flow usually looks like this:

1. identify the slow endpoint, background job, or database-heavy operation;
2. inspect traces and logs to confirm the database is the bottleneck;
3. inspect generated SQL;
4. review the execution plan in the database;
5. determine whether the issue is query shape, data volume, indexing, round trips, or tracking overhead;
6. re-measure after the change.

This matters because EF Core is often blamed for problems that are really schema, indexing, or query-design problems. (The database SQL chapter covers indexing and query optimization from the database engine perspective, which provides context for the EF-specific tuning discussed here.)

## Data Shape Matters More Than ORM Overhead

The most common performance win in EF Core is reducing data shape.

Bad:

```csharp
var users = await _dbContext.Users.ToListAsync(ct);

return users.Select(u => new UserListItemDto
{
    Id = u.Id,
    Name = u.Name
}).ToList();
```

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

Projection usually matters more than low-level ORM tuning because the database can send less data, EF Core can materialize less data, and the application can serialize less data.

## Tracking Cost On Read Paths

Read-only queries often benefit from no-tracking:

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

This reduces memory usage, snapshot creation, relationship fix-up work, and the likelihood that large read operations will pollute a request's tracked graph. It does not make every query fast, but it avoids paying write-oriented infrastructure cost on read-oriented paths.

For contexts that serve predominantly read-heavy workloads, the default tracking mode can be changed at the context level:

```csharp
public sealed class ReadOnlyDbContext : DbContext
{
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder
            .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)
            .UseSqlServer(connectionString);
    }
}
```

This eliminates the need to append `AsNoTracking()` to every read query. Individual queries that require tracking can opt in with `AsTracking()`.

## Round Trips And The N+1 Pattern

Round-trip count is one of the fastest ways to destroy query performance.

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

foreach (var order in orders)
{
    Console.WriteLine(order.Customer.Name);
}
```

If this triggers lazy loading, the system now performs one query for the orders and then one additional query per row. That pattern is often much worse than a single heavier SQL statement.

The usual corrections are:

- project related values directly;
- use `Include` when the full entity graph is genuinely needed;
- avoid hidden lazy-loading paths in API or loop-heavy code.

## Pagination And Result Windowing

Unbounded queries are rarely acceptable in production APIs. Offset pagination is a common starting point:

```csharp
var items = await _dbContext.Orders
    .AsNoTracking()
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
```

It is easy to implement, but large offsets can become expensive because the database may still scan or sort rows that the application later discards.

For deep scrolling or large datasets, keyset pagination is often more stable:

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

The trade-off is more complex client state in exchange for better scaling on large ordered sets.

## `Include`, Split Queries, And Graph Size

Large `Include` chains can create result sets with duplicated parent data and unexpectedly large join shapes:

```csharp
var customers = await _dbContext.Customers
    .Include(c => c.Orders)
    .ThenInclude(o => o.Items)
    .AsSplitQuery()
    .ToListAsync(ct);
```

Split queries can reduce cartesian expansion in some cases by issuing multiple related queries instead of one very large join. The trade-off is additional round trips. This is a good example of EF Core tuning being about shape and trade-off rather than about one universally best option.

When a graph is only needed for output, projection is often better than either eager entity loading strategy.

## Index Awareness And SARGability

EF Core cannot compensate for poor indexing or non-SARGable predicates. The query:

```csharp
var orders = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .ToListAsync(ct);
```

still depends on the database having an index shape that supports the filter and order pattern.

Likewise, a predicate such as:

```csharp
o.CreatedAt.Date == targetDate
```

often harms index usage compared with a range predicate:

```csharp
o.CreatedAt >= start && o.CreatedAt < end
```

Performance tuning in EF Core therefore requires reading the LINQ expression as a database query, not only as C# code.

## Set-Based Operations Versus Entity Loops

When the task is bulk infrastructure work rather than domain behavior on loaded aggregates, set-based operations are often superior.

```csharp
await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Pending &&
        o.CreatedAt < DateTimeOffset.UtcNow.AddDays(-7))
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(o => o.Status, OrderStatus.Expired),
        ct);
```

This avoids loading every row into memory and bypasses change tracking. The trade-off is that domain methods, entity callbacks, and graph-level invariants are also bypassed. That is acceptable only when the operation is fundamentally a data maintenance action rather than a rich domain command.

## Batch Size And Command Batching

When `SaveChanges` processes multiple insert, update, or delete commands, EF Core batches them into a single round trip rather than issuing each command individually. The batch size is controlled by the provider and can be configured:

```csharp
optionsBuilder.UseSqlServer(connectionString, options =>
{
    options.MinBatchSize(1);
    options.MaxBatchSize(100);
});
```

For large bulk operations, the default batching behavior can consume significant memory as EF Core builds the command set before execution. In such cases, `ExecuteUpdate` and `ExecuteDelete` are often a better choice because they bypass the tracked graph entirely and generate a single set-based statement.

Batch size tuning is most relevant for write-heavy workloads where `SaveChanges` processes tens or hundreds of commands in one call. For ordinary request-scoped operations with a handful of changes, the defaults are usually adequate.

## Compiled Queries

Compiled queries can reduce overhead for very hot query paths:

```csharp
private static readonly Func<AppDbContext, int, Task<UserDto?>> GetUserByIdQuery =
    EF.CompileAsyncQuery((AppDbContext db, int id) =>
        db.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto(u.Id, u.Name))
            .FirstOrDefault());
```

They should not be introduced speculatively. Most EF Core performance issues come from SQL shape, data volume, indexing, tracking, or round trips rather than from query compilation cost.

Compiled queries are best treated as a late-stage optimization for a measured hot path whose broader query shape is already sound.

## Streaming Results

When a query returns a large result set, the default buffering behavior -- materializing the full set into memory -- can cause significant memory pressure. `AsAsyncEnumerable` streams each row as it arrives, keeping peak memory proportional to one row:

```csharp
await foreach (var order in _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.Region == region)
    .OrderBy(o => o.Id)
    .AsAsyncEnumerable())
{
    await ProcessOrderAsync(order, ct);
}
```

Streaming is appropriate for batch jobs, exports, and data migration workloads where the total row count is large but each row is processed independently. The trade-off is that the database connection remains open for the duration of the enumeration.

## Query Tags For Performance Correlation

Tagging queries with `TagWith` embeds identifying comments into the generated SQL, making it easier to correlate logged command execution times with specific application code paths:

```csharp
var orders = await _dbContext.Orders
    .TagWith("SearchOrders")
    .Where(o => o.Status == status)
    .Select(o => new OrderListItemDto { Id = o.Id, Total = o.Total })
    .ToListAsync(ct);
```

In command logs, the tag appears as a SQL comment, allowing the operator or DBA to identify which part of the application produced a given query. This is especially useful when analyzing slow query logs from the database side. For automatic source location, `TagWithCallSite()` inserts the file path and line number.

Tags have no execution cost beyond the comment text in the SQL string. They are purely a diagnostics aid.

## Logging And SQL Inspection

Operational tuning depends on visibility. `ToQueryString`, EF logging, tracing, and database execution plans form the bridge between application code and database behavior.

Without that visibility, teams often guess incorrectly about the root cause. With it, they can distinguish between:

- too much data returned;
- poor predicate shape;
- missing indexes;
- excessive includes;
- query count explosion;
- tracking overhead;
- command batching issues.

Performance work becomes much more predictable once the generated SQL and actual execution plan are part of the normal debugging workflow.

## Design Consequences

The best EF Core performance improvements usually come from design discipline, not from isolated tweaks. Project read models instead of loading entities by habit. Use no-tracking when the data will not be updated. Keep pagination bounded. Preserve index-friendly predicates. Prefer set-based operations for bulk data changes. Measure first, and confirm the database behavior rather than optimizing against assumptions.

Those habits keep EF Core aligned with the relational engine underneath it, which is where most meaningful performance gains actually come from.
