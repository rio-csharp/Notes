# SQL Basics

## Core Idea

SQL is the language used to query and modify relational databases.

Chinese notes:

- `SELECT`: 查询.
- `INSERT`: 插入.
- `UPDATE`: 更新.
- `DELETE`: 删除.
- `WHERE`: 条件.

## SELECT

```sql
SELECT Id, Name, Email
FROM Users;
```

Filter:

```sql
SELECT Id, Name
FROM Users
WHERE IsActive = 1;
```

Select explicit columns:

```sql
SELECT
    Id,
    Email,
    Name,
    CreatedAt
FROM Customers
WHERE IsActive = 1;
```

Avoid `SELECT *` in application queries because table shape can grow over time and increase network, memory, and serialization cost.

## INSERT

```sql
INSERT INTO Users (Name, Email, IsActive)
VALUES ('Alice', 'alice@example.com', 1);
```

## UPDATE

```sql
UPDATE Users
SET Name = 'Alice Smith'
WHERE Id = 1;
```

Always use `WHERE` unless intentionally updating all rows.

## DELETE

```sql
DELETE FROM Users
WHERE Id = 1;
```

For business systems, soft delete is often used:

```sql
UPDATE Users
SET IsDeleted = 1
WHERE Id = 1;
```

## ORDER BY

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC;
```

## GROUP BY

```sql
SELECT CustomerId, SUM(Total) AS TotalAmount
FROM Orders
GROUP BY CustomerId;
```

Monthly sales:

```sql
SELECT
    DATEFROMPARTS(YEAR(CreatedAt), MONTH(CreatedAt), 1) AS SalesMonth,
    COUNT(*) AS OrderCount,
    SUM(Total) AS TotalAmount
FROM Orders
WHERE Status = 'Paid'
GROUP BY DATEFROMPARTS(YEAR(CreatedAt), MONTH(CreatedAt), 1)
ORDER BY SalesMonth;
```

## HAVING

`WHERE` filters rows before grouping.

`HAVING` filters groups after grouping.

```sql
SELECT CustomerId, SUM(Total) AS TotalAmount
FROM Orders
GROUP BY CustomerId
HAVING SUM(Total) > 1000;
```

## Pagination

SQL Server:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
ORDER BY CreatedAt DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

## CTE

Common Table Expression:

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

## Window Function

```sql
SELECT
    Id,
    CustomerId,
    Total,
    ROW_NUMBER() OVER (PARTITION BY CustomerId ORDER BY CreatedAt DESC) AS RowNumber
FROM Orders;
```

Useful for:

- ranking;
- top N per group;
- running totals;
- pagination patterns.

Top 3 orders per customer:

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

Running total:

```sql
SELECT
    Id,
    CustomerId,
    Total,
    CreatedAt,
    SUM(Total) OVER (
        PARTITION BY CustomerId
        ORDER BY CreatedAt, Id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS CustomerRunningTotal
FROM Orders;
```

## NULL Behavior

`NULL` means unknown or missing, not an empty string and not zero.

This does not work as expected:

```sql
SELECT Id, Email
FROM Customers
WHERE DeletedAt = NULL;
```

Use:

```sql
SELECT Id, Email
FROM Customers
WHERE DeletedAt IS NULL;
```

Use `COALESCE` to provide fallback values:

```sql
SELECT
    Id,
    COALESCE(DisplayName, Name, Email) AS Label
FROM Customers;
```

## Transactions For Changes

Wrap related changes in a transaction when they must succeed or fail together.

```sql
BEGIN TRANSACTION;

UPDATE Products
SET Price = Price + 5
WHERE Sku = 'KB-001';

INSERT INTO PriceChangeLogs (ProductSku, ChangedAt, Reason)
VALUES ('KB-001', SYSUTCDATETIME(), 'Supplier price update');

COMMIT TRANSACTION;
```

If something fails, use `ROLLBACK TRANSACTION`.

## Review Questions

### WHERE vs HAVING?

> `WHERE` filters rows before grouping. `HAVING` filters grouped results after aggregation.

### DELETE vs TRUNCATE?

> `DELETE` removes rows and can use a WHERE clause. `TRUNCATE` removes all rows more efficiently but has restrictions and is more destructive.

### What is a CTE?

> A CTE is a named temporary result set within a query. It can make complex queries more readable.

## Common Mistakes

- UPDATE or DELETE without WHERE.
- SELECT * in production APIs.
- No ORDER BY with pagination.
- Misusing HAVING instead of WHERE.
- Forgetting NULL behavior.

## Practice Task

Write SQL for:

1. active users;
2. orders by customer;
3. total sales by month;
4. customers with more than 10 orders;
5. paginated order list;
6. top 3 orders per customer.
