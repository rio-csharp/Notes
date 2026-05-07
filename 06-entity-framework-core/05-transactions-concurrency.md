# Transactions And Concurrency

## Core Idea

Transactions and concurrency control solve related but different problems. Transactions define which operations succeed or fail together. Concurrency control defines what should happen when multiple actors try to change overlapping data at roughly the same time. Confusing those two concerns leads to designs that are either over-serialized, under-protected, or operationally fragile.

EF Core provides support for both, but the correct design depends on the business operation, the underlying database, and the surrounding application architecture.

## `SaveChanges` And Transaction Boundaries

For relational providers, one `SaveChanges` call typically executes within a transaction when multiple commands must succeed atomically.

```csharp
order.Status = OrderStatus.Paid;
payment.Status = PaymentStatus.Captured;

await _dbContext.SaveChangesAsync(ct);
```

Conceptually:

```text
Begin transaction
  UPDATE Orders
  UPDATE Payments
Commit
```

This default behavior is often enough for a single, coherent unit of work. Manual transactions are needed when the application must coordinate several save phases or mix EF changes with additional commands inside one atomic boundary.

## Explicit Transactions

Explicit transactions become useful when one operation genuinely spans multiple persistence steps:

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

try
{
    order.MarkPaid();
    await _dbContext.SaveChangesAsync(ct);

    auditLog.Record("Order paid");
    await _dbContext.SaveChangesAsync(ct);

    await transaction.CommitAsync(ct);
}
catch
{
    await transaction.RollbackAsync(ct);
    throw;
}
```

The important question is not whether explicit transactions are available. It is whether the business operation truly requires one broader atomic boundary. Keeping transactions narrower reduces locking time and usually improves operational safety.

## External Calls Do Not Belong Inside Database Transactions

One of the most common design mistakes is holding a database transaction open while waiting on a network call:

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

order.MarkPaid();
await _paymentProvider.CaptureAsync(paymentId, ct);
await _dbContext.SaveChangesAsync(ct);

await transaction.CommitAsync(ct);
```

This is risky because it:

- extends lock duration;
- couples database correctness to network latency;
- increases blocking and deadlock probability;
- can leave the system inconsistent if the external call succeeds but the database write fails.

The safer architectural move is often to commit database intent first and let an outbox or asynchronous workflow perform the external side effect afterward.

## Isolation Levels And Trade-Offs

Isolation levels control what one transaction can observe of another transaction's changes.

Common levels include:

- `Read Committed`
- `Repeatable Read`
- `Serializable`
- `Snapshot`

Higher isolation is not automatically better. It usually trades increased correctness guarantees for more locking, more blocking, or more version-store cost depending on the engine.

(The database chapter on transactions and isolation covers these levels from the SQL Server perspective, including their locking behavior and concurrency trade-offs.)

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(
    IsolationLevel.Serializable,
    ct);
```

Using a stronger isolation level should be a response to a real anomaly the business cares about, not a substitute for understanding the actual conflict pattern.

## Optimistic Concurrency

Optimistic concurrency assumes conflicting writes are relatively rare and detects them when saving.

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

```csharp
modelBuilder.Entity<Product>()
    .Property(p => p.RowVersion)
    .IsRowVersion();
