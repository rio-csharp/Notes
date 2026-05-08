# SQL As A Declarative Query Language

## Core Idea

SQL is not a sequence of row-by-row instructions in the way many application programmers first imagine it. It is a declarative language in which the query describes the result set the database should produce, while the optimizer chooses an execution strategy. That distinction matters because effective SQL work depends on thinking in sets, predicates, and result shape rather than in procedural loops.

The objective is to build the mental model needed for later work on joins, indexing, and query optimization, not to list syntax mechanically.

## Result Sets And Projection

The most basic SQL query is a `SELECT` statement:

```sql
SELECT Id, Name, Email
FROM Users;
```

This query projects specific columns from a set of rows. Projection matters because result shape has real cost. Selecting only the necessary columns reduces I/O, memory usage, network transfer, and often makes later indexing decisions more effective.

For that reason, explicit projection is usually better than `SELECT *` in application queries.

## Filtering With `WHERE`

`WHERE` restricts which rows participate in the result:

```sql
SELECT Id, Name
FROM Users
WHERE IsActive = 1;
```

At a conceptual level, filtering is one of the most important operations in SQL because it determines how much data the rest of the query must process. A well-shaped predicate can make a query narrow and efficient. A weak or non-SARGable predicate can force the database to inspect far more rows than the application intended.

## Data Modification

SQL also defines set-based data modification operations.

Insert:

```sql
INSERT INTO Users (Name, Email, IsActive)
VALUES ('Alice', 'alice@example.com', 1);
```

Update:

```sql
UPDATE Users
SET Name = 'Alice Smith'
WHERE Id = 1;
```

Delete:

```sql
DELETE FROM Users
WHERE Id = 1;
```

The `OUTPUT` clause (SQL Server) or `RETURNING` clause (PostgreSQL) captures the rows affected by a modification without a separate SELECT:

```sql
-- SQL Server
INSERT INTO Users (Name, Email, IsActive)
OUTPUT inserted.Id, inserted.CreatedAt
VALUES ('Alice', 'alice@example.com', 1);

-- PostgreSQL
INSERT INTO Users (Name, Email, IsActive)
VALUES ('Alice', 'alice@example.com', 1)
RETURNING Id, CreatedAt;
```

This is especially useful when the application needs the generated identity value, computed column, or default right after the insert. It avoids a separate round-trip to retrieve what the database just produced.

The `MERGE` statement (SQL Server) or `INSERT ... ON CONFLICT` (PostgreSQL) performs upsert — insert or update depending on whether a matching row exists:

```sql
-- SQL Server
MERGE INTO Customers AS target
USING (VALUES (@Email, @Name)) AS source (Email, Name)
ON target.Email = source.Email
WHEN MATCHED THEN
    UPDATE SET Name = source.Name
WHEN NOT MATCHED THEN
    INSERT (Email, Name) VALUES (source.Email, source.Name);

-- PostgreSQL
INSERT INTO Customers (Email, Name)
VALUES (@Email, @Name)
ON CONFLICT (Email) DO UPDATE SET Name = EXCLUDED.Name;
```

`MERGE` is useful for ETL, data synchronization, and idempotent write operations. The trade-off is that it holds more locks than a simple INSERT or UPDATE, and in SQL Server it has historically had correctness edge cases that require careful testing.

These operations should be read with the same set-oriented mindset as queries. Even an `UPDATE` that affects one row is still expressed as a set operation over all rows matching the predicate. That is why an omitted `WHERE` clause on an update or delete is so dangerous: it changes the target set from one row to all rows.

## Ordering And Deterministic Results

`ORDER BY` defines output ordering:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC;
```

This seems straightforward, but two points matter in practice.

First, rows are not inherently ordered unless the query specifies an order. Second, ordering can be expensive if the database must sort a large intermediate result set. This is why index design and query shape later become closely tied to ordering patterns.

## Distinct Results

`SELECT DISTINCT` removes duplicate rows from the result set:

```sql
SELECT DISTINCT Status
FROM Orders;
```

This is useful for enumerating the set of unique values in a column. However, it should be used deliberately. `DISTINCT` can be expensive on wide result sets because the database must compare all selected columns to identify duplicates. A more targeted approach is often to use `GROUP BY` with specific aggregation or to query a separate lookup table.

## Subqueries

A subquery is a `SELECT` statement nested inside another query. Subqueries can appear in `WHERE`, `FROM`, or `SELECT` clauses.

Non-correlated subquery (executed once, independent of the outer query):

```sql
SELECT Id, Name
FROM Customers
WHERE Id IN
(
    SELECT CustomerId
    FROM Orders
    WHERE Total > 500
);
```

Correlated subquery (re-evaluated for each row of the outer query):

```sql
SELECT c.Id, c.Name,
    (
        SELECT SUM(o.Total)
        FROM Orders o
        WHERE o.CustomerId = c.Id
    ) AS TotalSpent
FROM Customers c;
```

Correlated subqueries require careful evaluation because they can become expensive for large row sets. In many cases, a `JOIN` with aggregation is more efficient and more readable than a correlated subquery.

## Set Operations: UNION, INTERSECT, EXCEPT

SQL set operations combine results from multiple queries:

- `UNION` combines results and removes duplicates.
- `UNION ALL` combines results and preserves duplicates.
- `INTERSECT` returns rows present in both result sets.
- `EXCEPT` returns rows present in the first set but not the second.

```sql
SELECT Email FROM CurrentCustomers
UNION
SELECT Email FROM ArchivedCustomers;
```

These operations work when both queries return the same number of columns with compatible types. They are especially useful for reporting queries that need to compare or combine data from different logical sources.

## CASE Expressions

`CASE` provides conditional logic within SQL:

```sql
SELECT
    Id,
    Total,
    CASE
        WHEN Total >= 1000 THEN 'High'
        WHEN Total >= 100 THEN 'Medium'
        ELSE 'Low'
    END AS OrderCategory
