# Database Design

## Core Idea

Database design is about modeling data correctly, enforcing integrity, and supporting query patterns efficiently.

Chinese notes:

- `data modeling`: 数据建模.
- `entity`: 实体.
- `relationship`: 关系.
- `audit fields`: 审计字段.

## Design Process

1. Understand business entities.
2. Identify relationships.
3. Define keys.
4. Add constraints.
5. Normalize where appropriate.
6. Add indexes based on query patterns.
7. Plan audit and lifecycle fields.
8. Consider security and tenancy.

## Example: Order System

Entities:

- Customer;
- Order;
- OrderItem;
- Product;
- Payment;

Relationships:

```text
Customer 1 -> many Orders
Order 1 -> many OrderItems
Product 1 -> many OrderItems
Order 1 -> many Payments
```

## Table Example

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    CustomerId INT NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL,
    CONSTRAINT FK_Orders_Customers
        FOREIGN KEY (CustomerId) REFERENCES Customers(Id)
);
```

## Audit Fields

Common:

```text
CreatedAt
CreatedBy
UpdatedAt
UpdatedBy
DeletedAt
DeletedBy
```

Use UTC timestamps.

## Soft Delete

```sql
ALTER TABLE Users ADD IsDeleted BIT NOT NULL DEFAULT 0;
```

Benefits:

- recover data;
- audit history;
- avoid breaking references.

Costs:

- every query must filter deleted rows;
- unique constraints need careful design;
- storage grows.

## Multi-tenancy

Shared table example:

```sql
TenantId UNIQUEIDENTIFIER NOT NULL
```

Indexes often start with `TenantId`:

```sql
CREATE INDEX IX_Orders_Tenant_Status_CreatedAt
ON Orders (TenantId, Status, CreatedAt DESC);
```

## Partitioning And Sharding

When data grows, database design questions often move beyond normal tables and indexes.

Chinese notes:

- `partitioning`: 分区, usually splitting data inside one database/table system.
- `sharding`: 分片, splitting data across multiple database instances.
- `shard key`: 分片键.
- `hot shard`: 热点分片.

Do not jump to sharding too early. First consider:

- proper indexes;
- query optimization;
- archiving old data;
- read replicas;
- caching;
- vertical scaling;
- partitioning inside the database.

Engineering perspective:

> Sharding is a scalability tool, but it creates complexity in queries, transactions, operations, and data rebalancing. I would only choose it when simpler options cannot meet the scale or isolation requirements.

## Vertical vs Horizontal Partitioning

Vertical partitioning splits columns or feature areas.

Example:

```text
Users
  Id, Email, Name, CreatedAt

UserProfiles
  UserId, Bio, AvatarUrl, PreferencesJson
```

Use when:

- a table has many rarely used columns;
- large columns slow common queries;
- different features have different access patterns;
- sensitive data needs stricter access control.

Horizontal partitioning splits rows.

Example:

```text
Orders_2026_01
Orders_2026_02
Orders_2026_03
```

Use when:

- data is naturally time-based;
- old data can be archived;
- queries usually target recent data;
- maintenance operations need smaller chunks.

SQL Server partitioning concept:

```sql
-- Conceptual only. Real production partitioning needs careful filegroup,
-- index, maintenance, and query plan design.
CREATE PARTITION FUNCTION pfOrdersByMonth (datetime2)
AS RANGE RIGHT FOR VALUES
(
    '2026-01-01',
    '2026-02-01',
    '2026-03-01'
);
```

## Sharding Mental Model

Sharding splits rows across databases.

Example:

```text
Shard 1: customers 0000-2999
Shard 2: customers 3000-5999
Shard 3: customers 6000-9999
```

Application flow:

```text
Request has TenantId
  -> shard resolver
  -> connection string for shard
  -> query only that shard
```

Simple resolver example:

```csharp
using System.Security.Cryptography;

public interface IShardResolver
{
    string GetConnectionString(Guid tenantId);
}

