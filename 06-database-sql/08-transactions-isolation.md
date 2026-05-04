# Transactions And Isolation Levels

## Core Idea

A database transaction groups multiple operations into one logical unit of work.

Chinese notes:

- `transaction`: 事务.
- `isolation level`: 隔离级别.
- `deadlock`: 死锁.
- `lock`: 锁.
- `optimistic concurrency`: 乐观并发.

## ACID

### Atomicity

All operations succeed or all fail.

### Consistency

Data moves from one valid state to another valid state.

### Isolation

Concurrent transactions should not incorrectly interfere with each other.

### Durability

Committed data survives failures.

## Basic Transaction Example

```sql
BEGIN TRANSACTION;

UPDATE Accounts
SET Balance = Balance - 100
WHERE Id = 1;

UPDATE Accounts
SET Balance = Balance + 100
WHERE Id = 2;

COMMIT;
```

If the second update fails, rollback should happen.

```sql
ROLLBACK;
```

## EF Core Transaction Example

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

try
{
    sender.Balance -= amount;
    receiver.Balance += amount;

    await _dbContext.SaveChangesAsync(ct);
    await transaction.CommitAsync(ct);
}
catch
{
    await transaction.RollbackAsync(ct);
    throw;
}
```

`SaveChanges` already uses a transaction for many normal cases. Manual transactions are needed when multiple SaveChanges or external consistency boundaries are involved.

## Concurrency Problems

### Dirty Read

A transaction reads uncommitted data from another transaction.

### Non-repeatable Read

The same row is read twice, but another transaction modifies it between reads.

### Phantom Read

The same query returns different sets of rows because another transaction inserts or deletes matching rows.

### Lost Update

Two transactions read the same data and overwrite each other's updates.

## Isolation Levels

### Read Uncommitted

Allows dirty reads.

Fast but unsafe for most business logic.

### Read Committed

Prevents dirty reads.

Common default in many databases.

### Repeatable Read

Prevents non-repeatable reads.

### Serializable

Strongest isolation.

Prevents phantom reads but can reduce concurrency.

### Snapshot Isolation

Reads use row versions instead of blocking writers.

Can improve concurrency, but write conflicts still need handling.

## Lost Update Example

Two users update stock.

Initial:

```text
Stock = 10
```

Transaction A reads 10.

Transaction B reads 10.

A writes 9.

B writes 9.

Expected stock after two purchases: 8.

Actual stock: 9.

## Optimistic Concurrency In EF Core

Entity:

```csharp
public sealed class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Stock { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = [];
}
```

Handling conflict:

```csharp
try
{
    await _dbContext.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    throw new ConflictException("The product was modified by another user.");
}
```

## Deadlock

Deadlock happens when transactions wait on each other.

Example:

```text
Transaction A locks Row 1, then wants Row 2.
Transaction B locks Row 2, then wants Row 1.
```

Prevention:

- access resources in consistent order;
- keep transactions short;
- use proper indexes;
- avoid user interaction inside transactions;
- retry deadlock victims;
- reduce lock scope where possible.

## Under The Hood: SQL Server Locks

SQL Server uses locks to protect data consistency.

Chinese notes:

- `shared lock`: 共享锁.
- `exclusive lock`: 排他锁.
- `update lock`: 更新锁.
- `intent lock`: 意向锁.
- `lock escalation`: 锁升级.

Common lock modes:

| Lock Mode | Meaning | Typical Use |
|---|---|---|
| `S` shared | allows reads | reading data |
| `X` exclusive | blocks other reads/writes depending on isolation | modifying data |
| `U` update | prepares to update | avoids some conversion deadlocks |
| `IS` intent shared | signals shared locks below | table/page intent |
| `IX` intent exclusive | signals exclusive locks below | table/page intent |
| `SIX` shared with intent exclusive | read many, update some | mixed read/update |

You do not need to memorize the full compatibility matrix for most engineering practice, but you should understand:

- multiple shared locks can coexist;
- exclusive locks conflict with most other locks;
- intent locks help SQL Server manage hierarchy between table, page, and row locks;
- update locks reduce certain deadlock patterns where two sessions read then both try to update.

## Lock Granularity

SQL Server can lock at different levels:

- row/key;
- page;
- table;
- database-level metadata in some cases.

Fine-grained locks improve concurrency but require more lock management overhead.

Coarse-grained locks reduce overhead but block more work.

SQL Server may use lock escalation（锁升级）:

```text
many row locks -> table lock
```

This can happen when many locks are held, though SQL Server's actual decision is more nuanced.

Engineering perspective:

> If a query scans many rows because of a missing index, it may hold many locks or larger-range locks, increasing blocking and deadlock risk. Good indexes are not only about speed; they also reduce the amount of data touched and locked.

## Blocking vs Deadlock vs Timeout

These are related but different.

Blocking:

```text
Session A holds a lock.
Session B waits.
Session A eventually commits.
Session B continues.
```

Deadlock:

```text
Session A waits for Session B.
Session B waits for Session A.
Neither can continue.
SQL Server kills one victim.
```

Timeout:

```text
Client waits too long and gives up.
The database may or may not still be working.
```

Practical explanation:

> Blocking is normal waiting. Deadlock is a cycle of waiting where progress is impossible. Timeout is a client-side or command-level wait limit being exceeded.

## How SQL Server Handles Deadlocks

SQL Server has a deadlock monitor.

When it detects a cycle, it chooses a victim transaction, rolls it back, and lets the other transaction continue.

The victim receives an error, commonly:

```text
1205: Transaction was deadlocked on resources with another process and has been chosen as the deadlock victim.
```

Application code should treat this as a transient failure when the operation is safe to retry.

## Classic Deadlock Pattern

Transaction A:

```sql
BEGIN TRAN;

