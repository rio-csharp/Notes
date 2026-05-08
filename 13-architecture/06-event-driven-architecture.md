# Event-Driven Architecture

## Core Idea

Event-driven architecture uses events to communicate that something happened.

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

## Event Benefits And Costs

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
        var deadLetterQueue = scope.ServiceProvider.GetRequiredService<IDeadLetterQueue>();

        var messages = await dbContext.OutboxMessages
            .Where(x => x.ProcessedAt == null)
            .OrderBy(x => x.OccurredAt)
            .Take(50)
            .ToListAsync(ct);

        foreach (var message in messages)
        {
            if (message.RetryCount >= 10)
            {
                await deadLetterQueue.PublishAsync(message, ct);
                message.MarkDeadLettered(DateTimeOffset.UtcNow);
                continue;
            }

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

A well-designed event contract includes several key fields:

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

Good contracts contain:

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

## Schema Registry

As the number of event types grows, a schema registry becomes valuable. A schema registry stores event schemas and their versions so producers and consumers can validate messages before processing. In the .NET ecosystem, options include Confluent Schema Registry (when using Kafka) or simpler approaches such as publishing contract NuGet packages from a shared repository.

Without a registry, schema changes are harder to track: a producer may add a field that a consumer cannot parse, or a consumer may expect a field that a producer removed. A registry catches these mismatches at build or deploy time rather than at runtime.

## Dead-Letter Handling

Messages that cannot be processed after retry exhaustion must not be silently dropped. A dead-letter queue (DLQ) captures them for inspection and recovery.

The `PublishBatchAsync` method above includes dead-letter logic: when a message's `RetryCount` reaches 10, the publisher moves it to a dead-letter destination rather than leaving it in the outbox table indefinitely. The query no longer filters by retry count, so exhausted messages are fetched, dead-lettered, and marked rather than skipped silently.

DLQ messages should be surfaced through monitoring so operators can investigate and replay after fixing the root cause. A DLQ without alerting becomes a silent data loss mechanism.

## Event Sourcing vs Event-Driven Architecture

Event-driven architecture and event sourcing are distinct concepts that are sometimes conflated.

Event-driven architecture uses events for communication between components. The events notify other parts of the system that something happened; the source of truth is still the current state stored in a database.

Event sourcing persists state as a sequence of events rather than storing current state directly. The current state is reconstructed by replaying events. Event sourcing is a persistence strategy, not a communication pattern — though it pairs naturally with event-driven design because the event store can also feed integration events.

Most systems benefit from event-driven architecture without event sourcing. Event sourcing adds complexity (snapshots, projections, replay) and is appropriate when audit history, temporal queries, or full rebuild capability are required.

## Event-Driven Architecture Summary

Event-driven architecture decouples components by communicating through events rather than direct calls. Reliable event publishing relies on the outbox pattern to ensure at-least-once delivery, while consumer idempotency protects against duplicate processing. Schema versioning, dead-letter queues, and monitoring are essential operational concerns that determine whether an event-driven system remains maintainable as it grows.
