# EF Core Review Questions

This file is for self-review and knowledge checks. Do not memorize word by word. Practice explaining the reasoning naturally.

## 1. What is DbContext?

Answer:

> `DbContext` represents a session with the database. It handles querying, entity mapping, change tracking, and saving changes as a unit of work. In ASP.NET Core, it is usually registered as scoped because one request often maps to one unit of work and `DbContext` is not thread-safe.

Follow-up: Why not singleton?

> `DbContext` is not thread-safe and contains per-unit-of-work state such as tracked entities. A singleton `DbContext` would keep state across requests, grow memory usage, mix unrelated operations, and create concurrency bugs.

Follow-up: What happens if you use one `DbContext` across threads?

> You can get race conditions, invalid operation exceptions, corrupted tracking state, or unpredictable query/save behavior. Each request or unit of work should use its own context instance.

Follow-up: What is change tracking?

> Change tracking means EF Core remembers entity instances loaded or attached to the context, tracks their original values and current values, then generates SQL updates/inserts/deletes during `SaveChanges`.

Small update example:

```csharp
var order = await _dbContext.Orders
    .SingleAsync(o => o.Id == orderId, ct);

order.Status = OrderStatus.Submitted;

await _dbContext.SaveChangesAsync(ct);
```

EF tracks the loaded `order`, detects the status change, and generates an `UPDATE`.

## 2. Tracking vs no-tracking queries?

Answer:

> Tracking queries keep entity instances in the change tracker, so EF can detect modifications and save updates. No-tracking queries skip that overhead and are better for read-only scenarios, especially list pages and API DTO projections.

Example:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Select(o => new OrderDto(o.Id, o.Total))
    .ToListAsync(ct);
```

Follow-up: When should you not use `AsNoTracking`?

> When you plan to update the loaded entities in the same context. Tracking makes update workflows simpler and safer.

Follow-up: What is `AsNoTrackingWithIdentityResolution`?

> It avoids normal tracking but still ensures repeated rows for the same entity key are represented by the same object instance in the result. It is useful for read-only graph queries where duplicate instances would be wasteful or confusing.

## 3. How does EF Core translate LINQ to SQL?

Answer:

> EF Core builds an expression tree from an `IQueryable` LINQ query. The database provider translates supported expressions into SQL. The query executes only when materialized with methods like `ToListAsync`, `FirstOrDefaultAsync`, `CountAsync`, or `AnyAsync`.

Follow-up: What is the difference between `IQueryable` and `IEnumerable`?

> `IQueryable` is provider-translatable query description. `IEnumerable` is in-memory enumeration. Calling `AsEnumerable` switches the rest of the query to client-side LINQ.

Follow-up: Why can local methods be a problem?

> EF Core cannot translate arbitrary .NET methods into SQL. Unsupported methods can cause runtime exceptions or force too much data to be processed in memory.

Translatable:

```csharp
var paidOrders = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .ToListAsync(ct);
```

Usually not translatable:

```csharp
var paidOrders = await _dbContext.Orders
    .Where(o => IsImportantOrder(o))
    .ToListAsync(ct);
```

If custom logic must run in memory, first reduce the candidate set in SQL.

## 4. How do you avoid N+1 queries?

Answer:

> I avoid lazy loading in high-traffic API paths, inspect generated SQL, and use projection or `Include` intentionally. For DTO responses, projection is often better because it loads only required fields. For full aggregate loading, `Include` or explicit loading may be appropriate.

Good:

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

Follow-up: Why is lazy loading risky?

> It hides database calls behind property access. A simple loop or JSON serialization can accidentally trigger many queries.

## 5. Include vs projection?

Answer:

> `Include` loads related entities into the entity graph. Projection shapes query results into DTOs or anonymous objects. For read APIs, projection is usually more efficient. I use `Include` when I need entities and their relationships for domain behavior or updates.

Follow-up: Does `Include` affect projection?

> If the final query projects to a DTO, explicit `Include` is often unnecessary because EF can generate joins for the projected navigation fields.

Follow-up: What is cartesian explosion?

> Cartesian explosion can happen when including multiple collections in one query. The join multiplies rows and duplicates parent data. EF Core split queries can reduce duplication by executing multiple queries.

Example:

```csharp
var customers = await _dbContext.Customers
    .Include(c => c.Orders)
    .ThenInclude(o => o.Items)
    .AsSplitQuery()
    .ToListAsync(ct);
