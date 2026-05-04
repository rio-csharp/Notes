# SQL Query Optimization

## Core Idea

SQL query optimization is the process of making database queries faster, more predictable, and less resource-intensive.

Chinese notes:

- `execution plan`: 执行计划.
- `query optimizer`: 查询优化器.
- `cardinality`: 基数，估算行数.
- `SARGable`: 可利用索引搜索的查询条件.

Query optimization is not only "add an index." Good engineering practice is to inspect the query, understand the execution plan, and reason about data distribution.

## Optimization Process

Use this order:

1. Identify the slow query.
2. Get the actual execution plan.
3. Check row estimates vs actual rows.
4. Check index usage.
5. Check joins and scans.
6. Check sorting, grouping, and spills.
7. Rewrite query if needed.
8. Add or adjust indexes.
9. Measure again.

## Example Problem

Table:

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    CustomerId INT NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

Slow query:

```sql
SELECT Id, CustomerId, Total, CreatedAt
FROM Orders
WHERE TenantId = @TenantId
  AND Status = @Status
ORDER BY CreatedAt DESC
OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY;
```

Useful index:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC)
INCLUDE (CustomerId, Total);
```

Why it helps:

- `TenantId` filters tenant data.
- `Status` filters business state.
- `CreatedAt DESC` supports ordering.
- `CustomerId` and `Total` are included to avoid lookup.

## Execution Plan Terms

### Table Scan

Reads the whole table.

Can be bad for large tables, but acceptable for small tables or when most rows are needed.

### Index Scan

Reads a large part of an index.

May be okay if result set is large.

### Index Seek

Navigates to matching index range.

Usually good for selective filters.

### Key Lookup

After finding rows in a non-clustered index, SQL Server looks up missing columns from the clustered index.

Many key lookups can be expensive.

Fix with:

- include columns;
- adjust select list;
- use covering index.

### Sort

Sort operation can be expensive for large datasets.

Index order can avoid sort.

### Hash Match

Often used for joins or aggregations.

Can be fine, but may be expensive if memory spills to disk.

## SARGable Conditions

Bad:

```sql
WHERE YEAR(CreatedAt) = 2026
```

Better:

```sql
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01'
```

Bad:

```sql
WHERE ISNULL(Status, '') = 'Paid'
```

Better:

```sql
WHERE Status = 'Paid'
```

Bad:

```sql
WHERE Email LIKE '%@example.com'
```

This cannot use a normal index efficiently because the wildcard is at the beginning.

## Select Only Needed Columns

Bad:

```sql
SELECT *
FROM Orders
WHERE CustomerId = @CustomerId;
```

Better:

```sql
SELECT Id, Status, Total, CreatedAt
FROM Orders
WHERE CustomerId = @CustomerId;
```

Benefits:

- less I/O;
- less memory;
- less network transfer;
- easier to cover with an index.

## Pagination Optimization

Offset pagination:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC
OFFSET 100000 ROWS FETCH NEXT 50 ROWS ONLY;
```

Deep offset can be slow because the database still has to skip many rows.

Keyset pagination:

```sql
SELECT TOP (50) Id, Total, CreatedAt
FROM Orders
WHERE CreatedAt < @LastCreatedAt
   OR (CreatedAt = @LastCreatedAt AND Id < @LastId)
ORDER BY CreatedAt DESC, Id DESC;
```

Index:

```sql
CREATE INDEX IX_Orders_CreatedAt_Id
ON Orders (CreatedAt DESC, Id DESC)
INCLUDE (Total);
```

## Parameter Sniffing

Parameter sniffing means SQL Server creates a plan based on the first parameter values it sees.

This can hurt when data distribution is uneven.

Example:

- Status = `Pending` returns 90% of rows.
- Status = `Cancelled` returns 1% of rows.

One plan may not be good for both.

Possible solutions:

- update statistics;
- use better indexes;
- `OPTION (RECOMPILE)` for specific cases;
- dynamic SQL for very different filters;
- optimize for unknown;
- split query paths.

Use carefully. Do not add hints blindly.

## Under The Hood: Database Connection Pooling

Database connections are expensive to create.

A physical connection may involve:

- TCP connection;
- TLS negotiation if encrypted;
- authentication;
- session initialization;
- database protocol setup.

Connection pooling（连接池） reuses physical connections instead of opening a new one for every request.

Conceptual flow:

```text
API request
  -> asks connection pool for connection
  -> pool returns existing idle connection if available
  -> query executes
  -> connection is returned to pool on Dispose/Close
```

In .NET, ADO.NET providers such as `Microsoft.Data.SqlClient` use connection pooling by default for matching connection strings.

Important:

> Closing or disposing a pooled connection usually returns it to the pool. It does not necessarily close the physical network connection immediately.

Correct:

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync(ct);

await using var command = connection.CreateCommand();
command.CommandText = "SELECT TOP (1) Id FROM Orders";

var result = await command.ExecuteScalarAsync(ct);
```

The `await using` is still important because it returns the connection to the pool.

## Connection Pool Exhaustion

Pool exhaustion happens when all available pooled connections are busy and new requests must wait.

Common symptoms:

- API latency increases;
- timeouts while opening connection;
- database CPU may be normal;
- many requests stuck waiting for a connection;
- logs show errors like timeout expired before obtaining a connection.

Common causes:

- connections not disposed;
- long-running queries hold connections too long;
- transactions kept open;
- too many concurrent requests;
- pool size too small for workload;
- database is slow, causing connections to be held longer;
- sync-over-async blocks request threads and delays cleanup.

Bad:

```csharp
private static SqlConnection? _connection;

