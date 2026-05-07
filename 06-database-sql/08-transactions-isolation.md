# Transactions, Isolation, And Concurrency Behavior

## Core Idea

Transactions define atomic boundaries for change. Isolation levels define how concurrent transactions can observe or interfere with one another. Locking and concurrency behavior are therefore not secondary implementation details. They are part of the correctness model of relational systems. Understanding these ideas at the database level provides a firm foundation for later application-layer patterns, including ORM behavior and distributed workflow design.

## ACID As A Practical Model

The classic ACID properties remain useful when read practically.

Atomicity means a grouped change either commits as a whole or does not commit at all.

Consistency means database rules and invariants still hold after the transaction completes.

Isolation means concurrent work should not observe or create invalid interference patterns.

Durability means committed data survives system failure according to the engine's guarantees.

These ideas sound abstract until a system fails. Then they become operationally concrete very quickly.

## Transaction Boundaries

A transaction groups related writes:

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

This is not only a syntactic wrapper. It tells the database that partial completion would be invalid. The right transaction boundary is therefore a business boundary, not a random technical one.

## Isolation Levels And Read Phenomena

Isolation levels control which concurrency anomalies are allowed or prevented. Common phenomena include:

- dirty reads;
- non-repeatable reads;
- phantom reads;
- lost updates.

The exact behavior depends on the engine and its implementation strategy, but the conceptual trade-off is stable: stronger isolation reduces anomalies and often reduces concurrency or increases coordination cost.

That is why isolation level should be chosen according to correctness requirements rather than by habit.

## Read Committed, Repeatable Read, Serializable, Snapshot

`Read Committed` is a common default because it prevents dirty reads while preserving reasonable concurrency.

`Repeatable Read` and `Serializable` strengthen guarantees, but they may also enlarge lock duration or constrain concurrency more aggressively.

`Snapshot` isolation uses versioned reads rather than traditional blocking reads. When enabled, the database stores row versions in tempdb (in SQL Server). A `SELECT` under snapshot isolation reads the latest committed version as of the start of the transaction, without acquiring shared locks. This eliminates most read-write blocking but adds tempdb overhead and may increase the cost of write operations that must check for version conflicts.

The key engineering point is that no isolation level is simply "best." Each is a different correctness-versus-concurrency trade.

## Lost Updates And Write Conflicts

One of the most practically important anomalies is the lost update. Two sessions read the same value, both compute a new value, and the later write silently overwrites the earlier result.

This is why concurrency correctness is not only about read phenomena. It is also about whether the system detects conflicting writes or allows them to pass invisibly.

Optimistic concurrency tokens at the application layer are one solution. Stronger locking strategies are another. The right answer depends on how often conflicts happen and how expensive they are.

## Locks And Blocking

Relational databases often use locks to coordinate concurrent access. Shared locks support reading. Exclusive locks support writing. Intent and update locks help the engine manage more complex access patterns.

The important practical lesson is that lock behavior depends heavily on query shape. A precise indexed update may lock a very small set of rows. A broad scan under write pressure may touch and lock far more data than the application expected.

That is one reason indexing and transaction behavior are connected. Good indexes improve not only speed, but also lock locality.

## Blocking, Deadlocks, And Timeouts

Blocking is ordinary waiting. One session holds a resource and another waits for it.

Deadlock is cyclic waiting. Session A waits for a resource held by Session B, while Session B waits for one held by Session A. At that point, no forward progress is possible, so the database chooses a victim and aborts one transaction.

Timeout is different again. A client gives up after waiting too long, whether because of blocking, slow execution, or broader system pressure.

Distinguishing among these states matters because the remedy depends on which one is happening.

## Deadlocks As Design Signals

Deadlocks are often treated as random database bad luck. They are usually design signals.

Typical contributing factors include:

- inconsistent resource access order;
- transactions that remain open too long;
- missing indexes causing broad scans and larger lock footprints;
- workflows that mix user interaction or network calls into transaction scope.

Retrying deadlock victims is often necessary, but it is mitigation rather than full resolution. The durable fix usually comes from narrowing the lock footprint, shortening the transaction, or making access order consistent.

## Application Boundaries And External Calls

One of the worst transaction patterns is holding a database transaction open while waiting on an external API, user action, or long-running computation. That increases lock duration, reduces concurrency, and makes failure states harder to reconcile.

Short transaction boundaries are therefore not only a performance recommendation. They are part of concurrency design.

## Application-Level Coordination With `sp_getapplock`

When database isolation levels are too coarse or too expensive for a specific concurrency requirement, SQL Server's `sp_getapplock` provides application-defined locking. It acquires a named lock that can be shared or exclusive, scoped to the current transaction:

```sql
EXEC sp_getapplock @Resource = 'OrderPayment_123',
    @LockMode = 'Exclusive',
    @LockTimeout = 5000;
```

This is useful for coordinating access to a specific business resource (such as a single order's payment flow) without using pessimistic locking on database rows. The lock is released when the transaction commits or rolls back.

`sp_getapplock` should be used sparingly. It adds explicit serialization that can become a bottleneck if overused. It is most appropriate for operations where the database's native locking is not granular enough or where the application needs a named, transaction-scoped mutex across multiple database operations.

## Indexing And Concurrency

Missing or weak indexes can increase deadlock and blocking risk because the database must inspect and lock more data to find the target rows. This is an important reminder that physical design supports correctness as well as speed.

A good index narrows the search space. A narrow search space often means fewer locks, shorter waits, and fewer conflict opportunities.

## Investigation And Operational Evidence

When concurrency issues appear in production, evidence matters. Deadlock graphs (captured in SQL Server via the `system_health` Extended Events session or by enabling trace flag 1222), blocking chains, running requests, transaction duration, execution plans, and application traces all contribute to the diagnosis.

The goal is not only to handle the immediate incident. It is to identify whether the real cause is query shape, index quality, workflow design, or isolation choice.

## Design Consequences

Transactions and isolation levels should be designed around business correctness first, but with strong awareness of their physical consequences. Choose transaction boundaries that match the real unit of work. Keep them short. Align indexing with write paths. Use stronger isolation only when the anomaly being prevented is worth the concurrency cost.

Once those principles are clear, database concurrency stops looking like mysterious engine behavior and starts looking like a design space with understandable trade-offs.
