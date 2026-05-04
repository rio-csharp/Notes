# EF Core Transactions And Concurrency

## Core Idea

EF Core supports transactions and concurrency control to keep data correct when multiple operations or users interact with the same data.

Chinese notes:

- `transaction`: 事务.
- `concurrency`: 并发.
- `optimistic concurrency`: 乐观并发.
- `pessimistic locking`: 悲观锁.
- `RowVersion`: 行版本.
- `isolation level`: 隔离级别.
- `retry strategy`: 重试策略.

Key takeaway:

> Transactions protect atomicity, while concurrency control protects correctness when multiple users or processes update the same data.

## SaveChanges Transaction

For most normal operations, `SaveChanges` runs in a transaction for relational providers when multiple commands must be saved atomically.

```csharp
order.Status = OrderStatus.Paid;
payment.Status = PaymentStatus.Captured;

await _dbContext.SaveChangesAsync(ct);
```

Both changes succeed or fail together.

Conceptually:

```text
Begin transaction
  UPDATE Orders
  UPDATE Payments
Commit
```

## Manual Transaction

Use explicit transaction when multiple steps must share one transaction.

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

Use manual transactions for:

- multiple `SaveChanges` in one atomic operation;
- raw SQL plus EF changes;
- multiple repositories sharing one `DbContext`;
- special transaction boundaries.

## Avoid External Calls Inside Transactions

Bad:

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

order.MarkPaid();
await _paymentProvider.CaptureAsync(paymentId, ct);
await _dbContext.SaveChangesAsync(ct);

await transaction.CommitAsync(ct);
```

Problems:

- transaction stays open during network call;
- locks are held longer;
- provider success but DB failure creates inconsistency;
- retries may duplicate external side effects;
- deadlock/blocking risk increases.

Better:

- use payment intent/callback model;
- save state first and process external call asynchronously;
- use outbox;
- use idempotency keys;
- use reconciliation jobs.

## Isolation Levels

Isolation level controls what one transaction can see from another transaction.

Common levels:

- `Read Committed`;
- `Repeatable Read`;
- `Serializable`;
- `Snapshot`.

Practical explanation:

> Higher isolation can reduce anomalies but usually increases locking, blocking, or version-store cost. Choose based on correctness requirements, not by defaulting to the strongest level.

Example:

```csharp
await using var transaction = await _dbContext.Database.BeginTransactionAsync(
    IsolationLevel.Serializable,
    ct);
```

Use carefully. Higher isolation can hurt throughput.

## Optimistic Concurrency

Optimistic concurrency assumes conflicts are rare.

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

Fluent configuration:

```csharp
modelBuilder.Entity<Product>()
    .Property(p => p.RowVersion)
    .IsRowVersion();
```

When EF updates the row, it includes row version in `WHERE`.

Conceptual SQL:

```sql
UPDATE Products
SET Stock = @p0
WHERE Id = @p1
  AND RowVersion = @p2;
```

If no row is affected, EF throws:

```text
DbUpdateConcurrencyException
```

## Handling Concurrency Conflict

Simple API approach:

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

API response:

```http
409 Conflict
```

More detailed approach:

```csharp
catch (DbUpdateConcurrencyException ex)
{
    var entry = ex.Entries.Single();
    var databaseValues = await entry.GetDatabaseValuesAsync(ct);

    if (databaseValues is null)
    {
        throw new NotFoundException("The record was deleted by another user.");
    }

    throw new ConflictException("The record was updated by another user. Please reload and retry.");
}
```

Conflict resolution strategies:

- client wins;
- database wins;
- merge fields;
- reject and ask user to reload;
- retry command if operation is naturally retryable.

For business systems, rejecting with `409` is often safer than silently overwriting.

## Stock Deduction Example

```csharp
public async Task ReserveStockAsync(int productId, int quantity, CancellationToken ct)
{
    var product = await _dbContext.Products
        .FirstOrDefaultAsync(p => p.Id == productId, ct);

    if (product is null)
    {
        throw new NotFoundException("Product not found.");
    }

    if (product.Stock < quantity)
    {
        throw new DomainException("Not enough stock.");
    }

    product.Stock -= quantity;

    try
    {
        await _dbContext.SaveChangesAsync(ct);
    }
    catch (DbUpdateConcurrencyException)
    {
        throw new ConflictException("Stock changed. Please retry.");
    }
}
```

Important:

> RowVersion detects conflicting updates. It does not automatically decide how to resolve the business conflict.

## Set-based Atomic Update Alternative

For stock reservation, an atomic SQL update can be better.

```csharp
var affectedRows = await _dbContext.Products
    .Where(p => p.Id == productId && p.Stock >= quantity)
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(p => p.Stock, p => p.Stock - quantity),
        ct);

if (affectedRows == 0)
{
    throw new ConflictException("Not enough stock or product was changed.");
}
```

Why it helps:

- no read-modify-write race in application memory;
- database checks and updates in one statement;
- avoids loading the entity.

## Pessimistic Locking

EF Core does not expose every provider-specific locking feature through LINQ.

Sometimes raw SQL is used:

```csharp
var product = await _dbContext.Products
    .FromSql($"SELECT * FROM Products WITH (UPDLOCK, ROWLOCK) WHERE Id = {productId}")
    .SingleAsync(ct);
