# Database Performance

## Core Idea

Database performance is usually one of the biggest bottlenecks in business applications.

## Common Bottlenecks

- missing indexes;
- bad query plans;
- N+1 queries;
- large table scans;
- deep offset pagination;
- lock contention;
- deadlocks;
- long transactions;
- too many connections;
- returning too much data;
- inefficient joins;
- outdated statistics;
- parameter sniffing;
- non-SARGable filters;
- tempdb pressure;
- excessive key lookups.

## Optimization Process

```text
1. Identify the slow query or workload.
2. Capture duration, logical reads, CPU, and row count.
3. Check actual execution plan.
4. Compare estimated rows vs actual rows.
5. Check seek/scan/key lookup/sort/hash match.
6. Check waits, blocking, and deadlocks.
7. Add or adjust indexes.
8. Rewrite query if needed.
9. Test with production-like data.
10. Measure again.
```

Do not tune from memory. Measure the query.

## SQL Server Measurement

Useful local diagnostics:

```sql
SET STATISTICS IO ON;
SET STATISTICS TIME ON;

SELECT Id, TotalAmount, CreatedAt
FROM Orders
WHERE TenantId = @TenantId
  AND Status = @Status
ORDER BY CreatedAt DESC
OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY;
```

Look at:

- logical reads;
- CPU time;
- elapsed time;
- actual execution plan.

## Execution Plan Basics

Common operators:

| Operator | Meaning |
|---|---|
| Index Seek | uses index to directly find matching range |
| Index Scan | scans many/all index rows |
| Key Lookup | uses clustered key to fetch missing columns |
| Sort | sorts rows, can be expensive |
| Hash Match | used for joins/aggregates, can be expensive |
| Nested Loops | often good for small outer input |
| Merge Join | efficient when both inputs sorted |

Index scan is not always bad, and index seek is not always enough. Look at row counts, reads, and total plan cost.

## Index Design

Index should match query pattern.

Query:

```sql
SELECT Id, TotalAmount, CreatedAt
FROM Orders
WHERE TenantId = @TenantId
  AND Status = @Status
ORDER BY CreatedAt DESC
OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY;
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (TotalAmount);
```

Why:

```text
TenantId, Status help filtering.
CreatedAt helps ordering.
TotalAmount is included to avoid extra lookup.
```

## Composite Index Order

Column order matters.

For equality filters plus range/order:

```text
Equality columns first, then range/order columns.
```

Example:

```sql
WHERE TenantId = @TenantId
  AND Status = @Status
  AND CreatedAt >= @From
ORDER BY CreatedAt DESC
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC);
```

## Covering Index

A covering index contains all columns needed by the query.

```sql
CREATE INDEX IX_Orders_List
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (OrderNumber, TotalAmount);
```

This can avoid key lookups.

Trade-off:

- faster reads for that query;
- more storage;
- slower writes;
- more index maintenance.

## SARGability

SARGable queries can use indexes effectively.

Risky:

```sql
WHERE YEAR(CreatedAt) = 2026
```

Better:

```sql
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01'
```

Risky:

```sql
WHERE LOWER(Email) = LOWER(@Email)
```

Better:

```sql
WHERE NormalizedEmail = @NormalizedEmail
```

Applying functions to columns often prevents efficient index seeks.

## EF Core Query Shape

Risky:

```csharp
var orders = await _dbContext.Orders
    .Include(x => x.Items)
    .ToListAsync(ct);

return orders
    .Where(x => x.Status == OrderStatus.Paid)
    .Select(x => new OrderDto(x.Id, x.TotalAmount))
    .ToList();
```

Better:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Where(x => x.Status == OrderStatus.Paid)
    .Select(x => new OrderDto(x.Id, x.TotalAmount))
    .ToListAsync(ct);
```

Filter and project in SQL, not after loading everything into memory.

## N+1 Query

Risky:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Take(50)
    .ToListAsync(ct);

foreach (var order in orders)
{
    order.Items = await _dbContext.OrderItems
        .Where(x => x.OrderId == order.Id)
        .ToListAsync(ct);
}
```