```

## 6. What is optimistic concurrency?

Answer:

> Optimistic concurrency assumes conflicts are rare. A version column like `RowVersion` is checked during update. If another transaction changed the row, EF throws `DbUpdateConcurrencyException`, and the API can return `409 Conflict`.

Example:

```csharp
[Timestamp]
public byte[] RowVersion { get; set; } = [];
```

Follow-up: What SQL does EF generate conceptually?

> EF includes the original row version in the `WHERE` clause. If zero rows are updated, EF knows someone changed or deleted the row.

Conceptual SQL:

```sql
UPDATE Products
SET Stock = @p0
WHERE Id = @p1
  AND RowVersion = @p2;
```

Follow-up: Should you silently retry every concurrency conflict?

> Not always. Some conflicts need user decision or business merge logic. For important user edits, returning `409 Conflict` and asking the user to reload is often safer.

## 7. What are migrations?

Answer:

> Migrations are versioned database schema changes generated from EF Core model changes. They allow teams to evolve schema consistently. For production, I prefer generating SQL scripts, reviewing them, and applying through CI/CD rather than blindly running migrations on app startup.

Follow-up: What is expand-contract?

> It is a zero-downtime migration pattern: add new schema first, deploy compatible app changes, backfill data, switch reads/writes, and remove old schema later.

Follow-up: Why review generated migrations?

> EF may generate destructive changes, expensive table operations, or drop/add instead of rename. Reviewing SQL reduces data loss and downtime risk.

## 8. How do you optimize EF Core performance?

Answer:

> I inspect generated SQL and execution plans, use DTO projection, `AsNoTracking` for read-only queries, avoid N+1, paginate results, reduce unnecessary `Include`, use proper indexes, consider split queries for large graphs, and only use compiled queries for measured hot paths.

Follow-up: Are compiled queries the first optimization?

> No. Most performance problems are caused by bad SQL, too much data loaded, missing indexes, or too many round trips. Compiled queries help only when query compilation overhead is measurable on a hot path.

Follow-up: Why is pagination important?

> It limits database work, memory usage, network transfer, and serialization cost. It also protects APIs from accidentally returning huge result sets.

## 9. Repository pattern with EF Core: yes or no?

Answer:

> It depends. EF Core already has repository-like behavior through `DbSet` and unit-of-work behavior through `DbContext`. A repository can add value when it protects domain boundaries or hides complex persistence. But generic repositories often add little value and can hide EF Core features.

Engineering perspective:

> I avoid using patterns mechanically. I choose repository when it improves boundaries and testability, not just because the pattern exists.

Follow-up: What is wrong with a generic repository?

> It often exposes CRUD methods that duplicate `DbSet` while hiding important EF features like projection, includes, tracking options, compiled queries, and provider-specific optimizations.

## 10. How do you handle transactions in EF Core?

Answer:

> `SaveChanges` uses transactions for normal changes. I use explicit transactions when multiple `SaveChanges`, raw SQL plus EF changes, or coordinated operations need one atomic boundary. I avoid holding database transactions while calling external services.

Follow-up: Why avoid external calls inside transactions?

> External calls are slow and unreliable. Holding database locks during network calls increases blocking and can create inconsistent outcomes if the external call succeeds but the database transaction fails.

Follow-up: How do you handle transient failures with manual transactions?

> Use EF Core execution strategy and execute the whole transaction inside the retry delegate, so the entire unit is retried safely.

Example:

```csharp
var strategy = _dbContext.Database.CreateExecutionStrategy();

