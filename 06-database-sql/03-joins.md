# SQL Joins

## Core Idea

Joins combine rows from multiple tables based on related columns.

Chinese notes:

- `join`: 连接.
- `inner join`: 内连接.
- `left join`: 左连接.

## Sample Tables

```sql
Customers(Id, Name)
Orders(Id, CustomerId, Total)
```

Sample data:

```sql
INSERT INTO Customers (Id, Name)
VALUES
    (1, 'Alice'),
    (2, 'Bob'),
    (3, 'Cara');

INSERT INTO Orders (Id, CustomerId, Total)
VALUES
    (101, 1, 100.00),
    (102, 1, 25.00),
    (103, 2, 75.00);
```

## Inner Join

Returns matching rows from both tables.

```sql
SELECT c.Name, o.Id, o.Total
FROM Customers c
INNER JOIN Orders o ON o.CustomerId = c.Id;
```

Only customers with orders are returned.

## Left Join

Returns all rows from left table and matching rows from right table.

```sql
SELECT c.Name, o.Id, o.Total
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id;
```

Customers without orders still appear with NULL order columns.

## Right Join

Returns all rows from right table and matching rows from left table.

Often can be rewritten as left join by swapping table order.

## Full Join

Returns rows from both sides, matched where possible.

```sql
SELECT *
FROM A
FULL OUTER JOIN B ON A.Id = B.AId;
```

## Cross Join

Returns every combination.

```sql
SELECT *
FROM Colors
CROSS JOIN Sizes;
```

Be careful: row count multiplies.

## Self Join

Table joins to itself.

Example employees and managers:

```sql
SELECT e.Name AS Employee, m.Name AS Manager
FROM Employees e
LEFT JOIN Employees m ON e.ManagerId = m.Id;
```

## Anti Join

Find rows without match.

Customers with no orders:

```sql
SELECT c.Id, c.Name
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
WHERE o.Id IS NULL;
```

Alternative:

```sql
SELECT c.Id, c.Name
FROM Customers c
WHERE NOT EXISTS
(
    SELECT 1
    FROM Orders o
    WHERE o.CustomerId = c.Id
);
```

## Filtering With LEFT JOIN

A common bug is putting a right-table filter in `WHERE` after a `LEFT JOIN`.

Problem:

```sql
SELECT c.Id, c.Name, o.Id AS OrderId
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
WHERE o.Status = 'Paid';
```

This removes customers with no orders because `o.Status` is `NULL`.

Better when you still want all customers:

```sql
SELECT c.Id, c.Name, o.Id AS OrderId
FROM Customers c
LEFT JOIN Orders o
    ON o.CustomerId = c.Id
   AND o.Status = 'Paid';
```

Rule:

> Conditions on the optional side of a `LEFT JOIN` often belong in the `ON` clause if you want to preserve unmatched left rows.

## Aggregation After Join

Total sales by customer:

```sql
SELECT
    c.Id,
    c.Name,
    COUNT(o.Id) AS OrderCount,
    COALESCE(SUM(o.Total), 0) AS TotalSales
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
GROUP BY c.Id, c.Name
ORDER BY TotalSales DESC;
```

Top customer by sales:

```sql
SELECT TOP (1)
    c.Id,
    c.Name,
    SUM(o.Total) AS TotalSales
FROM Customers c
INNER JOIN Orders o ON o.CustomerId = c.Id
GROUP BY c.Id, c.Name
ORDER BY TotalSales DESC;
```

Products never ordered:

```sql
SELECT p.Id, p.Name
FROM Products p
WHERE NOT EXISTS
(
    SELECT 1
    FROM OrderItems oi
    WHERE oi.ProductId = p.Id
);
```

## Review Questions

### Inner join vs left join?

> Inner join returns only matching rows from both tables. Left join returns all rows from the left table and matching rows from the right table, with NULLs when there is no match.

### How do you find records that do not have related records?

> Use `LEFT JOIN ... WHERE right.Id IS NULL` or `NOT EXISTS`.

### What can make joins slow?

> Missing indexes, joining large datasets, wrong join order, poor cardinality estimates, functions on join columns, and returning too many columns.

## Common Mistakes

- Putting right-table filter in WHERE after LEFT JOIN and accidentally turning it into INNER JOIN.
- Joining on non-indexed columns.
- SELECT * from many joined tables.
- Cross join accidentally.
- Not understanding NULLs from left join.

## Practice Task

Write queries for:

1. customers with orders;
2. customers without orders;
3. order with customer name;
4. employee-manager list;
5. top customer by total sales;
6. products never ordered.