Better projection:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .OrderByDescending(x => x.CreatedAt)
    .Take(50)
    .Select(x => new OrderListItemDto
    {
        Id = x.Id,
        OrderNumber = x.OrderNumber,
        ItemCount = x.Items.Count,
        TotalAmount = x.TotalAmount
    })
    .ToListAsync(ct);
```

## Offset vs Keyset Pagination

Offset:

```sql
ORDER BY CreatedAt DESC
OFFSET 100000 ROWS FETCH NEXT 50 ROWS ONLY;
```

Deep offset can be expensive because the database still walks/skips many rows.

Keyset:

```sql
SELECT TOP (50) Id, CreatedAt, TotalAmount
FROM Orders
WHERE TenantId = @TenantId
  AND CreatedAt < @LastSeenCreatedAt
ORDER BY CreatedAt DESC;
```

Use a stable tie-breaker if values can repeat:

```sql
WHERE TenantId = @TenantId
  AND (
      CreatedAt < @LastSeenCreatedAt
      OR (CreatedAt = @LastSeenCreatedAt AND Id < @LastSeenId)
  )
ORDER BY CreatedAt DESC, Id DESC;
```

## Lock Contention

Symptoms:

- queries wait;
- timeouts;
- high blocking sessions;
- deadlocks.

Common causes:

- long transactions;
- missing indexes;
- updating many rows;
- inconsistent update order;
- high isolation level;
- user interaction inside transaction.

Find blocking:

```sql
SELECT
    r.session_id,
    r.blocking_session_id,
    r.wait_type,
    r.wait_time,
    r.status,
    t.text
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.blocking_session_id <> 0;
```

## Deadlock Prevention

Use:

- consistent update order;
- short transactions;
- proper indexes;
- retry on deadlock victim;
- avoid user/network calls inside transactions;
- update fewer rows per transaction.

Retry in application:

```csharp
public async Task ExecuteWithDeadlockRetryAsync(Func<Task> operation)
{
    for (var attempt = 1; attempt <= 3; attempt++)
    {
        try
        {
            await operation();
            return;
        }
        catch (SqlException ex) when (ex.Number == 1205 && attempt < 3)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(100 * attempt));
        }
    }
}
```

## Connection Pool Exhaustion

Symptoms:

- timeout acquiring connection;
- requests wait;
- database CPU may not be high;
- app latency rises.

Causes:

- connections not disposed;
- slow queries holding connections;
- too many concurrent requests;
- long transactions;
- connection pool too small for workload.

In EF Core, scoped `DbContext` is usually disposed automatically at request end.

Risky:

```csharp
var dbContext = new AppDbContext(options);
```

without disposal.

Better:

```csharp
await using var dbContext = await _dbContextFactory.CreateDbContextAsync(ct);
```

## Statistics And Parameter Sniffing

SQL Server uses statistics to estimate row counts.

Bad estimates can lead to bad plans.

Helpful actions:

- update statistics;
- check actual vs estimated rows;
- consider query/index changes;
- investigate parameter-sensitive plans.

Parameter sniffing means SQL Server compiles a plan based on one parameter value that may be bad for another value.

Do not blindly add hints. First understand the plan.

## Read Scaling

Options:

- optimize queries first;
- caching;
- read replicas;
- CQRS read models;
- reporting database;
- materialized/summary tables;
- denormalized read models;
- search index such as Elasticsearch for search workloads.

Read replicas help only if:

- workload is read-heavy;
- replication lag is acceptable;
- the application routes reads safely;
- consistency expectations are clear.

## Practical Query Tuning Checklist

```text
What query is slow?
How often does it run?
How many rows does it read vs return?
Does it use a seek or scan?
Are estimates close to actual rows?
Is there a sort or key lookup?
Are filters SARGable?
Does an index match filter and order?
Is pagination deep offset?
Is blocking involved?
Are statistics stale?
Did data volume change recently?
```

## Practice Task

Analyze an order list query:

1. capture execution plan;
2. add composite index;
3. compare logical reads;
4. test offset vs keyset pagination;
5. simulate blocking transaction.
