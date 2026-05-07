# Indexes And Access Paths

## Core Idea

An index is not merely a faster lookup table. It is a physical access path that changes how the database can reach, order, and combine rows. Understanding indexes therefore means understanding how the storage engine navigates data and how the optimizer chooses among those navigation options. SQL Server concepts are used here because they are concrete and widely known, but the architectural lessons apply more broadly across relational systems.

## Access Paths And Database Work

Without a useful index, the database may need to inspect a large portion of a table before finding the qualifying rows. With a useful index, it may be able to navigate directly to the relevant key range and read far less data.

That difference is often more important than any ORM or application-side optimization because it changes the amount of physical work the database performs.

## B+ Trees And Rowstore Indexes

For SQL Server rowstore indexes, the most useful mental model is a B+ tree:

- root page at the top;
- intermediate pages routing the search;
- leaf pages containing the final ordered key space;
- linked leaf pages supporting ordered scans and range traversal.

This matters because indexes are not only equality accelerators. Their ordered structure also supports range filters, ordered output, and merge-like access patterns.

## Clustered And Nonclustered Indexes

A clustered index defines the primary ordering of the table's row data. Its leaf level contains the table rows themselves. A table can therefore have only one clustered index.

A nonclustered index is a separate structure containing its own key plus a locator back to the base row. If the table is clustered, that locator is usually the clustered key.

This is why clustered-key choice matters so much. A wide or unstable clustered key does not only affect the table. It also makes nonclustered indexes wider because the locator is part of their leaf structure.

## Key Width, Stability, And Identity Choice

Good clustered keys are usually:

- narrow;
- stable;
- frequently used for row identity;
- reasonably insertion-friendly.

This is why sequential integer or bigint surrogate keys are such common defaults. Random, wide, or mutable clustered keys often create unnecessary storage cost and can increase fragmentation or maintenance complexity.

That does not make surrogate keys universally correct, but it does explain why clustered-key design should be treated as a physical decision, not only a logical one.

## Seeks, Scans, And Misleading Intuition

People often talk as if seeks are always good and scans are always bad. That is too simplistic.

A seek is efficient when the qualifying range is selective. A scan can be reasonable when the table is small or when the query needs a large fraction of the rows anyway. The real question is not operator naming. It is how much data the engine had to touch and whether that work matched the actual result shape.

This is why execution plans, row counts, and logical reads matter more than slogans. In SQL Server, enabling `SET STATISTICS IO ON` before running a query reports the logical reads (pages touched) for each table involved, making the physical cost of the chosen plan directly visible.

## Fill Factor And Page Splits

When an index page runs out of space for new entries, the database performs a page split: half the entries move to a new page. This causes fragmentation and slows write performance. The fill factor setting controls how much free space is reserved on each index page:

```sql
CREATE INDEX IX_Orders_Status_CreatedAt
ON Orders (Status, CreatedAt DESC)
WITH (FILLFACTOR = 90);
```

A lower fill factor (such as 70 or 80) leaves more room for future inserts and reduces page splits at the cost of larger storage. The default fill factor (0, meaning full pages) is appropriate for mostly-read tables. For indexes on tables with frequent inserts in the middle of the key range, a lower fill factor can improve write performance.

## Filtered Indexes

A filtered index covers only a subset of rows, defined by a `WHERE` clause:

```sql
CREATE INDEX IX_Orders_ActiveStatus
ON Orders (CreatedAt DESC)
WHERE Status IN ('Pending', 'Processing');
```

Filtered indexes are smaller than full-table indexes and can be more efficient for queries that match the filter predicate. They are especially useful for soft-delete patterns, status-based queries, and covering the most common access paths without paying the storage cost of a full index.

The trade-off is that queries must include the same or a narrower predicate to benefit from the filtered index. A query filtering on a different status value will not use it.

## Composite Indexes And Key Order

Composite indexes support queries that filter or order by multiple columns:

```sql
CREATE INDEX IX_Orders_Status_CreatedAt
ON Orders (Status, CreatedAt DESC);
```

Column order matters because the leftmost part of the index defines how the key space is organized. An index on `(Status, CreatedAt)` is naturally useful for queries anchored by `Status`, but it is less naturally useful for queries filtering only by `CreatedAt`.

This is one of the most important index design rules: index key order should reflect the real predicate and ordering patterns of important queries.

## Covering Indexes And Lookups

If the optimizer finds qualifying keys in a nonclustered index but still needs columns that are not present there, it may perform key lookups back to the clustered data.

That can be perfectly acceptable for a small number of rows. It becomes expensive when repeated for many rows. A covering index reduces or removes that need by including all columns required by the query, either as key columns or as included columns.

This is a useful optimization, but it is not free. Wider indexes consume more storage, slow writes, and increase maintenance overhead. Covering should therefore be driven by real query value, not by a desire to cover everything.

## SARGability And Predicate Shape

An index can only help if the query predicate allows the optimizer to use it effectively. This is why SARGability matters.

A predicate such as:

```sql
WHERE YEAR(CreatedAt) = 2026
```

often prevents direct range seeking on an index over `CreatedAt`. A range predicate:

```sql
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01'
```

usually preserves the index-friendly search shape.

This is a recurring database design lesson: the logical intent may be the same, but the physical access path can be radically different.

## Write Cost And Index Trade-Offs

Indexes improve many reads, but every additional index also imposes write cost:

- inserts must maintain more structures;
- updates to indexed columns become more expensive;
- deletes must remove more index entries;
- storage usage rises;
- maintenance tasks grow more complex.

This is why index design should be workload-driven. A database is not improved simply by adding more indexes. It is improved when the indexes support the right read paths without overwhelming the write path.

## Index Maintenance And Fragmentation

Over time, as rows are inserted, updated, and deleted, index pages become fragmented. Logical fragmentation means the logical order of pages does not match the physical order on disk. Internal fragmentation means pages have unused space. Both can degrade scan performance.

SQL Server provides two maintenance operations:

- `ALTER INDEX ... REORGANIZE` -- defragments the leaf level online with minimal locking. Suitable for low-to-moderate fragmentation.
- `ALTER INDEX ... REBUILD` -- drops and recreates the index. Can be done online or offline. More thorough but more resource-intensive.

```sql
ALTER INDEX IX_Orders_Status_CreatedAt
ON Orders REORGANIZE;

ALTER INDEX IX_Orders_Status_CreatedAt
ON Orders REBUILD WITH (ONLINE = ON);
```

Regular index maintenance should be part of a database maintenance plan, especially for tables with heavy write activity. The frequency depends on the write volume and the acceptable performance degradation between maintenance windows.

## Indexes As Join And Pagination Infrastructure

Indexes do not only accelerate simple point lookups. They also support joins, ordering, grouping, and pagination. A query that filters by status and orders by creation time may benefit from an index shaped around both:

```sql
CREATE INDEX IX_Orders_Status_CreatedAt_Id
ON Orders (Status, CreatedAt DESC, Id DESC)
INCLUDE (Total);
```

This index supports not only filtering but also ordered pagination, which is why index design should always be read in relation to actual query patterns rather than to isolated columns.

## Design Consequences

Indexes are one of the strongest levers in relational performance because they define the database's available access paths. Good index design begins with query shape, respects storage and write cost, and treats clustered-key choice as a foundational physical decision.

Once that access-path mindset is clear, query optimization becomes easier to reason about because the database plan is no longer a black box. It is a set of choices over the structures the schema made available.
