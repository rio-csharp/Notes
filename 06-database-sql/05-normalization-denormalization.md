# Normalization And Denormalization

## Core Idea

Normalization reduces duplication and protects data integrity. Denormalization intentionally duplicates or reshapes data to improve read performance.

Chinese notes:

- `normalization`: 范式化.
- `denormalization`: 反范式化.
- `redundancy`: 冗余.

## 1NF

First Normal Form:

- columns contain atomic values;
- no repeating groups.

Bad:

```text
OrderId | ProductIds
1       | "10,11,12"
```

Better:

```text
OrderItems(OrderId, ProductId)
```

## 2NF

Second Normal Form:

- in 1NF;
- non-key columns depend on the whole key.

Important for composite keys.

Bad:

```text
OrderItems(OrderId, ProductId, ProductName, Quantity)
Primary key: (OrderId, ProductId)
```

`ProductName` depends only on `ProductId`, not on the whole `(OrderId, ProductId)` key.

Better:

```text
Products(ProductId, ProductName)
OrderItems(OrderId, ProductId, Quantity)
```

## 3NF

Third Normal Form:

- in 2NF;
- non-key columns do not depend on other non-key columns.

Example:

Bad:

```text
Orders(OrderId, CustomerId, CustomerName)
```

If customer name changes, many order rows need updates.

Better:

```text
Customers(CustomerId, CustomerName)
Orders(OrderId, CustomerId)
```

## Denormalization

Sometimes duplicate data for performance or history.

Example:

```text
OrderItems(ProductId, ProductNameSnapshot, UnitPriceSnapshot)
```

Why:

- order history should preserve product name and price at purchase time;
- joining Product every time may be unnecessary;
- product name changes should not rewrite old orders.

SQL example:

```sql
CREATE TABLE OrderItems
(
    Id INT IDENTITY PRIMARY KEY,
    OrderId INT NOT NULL,
    ProductId INT NOT NULL,
    ProductNameSnapshot NVARCHAR(200) NOT NULL,
    UnitPriceSnapshot DECIMAL(18, 2) NOT NULL,
    Quantity INT NOT NULL
);
```

This is intentional denormalization because order history needs the old name and price.

## Read Model Denormalization

For dashboards:

```text
DailySalesSummary(Date, TenantId, OrderCount, TotalAmount)
```

Generated from order events or scheduled jobs.

Table:

```sql
CREATE TABLE DailySalesSummary
(
    SalesDate DATE NOT NULL,
    TenantId INT NOT NULL,
    OrderCount INT NOT NULL,
    TotalAmount DECIMAL(18, 2) NOT NULL,
    UpdatedAt DATETIME2 NOT NULL,
    CONSTRAINT PK_DailySalesSummary PRIMARY KEY (SalesDate, TenantId)
);
```

Refresh query:

```sql
MERGE DailySalesSummary AS target
USING
(
    SELECT
        CAST(CreatedAt AS DATE) AS SalesDate,
        TenantId,
        COUNT(*) AS OrderCount,
        SUM(Total) AS TotalAmount
    FROM Orders
    WHERE Status = 'Paid'
      AND CreatedAt >= @From
      AND CreatedAt < @To
    GROUP BY CAST(CreatedAt AS DATE), TenantId
) AS source
ON target.SalesDate = source.SalesDate
AND target.TenantId = source.TenantId
WHEN MATCHED THEN
    UPDATE SET
        OrderCount = source.OrderCount,
        TotalAmount = source.TotalAmount,
        UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (SalesDate, TenantId, OrderCount, TotalAmount, UpdatedAt)
    VALUES (source.SalesDate, source.TenantId, source.OrderCount, source.TotalAmount, SYSUTCDATETIME());
```

Consistency options:

- rebuild summaries periodically;
- update summaries from events;
- use outbox messages to avoid missing updates;
- store `UpdatedAt` so stale summaries are visible;
- compare summary totals with source data during reconciliation.

## Trade-offs

Normalization:

- less duplication;
- better integrity;
- more joins.

Denormalization:

- faster reads;
- simpler queries;
- data duplication;
- consistency maintenance.

## Review Questions

### What is normalization?

> Normalization organizes data to reduce duplication and improve integrity, usually by separating entities into related tables.

### When would you denormalize?

> When read performance, reporting, historical snapshots, or simplified queries justify duplicated data and the team has a strategy to keep it consistent.

### Is denormalization bad?

> No. It is a trade-off. It becomes bad when duplication is accidental and consistency is not managed.

## Common Mistakes

- Over-normalizing simple read-heavy systems.
- Denormalizing without ownership of consistency.
- Storing comma-separated values in one column.
- Not preserving historical price/name snapshots.
- Assuming one design works for both OLTP and reporting.

## Practice Task

Design:

1. normalized order schema;
2. order item snapshot fields;
3. daily sales summary table;
4. process to update summary;
5. consistency strategy.