FROM Orders;
```

`CASE` is a scalar expression, not a control-of-flow statement. It can appear in `SELECT`, `WHERE`, `ORDER BY`, and `GROUP BY` clauses. Using `CASE` in SQL is often cleaner than importing the raw data and applying conditional logic in application code.

## Aggregation And Grouping

Aggregation collapses many rows into summary values.

```sql
SELECT CustomerId, SUM(Total) AS TotalAmount
FROM Orders
GROUP BY CustomerId;
```

Grouping changes the shape of the query. The result is no longer one row per order. It is one row per customer group. Once a query becomes grouped, the database must reason not only about filtering rows but also about how to form and aggregate sets of rows.

## `WHERE` Versus `HAVING`

`WHERE` filters rows before grouping:

```sql
SELECT CustomerId, SUM(Total) AS TotalAmount
FROM Orders
WHERE Status = 'Paid'
GROUP BY CustomerId;
```

`HAVING` filters groups after aggregation:

```sql
SELECT CustomerId, SUM(Total) AS TotalAmount
FROM Orders
GROUP BY CustomerId
HAVING SUM(Total) > 1000;
```

This distinction is conceptually important. `WHERE` changes the input rows to the aggregation. `HAVING` changes which aggregated groups survive afterward.

## Pagination As Result Windowing

Application queries often need only part of a larger ordered set:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

This is not only an API convenience. Pagination is a protective design decision that prevents unbounded result sets from overwhelming the application and the database. The deeper performance implications of offset pagination are addressed later, but the conceptual role is already important here: SQL often returns windows over sets rather than full sets.

## Common Table Expressions

A common table expression, or CTE, gives a name to an intermediate query:

```sql
WITH RecentOrders AS
(
    SELECT *
    FROM Orders
    WHERE CreatedAt >= '2026-01-01'
)
SELECT CustomerId, COUNT(*) AS OrderCount
FROM RecentOrders
GROUP BY CustomerId;
```

CTEs are useful mainly because they improve structure and readability for complex statements. They do not automatically make a query faster. Their value is architectural within the query text: they allow larger set-based transformations to be broken into understandable stages.

## Window Functions

Window functions compute values across related rows without collapsing them into one row per group.

```sql
SELECT
    Id,
    CustomerId,
    Total,
    ROW_NUMBER() OVER (PARTITION BY CustomerId ORDER BY CreatedAt DESC) AS RowNumber
FROM Orders;
```

This is powerful because it allows ranking, running totals, and top-N-per-group logic while preserving row-level output.

For example, top three orders per customer:

```sql
WITH RankedOrders AS
(
    SELECT
        Id,
        CustomerId,
        Total,
        CreatedAt,
        ROW_NUMBER() OVER (
            PARTITION BY CustomerId
            ORDER BY Total DESC, Id DESC
        ) AS RowNumber
    FROM Orders
)
SELECT Id, CustomerId, Total, CreatedAt
FROM RankedOrders
WHERE RowNumber <= 3;
```

Window functions are one of the clearest examples of SQL's expressive power as a set language. They solve many problems that would be awkward or inefficient if approached procedurally.

The `LAG` and `LEAD` functions access values from preceding or following rows without self-joins:

```sql
SELECT Id, Total,
    LAG(Total) OVER (ORDER BY CreatedAt) AS PreviousTotal,
    LEAD(Total) OVER (ORDER BY CreatedAt) AS NextTotal
FROM Orders
WHERE CustomerId = 42
ORDER BY CreatedAt;
```

`LAG` and `LEAD` are among the most commonly used analytic functions in practice — for comparing consecutive rows, calculating deltas, detecting gaps, and building trend queries. The `ROWS` / `RANGE` frame specification (`ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING`) provides additional control over which rows participate in the calculation for aggregate window functions like `SUM` or `AVG`.

## `NULL` And Three-Valued Logic

`NULL` does not mean empty string or zero. It represents missing or unknown value state.

That affects predicates:

```sql
SELECT Id, Email
FROM Customers
WHERE DeletedAt IS NULL;
```

The equality form:

```sql
WHERE DeletedAt = NULL
```

does not behave as intended because SQL uses three-valued logic around nulls. This is one of the points where SQL semantics differ sharply from many application-language intuitions.

Functions such as `COALESCE` help provide fallback values:

```sql
SELECT
    Id,
    COALESCE(DisplayName, Name, Email) AS Label
FROM Customers;
```

## Transactions As SQL Boundaries

SQL also defines explicit transaction boundaries:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET Price = Price + 5
WHERE Sku = 'KB-001';

INSERT INTO PriceChangeLogs (ProductSku, ChangedAt, Reason)
VALUES ('KB-001', SYSUTCDATETIME(), 'Supplier price update');

COMMIT TRANSACTION;
```

This is included here not to fully explain transactions yet, but to reinforce the set-oriented model. SQL is a full data language: it defines reading, writing, and transactional grouping, all at the level of result sets and predicates rather than procedural loops.

## Design Consequences

Good SQL work begins with the right mental model. Queries describe result sets. Filters narrow those sets. grouping and windowing reshape them. Transactions define atomic units around them. Once that becomes natural, later topics such as joins, indexing, and optimization become much easier because the query can be reasoned about as a set transformation rather than as a hidden algorithm.
