# Kafka

## Core Idea

Kafka is a distributed event streaming platform.

It is commonly used for:

- event-driven architecture;
- asynchronous communication;
- log/event pipelines;
- analytics ingestion;
- integration between services.

## Core Concepts

### Broker

A Kafka server.

Kafka clusters contain multiple brokers.

### Topic

A named stream of records.

Example:

```text
orders.created
payments.completed
users.registered
```

### Partition

A topic is split into partitions.

Benefits:

- parallelism;
- scalability;
- ordering within a partition.

Important:

Kafka guarantees order within a partition, not across the whole topic.

### Producer

Writes messages to Kafka.

### Consumer

Reads messages from Kafka.

### Consumer Group

Consumers in the same group share work.

If a topic has 6 partitions and a consumer group has 3 consumers, each consumer may process 2 partitions.

### Offset

An offset identifies a message position inside a partition.

Consumers commit offsets to record progress.

## Under The Hood: Duplicate Consumption And Failed Consumption

Kafka does not remove a message when a consumer reads it. Kafka stores messages in an append-only partition log, and each consumer group records progress by committing offsets.

Conceptual model:

```text
Topic: orders.created
Partition: 0

offset 100 -> OrderCreated A
offset 101 -> OrderCreated B
offset 102 -> OrderCreated C

Consumer group billing-service committed offset: 100
Next message to process: 101
```

Common timeline:

```text
1. Consumer reads message at offset 101.
2. Consumer writes invoice to database successfully.
3. Consumer crashes before committing offset 101.
4. Consumer restarts.
5. Kafka delivers offset 101 again.
6. The same business message is processed again.
```

This is not an unusual Kafka bug. It is a normal risk in at-least-once delivery.

Engineering perspective:

> I assume Kafka messages can be delivered more than once. I commit offsets only after successful processing, and I make consumers idempotent using event IDs, processed-message tables, and unique business constraints.

Consumption can fail for different reasons:

| Failure Type | Example | Typical Response |
|---|---|---|
| Deserialization error | invalid JSON, incompatible schema | send to DLT or quarantine |
| Business validation error | missing required field | DLT with reason |
| Transient dependency error | database timeout, HTTP 503 | retry with backoff |
| Permanent dependency error | referenced entity never exists | DLT or manual repair |
| Poison message | same message always crashes handler | retry limit, then DLT |
| Consumer too slow | lag keeps growing | scale, batch, optimize |
| Rebalance issue | partitions constantly reassigned | tune processing, heartbeat/session, shutdown |
| Offset commit failure | duplicates after restart | idempotency and commit retry |

Key point:

> The first step is to classify the failure. Retrying everything forever can block a partition and make consumer lag worse.

## Offset Commit Strategy

### Commit Before Processing

```text
read message
commit offset
process message
```

Risk:

- if processing fails after commit, the message is lost from this consumer group's perspective.

This is at-most-once behavior.

### Commit After Processing

```text
read message
process message
commit offset
```

Risk:

- if processing succeeds but the app crashes before commit, the message can be processed again.

This is at-least-once behavior and is common for business systems.

### Auto Commit

Auto commit periodically commits offsets.

Risk:

- the offset may be committed before the business operation truly succeeds;
- failure behavior becomes harder to reason about.

For important business workflows, prefer manual commit after successful processing.

## Rebalance And Duplicate Processing

Causes:

- a consumer starts;
- a consumer stops;
- a consumer crashes;
- heartbeat/session timeout is exceeded;
- partitions are added.

If a consumer processed messages but did not commit before losing partition ownership, another consumer may process those messages again.

Design implications:

- keep message processing time bounded;
- avoid blocking the consumer loop for too long;
- commit after successful processing;
- handle shutdown gracefully;
- make handlers idempotent;
- monitor rebalance frequency.

## Retry Topic And Dead-Letter Topic

Do not retry forever inside the main partition.

Bad:

```text
orders.created partition 0
  offset 100 poison message
  offset 101 normal message
  offset 102 normal message

Consumer retries offset 100 forever.
Offsets 101 and 102 are blocked.
```

Better:

```text
orders.created
  -> processing fails
  -> orders.created.retry.1m
  -> orders.created.retry.10m
  -> orders.created.dlt
```

A DLT message should keep enough metadata for investigation:

- original topic;
- partition;
- offset;
- key;
- payload;
- error message;
- attempt count;
- failed time;
- correlation ID.

Example:

```json
{
  "originalTopic": "orders.created",
  "originalPartition": 0,
  "originalOffset": 101,
  "key": "123",
  "error": "Customer account not found",
  "attempt": 5,
  "failedAt": "2026-04-30T10:20:00Z"
}
```

