# Event-Driven Architecture

## Core Idea

Event-driven architecture uses events to communicate that something happened.

Chinese notes:

- `event`: 事件.
- `producer`: 生产者.
- `consumer`: 消费者.
- `eventual consistency`: 最终一致性.

Example events:

```text
OrderCreated
PaymentCaptured
UserRegistered
FileUploaded
```

## Event vs Command

Command:

```text
ApproveOrder
```

An instruction to do something.

Event:

```text
OrderApproved
```

A fact that something already happened.

## Why Use Events?

Benefits:

- decouples services/modules;
- supports async processing;
- improves resilience;
- enables multiple consumers;
- supports audit and analytics.

Costs:

- eventual consistency;
- harder debugging;
- duplicate messages;
- ordering issues;
- schema evolution.

## Example Flow

```text
Order API
  -> saves order
  -> publishes OrderCreated
  -> Notification Consumer sends email
  -> Analytics Consumer updates dashboard
  -> Billing Consumer creates invoice
```

## Domain Event vs Integration Event

Domain event:

- inside domain/application boundary;
- expresses business event.

Integration event:

- published to other services/modules;
- part of external contract.

Example:

```csharp
public sealed record OrderSubmittedDomainEvent(int OrderId);
```

```csharp
public sealed record OrderSubmittedIntegrationEvent(
    int OrderId,
    decimal Total,
    DateTimeOffset SubmittedAt);
```

## Outbox Pattern

Use outbox to reliably publish events after database commit.

```text
Transaction:
  save business data
  save outbox message

Background worker:
  read outbox
  publish message
  mark as published
```

## Outbox Table Example

```sql
CREATE TABLE OutboxMessages
(
    Id uniqueidentifier NOT NULL PRIMARY KEY,
    Type nvarchar(300) NOT NULL,
    Content nvarchar(max) NOT NULL,
    OccurredAt datetimeoffset NOT NULL,
    ProcessedAt datetimeoffset NULL,
    Error nvarchar(max) NULL,
    RetryCount int NOT NULL DEFAULT 0
);

CREATE INDEX IX_OutboxMessages_ProcessedAt_OccurredAt
ON OutboxMessages (ProcessedAt, OccurredAt);
```

Save business data and outbox message in the same transaction:

```csharp
public sealed class SubmitOrderHandler
{
    private readonly AppDbContext _dbContext;

    public SubmitOrderHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task HandleAsync(SubmitOrderCommand command, CancellationToken ct)
    {
        var order = await _dbContext.Orders
            .FirstOrDefaultAsync(x => x.Id == command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        order.Submit(DateTimeOffset.UtcNow);

        var integrationEvent = new OrderSubmittedIntegrationEvent(
            Guid.NewGuid(),
            order.Id,
            order.Total,
            DateTimeOffset.UtcNow);

        _dbContext.OutboxMessages.Add(OutboxMessage.From(integrationEvent));

        await _dbContext.SaveChangesAsync(ct);
    }
}
```

```csharp
public sealed class OutboxMessage
{
    public Guid Id { get; private set; }
    public string Type { get; private set; } = string.Empty;
    public string Content { get; private set; } = string.Empty;
    public DateTimeOffset OccurredAt { get; private set; }
    public DateTimeOffset? ProcessedAt { get; private set; }
    public string? Error { get; private set; }
    public int RetryCount { get; private set; }

    public static OutboxMessage From<T>(T message)
    {
        return new OutboxMessage
        {
            Id = Guid.NewGuid(),
            Type = typeof(T).FullName!,
            Content = JsonSerializer.Serialize(message),
            OccurredAt = DateTimeOffset.UtcNow
        };
    }

    public void MarkProcessed(DateTimeOffset now)
    {
        ProcessedAt = now;
        Error = null;
    }

    public void MarkFailed(string error)
    {
        RetryCount += 1;
        Error = error;
    }
}
```

## Outbox Publisher Worker