UPDATE Accounts
SET Balance = Balance - 100
WHERE Id = 1;

UPDATE Accounts
SET Balance = Balance + 100
WHERE Id = 2;

COMMIT;
```

Transaction B:

```sql
BEGIN TRAN;

UPDATE Accounts
SET Balance = Balance - 50
WHERE Id = 2;

UPDATE Accounts
SET Balance = Balance + 50
WHERE Id = 1;

COMMIT;
```

Problem:

```text
A locks account 1, then wants account 2.
B locks account 2, then wants account 1.
```

Fix: always access resources in the same order.

```sql
-- Always update lower account id first, then higher account id.
```

Application example:

```csharp
var orderedAccountIds = new[] { fromAccountId, toAccountId }
    .OrderBy(id => id)
    .ToArray();
```

## Avoiding Deadlocks In Application Design

Strong practices:

- access tables and rows in a consistent order;
- keep transactions short;
- never call external APIs inside a database transaction;
- avoid waiting for user input inside a transaction;
- create indexes that let updates find rows directly;
- update only necessary rows;
- choose isolation level deliberately;
- use optimistic concurrency for user-edit scenarios;
- retry deadlock victims when the operation is idempotent or safely repeatable.

Bad:

```csharp
await using var tx = await db.Database.BeginTransactionAsync(ct);

order.Status = OrderStatus.Paid;
await db.SaveChangesAsync(ct);

await paymentGateway.CaptureAsync(order.PaymentId, ct); // external call inside transaction

order.PaymentCaptured = true;
await db.SaveChangesAsync(ct);