## Message Key And Ordering

Producer can send a key:

```text
key = orderId
```

Messages with the same key usually go to the same partition, preserving order for that key.

Use this for:

- order events;
- user events;
- account events.

## Delivery Semantics

### At most once

Message may be lost but not processed twice.

### At least once

Message will not be lost if committed correctly, but may be processed more than once.

Most common in business systems.

### Exactly once

Kafka supports exactly-once semantics in specific Kafka-to-Kafka workflows, but end-to-end exactly-once with databases and external systems is still hard.

Engineering perspective:

> In business systems, I usually design for at-least-once delivery and make consumers idempotent.

## Producer Example With Confluent.Kafka

```csharp
public sealed class OrderEventProducer
{
    private readonly IProducer<string, string> _producer;

    public OrderEventProducer(IProducer<string, string> producer)
    {
        _producer = producer;
    }

    public async Task PublishOrderCreatedAsync(OrderCreatedEvent evt, CancellationToken ct)
    {
        var message = new Message<string, string>
        {
            Key = evt.OrderId.ToString(),
            Value = JsonSerializer.Serialize(evt)
        };

        await _producer.ProduceAsync("orders.created", message, ct);
    }
}
```

Registration:

```csharp
builder.Services.AddSingleton<IProducer<string, string>>(_ =>
{
    var config = new ProducerConfig
    {
        BootstrapServers = "localhost:9092",
        EnableIdempotence = true,
        Acks = Acks.All
    };

    return new ProducerBuilder<string, string>(config).Build();
});
```

## Consumer Example

```csharp
public sealed class OrderCreatedConsumer : BackgroundService
{
    private readonly ILogger<OrderCreatedConsumer> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public OrderCreatedConsumer(
        ILogger<OrderCreatedConsumer> logger,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = "localhost:9092",
            GroupId = "billing-service",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe("orders.created");

        while (!stoppingToken.IsCancellationRequested)
        {
            var result = consumer.Consume(stoppingToken);

            try
            {
                var evt = JsonSerializer.Deserialize<OrderCreatedEvent>(result.Message.Value)
                    ?? throw new InvalidOperationException("Invalid event");

                using var scope = _scopeFactory.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<OrderCreatedHandler>();

                await handler.HandleAsync(evt, stoppingToken);

                consumer.Commit(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process Kafka message at {Offset}", result.Offset);
                // send to retry topic or dead-letter topic in production
            }
        }
    }
}
```

## Idempotent Consumer

Because messages can be processed more than once, consumers must be idempotent.

Example table:

```sql
CREATE TABLE ProcessedMessages
(
    MessageId NVARCHAR(100) PRIMARY KEY,
    ProcessedAt DATETIMEOFFSET NOT NULL
);
```

Handler:

```csharp
public async Task HandleAsync(OrderCreatedEvent evt, CancellationToken ct)
{
    var alreadyProcessed = await _dbContext.ProcessedMessages
        .AnyAsync(m => m.MessageId == evt.EventId, ct);

    if (alreadyProcessed)
    {
        return;
    }

    _dbContext.Invoices.Add(new Invoice
    {
        OrderId = evt.OrderId,
        Amount = evt.Total,
        CreatedAt = DateTimeOffset.UtcNow
    });

    _dbContext.ProcessedMessages.Add(new ProcessedMessage
    {
        MessageId = evt.EventId,
        ProcessedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);
}
```

## Outbox Pattern

Problem:

```text
Save order to database
Publish event to Kafka
```

If database save succeeds but Kafka publish fails, the system is inconsistent.

Outbox solution:

1. Save business data and outbox event in the same database transaction.
2. Background worker reads outbox table.
3. Worker publishes event to Kafka.
4. Worker marks event as published.

Outbox table:

```sql
CREATE TABLE OutboxMessages
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    Type NVARCHAR(200) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    PublishedAt DATETIMEOFFSET NULL
);
```

## Kafka vs RabbitMQ

Kafka:

- event streaming;
- high throughput;
- persistent log;
- replayable events;
- partition-based scale;
- great for analytics and event-driven systems.

RabbitMQ:

- traditional message broker;
- flexible routing;
- work queues;
- request/reply;
- lower-latency task distribution;
- easier for many business queue scenarios.

Engineering perspective:

> I choose Kafka when I need durable event streams, replay, high throughput, and event-driven integration. I choose RabbitMQ or Azure Service Bus when I need command-style queues, routing, delayed messages, and simpler business workflow messaging.

## Practice Task

Build:

1. `orders.created` producer;
2. consumer that creates invoices;
3. processed message table for idempotency;
4. retry topic;
5. dead-letter topic;
6. consumer lag monitoring plan.
