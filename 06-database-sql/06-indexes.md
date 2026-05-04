# Database Indexes

## Core Idea

An index is a data structure that helps the database find rows faster.

Chinese notes:

- `index`: 索引.
- `clustered index`: 聚集索引.
- `non-clustered index`: 非聚集索引.
- `execution plan`: 执行计划.
- `selectivity`: 选择性.

Without an index, the database may scan many rows.

With a useful index, the database can seek directly to relevant rows.

## Under The Hood: SQL Server Index Data Structure

In SQL Server, rowstore indexes are commonly implemented as B+ tree structures（B+树）.

People often say "B-tree", but for SQL Server rowstore indexes, the useful mental model is a B+ tree:

- root page at the top;
- intermediate pages in the middle;
- leaf pages at the bottom;
- data is found at the leaf level;
- pages are linked in key order at the leaf level, which helps range scans and ordered reads.

Conceptual structure:

```text
Root page
  -> Intermediate page
      -> Leaf page: keys 1-100
      -> Leaf page: keys 101-200
  -> Intermediate page
      -> Leaf page: keys 201-300
      -> Leaf page: keys 301-400
```

Why B+ tree?

- keeps data sorted by key;
- supports fast equality search;
- supports range queries;
- supports ordered scans;
- keeps tree height relatively small even for large tables.

For example, searching for `CustomerId = 42` does not scan every row. SQL Server can navigate from root to intermediate page to leaf page.

## Pages, Extents, And Logical Reads

SQL Server stores data in pages. A page is 8 KB.

Pages are grouped into extents. An extent is 8 pages, so 64 KB.

When you analyze performance, SQL Server often reports logical reads.

Important:

- one logical read means reading one 8 KB page from buffer cache;
- fewer logical reads usually means less work;
- an index seek can still do many reads if it returns many rows or causes many lookups;
- an index scan on a small table may be cheaper than a seek plus many random lookups.

Engineering perspective:

> I do not judge a query only by seek vs scan. I check logical reads, estimated vs actual rows, key lookups, sort/hash operations, and whether the plan matches production-scale data.

## Clustered Index Leaf Level

A clustered index determines the order of table data by the clustered key.

For a clustered table, the leaf level of the clustered index is the actual data rows.

Conceptually:

```text
Clustered index on Orders(Id)

Root / intermediate pages:
  keys and page pointers

Leaf pages:
  full Orders rows
```

This is why a table can have only one clustered index: the data rows can only be organized one primary way.

The clustered key is also used as the row locator for non-clustered indexes.

If the clustered key is wide, every non-clustered index becomes wider too.

Bad clustered key candidate:

```sql
CustomerEmail NVARCHAR(320)
```

Problems:

- wide;
- may change;
- repeated in non-clustered indexes as locator;
- less efficient than a narrow stable key.

Common choice:

```sql
Id BIGINT IDENTITY PRIMARY KEY
```

Trade-off:

- sequential keys are insert-friendly;
- hot insert pages can become a bottleneck at extreme write scale;
- random GUID keys reduce hot spots but can cause fragmentation unless handled carefully.

## Non-Clustered Index Leaf Level

A non-clustered index is a separate B+ tree.

Its leaf level contains:

- non-clustered index key columns;
- included columns;
- row locator.

If the base table has a clustered index, the row locator is usually the clustered key.

If the base table is a heap, the row locator is a RID（row identifier）.

Conceptually:

```text
Non-clustered index IX_Orders_CustomerId

Leaf row:
  CustomerId = 42
  Included Total = 99.00
  Row locator = clustered key Id = 12345
```

If the query needs columns not in the non-clustered index, SQL Server may perform a lookup.

## Key Lookup And RID Lookup

Example:

```sql
CREATE INDEX IX_Orders_CustomerId
ON Orders (CustomerId);

SELECT Id, CustomerId, Status, Total
FROM Orders
WHERE CustomerId = 42;
```

If `Status` and `Total` are not in the non-clustered index, SQL Server may:

1. seek `IX_Orders_CustomerId`;
2. find matching row locators;
3. perform key lookups into the clustered index for missing columns.

This can be fine for a few rows.

It can be terrible for many rows.

Fix with a covering index when appropriate:

```sql
CREATE INDEX IX_Orders_CustomerId_Covering
ON Orders (CustomerId)
INCLUDE (Status, Total);
```

Clear wording:

> A key lookup is not always bad, but many repeated key lookups can become expensive because SQL Server repeatedly goes back to the clustered index to fetch missing columns.

## Page Split And Fragmentation

Indexes keep keys ordered.

When a new row must be inserted into a full page, SQL Server may split the page:

```text
Before:
  Page A: [10, 20, 30, 40]

Insert 25:
  Page A: [10, 20]
  Page B: [25, 30, 40]
```

Page splits can cause:

- extra writes;
- fragmentation;
- more pages to read;
- slower range scans.

Random clustered keys, such as random GUIDs, can increase page splits because inserts happen throughout the tree.

Mitigations:

- choose narrow, stable, mostly increasing clustered keys when appropriate;
- use `NEWSEQUENTIALID()` carefully when GUIDs are required;
- use fill factor for specific high-write indexes;
- monitor fragmentation and page density;
- avoid rebuilding indexes blindly without understanding workload.

## Statistics And The Query Optimizer

Indexes are not only data structures. SQL Server also uses statistics to estimate how many rows a query will return.

Statistics help the optimizer choose:

- index seek vs scan;
- join type;
- join order;
- memory grant;
- parallelism.

Bad estimates can cause bad plans.

Common causes:

- stale statistics;
- parameter sniffing;
- skewed data distribution;
- implicit conversion;
- local test data not matching production.

Practical explanation:

> When a query is slow, I look at the actual execution plan and compare estimated rows with actual rows. If estimates are far off, I check statistics, parameter sniffing, predicates, and data distribution.

## Simple Example

Table:

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    CustomerId INT NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

Query:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
WHERE CustomerId = 42
ORDER BY CreatedAt DESC;
```

Useful index:

```sql
CREATE INDEX IX_Orders_CustomerId_CreatedAt
ON Orders (CustomerId, CreatedAt DESC)
INCLUDE (Total);
```

Why:

- `CustomerId` helps filter.
- `CreatedAt` helps sort.
- `Total` is included so the query can be covered.

## Clustered Index

A clustered index defines the physical/logical order of table data.

In SQL Server:

- a table usually has one clustered index;
- primary key often becomes clustered by default;
- the clustered key is included in non-clustered indexes.

Common clustered index choice:

```sql
Id INT IDENTITY PRIMARY KEY
```

Trade-off:

- sequential integer keys are insert-friendly;
- random GUID clustered keys can cause fragmentation;
- business keys may change, which makes them risky clustered keys.

## Non-clustered Index

A non-clustered index is a separate structure pointing to table rows.

Example:

```sql
CREATE INDEX IX_Users_Email
ON Users (Email);
```

Good for:

- lookup by email;
- uniqueness checks;
- login queries.

Often:

```sql
CREATE UNIQUE INDEX UX_Users_Email
ON Users (Email);
```

## Composite Index

Composite index uses multiple columns.

```sql
CREATE INDEX IX_Orders_Status_CreatedAt
ON Orders (Status, CreatedAt DESC);
```

Column order matters.

Useful for:

```sql
WHERE Status = 'Paid'
ORDER BY CreatedAt DESC
```

Less useful for:

```sql
WHERE CreatedAt > '2026-01-01'
```

because `Status` is the leading column.

## Covering Index

A covering index contains all columns needed by a query.

```sql
CREATE INDEX IX_Orders_Customer_Created
ON Orders (CustomerId, CreatedAt DESC)
INCLUDE (Status, Total);
```

Query:

```sql
SELECT Status, Total
FROM Orders
WHERE CustomerId = 42
ORDER BY CreatedAt DESC;
```

The database may not need to look up the base table.

## Index Seek vs Index Scan

`Index Seek` usually means the database can navigate directly to matching rows.

`Index Scan` means the database reads a larger part of the index.

But do not blindly assume seek is always good and scan is always bad. For large result sets, scanning can be reasonable.

## SARGable Queries

SARGable means the query can use indexes effectively.

Bad:

```sql
SELECT *
FROM Orders
WHERE YEAR(CreatedAt) = 2026;
```

Better:

```sql
SELECT *
FROM Orders
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01';
```

Bad:

```sql
WHERE LOWER(Email) = 'alice@example.com'
```

Better:

- store normalized email;
- use case-insensitive collation;
- create computed column if needed.

## Index Trade-offs

Indexes improve reads but cost writes.

Costs:

- slower inserts;
- slower updates on indexed columns;
- more storage;
- index maintenance;
- possible fragmentation;
- more complex query optimizer choices.

Engineering perspective:

> Indexes are not free. I add them based on query patterns, cardinality, and execution plans, then measure impact.

## Pagination Index

Query:

```sql
SELECT Id, Total, CreatedAt
FROM Orders
WHERE Status = 'Paid'
ORDER BY CreatedAt DESC, Id DESC
OFFSET 1000 ROWS FETCH NEXT 50 ROWS ONLY;
```

Index:

```sql
CREATE INDEX IX_Orders_Status_CreatedAt_Id
ON Orders (Status, CreatedAt DESC, Id DESC)
INCLUDE (Total);
```

For very deep pages, consider keyset pagination:

```sql
SELECT TOP (50) Id, Total, CreatedAt
FROM Orders
WHERE Status = 'Paid'
  AND (
      CreatedAt < @LastCreatedAt
      OR (CreatedAt = @LastCreatedAt AND Id < @LastId)
  )
ORDER BY CreatedAt DESC, Id DESC;
```

## Review Questions

### What is an index?

> An index is a database structure, commonly B-tree based in relational databases, that speeds up searching, filtering, sorting, and joining by avoiding full table scans when possible.

### What data structure does SQL Server use for indexes?

> SQL Server rowstore indexes use a B+ tree style structure with root, intermediate, and leaf pages. For a clustered index, the leaf level contains the actual data rows. For a non-clustered index, the leaf level contains index keys, included columns, and a row locator back to the base row.

### Clustered vs non-clustered index?

> A clustered index defines the table's data order, and a table can usually have one. A non-clustered index is a separate structure that points back to table rows and can have many per table.

### What is a key lookup?

> A key lookup happens when SQL Server uses a non-clustered index to find matching rows but must go back to the clustered index to fetch columns not present in the non-clustered index. It can be fine for small result sets but expensive for many rows.

### Why can an index become useless?

Reasons:

- function applied to indexed column;
- leading column of composite index not used;
- low selectivity;
- implicit conversion;
- outdated statistics;
- query returns too many rows;
- wildcard prefix like `LIKE '%abc'`.

## Common Mistakes

- Adding indexes without checking query patterns.
- Creating too many indexes.
- Ignoring composite index column order.
- Using functions on indexed columns.
- Forgetting included columns.
- Not reviewing execution plans.
- Optimizing only local small data, not production-scale data.
- Ignoring key lookups that happen thousands of times.
- Choosing a wide mutable clustered key.
- Assuming every index seek is good and every scan is bad.

## Practice Task

Create an `Orders` table with 1 million rows.

Test:

1. query without index;
2. query with single-column index;
3. query with composite covering index;
4. offset pagination;
5. keyset pagination.

Compare execution plans and elapsed time.