```csharp
public sealed class OutboxPublisherWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxPublisherWorker> _logger;

    public OutboxPublisherWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxPublisherWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await PublishBatchAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task PublishBatchAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();

        var messages = await dbContext.OutboxMessages
            .Where(x => x.ProcessedAt == null && x.RetryCount < 10)
            .OrderBy(x => x.OccurredAt)
            .Take(50)
            .ToListAsync(ct);

        foreach (var message in messages)
        {
            try
            {
                await publisher.PublishAsync(message.Type, message.Content, ct);
                message.MarkProcessed(DateTimeOffset.UtcNow);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to publish outbox message {MessageId}", message.Id);
                message.MarkFailed(ex.Message);
            }
        }

        await dbContext.SaveChangesAsync(ct);
    }
}
```

The outbox pattern gives at-least-once delivery. Consumers still need idempotency.

## Consumer Idempotency

Consumers must handle duplicate events.

Use:

- processed message table;
- unique constraints;
- natural idempotent operation;
- event ID.

## Inbox Table Example

```sql
CREATE TABLE ProcessedMessages
(
    MessageId uniqueidentifier NOT NULL PRIMARY KEY,
    ConsumerName nvarchar(200) NOT NULL,
    ProcessedAt datetimeoffset NOT NULL
);
```

Consumer:

```csharp
public sealed class OrderSubmittedConsumer
{
    private const string ConsumerName = "billing.order-submitted";
    private readonly BillingDbContext _dbContext;

    public OrderSubmittedConsumer(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task ConsumeAsync(OrderSubmittedIntegrationEvent message, CancellationToken ct)
    {
        var alreadyProcessed = await _dbContext.ProcessedMessages
            .AnyAsync(x =>
                x.MessageId == message.MessageId &&
                x.ConsumerName == ConsumerName,
                ct);

        if (alreadyProcessed)
        {
            return;
        }

        _dbContext.Invoices.Add(new Invoice
        {
            OrderId = message.OrderId,
            Amount = message.Total,
            Status = InvoiceStatus.Pending
        });

        _dbContext.ProcessedMessages.Add(new ProcessedMessage
        {
            MessageId = message.MessageId,
            ConsumerName = ConsumerName,
            ProcessedAt = DateTimeOffset.UtcNow
        });

        await _dbContext.SaveChangesAsync(ct);
    }
}
```

The unique primary key protects against duplicate effects even if the same message is delivered multiple times.

## Event Contract Design

Events are contracts. Design them carefully.

Good event contract:

```csharp
public sealed record OrderSubmittedIntegrationEvent(
    Guid MessageId,
    int SchemaVersion,
    int OrderId,
    string OrderNumber,
    decimal Total,
    string Currency,
    DateTimeOffset SubmittedAt);
```

Include:

- stable message ID;
- schema version;
- aggregate ID;
- event timestamp;
- enough data for consumers;
- no sensitive data unless required and protected;
- no huge object graph.

## Event Versioning

Prefer additive changes.

Version 1:

```json
{
  "messageId": "9e477fa0-8051-4e8e-a958-8fb90eb5a5df",
  "schemaVersion": 1,
  "orderId": 123,
  "total": 49.99
}
```

Version 2 adds `currency`:

```json
{
  "messageId": "9e477fa0-8051-4e8e-a958-8fb90eb5a5df",
  "schemaVersion": 2,
  "orderId": 123,
  "total": 49.99,
  "currency": "USD"
}
```

Avoid removing or renaming fields without a migration period.

## Knowledge Checks

### What is event-driven architecture?

It is an architecture where components communicate by publishing and consuming events that represent facts that happened in the system.

### What are the trade-offs?

It decouples components and improves async scalability, but introduces eventual consistency, duplicate delivery, ordering challenges, and harder debugging.

### Domain event vs integration event?

Domain events are internal business events. Integration events are external contracts published to other systems.

## Common Mistakes

- Treating events as synchronous commands.
- No idempotent consumers.
- No schema versioning.
- No dead-letter strategy.
- Publishing event outside transaction without outbox.
- Events too large or too vague.

## Practice Task

Design:

1. `OrderSubmitted` domain event;
2. integration event contract;
3. outbox table;
4. publisher worker;
5. idempotent consumer;
6. dead-letter handling.
