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

## Execution Plan Mechanics

The query optimizer translates SQL into an execution plan by estimating the cost of alternative strategies and selecting the cheapest one. Estimates are based on statistics -- histograms and density vectors that describe the data distribution in each index or column.

### How the Optimizer Works

1. The optimizer parses the query and generates candidate plan variants (using different join strategies, access methods, and operator orderings).
2. For each variant, it estimates the row count at each operator using statistics. These estimates drive the cost calculation.
3. The cheapest plan (by estimated I/O and CPU cost) is selected and cached.

When estimated rows differ significantly from actual rows, the optimizer may choose a suboptimal plan. For example, estimating 100 rows when the actual count is 1,000,000 could push the optimizer toward a nested loops join when a hash join would be better.

### Key Operators and Their Implications

| Operator | Mechanism | Cost Signal |
|---|---|---|
| **Index Seek** | Traverses the B-tree to find a range of rows matching a predicate. Cost scales with tree depth and number of matching rows, not total table size. | Low for selective predicates; high for broad ranges. |
| **Index Scan** | Reads all leaf-level pages of an index (or table). Cost scales with total pages, not row count selected. | Better than a seek when most rows match. |
| **Key Lookup** | For each row found in a non-clustered index, fetches the remaining columns from the clustered index via the row locator. Each lookup is a random I/O operation. | High for large row counts; often eliminated with covering or included columns. |
| **Sort** | Materializes and orders rows. Requires memory (sort buffer in tempdb if rows exceed memory grant). | Expensive for large inputs; avoid by serving pre-sorted data via an index. |
| **Hash Match** | Builds a hash table from one input and probes with the other. Used for joins and aggregates when inputs are large and unsorted. | Memory-intensive for large build inputs; spills to tempdb if memory is insufficient. |
| **Nested Loops** | For each row in the outer input, probes the inner input. Efficient when outer input is small and inner input has a useful index. | O(N * M) in the worst case; ideal when outer input is tiny. |
| **Merge Join** | Both inputs are sorted on the join key, then merged in a single pass. | Efficient for large, pre-sorted inputs; avoids sorting if indexes already provide sort order. |

Index scan is not always bad, and index seek is not always sufficient. Evaluate by comparing actual row counts, logical reads, and the overall plan shape. A scan that reads 50 pages to return 90% of a small table is fine; a scan that reads 500,000 pages because of a missing predicate is a problem.

### Debugging Plan Issues

When optimizing a slow query:

1. Compare **estimated rows vs actual rows** in the execution plan. A large discrepancy indicates stale statistics or a poorly selective parameter sniff.
2. Identify **Key Lookup** operators -- these often dominate cost in OLTP queries. Add INCLUDE columns or a covering index.
3. Look for **Sort** operators above a large row estimate; an index on the sort columns may eliminate them.
4. Check **memory grants**: a large discrepancy between granted and used memory points to cardinality estimation errors and can cause unnecessary memory pressure.

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

Index design rationale:

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

- faster reads for that query;
- more storage;
- slower writes;
- more index maintenance.

## SARGability

SARGable (Search ARGument ABLE) predicates can use an index seek. When a predicate is non-SARGable, the query optimizer cannot use the B-tree structure to narrow the search range and must fall back to scanning.

### Mechanism

An index B-tree organizes values in sorted order. A seek works by navigating the tree to the first matching value and then scanning forward. This requires the comparison to be of the form:

```
<column> <operator> <expression>
```

When the column is wrapped in a function -- `YEAR(CreatedAt)`, `LOWER(Email)`, `CONVERT(varchar, Date)` -- the optimizer cannot reverse the function to determine which index keys to navigate toward. It must evaluate the function for every row in the index to find matches.

### Non-SARGable Patterns

```sql
-- Cannot seek: YEAR() must be evaluated for every row
WHERE YEAR(CreatedAt) = 2026

-- Can seek: the optimizer sees a range of index key values to target
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01'
```

```sql
-- Cannot seek: LOWER() evaluated per row
WHERE LOWER(Email) = LOWER(@Email)

-- Can seek: precomputed normalized value
WHERE NormalizedEmail = @NormalizedEmail
```

### Other Non-SARGable Patterns

- `WHERE Column LIKE '%prefix'` -- leading wildcard prevents seek.
- `WHERE Column + @offset = @target` -- arithmetic on the column.
- `WHERE ISNULL(Column, 0) = @value` -- NULL handling wrapping.
- `WHERE CAST(Column AS type) = @value` -- type conversion on the column.

### Exceptions

When the table is small, a scan may be perfectly acceptable. SARGability matters most for large tables queried by selective predicates. Always measure the actual impact before rewriting queries.

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

Lock contention occurs when concurrent transactions compete for the same data resources. SQL Server uses lock managers with multiple granularity levels: row (key), page, and table. The database engine automatically escalates row locks to page or table locks when a single transaction accumulates more than 5,000 locks on the same object or when memory pressure from lock structures is detected. Lock escalation can convert many fine-grained locks into a single blocking bottleneck.

### Lock Types

- **Shared (S)**: held during read operations (SELECT). Multiple shared locks can coexist on the same resource.
- **Exclusive (X)**: held during write operations (INSERT, UPDATE, DELETE). Only one exclusive lock can exist on a resource, and it blocks all other lock requests.
- **Update (U)**: held on the initial read phase of an update to prevent deadlocks with other concurrent updates. Converted to exclusive when the actual write occurs.
- **Intent locks**: signal the intent to acquire a lock at a finer granularity (e.g., intent exclusive at the table level means the transaction holds exclusive locks on some rows).

### Symptoms

- queries wait on `LCK_M_*` wait types;
- timeouts and slow response times;
- high blocking chains visible in `sys.dm_exec_requests`;
- deadlocks in error logs.