public async Task LoadAsync()
{
    _connection = new SqlConnection(_connectionString);
    await _connection.OpenAsync();
    // connection is not disposed
}
```

Better:

```csharp
public async Task<IReadOnlyList<OrderDto>> LoadAsync(CancellationToken ct)
{
    await using var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync(ct);

    // execute query
}
```

With EF Core:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});
```

`DbContext` should be scoped and disposed at the end of the request. That returns underlying connections when EF opens them.

## Connection Pool Tuning

Connection string options may include:

```text
Max Pool Size=100;
Min Pool Size=0;
Connection Timeout=15;
```

Do not blindly increase pool size.

If every query is slow, a bigger pool can make the database even more overloaded.

Troubleshooting order:

1. Check whether connections are leaked.
2. Check slow queries and transaction duration.
3. Check database CPU, waits, locks, and connection count.
4. Check API concurrency and request spikes.
5. Check pool settings only after understanding workload.

Practical explanation:

> Connection pooling reuses physical database connections. Pool exhaustion usually means connections are held too long or leaked, often because of slow queries, long transactions, missing disposal, or excessive concurrency. I fix the root cause before increasing pool size.

## Common SQL Server Waits To Recognize

You do not need to be a DBA, but backend engineers should recognize common categories.

Examples:

- lock waits: blocking or transaction contention;
- PAGEIOLATCH waits: waiting for data pages from disk;
- CXPACKET / CXCONSUMER: parallelism-related waits;
- RESOURCE_SEMAPHORE: memory grant pressure;
- THREADPOOL: SQL Server worker thread exhaustion.

Practical answer:

> I use waits as clues, not final answers. I correlate wait stats with query plans, blocking sessions, CPU, I/O, memory grants, and application traces.

## Practical SQL Server Investigation Queries

Find currently running requests:

```sql
SELECT
    r.session_id,
    r.status,
    r.command,
    r.cpu_time,
    r.logical_reads,
    r.reads,
    r.writes,
    r.wait_type,
    r.wait_time,
    r.blocking_session_id,
    DB_NAME(r.database_id) AS database_name,
    SUBSTRING(
        t.text,
        (r.statement_start_offset / 2) + 1,
        ((CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(t.text)
            ELSE r.statement_end_offset
        END - r.statement_start_offset) / 2) + 1
    ) AS running_statement
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id <> @@SPID
ORDER BY r.cpu_time DESC;
```

Find expensive cached queries by logical reads:

```sql
SELECT TOP (20)
    qs.execution_count,
    qs.total_logical_reads,
    qs.total_logical_reads / NULLIF(qs.execution_count, 0) AS avg_logical_reads,
    qs.total_worker_time / NULLIF(qs.execution_count, 0) AS avg_cpu_time,
    qs.total_elapsed_time / NULLIF(qs.execution_count, 0) AS avg_elapsed_time,
    SUBSTRING(
        st.text,
        (qs.statement_start_offset / 2) + 1,
        ((CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset) / 2) + 1
    ) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
ORDER BY avg_logical_reads DESC;
```

Find blocking sessions:

```sql
SELECT
    blocked.session_id AS blocked_session_id,
    blocked.blocking_session_id,
    blocked.wait_type,
    blocked.wait_time,
    blocked.wait_resource,
    blocked_sql.text AS blocked_sql,
    blocker_sql.text AS blocker_sql
FROM sys.dm_exec_requests blocked
OUTER APPLY sys.dm_exec_sql_text(blocked.sql_handle) blocked_sql
LEFT JOIN sys.dm_exec_requests blocker
    ON blocker.session_id = blocked.blocking_session_id
OUTER APPLY sys.dm_exec_sql_text(blocker.sql_handle) blocker_sql
WHERE blocked.blocking_session_id <> 0;
```

Use these queries carefully:

- run them with appropriate permissions;
- prefer actual execution plans for query tuning;
- correlate database evidence with API traces and timestamps;
- do not run random tuning scripts in production without understanding them.

## Review Questions

### How do you optimize a slow SQL query?

> I identify the query, inspect the actual execution plan, compare estimated vs actual rows, check scans/seeks/key lookups/sorts, review indexes and predicates, make the query SARGable, reduce selected columns, add or adjust indexes, and measure again.

### What is a covering index?

> A covering index contains all columns needed by a query, either as key columns or included columns, so the database can answer the query without additional lookups.

### Why can `SELECT *` be bad?

> It reads unnecessary data, increases network transfer, prevents narrow covering indexes, and makes query performance more fragile when schema changes.

### What is database connection pooling?

> Connection pooling reuses physical database connections. In .NET, disposing a pooled connection returns it to the pool. It reduces connection setup cost, but pool exhaustion can happen if connections are leaked, queries are slow, or concurrency is too high.

### How do you troubleshoot connection pool exhaustion?

> I check for missing disposal, long-running queries, long transactions, database blocking, high request concurrency, and pool settings. I avoid simply increasing max pool size until I understand why connections are held.

## Common Mistakes

- Adding indexes without checking the plan.
- Ignoring actual row count vs estimated row count.
- Using functions on indexed columns.
- Over-indexing write-heavy tables.
- Optimizing on tiny development data only.
- Ignoring pagination depth.
- Treating query hints as first choice.
- Not disposing connections or DbContext properly.
- Increasing max pool size while the database is already overloaded.
- Holding database connections during external API calls.

## Practice Task

Create a table with at least 1 million rows and test:

1. query without index;
2. query with single-column index;
3. query with composite index;
4. query with covering index;
5. offset pagination;
6. keyset pagination;
7. non-SARGable vs SARGable date filter.