```

When EF Core updates the row, the concurrency token becomes part of the `WHERE` clause:

```sql
UPDATE Products
SET Stock = @newStock, RowVersion = @newRowVersion
WHERE Id = @id AND RowVersion = @originalRowVersion
```

The `@originalRowVersion` value is the token the application read earlier. If another transaction modified the row between the read and the update, the database's `RowVersion` no longer matches, the `WHERE` clause excludes the row, and `@@ROWCOUNT` is zero. EF Core detects this condition and throws `DbUpdateConcurrencyException`.

This mechanism does not resolve the conflict. It detects that the original assumptions are no longer valid.

## Conflict Handling

The simplest application response is often to reject the operation cleanly:

```csharp
try
{
    await _dbContext.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    throw new ConflictException("The record was modified by another user.");
}
```

In HTTP APIs, that commonly maps to `409 Conflict`.

The exception provides access to the conflicting entries through its `Entries` property, which exposes three value sets for each affected entity:

- `OriginalValues` -- the values as they were when the entity was loaded.
- `CurrentValues` -- the values the application attempted to write.
- `GetDatabaseValues()` -- the values currently in the database.

More sophisticated flows may load current database values and decide whether to:

- reject and ask the user to reload;
- merge non-overlapping changes (overwriting only the columns that did not change in the database);
- retry a naturally retryable command after refreshing the entity;
- treat the row as deleted if current values no longer exist.

```csharp
catch (DbUpdateConcurrencyException ex)
{
    foreach (var entry in ex.Entries)
    {
        var databaseValues = await entry.GetDatabaseValuesAsync(ct);

        if (databaseValues is null)
        {
            // Row was deleted.
            throw new ConflictException("The record was deleted by another user.");
        }

        // Option: reload and retry, or report the conflict to the user.
        entry.OriginalValues.SetValues(databaseValues);
    }

    await _dbContext.SaveChangesAsync(ct);
}
```

The right response depends on the business rule. Concurrency detection is a business event, not merely a technical exception. Retry logic should be idempotent-safe, and automatic merge strategies should be validated against the specific domain rules before being deployed.

## Transactions And Concurrency Are Not The Same

This distinction is worth making explicitly.

A transaction answers questions such as:

- should these writes commit together;
- should partial success be impossible;
- how long should the database lock or version state remain active.

Concurrency control answers questions such as:

- what if two users edit the same row;
- what if stock changed after the read but before the save;
- should later writers overwrite earlier ones, merge with them, or fail.

A system may need one without much of the other. Treating concurrency conflicts as purely transactional problems often pushes designs toward unnecessarily broad locking.

## Set-Based Updates And Race Reduction

Some operations are better expressed as one atomic database statement than as a read-modify-write cycle in application memory.

```csharp
var affectedRows = await _dbContext.Products
    .Where(p => p.Id == productId && p.Stock >= quantity)
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(p => p.Stock, p => p.Stock - quantity),
        ct);

if (affectedRows == 0)
{
    throw new ConflictException("Not enough stock or product state changed.");
}
```

This pattern is often superior for inventory-style operations because the database checks the condition and applies the update in one step. That reduces the race window and avoids loading an entity that the operation does not otherwise need.

## Pessimistic Locking

Some scenarios justify preventing concurrent modification up front instead of detecting it afterward. EF Core does not expose every locking behavior directly through LINQ, so pessimistic locking often requires provider-specific SQL.

That approach should be used carefully. It increases blocking, can raise deadlock risk, and usually reduces throughput. It is appropriate only when the cost of conflict is high enough that the system must serialize access more aggressively.

Optimistic concurrency is the better default in many business applications because it preserves throughput and pushes conflict resolution to the cases where conflict actually occurs.

## Execution Strategies And Retriable Failures

Cloud-hosted databases may produce transient failures. EF Core execution strategies can retry those operations. When transactions are involved, the retry boundary must include the full transactional unit:

```csharp
var strategy = _dbContext.Database.CreateExecutionStrategy();

await strategy.ExecuteAsync(async () =>
{
    await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

    order.MarkPaid();
    await _dbContext.SaveChangesAsync(ct);

    outbox.Add(order.Id, "OrderPaid");
    await _dbContext.SaveChangesAsync(ct);

    await transaction.CommitAsync(ct);
});
```

Retrying only one command inside a broader transaction boundary is not enough. The whole logical unit must be safe to rerun.

## Outbox Pattern As A Transaction Boundary Tool

The outbox pattern is one of the cleanest ways to combine local atomicity with external side effects.

Within one transaction, the application updates its own state and records an outbox message:

```csharp
_dbContext.OutboxMessages.Add(new OutboxMessage
{
    Type = "OrderPaymentRequested",
    Payload = JsonSerializer.Serialize(new
    {
        OrderId = order.Id,
        order.Total
    }),
    CreatedAt = DateTimeOffset.UtcNow
});
```

After commit, a background worker publishes the external message or calls the external dependency. This design keeps local persistence atomic without forcing the database transaction to span an unreliable network boundary.

The outbox does not remove the need for idempotency on the external side. It does, however, dramatically improve the system's ability to reconcile and retry safely.

## Design Consequences

Strong EF Core transaction design usually follows a few rules. Keep transactions no wider than the business operation requires. Do not mix external calls into database transaction scope. Prefer optimistic concurrency unless conflict frequency or business criticality justifies stronger coordination. Use set-based updates when the database can enforce the rule more directly than a tracked entity round trip can.

Those choices produce systems that are not only correct, but also far easier to operate under real load and failure conditions.