### Typical Sources

- **Long transactions**: holding locks increases contention probability. Keep transaction duration minimal.
- **Missing indexes**: an index scan may lock more rows than strictly necessary, escalating contention.
- **Updating many rows in one transaction**: triggers lock escalation, blocking all concurrent access to the table.
- **Inconsistent update order**: two transactions updating resources A and B in opposite order create a deadlock cycle.
- **High isolation level**: `SERIALIZABLE` holds range locks that block inserts into predicate ranges.
- **User interaction inside a transaction**: reading data, presenting it to a user, waiting for input, and then writing the result keeps locks held for seconds (or longer).

### Identifying Blocking

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

This query returns the head blocker and the blocked session, along with the wait type and SQL text. The `wait_type` column indicates the specific lock class (e.g., `LCK_M_S` for shared lock wait, `LCK_M_X` for exclusive lock wait).

### Deadlock Analysis

When a deadlock occurs, SQL Server selects a victim (the transaction with the lowest rollback cost) and terminates it with error 1205. The deadlock graph -- available in the system health session or via extended events -- shows the resources involved and the lock order for each transaction. Analyze the deadlock graph to identify which resources need consistent ordering or shorter lock duration.

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

### Statistics Mechanism

SQL Server maintains statistics as multi-column histograms on index key columns and optionally on non-indexed columns. A histogram divides the data range into up to 200 steps, storing the number of rows and the density of distinct values within each step. When a query references a column with a filter predicate, the optimizer looks up the predicate value in the histogram to estimate selectivity.

Statistics become stale when data is modified (inserts, updates, deletes) beyond a threshold. SQL Server automatically updates statistics when approximately 20% of rows in a table with more than 500 rows have changed, but for large tables this threshold may not trigger frequently enough. Queries compiled against stale statistics produce inaccurate row estimates, leading to suboptimal plans.

### Parameter Sniffing

When SQL Server compiles a query plan for a parameterized query or stored procedure, it "sniffs" the parameter value provided on first execution. The resulting plan is optimized for that specific value. If the procedure is later called with a different value whose data distribution is significantly different, the cached plan may perform poorly.

Example:

```sql
-- First call: @Status = 'Shipped' (returns 50 rows)
-- Optimizer generates a plan with a narrow index seek.
EXEC GetOrdersByStatus @Status = 'Shipped'

-- Second call: @Status = 'Pending' (returns 500,000 rows)
-- The cached seek-based plan is terrible for this value.
EXEC GetOrdersByStatus @Status = 'Pending'
```

### Mitigation Strategies

| Strategy | Approach | Trade-off |
|---|---|---|
| **Update statistics** | Keep statistics current for volatile tables. | May not help with fundamental data skew. |
| **Recompile hint** | `OPTION (RECOMPILE)` generates a new plan each execution. | Adds compilation overhead; acceptable for infrequent queries. |
| **Optimize for unknown** | `OPTION (OPTIMIZE FOR UNKNOWN)` uses average density instead of sniffed value. | Plan may not be optimal for any specific value but avoids worst-case. |
| **Query multiple plans** | Split the procedure into separate code paths for different value ranges. | Increases code complexity. |
| **Plan guide** | Force a specific plan via query store or plan guide. | Maintenance burden; plan may become stale. |

Do not blindly add hints. First capture the actual execution plan, compare estimated vs actual rows, and determine whether the plan shape changes with different parameter values.

## Read Scaling

Before scaling reads horizontally, ensure queries are already optimized -- adding replicas to mask a missing-index problem wastes infrastructure.

### Options (Ordered by Increasing Complexity)

1. **Optimize queries and indexes first.** Many read-performance problems are solved by better indexing, not by adding infrastructure.
2. **Caching**: in-memory cache for hot data, distributed cache for cross-instance sharing (see the Caching section in Chapter 1 of this topic).
3. **Read replicas**: asynchronous secondary copies of the primary database. Queries are routed to the replica, keeping the primary free for writes. Requires careful connection routing and tolerance for replication lag (typically sub-second in the same region, but can grow under high write load).
4. **CQRS read models**: a separate read-optimized database populated by events from the write side. The read schema can differ entirely from the write schema (denormalized, pre-joined, with precomputed aggregates). This adds event processing infrastructure but provides the most flexibility. See Chapter 13.05 for a detailed discussion of CQRS with separate read models and projection workers.
5. **Materialized / summary tables**: precomputed aggregations refreshed on a schedule or via triggers. Useful for dashboards and reports that query large fact tables.
6. **Search index**: Elasticsearch, Azure Cognitive Search, or similar for full-text search, faceted navigation, and complex filtering that would be awkward or slow in a relational database.

### Read Replica Mechanics

Asynchronous replication sends committed transactions from the primary's transaction log to the replica, which replays them. The replica may lag behind the primary by some duration (typically milliseconds to seconds, depending on the write volume and network latency). Applications that read from replicas must tolerate reading slightly stale data.

Transaction log replication types:

| Type | Mechanism | Typical Lag |
|---|---|---|
| **Always On Availability Groups** | Synchronous or asynchronous log block shipping | < 1 second (async in same region) |
| **Transactional Replication** | Log reader agent publishes commands to distribution database | 1-30 seconds |
| **Log Shipping** | Periodic log backup restore | Minutes (configurable) |

Read replicas help only when:

- workload is predominantly read-heavy (e.g., 90%+ reads);
- replication lag is acceptable for the read path;
- the application routes reads to replicas safely (via connection string configuration or middleware);
- consistency expectations between read and write paths are clearly defined and communicated.

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

## Verification

An order list query can be verified by:

1. capturing the execution plan;
2. adding a composite index;
3. comparing logical reads;
4. testing offset vs keyset pagination;
5. simulating a blocking transaction.
