# Kafka Advanced Notes

## Core Idea

Advanced Kafka learning focuses on reliability, ordering, consumer groups, retries, idempotency, and operational trade-offs.

For the foundational Kafka concepts including topics, partitions, producers, consumers, consumer groups, offsets, and basic delivery semantics, see the [Kafka chapter](03-kafka.md). This chapter builds on those concepts with deeper operational and reliability coverage.

## Ordering

Kafka guarantees ordering only within a partition.

If events for the same order must be processed in order, use the same message key:

```text
key = orderId
```

This sends events for the same order to the same partition.

- good per-order ordering;
- hot order/customer keys can create partition imbalance.

## Consumer Group

One partition is consumed by only one consumer in the same consumer group at a time.

If topic has 4 partitions:

- 2 consumers -> each may handle 2 partitions;
- 4 consumers -> each may handle 1 partition;
- 8 consumers -> 4 consumers idle.

Parallelism is limited by partition count.

## Under The Hood: Partition Log, Segments, Replicas

A Kafka partition is an ordered append-only log.

Conceptually:

```text
Topic: orders.created
Partition 0:
  offset 0 -> event A
  offset 1 -> event B
  offset 2 -> event C

Partition 1:
  offset 0 -> event D
  offset 1 -> event E
```

Offsets are unique only within a partition, not globally across a topic.

### Log Segments

Kafka stores partition data in log segments -- contiguous files on disk. Only one segment is **active** (being written to) at a time; older segments are immutable and read-only.

Conceptually:

```text
orders.created-0/
  00000000000000000000.log   <- oldest, sealed
  00000000000001000000.log   <- sealed
  00000000000002000000.log   <- active, being appended to
```

Segments roll over based on configurable criteria: size threshold (e.g., 1 GB) or time window (e.g., 7 days). The segment file name encodes the base offset of the first message in that segment, enabling direct offset-based reads.

Segment files make retention and cleanup practical.

Kafka can remove old segments based on:

- time retention;
- size retention;
- compaction policy for compacted topics.

Kafka is not a queue that deletes a message immediately after consumption. It keeps a log for a retention period, and consumers track progress with offsets.

### Leader, Follower, ISR

Each partition has one leader replica and zero or more follower replicas.

Producer and consumer traffic normally goes through the leader.

Followers replicate data from the leader.

High-level flow:

```text
Producer -> partition leader
Follower replicas copy from leader
Consumer reads from leader
```

`acks=all` means the producer waits for the configured in-sync replication acknowledgement before considering the write successful.

Important trade-off:

- stronger durability requires waiting for more replication;
- lower latency may accept weaker acknowledgement;
- if ISR shrinks, availability and durability trade-offs become important.

### Retention vs Offset

Offsets are progress markers for a consumer group.

Retention controls how long Kafka keeps log data.

If a consumer is offline too long and the old offset falls out of retention, it may no longer be able to resume from that old position.

Consumer offset does not keep data alive forever. Kafka retention controls data availability. If lag exceeds retention, the consumer may lose the ability to replay from its old offset.

## Under The Hood: Consumer Group Coordination

A consumer group needs coordination so partitions are assigned to consumers.

Conceptually:

```text
Consumer group: billing-service
  consumer A -> partitions 0, 1
  consumer B -> partitions 2, 3
```

When membership changes, the group rebalances.

Rebalance triggers:

- consumer starts;
- consumer stops;
- consumer heartbeat fails;
- deployment rolls pods;
- partition count changes.

During rebalance, ownership changes. This is one reason duplicate processing can happen if offsets were not committed.

Practical design:

- avoid very long processing in the poll loop;
- commit processed offsets carefully;
- handle shutdown gracefully;
- monitor rebalance frequency;
- make consumers idempotent.

## Producer Partitioning

The producer chooses a partition.

Common strategies:

- use key hash so same key goes to same partition;
- no key, distribute across partitions;
- custom partitioner for special use cases.

Example:

```text
key = orderId
```

Benefits:

- all events for one order go to the same partition;
- order is preserved for that order.

- hot keys can create hot partitions;
- global ordering is still not guaranteed.

## Offset Commit Strategy

Bad:

```text
commit offset before processing
```

Risk:

- message lost if processing fails after commit.

Common:

```text
process message successfully
commit offset
```

Risk:

- duplicate processing if app crashes after processing but before commit.

Solution:

- idempotent consumer.

## Duplicate Consumption Deep Dive

Duplicate consumption is usually caused by a gap between message processing and offset commit.

Typical cases:

```text
Case 1:
  Database insert succeeds.
  Consumer crashes before offset commit.
  Message is consumed again after restart.

Case 2:
  Consumer processes too slowly.
  Session timeout or rebalance happens.
  Partition moves to another consumer.
  Uncommitted messages are consumed again.

Case 3:
  Offset commit fails due to broker or network issue.
  Consumer restarts from previous committed offset.

Case 4:
  Producer retries because ack was not received.
  The same logical event may appear more than once unless event design handles it.
```

Defense layers:

- stable `eventId`;
- idempotent consumer table;
- unique business constraints;
- manual commit after successful processing;
- retry limit and DLT;
- monitoring duplicate rate;
- correlation ID across producer and consumer logs.

The correct approach is not to prove duplicate delivery can never happen, but to design the consumer so duplicate delivery is harmless.

## Consumption Failure Playbook

When a Kafka consumer cannot consume successfully, diagnose in this order:

1. Check consumer lag by topic, partition, and consumer group.
2. Check whether one partition is stuck on the same offset.
3. Check logs for deserialization, validation, database, or downstream errors.
4. Check processing time per message.
5. Check rebalance frequency.
6. Check offset commit errors.
7. Check retry topic and DLT volume.
8. Check downstream dependency health.

Failure response:

| Problem | Symptom | Response |
|---|---|---|
| Bad schema | deserialization exception | DLT, schema compatibility check |
| Poison message | same offset fails repeatedly | retry limit then DLT |
| Slow DB | lag grows, DB latency high | optimize DB, batch, scale dependency |
| Rebalance loop | frequent partition reassignment | tune processing time and heartbeat/session settings |
| Hot partition | one partition lag high | improve key distribution |
| Commit failure | duplicates after restart | idempotency and commit retry |

## Rebalance Safety

A rebalance can interrupt processing if the consumer does not poll or heartbeat as expected.

Practical design:

- keep per-message processing bounded;
- avoid long synchronous blocking in the consumer loop;
- pause partitions if downstream is overloaded;
- commit processed offsets before graceful shutdown;
- make handlers idempotent because graceful shutdown can still fail;
- monitor rebalance count.

Rebalance is normal, but frequent rebalance is a production smell. Check processing duration, heartbeat/session settings, consumer crashes, deployment churn, and partition assignment behavior.

## Retry Strategies

### Immediate Retry

Good for transient errors.

Bad if dependency is down.

### Retry Topic

Flow:

```text
main topic -> consumer fails -> retry topic -> retry consumer -> main handling
```

### Dead-letter Topic

After max attempts:

```text
orders.created.DLT
```

Store:

- original message;
- error;
- attempt count;
- timestamp.

## Retry Design Details

Retry should match the failure type.

Transient failures:

- database deadlock;
- temporary HTTP 503;
- network timeout;
- rate limit.

Use retry with exponential backoff and jitter.

Permanent failures:

- invalid event schema;
- missing required business field;
- unsupported event version.

Send to DLT or quarantine quickly.

Poison message:

- always causes the same handler failure;
- blocks the partition if retried forever.

Use max attempts and DLT.

Example retry topics:

```text
orders.created
orders.created.retry.1m
orders.created.retry.10m
orders.created.retry.1h
orders.created.dlt
```

A retry topic changes timing and may affect strict ordering. If strict per-key ordering is required, retry design needs extra care because later messages for the same key may overtake the failed message.

## Idempotent Consumer

This pattern is covered in detail in the [Kafka chapter](03-kafka.md#idempotent-consumer). The same approach applies: use an event ID table with a primary key constraint, and commit the business change and processed-message marker in the same transaction.

## Outbox Pattern

This pattern is covered in detail in the [Kafka chapter](03-kafka.md#outbox-pattern). The same concept -- saving both business data and an outbox event in a single database transaction, then publishing asynchronously -- applies across all Kafka-based systems.

## Consumer Lag

Consumer lag means consumers are behind producers.

Causes:

- consumers too slow;
- not enough partitions;
- downstream dependency slow;
- message spike;
- poison messages;
- rebalance issues.

Solutions:

- optimize consumer processing;
- increase consumer instances up to partition count;
- increase partitions;
- batch processing;
- fix downstream bottlenecks;
- isolate poison messages.

## Kafka vs RabbitMQ vs Azure Service Bus

Kafka:

- event streaming;
- replayable log;
- high throughput;
- multiple independent consumers;
- analytics pipelines.

RabbitMQ:

- flexible routing;
- command queues;
- work distribution;
- lower operational entry barrier.

Azure Service Bus:

- managed enterprise broker;
- queues/topics;
- dead-letter;
- duplicate detection;
- sessions;
- integrates well with Azure.

The advanced Kafka patterns covered here -- idempotent consumption, retry topology design, outbox-based publishing, and consumer lag diagnosis -- equip engineering teams to build resilient event-driven systems at scale.
