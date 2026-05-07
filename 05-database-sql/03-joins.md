# Joins And Relationship Queries

## Core Idea

Joins are how relational databases combine rows from different tables according to key relationships. They are central to relational querying because normalized schemas rarely keep all useful information in one table. Understanding joins means knowing what result set each join shape produces and how filtering choices can subtly change that shape.

## Inner Joins

An inner join returns only rows that match on both sides:

```sql
SELECT c.Name, o.Id, o.Total
FROM Customers c
INNER JOIN Orders o ON o.CustomerId = c.Id;
```

This is appropriate when the result set should include only customers who actually have matching orders. In relational terms, the join represents an intersection over the relationship predicate.

## Left Joins

A left join keeps all rows from the left side and matches rows from the right side when they exist:

```sql
SELECT c.Name, o.Id, o.Total
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id;
```

This is useful when the absence of related data is still meaningful. The unmatched right-side columns appear as `NULL`, allowing the result set to represent both "has related row" and "does not have related row" within one query.

## Cross Joins

A cross join produces the cartesian product of two tables -- every row from the left combined with every row from the right:

```sql
SELECT c.Name, p.Name
FROM Customers c
CROSS JOIN Products p;
```

Cross joins are rarely used in application queries because the result set size grows multiplicatively. They are sometimes useful for generating test data, building calendar tables, or producing exhaustive combinations for reporting.

## Right And Full Joins

Right joins are conceptually symmetric to left joins, though many teams prefer rewriting them as left joins by reversing table order for readability. Full joins preserve unmatched rows from both sides.

These forms are valid relational tools, but in ordinary application queries they are less common than inner and left joins because most business relationships naturally begin from one primary table and then include or exclude related data from there.

## Self Joins

A table can also join to itself when rows of the same entity type relate to one another:

```sql
SELECT e.Name AS Employee, m.Name AS Manager
FROM Employees e
LEFT JOIN Employees m ON e.ManagerId = m.Id;
```

This is a good reminder that joins are not about different table names. They are about relating one set of rows to another set through a predicate.

## Anti-Joins And Missing Relationships

One common query pattern is finding rows that do not have a related match. Two idioms are common.

Left join with null check:

```sql
SELECT c.Id, c.Name
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
WHERE o.Id IS NULL;
```

`NOT EXISTS`:

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

Both express the idea of an anti-join. The `NOT EXISTS` form is often clearer because it states the business question directly: return customers for whom no related order row exists.

## Join Predicates And Semantic Drift

One of the most important practical join lessons is that filter placement changes meaning.

Consider:

```sql
SELECT c.Id, c.Name, o.Id AS OrderId
FROM Customers c
LEFT JOIN Orders o ON o.CustomerId = c.Id
WHERE o.Status = 'Paid';
```

Although the query starts with a left join, the `WHERE` predicate on the optional side removes rows where `o.Status` is `NULL`, which effectively turns the result into something closer to an inner join for that condition.

If the intent is to preserve all customers while attaching only paid orders when they exist, the predicate belongs in the join condition:

```sql
SELECT c.Id, c.Name, o.Id AS OrderId
FROM Customers c
LEFT JOIN Orders o
    ON o.CustomerId = c.Id
   AND o.Status = 'Paid';
```

This is not a formatting subtlety. It is a result-shape decision.

## Aggregation Over Joined Data

Joins often feed grouped queries:

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

This query does more than attach related rows. It transforms the one-to-many relationship into customer-level summary data. That ability to move between row-level and grouped relationship views is one of the reasons joins are so central to relational work.

## Join Cost And Data Volume

Joins are not inherently slow. They become expensive when the database has to combine large row sets inefficiently, usually because of one or more of the following:

- missing indexes on join keys;
- poor filtering selectivity;
- excessive projected columns;
- incorrect join order chosen from bad estimates;
- intermediate result sets that grow too large before later filters apply.

This is why join performance is not a separate topic from indexing and query optimization. A join is a relationship operation, but it is executed over physical access paths.

## Relationship Queries As Design Feedback

Join patterns also reveal design quality. If every common query requires many large joins, the schema may be overly normalized for the application's read needs. If no joins are needed because data is duplicated everywhere, the schema may be carrying integrity risk. Good database design usually produces joins that are meaningful and frequent, but not pathological.

That is the deeper lesson of joins: they are not only query operators. They are also evidence of how the schema decomposes real business relationships.

## Set Operations Versus Joins

It is worth distinguishing joins from set operations (`UNION`, `INTERSECT`, `EXCEPT`). Joins combine columns from different tables based on a relationship predicate. Set operations combine rows from different queries of the same shape.

A join answers: "how are these entities related?" A set operation answers: "which rows appear in one or both result sets?" The two tools serve different structural purposes and are not interchangeable.

Set operations are discussed in more detail in the SQL basics chapter, but the distinction matters here because teams sometimes reach for joins when a set operation would express the intent more clearly, or the reverse.
