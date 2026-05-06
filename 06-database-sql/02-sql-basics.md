# SQL As A Declarative Query Language

## Core Idea

SQL is not a sequence of row-by-row instructions in the way many application programmers first imagine it. It is a declarative language in which the query describes the result set the database should produce, while the optimizer chooses an execution strategy. That distinction matters because effective SQL work depends on thinking in sets, predicates, and result shape rather than in procedural loops.

This chapter introduces SQL from that perspective. The objective is not to list syntax mechanically. It is to build the mental model needed for the later chapters on joins, indexing, and query optimization.

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