public sealed class HashShardResolver : IShardResolver
{
    private readonly string[] _connectionStrings;

    public HashShardResolver(IConfiguration configuration)
    {
        _connectionStrings = configuration
            .GetSection("ShardConnectionStrings")
            .Get<string[]>() ?? Array.Empty<string>();
    }

    public string GetConnectionString(Guid tenantId)
    {
        if (_connectionStrings.Length == 0)
        {
            throw new InvalidOperationException("No shards configured.");
        }

        var bytes = SHA256.HashData(tenantId.ToByteArray());
        var hash = BitConverter.ToUInt32(bytes, 0);
        return _connectionStrings[hash % _connectionStrings.Length];
    }
}
```

This example is intentionally simple. Real systems need stable mapping, rebalancing support, and operational tooling.

## Choosing A Shard Key

A good shard key:

- appears in most queries;
- distributes traffic evenly;
- keeps related data together;
- avoids hot shards;
- rarely changes;
- supports tenant or ownership boundaries.

Common shard keys:

| Shard Key | Good For | Risk |
| --- | --- | --- |
| `TenantId` | B2B SaaS isolation | one huge tenant can become hot |
| `UserId` | user-centric apps | cross-user queries become hard |
| `OrderId` hash | high write distribution | customer order history may need fan-out |
| region | data residency | uneven regional traffic |
| time | archival and time queries | recent partition may become hot |

Bad shard keys:

- low-cardinality values like status;
- values that change;
- values not present in common queries;
- values that create one dominant shard.

Practical explanation:

> I choose a shard key based on query patterns and data ownership, not only write distribution. The best shard key lets most requests route to one shard and keeps cross-shard queries rare.

## Cross-Shard Query Problem

Before sharding:

```sql
SELECT *
FROM Orders
WHERE Status = 'Pending';
```

After sharding by tenant:

```text
Where are all pending orders?
Shard 1? Shard 2? Shard 3? All of them?
```

Cross-shard queries create problems:

- fan-out to many databases;
- slower latency;
- partial failure handling;
- sorting and pagination across shards;
- inconsistent snapshots;
- harder reporting.

Common solutions:

- design APIs to include shard key;
- keep global reporting in a separate analytical store;
- use search/read models for cross-tenant queries;
- replicate summary data to a central database;
- restrict admin queries to async exports.

Example:

```text
Operational API:
GET /tenants/{tenantId}/orders?status=Pending