await strategy.ExecuteAsync(async () =>
{
    await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

    order.Status = OrderStatus.Paid;
    await _dbContext.SaveChangesAsync(ct);

    payment.Status = PaymentStatus.Captured;
    await _dbContext.SaveChangesAsync(ct);

    await transaction.CommitAsync(ct);
});
```

The retry delegate contains the whole transaction boundary.

## 11. When do you use raw SQL?

Answer:

> I use raw SQL when LINQ is not expressive enough, when I need database-specific features, when integrating with stored procedures, or when a reporting/performance query is clearer in SQL. I always parameterize user input.

Follow-up: How do you prevent SQL injection?

> Use interpolated `FromSql` or explicit parameters. Never concatenate untrusted values into SQL strings.

Safe raw SQL:

```csharp
var orders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders WHERE Status = {status}")
    .AsNoTracking()
    .ToListAsync(ct);
```

Unsafe raw SQL:

```csharp
var sql = "SELECT * FROM Orders WHERE Status = '" + status + "'";
var orders = await _dbContext.Orders.FromSqlRaw(sql).ToListAsync(ct);
```

Follow-up: What is a keyless entity?

> A keyless entity maps query results without a primary key, often for views, reports, or stored procedure results.

## 12. Value converter vs owned entity?

Answer:

> A value converter maps one CLR property to one database value, such as `Email` to string or enum to string. An owned entity maps a value object with multiple properties, such as `Money` or `Address`, usually into columns owned by the parent entity.

Follow-up: What is the risk of enum-as-string?

> Renaming enum members can break existing database values unless you migrate the data or keep stable stored names.

Follow-up: What is `ValueComparer`?

> It tells EF how to compare, hash, and snapshot custom values for change tracking, especially converted collection-like or mutable values.

Owned entity example:

```csharp
modelBuilder.Entity<Order>()
    .OwnsOne(o => o.ShippingAddress, address =>
    {
        address.Property(x => x.Street).HasMaxLength(200);
        address.Property(x => x.City).HasMaxLength(100);
        address.Property(x => x.PostalCode).HasMaxLength(20);
    });
```

## Common Misconceptions

### Common misconception: Returning EF entities directly from controllers

Why it is risky:

> It leaks persistence models as API contracts, can expose fields accidentally, can create circular serialization problems, and makes API versioning harder.

Better:

> Return DTOs shaped for the API contract.

### Common misconception: Using lazy loading everywhere

Why it is risky:

> It can hide database calls and cause N+1 query problems, especially during JSON serialization.

Better:

> Use explicit projection or intentional `Include` based on the endpoint's data needs.

### Common misconception: No pagination

Why it is risky:

> Large result sets increase memory, network, serialization, and database load. They can also cause timeouts.

Better:

> Always paginate list APIs and define maximum page sizes.

### Common misconception: Calling `ToList()` too early

Why it is risky:

> It materializes data before all filters/projections are applied, moving work from the database to application memory.

Better:

> Compose the query first, then materialize at the boundary with `ToListAsync`.

### Common misconception: Using `Update()` blindly on request models

Why it is risky:

> It may mark every property as modified and can overwrite fields the client should not control.

Better:

> Load the entity, validate permissions, then update allowed fields explicitly.

### Common misconception: Assuming EF InMemory behaves like SQL Server

Why it is risky:

> EF InMemory is not relational: constraints, transactions, SQL translation, null behavior, and query semantics can differ.

Better:

> Use SQLite or Testcontainers for integration tests when relational behavior matters.

### Common misconception: Treating migrations as harmless in production

Why it is risky:

> Schema changes can lock tables, fail midway, break old app versions, or cause data loss.

Better:

> Review generated SQL, apply migrations through a controlled deployment process, and design backward-compatible changes.

### Common misconception: Saying EF Core means you do not need SQL knowledge

Why it is risky:

> EF Core generates SQL, and database performance still depends on indexes, query plans, joins, locks, and data volume.

Better:

> Use EF Core productively, but inspect SQL and understand relational database fundamentals.
