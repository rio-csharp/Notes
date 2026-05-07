# Query Optimization And Execution Plans

## Core Idea

Query optimization is the process of reducing the work the database must perform to produce the required result. That work is shaped by three things above all: result size, access path, and cardinality estimates. Tuning therefore begins not with tricks, but with evidence. Reading queries operationally means understanding what the optimizer must do, how execution plans expose that work, and which changes usually matter most.

## Start With Evidence

A strong tuning workflow is usually:

1. identify the slow query;
2. inspect the actual execution plan (in SQL Server, use `SET STATISTICS XML ON` or enable "Include Actual Execution Plan" in the client tool; in PostgreSQL, use `EXPLAIN ANALYZE`);
3. compare estimated and actual row counts;
4. check whether the chosen access path makes sense;
5. identify excessive scans, sorts, lookups, or memory-heavy operators;
6. decide whether the main problem is query shape, indexing, or data distribution;
7. measure again after the change.

This sequence matters because tuning without the plan often leads to cargo-cult fixes.

## Cardinality Estimates

The optimizer does not know the future result set exactly when producing a plan. It estimates row counts based on statistics, predicates, and heuristics. Those estimates influence:

- join order;
- join algorithm;
- memory grants;
- parallelism decisions;
- whether a seek or scan appears more attractive.

If the estimated rows differ sharply from actual rows, the chosen plan may be poor even when the SQL text looks reasonable. This is why statistics quality and data distribution matter so much in performance work.

## Common Plan Operators

A few plan operators are especially worth understanding:

- table or index scans, which read broad ranges of data;
- index seeks, which navigate to narrower ranges;
- key lookups, which fetch missing columns from base rows;
- sorts, which can become expensive on large sets;
- hash matches, often used for joins or aggregations;
- nested loops, often effective for small outer inputs and efficient lookups.

No operator is inherently bad in every case. The question is whether the operator is appropriate for the actual row counts and result shape.

## Data Shape And Projection

One of the most reliable query improvements is reducing selected columns.

```sql
SELECT Id, Status, Total, CreatedAt
FROM Orders
WHERE CustomerId = @CustomerId;
```

is often better than:

```sql
SELECT *
FROM Orders
WHERE CustomerId = @CustomerId;
```

because it reduces I/O, allows narrower covering indexes, and lowers memory and network cost. Many slow queries are slow not because they are conceptually difficult, but because they fetch more data than the consuming code needs.

## Predicate Shape And SARGability

Predicate form has a major effect on plan quality. A query that applies functions to indexed columns or hides the searchable range inside an expression often weakens the optimizer's ability to choose efficient access paths.

That is why a range predicate is often better than extracting year from a date column, and why normalizing data at write time can be better than wrapping it in runtime functions at read time.

SARGability is one of the most practical SQL tuning concepts because it translates directly into whether the storage engine can navigate the index structure effectively.

## Pagination And Deep Offsets

Offset pagination is convenient:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC
OFFSET 100000 ROWS FETCH NEXT 50 ROWS ONLY;
```

The problem is that deep offsets often force the database to sort or traverse many rows that the application then discards. Keyset pagination can be far more stable for large ordered data sets because it continues from a known boundary rather than from an abstract row count.

This is a good example of query optimization overlapping with API design. Sometimes the best query fix is to change the access pattern exposed to the application.

## Parameter Sensitivity

One plan is not always good for every parameter shape. Uneven data distribution can produce cases where a plan chosen for a very common value performs badly for a rare value, or the reverse.

This is often discussed under parameter sniffing in SQL Server. The important principle is broader: plan quality depends on data distribution, and a cached plan may not suit every predicate value equally well.

Possible responses include:

- better index design;
- better statistics;
- separate query paths for materially different patterns;
- targeted recompilation in limited cases.

When a query is known to have highly uneven distribution and no single plan is good for all parameter values, `OPTION (RECOMPILE)` can force the optimizer to produce a fresh plan for each execution based on the current parameter values:

```sql
SELECT Id, Status, Total
FROM Orders
WHERE Status = @Status
OPTION (RECOMPILE);
```

The cost is additional CPU time for plan compilation on every execution. `RECOMPILE` is therefore appropriate for queries that execute infrequently or whose compilation cost is small relative to the execution cost of a bad cached plan.

Blind hinting is rarely the best first answer. Index design and query shape should be evaluated before reaching for plan-affecting hints.

## Statistics And Plan Quality

The query optimizer relies on statistics -- histograms and density information about column value distribution -- to estimate row counts. If statistics are stale, estimates diverge from reality, and the optimizer may choose poor access paths.

Statistics are updated automatically by the database when a threshold of rows changes (roughly 20 percent of table rows plus a base row count, depending on the engine and version). For large tables, this threshold may not be reached frequently enough to keep plans optimal. Manual updates may be necessary:

```sql
UPDATE STATISTICS Orders IX_Orders_Status_CreatedAt;
UPDATE STATISTICS Orders;
```

The broader lesson is that query performance is not only about query text and indexes. It also depends on whether the optimizer has accurate information about the data it is working with. Stale statistics can make a perfectly reasonable query produce an unreasonable plan.

## Connection Pooling As Query-Side Pressure

Slow queries do not only affect their own latency. They also hold database connections longer, which can contribute to application-side connection pool exhaustion. This is why connection-pool problems are often query problems in disguise.

A slow query therefore has a double cost:

- it consumes more database resources;
- it lengthens the time the application must retain a live connection.

This is one reason database tuning belongs inside end-to-end application performance work rather than in isolation.

## SQL Server Diagnostic Queries

Operational investigation often benefits from database-native diagnostic views. Running requests, expensive cached queries, and blocking chains can provide evidence that complements application traces.

Those tools are valuable, but they should be used as part of a larger reasoning process. A DMV snapshot shows symptoms in time. The plan, data distribution, and workload pattern still explain why those symptoms appeared.

## Design Consequences

The most durable query optimizations usually come from improving result shape, predicate shape, and index alignment rather than from adding isolated hints. Read the plan, verify estimates, reduce unnecessary work, and treat the database as an execution engine with its own physical constraints rather than as a passive store behind SQL text.

That approach produces tuning decisions that remain understandable when the dataset, workload, and schema evolve.