Reporting:
Async job reads shards -> writes report file -> user downloads later
```

## Cross-Shard Transactions

Single-shard transaction:

```text
Tenant A order + payment record on Shard 2
```

This can use a normal local database transaction.

Cross-shard transaction:

```text
Tenant A data on Shard 2
Tenant B data on Shard 7
Need one atomic transaction across both
```

This is much harder.

Avoid by design:

- keep transaction boundaries inside one shard;
- align aggregates with shard key;
- use outbox/inbox and eventual consistency for cross-shard workflows;
- make operations idempotent;
- use compensation instead of distributed transaction when appropriate.

Chinese note:

- `compensation`: 补偿操作.

Engineering perspective:

> Sharding changes transaction design. I try to keep strong consistency inside one shard and use eventual consistency patterns across shards.

## Global IDs

Auto-increment integer IDs can collide across shards.

Options:

- GUID/UUID;
- sequential GUID;
- Snowflake-style IDs;
- database sequence per shard with shard prefix;
- application-generated IDs.

Example ID shape:

```text
timestamp + shardId + sequence
```

Trade-offs:

- random GUIDs can fragment indexes;
- sequential IDs reveal rough creation order;
- central ID services can become dependencies;
- Snowflake-style IDs require clock handling.

Practical .NET example:

```csharp
public sealed record OrderId(Guid Value)
{
    public static OrderId New() => new(Guid.CreateVersion7());
}
```

If your .NET version does not support UUID v7, you can use a library or SQL Server sequential GUID strategy.

## Rebalancing Shards

Rebalancing means moving data because shards are uneven or capacity changes.

Why it is hard:

- data is large;
- writes continue during migration;
- references must remain correct;
- application routing must change safely;
- rollback must be possible.

Common pattern:

```text
1. Add new shard.
2. Mark selected tenants for migration.
3. Copy historical data.
4. Capture changes during copy.
5. Pause or narrow writes briefly if needed.
6. Verify counts/checksums.
7. Switch routing table.
8. Monitor.
9. Keep rollback window.
```

Routing table example:

```sql
CREATE TABLE TenantShardMap
(
    TenantId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    ShardName NVARCHAR(100) NOT NULL,
    ConnectionName NVARCHAR(100) NOT NULL,
    Status NVARCHAR(30) NOT NULL
);
```

This is more flexible than simple hash modulo because tenants can move individually.

## Tenant Sharding

For B2B SaaS, tenant-based sharding is common.

Models:

| Model | Description | Pros | Cons |
| --- | --- | --- | --- |
| Shared database, shared tables | `TenantId` column | simple, cost-effective | weaker isolation, large tables |
| Shared database, separate schema | schema per tenant | some isolation | many schemas to manage |
| Database per tenant | each tenant has DB | strong isolation, easier tenant restore | operational complexity |
| Shard by tenant groups | many tenants per shard | scalable compromise | needs shard map and migration tools |

Practical explanation:

> I usually start with shared tables plus strong `TenantId` filtering and indexes unless isolation or scale requires more. For large enterprise tenants, database-per-tenant or tenant sharding may be justified.

## When Not To Shard

Avoid sharding when:

- the data size is still manageable;
- the bottleneck is bad queries or missing indexes;
- the team lacks operational maturity;
- reporting requires frequent global queries;
- transactions frequently cross the proposed shard boundary;
- a read replica, cache, or archive strategy solves the problem.

Engineering framing:

> I would not use sharding as a default architecture. I would first prove the bottleneck, estimate growth, and compare alternatives. Sharding solves some scale problems but creates new product and operational constraints.

## Review Questions

### How do you design a database table?

> I start from business entities and relationships, define primary and foreign keys, add constraints for integrity, normalize to reduce duplication, then add indexes based on query patterns.

### What audit fields do you usually add?

> CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, and sometimes DeletedAt/DeletedBy for soft delete. I usually store time in UTC.

### When do you use soft delete?

> When business needs recovery, audit, or historical references. I avoid it when data must be physically removed for compliance unless there is a separate archival/deletion strategy.

### How do you choose a shard key?

> I start from query patterns and ownership boundaries. A good shard key appears in most requests, distributes load evenly, keeps related data together, rarely changes, and avoids cross-shard transactions. For B2B SaaS, `TenantId` is common, but large tenants can create hot shards.

### What is the biggest problem after sharding?

> Cross-shard operations. Queries, pagination, reporting, transactions, uniqueness, and migrations become harder. I try to route operational requests to one shard and move global reporting to async read models or analytical stores.

### When should you not shard?

> I would avoid sharding if indexes, query optimization, caching, archiving, read replicas, or vertical scaling can solve the bottleneck. Sharding increases operational complexity and should be justified by scale, isolation, or data residency needs.

## Common Mistakes

- No constraints.
- No audit fields.
- Overusing soft delete.
- Designing tables without query patterns.
- No indexes for foreign keys or common filters.
- Using local time instead of UTC.
- Sharding before fixing bad queries.
- Choosing a shard key that is not present in common queries.
- Ignoring cross-shard reporting and pagination.
- Using auto-increment IDs without considering shard collisions.
- Forgetting shard rebalancing and tenant migration tooling.

## Practice Task

Design tables for:

1. users and roles;
2. orders and order items;
3. product catalog;
4. payment records;
5. audit logs;
6. tenant-aware data.
7. tenant shard map;
8. cross-shard reporting read model.