await tx.CommitAsync(ct);
```

Better:

```csharp
// 1. Save local state in a short transaction.
// 2. Commit.
// 3. Call external dependency.
// 4. Save result or use outbox/saga pattern.
```

## Deadlock Retry Pattern

Retry only when safe.

Example structure:

```csharp
for (var attempt = 1; attempt <= 3; attempt++)
{
    try
    {
        await ProcessOrderAsync(orderId, ct);
        break;
    }
    catch (SqlException ex) when (ex.Number == 1205 && attempt < 3)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(100 * attempt), ct);
    }
}
```

Important:

- retry must not create duplicate side effects;
- use idempotency keys for payment or message operations;
- log retry attempts;
- do not hide repeated deadlocks because they indicate a design/query issue.

## Helpful SQL Server Tools For Deadlocks

In engineering practice, mention how you would investigate:

- deadlock graph from Extended Events;
- blocked process reports if enabled;
- Query Store;
- actual execution plans;
- indexes used by the conflicting statements;
- transaction duration;
- isolation level;
- application logs with correlation ID.

Good troubleshooting should include both mitigation and root cause analysis:

> I would capture the deadlock graph, identify the resources and statements involved, check whether access order is inconsistent or indexes are missing, reduce transaction length, add retry for deadlock victim errors, and verify with production-like workload.

## Deadlock Investigation Queries

Extended Events often capture deadlock graphs through the built-in `system_health` session.

Example query:

```sql
WITH DeadlockEvents AS
(
    SELECT CAST(xet.target_data AS XML) AS target_data
    FROM sys.dm_xe_session_targets xet
    INNER JOIN sys.dm_xe_sessions xe
        ON xe.address = xet.event_session_address
    WHERE xe.name = 'system_health'
      AND xet.target_name = 'ring_buffer'
)
SELECT
    event_data.value('@timestamp', 'datetime2') AS event_time,
    event_data.query('(data/value/deadlock)[1]') AS deadlock_graph
FROM DeadlockEvents
CROSS APPLY target_data.nodes('//RingBufferTarget/event[@name="xml_deadlock_report"]') AS XEvent(event_data)
ORDER BY event_time DESC;
```

What to look for in a deadlock graph:

- victim process;
- two or more sessions waiting on each other;
- locked object/index/page/key;
- SQL statements involved;
- lock modes such as `S`, `U`, `X`;
- transaction start time and isolation level.

Check active locks during blocking:

```sql
SELECT
    request_session_id,
    resource_type,
    resource_database_id,
    resource_associated_entity_id,
    request_mode,
    request_status
FROM sys.dm_tran_locks
ORDER BY request_session_id;
```

Investigation habit:

> Deadlock retry is mitigation. The durable fix usually comes from reducing transaction length, improving indexes, keeping access order consistent, or changing the workflow.

## Review Questions

### What is ACID?

> ACID stands for Atomicity, Consistency, Isolation, and Durability. It describes key transaction guarantees in relational databases.

### What is the difference between optimistic and pessimistic locking?

> Optimistic locking assumes conflicts are rare and checks for conflicts when saving, often using version columns. Pessimistic locking locks data earlier to prevent other transactions from modifying it.

### How do you handle deadlocks?

> First identify the deadlock graph or blocked queries. Then reduce transaction length, ensure consistent access order, add appropriate indexes, and implement retry for deadlock victims.

### How do you avoid deadlocks?

> I avoid deadlocks by keeping transactions short, accessing resources in a consistent order, indexing predicates so SQL Server locks fewer rows, avoiding external calls inside transactions, choosing isolation levels carefully, and adding safe retry for transient deadlock victim errors.

### Why can missing indexes cause deadlocks?

> Missing indexes can force scans, which touch and lock more rows or key ranges than necessary. More locked resources increase blocking and make deadlock cycles more likely.

## Common Mistakes

- Holding transactions open while calling external APIs.
- Using serializable isolation everywhere.
- Ignoring lost updates.
- No retry policy for transient deadlocks.
- Missing indexes causing large lock ranges.
- Confusing application transaction with distributed transaction.
- Retrying non-idempotent operations blindly.
- Treating a command timeout as the same thing as a deadlock.
- Fixing symptoms without checking the deadlock graph.

## Practice Task

Build a stock deduction API:

1. implement without concurrency control;
2. simulate concurrent requests;
3. observe lost update;
4. add `RowVersion`;
5. return `409 Conflict` on concurrency failure;
6. add retry where appropriate.