```

SQL Server note:

> `UPDLOCK` can be used to take an update lock while reading, reducing some race conditions but increasing blocking risk.

Use pessimistic locking carefully:

- it can reduce concurrency;
- it can increase deadlock risk;
- it is provider-specific;
- it should be justified by business correctness needs.

## Execution Strategy

Cloud databases can have transient failures.

EF Core execution strategy can retry transient errors.

When using manual transactions with retrying execution strategy, use:

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

Why:

> The execution strategy needs to retry the whole transactional unit, not only one command inside it.

## Complete Example: Order Payment And Outbox

This example keeps database changes atomic and avoids calling an external payment provider while a database transaction is open.

Entities:

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public OrderStatus Status { get; private set; }
    public decimal Total { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = [];

    public void MarkPaymentRequested()
    {
        if (Status != OrderStatus.Submitted)
        {
            throw new DomainException("Only submitted orders can request payment.");
        }

        Status = OrderStatus.PaymentRequested;
    }
}

public sealed class OutboxMessage
{
    public long Id { get; set; }
    public string Type { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }
}
```

Command handler:

```csharp
public sealed class RequestOrderPaymentHandler
{
    private readonly AppDbContext _dbContext;

    public RequestOrderPaymentHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task HandleAsync(int orderId, CancellationToken ct)
    {
        var strategy = _dbContext.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

            var order = await _dbContext.Orders
                .SingleOrDefaultAsync(o => o.Id == orderId, ct);

            if (order is null)
            {
                throw new NotFoundException("Order not found.");
            }

            order.MarkPaymentRequested();

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

            try
            {
                await _dbContext.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                throw new ConflictException("Order was modified by another operation.");
            }

            await transaction.CommitAsync(ct);
        });
    }
}
```

Outbox worker later sends the external request:

```csharp
public sealed class PaymentOutboxWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public PaymentOutboxWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var paymentClient = scope.ServiceProvider.GetRequiredService<IPaymentClient>();

            var messages = await dbContext.OutboxMessages
                .Where(m => m.ProcessedAt == null && m.Type == "OrderPaymentRequested")
                .OrderBy(m => m.Id)
                .Take(20)
                .ToListAsync(stoppingToken);

            foreach (var message in messages)
            {
                await paymentClient.RequestPaymentAsync(message.Payload, stoppingToken);
                message.ProcessedAt = DateTimeOffset.UtcNow;
            }

            await dbContext.SaveChangesAsync(stoppingToken);
        }
    }
}
```

Why this design is safer:

- the order update and outbox insert commit together;
- the external payment call happens outside the database transaction;
- the worker can retry unprocessed outbox messages;
- the payment API should still use idempotency keys to avoid duplicate side effects;
- concurrency conflicts on the order return a clear conflict instead of silently overwriting state.

## Multiple DbContexts

Using multiple `DbContext` instances in one transaction is possible but more complex.

Options:

- share the same database connection and transaction;
- use `TransactionScope`;
- avoid distributed transactions if possible;
- prefer one context per bounded unit of work when practical.

Engineering perspective:

> I avoid distributed transactions where possible. For cross-service consistency, I prefer outbox, idempotency, and eventual consistency patterns.

## Review Questions

### Does `SaveChanges` use a transaction?

Yes, for most relational providers, `SaveChanges` wraps changes in a transaction when needed. Manual transactions are needed for multiple `SaveChanges` or special transaction boundaries.

### What is optimistic concurrency?

Optimistic concurrency assumes conflicts are rare. It checks a version token during update and fails if another transaction changed the row first.

### Why avoid external calls inside DB transactions?

External calls are slow and unreliable. Holding locks while waiting increases contention and can create inconsistent outcomes if the external call succeeds but the database transaction fails.

### What status code should an API return for concurrency conflict?

Usually `409 Conflict`, because the request conflicts with the current state of the resource.

### What is the difference between transaction and concurrency?

A transaction groups operations atomically. Concurrency control handles conflicts when multiple operations interact with the same data at the same time.

### When would you use pessimistic locking?

When conflicts are frequent or the cost of conflict is too high, and the business requires preventing concurrent changes rather than detecting them after the fact. Use carefully because it increases blocking.

## Common Mistakes

### Mistake: Long transactions

Why it is wrong:

> Long transactions hold locks longer and increase blocking, deadlocks, and timeout risk.

Better answer:

> Keep transactions short and limited to database work that truly must be atomic.

### Mistake: External HTTP calls inside transactions

Why it is wrong:

> Network calls are slow and unreliable, while database locks remain held.

Better answer:

> Use outbox, callbacks, idempotency keys, and reconciliation.

### Mistake: No concurrency handling on important updates

Why it is wrong:

> Users can silently overwrite each other's changes.

Better answer:

> Use RowVersion/concurrency tokens and return `409 Conflict` when appropriate.

### Mistake: Catching concurrency exception and silently overwriting

Why it is wrong:

> It hides data loss and violates user expectations.

Better answer:

> Reload, merge, reject, or retry according to business rules.

### Mistake: Manual transactions without retry strategy in cloud environments

Why it is wrong:

> A transient failure may retry only part of the work incorrectly.

Better answer:

> Use EF Core execution strategy to retry the entire transactional unit.

## Practice Task

Implement:

1. product stock with `RowVersion`;
2. concurrent stock update test;
3. `409 Conflict` response;
4. manual transaction with two `SaveChanges`;
5. outbox event saved in same transaction;
6. set-based stock deduction with `ExecuteUpdateAsync`.
