# Database Design And Data Modeling

## Core Idea

Database design is the discipline of turning business concepts into tables, keys, constraints, and access paths that remain correct under change. A good design does not only store today's fields. It preserves identity, models relationships clearly, supports the expected query patterns, and allows the system to evolve without turning every feature into a schema exception.

This chapter stays focused on primary database design rather than on full-scale distributed data architecture. Partitioning and sharding are discussed, but only as later-stage consequences of design and scale rather than as default starting points.

## From Business Concepts To Relational Structure

A sound design process usually begins with a few questions:

- what are the real business entities;
- which relationships are one-to-one, one-to-many, or many-to-many;
- which values identify entities;
- which rules must hold even if the application is buggy;
- which query patterns will dominate real usage.

Those questions matter because database design is not only conceptual modeling. It is conceptual modeling under operational constraints.

## An Example Order Domain

Consider an order system with:

- customers;
- orders;
- order items;
- products;
- payments.

Its high-level relationships might be:

```text
Customer 1 -> many Orders
Order 1 -> many OrderItems
Product 1 -> many OrderItems
Order 1 -> many Payments
```

Even at this level, design decisions are already visible. `OrderItems` exists because the order-to-product relationship carries quantity, price snapshot, and often other semantics. That means it is not just a hidden join table. It is a business entity in its own right.

## Keys And Identity Strategy

Every table needs a clear identity strategy. Surrogate keys such as integer or bigint identities are common because they are narrow and stable. Natural keys such as email or SKU still matter, but they are often better enforced as unique constraints than used as the table's primary identifier.

That split is useful because business identifiers can change, while relational identity usually should not. A design that conflates the two often becomes painful when product rules evolve.

## Audit And Lifecycle Columns

Most business tables also need lifecycle information:

```text
CreatedAt
CreatedBy
UpdatedAt
UpdatedBy
DeletedAt
DeletedBy
```

These fields are not decorative. They support investigation, reconciliation, compliance reasoning, and operational debugging. At the same time, they should not be added mechanically to every table without purpose. Audit columns are valuable when the system actually needs to know who changed what and when.

Using UTC-based timestamps is generally the right default because it keeps storage unambiguous and avoids local-time interpretation errors.

## Soft Delete And Its Costs

Soft delete is a design choice, not just a column:

```sql
ALTER TABLE Users ADD IsDeleted BIT NOT NULL DEFAULT 0;
```

It can be valuable when the system needs recoverability, historical references, or delayed deletion workflows. It also introduces persistent costs:

- every relevant query must account for deleted rows;
- uniqueness rules may need filtered indexes or more careful constraints;
- tables continue to grow even when data is logically removed;
- compliance-driven physical deletion becomes more complex.

Soft delete is therefore appropriate when the business meaning of deletion is really "inactive but historically important," not merely when the team wants to avoid hard-delete decisions.

## Multi-Tenancy And Shared Data Boundaries

Many systems must decide whether data from multiple tenants lives together or apart. In a shared-table model, a tenant discriminator is part of the table design:

```sql
TenantId UNIQUEIDENTIFIER NOT NULL
```

That decision affects more than security filtering. It also affects index shapes, query predicates, and how easy it is to keep operational requests tenant-local.

A multi-tenant design is healthy only when tenant filtering is treated as part of the schema and query model rather than as an optional application convention.

## Normalization, Read Shape, And Future Change

A well-designed schema usually starts normalized enough that one fact has one primary home. That reduces update anomalies and keeps business rules easier to enforce. At the same time, a schema should not be judged only by purity. If the expected workload repeatedly needs certain summaries, snapshots, or read models, the design may later need controlled denormalization or projection tables.

The right starting point is usually correctness first, then selective read optimization based on actual workload.

## Partitioning As A Scaling Extension

As data grows, database design sometimes extends beyond ordinary table layout. Partitioning is one such extension. Vertical partitioning separates columns or feature areas into different tables. Horizontal partitioning separates rows into partitions, often by time or another large-scale access boundary.

These techniques can help with maintenance, archival, and performance, but they are not substitutes for basic schema quality. If the core model, constraints, and query paths are weak, partitioning usually makes the pain larger rather than smaller.

## Sharding As A Last-Stage Design Decision

Sharding splits data across databases rather than within one database instance. It can solve real scale, isolation, or residency problems. It also introduces major costs:

- cross-shard queries become harder;
- transactions across shards become much harder;
- rebalancing becomes an operational project;
- uniqueness and reporting rules become more complex;
- application routing must become shard-aware.

That is why sharding should be treated as an advanced architectural choice, not as a default marker of sophistication.

A good shard key typically:

- appears in most operational queries;
- keeps related data together;
- distributes load reasonably;
- changes rarely or never;
- minimizes cross-shard transactions.

For B2B SaaS systems, `TenantId` is a common candidate because it aligns ownership and routing. Even then, large tenants can create hot-shard issues, which means sharding strategy and customer distribution strategy remain linked.

## Designing For Operational Locality

One of the strongest database design principles is locality: most operational requests should touch a small, predictable part of the data model.

That principle appears at several levels:

- one aggregate should usually update within one transaction boundary;
- one tenant request should ideally stay within one tenant slice;
- one indexed predicate should narrow the search space early;
- one archive strategy should let old data move without destabilizing current data.

Locality is what keeps relational systems understandable as they grow.

## Design Consequences

Good database design is not the art of creating many tables. It is the art of assigning each fact a natural home, enforcing important invariants at the schema boundary, and shaping the data so that the system's most important operations remain both correct and efficient.

Partitioning and sharding may later become necessary, but they should extend a sound model rather than compensate for a weak one. The stronger the core schema, the more gracefully the system can evolve when scale and product complexity increase.
