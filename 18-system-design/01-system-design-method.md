# System Design Method

## Core Idea

System design is the practice of designing software under constraints.

It is not only about naming technologies. A good design explains:

- requirement clarification;
- trade-off reasoning;
- API and data modeling;
- scalability;
- reliability;
- security;
- operational awareness.

## System Design Framework

Use this structure:

1. Clarify requirements.
2. Define scope.
3. Estimate scale.
4. Design APIs.
5. Design data model.
6. Create high-level architecture.
7. Deep dive into critical components.
8. Discuss bottlenecks and trade-offs.
9. Discuss reliability, security, monitoring, and deployment.

## Step 1: Clarify Requirements

Ask questions before designing.

Example for notification system:

- Real-time or delayed?
- Delivery guarantee?
- User preferences?
- Retry requirement?
- Compliance requirements?

Good engineering behavior:

> Before designing, clarify the scope. Are we designing only the backend notification pipeline, or also user preference management and provider integration?

## Step 2: Functional Requirements

Example notification system:

- send notification;
- store templates;
- manage user preferences;
- support email/SMS/push;
- retry failed delivery;
- view delivery status.

## Step 3: Non-functional Requirements

Examples:

- availability: 99.9%;
- latency: important notifications delivered within 5 seconds;
- throughput: 10,000 notifications per second;
- durability: no accepted notification should be lost;
- scalability: horizontally scalable workers;
- observability: logs, metrics, traces;
- security: protect PII.

## Step 4: Capacity Estimation

Example:

```text
Users: 10 million
Daily active users: 2 million
Average notifications per active user per day: 5
Total notifications per day: 10 million
Average per second: 10,000,000 / 86,400 ~= 116/sec
Peak factor: 20x
Peak throughput: ~2,300/sec
```

Storage:

```text
Notification record size: 1 KB
10 million/day = 10 GB/day
Retention: 90 days = 900 GB
```

Engineering note:

Numbers do not need to be perfect. They should guide architecture.

## Capacity Estimation Method

Capacity estimates do not need to be precise. Their purpose is to identify the likely bottlenecks before any code is written, so the architecture can address them early.

### Derivation Chain

```text
Daily traffic -> average QPS -> peak QPS
Record size -> daily storage -> retention storage
Read/write ratio -> cache and database pressure
Fanout factor -> queue and worker pressure
```

### Example: Notification System

```text
Users:                         10 million
Daily active users (DAU):      2 million (20% of total)
Avg. notifications/active user: 5
Total notifications/day:       10 million
Average QPS:                   10,000,000 / 86,400 ~= 116/sec
Peak factor (DAU concentrated): 20x
Peak QPS:                      ~2,300/sec

If each notification fans out to 2 channels (email + push):
Peak delivery jobs:            4,600/sec
```

This estimate immediately reveals that the system needs horizontally scalable workers, a message queue that can sustain ~5,000 messages per second, and provider integrations that can handle peak throughput without being overwhelmed. The 20x peak factor means the system must scale up quickly during business hours or promotional events.

### Why Peak Factor Matters

The peak-to-average ratio varies by domain. An e-commerce site may see 1-2x on a normal day but 50x on Black Friday. A business-hours B2B application may see 4x concentrated in 8 hours. Choose a peak factor that matches the system's traffic pattern, and test against that peak -- average-case estimates hide scaling requirements.

### Storage Estimation

```text
Notification record:     1 KB
Daily storage:           10 GB
90-day retention:        900 GB
Index overhead (approx): 100-200 GB
Total storage estimate:  ~1.1 TB
```

This determines the database tier and whether archival/purging strategies are needed for the 90-day retention target.

## Step 5: API Design

```http
POST /api/notifications
Content-Type: application/json

{
  "userId": "123",
  "type": "OrderShipped",
  "channels": ["email", "push"],
  "data": {
    "orderId": "A1001"
  },
  "idempotencyKey": "order-shipped-A1001-user-123"
}
```

Response:

```http
202 Accepted

{
  "notificationId": "n-789",
  "status": "Accepted"
}
```

A `202 Accepted` response signals that the request is accepted for asynchronous processing, not fully delivered yet.

## Step 6: Data Model

```sql
CREATE TABLE Notifications
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    UserId NVARCHAR(100) NOT NULL,
    Type NVARCHAR(100) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    IdempotencyKey NVARCHAR(200) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL
);

CREATE UNIQUE INDEX UX_Notifications_IdempotencyKey
ON Notifications (IdempotencyKey);
```

Delivery attempts:

```sql
CREATE TABLE NotificationDeliveries
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    NotificationId UNIQUEIDENTIFIER NOT NULL,
    Channel NVARCHAR(50) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    AttemptCount INT NOT NULL,
    LastError NVARCHAR(MAX) NULL,
    NextRetryAt DATETIMEOFFSET NULL
);
```

## Step 7: High-level Architecture

```text
Client
  -> API Gateway
  -> Notification API
  -> Database
  -> Message Queue
  -> Email Worker
  -> SMS Worker
  -> Push Worker
  -> External Providers
```

Important components:

- API validates request and stores notification.
- Queue decouples API from delivery.
- Workers process asynchronously.
- Retry and dead-letter queue handle failures.
- Monitoring tracks success rate and lag.

## Step 7.5: Sequence Flow

A sequence flow explains how components cooperate.

```text
Client
  -> Notification API validates request
  -> DB inserts notification and delivery records
  -> Outbox record is inserted in same transaction
  -> Outbox worker publishes message
  -> Channel worker sends provider request
  -> Delivery status is updated
  -> Metrics and logs are emitted
```

Sequence flows are useful because they reveal transaction boundaries and failure points.

## Step 8: Deep Dive Topics

If client retries the same request, system should not create duplicate notifications.

Use:

- idempotency key;
- unique database constraint;
- return existing result if duplicate.

### Retry

Use exponential backoff:

```text
1 min -> 5 min -> 15 min -> 1 hour
```

Avoid infinite immediate retries.

### Dead-letter Queue

Messages that repeatedly fail go to DLQ for inspection.

### Provider Failure

If email provider is down:

- retry later;
- switch provider if supported;
- alert operations team;
- avoid blocking API requests.

## Step 9: Trade-offs

Synchronous delivery:

- simpler;
- immediate result;
- poor latency and reliability under provider issues.

Asynchronous delivery:

- more complex;
- needs queue and workers;
- better resilience and scalability.

## Step 10: Failure Modes

Every serious design should discuss failure.

Example notification failures:

| Failure | Handling |
|---|---|
| API receives duplicate request | idempotency key |
| database commit succeeds but publish fails | outbox pattern |
| provider is down | retry with backoff, provider failover |
| worker crashes during send | message retry, idempotent consumer |
| poison message | dead-letter queue |
| queue grows | autoscale workers, alert |
| user disables channel | preference check before send |

## Step 11: Observability

Design metrics before the system is built.

Useful metrics:

```text
notification.accepted.count
notification.delivery.success.count
notification.delivery.failure.count
notification.delivery.duration
notification.queue.lag
notification.dlq.count
provider.email.latency
provider.email.error_rate
```

Logs should include:

- correlation ID;
- notification ID;
- user/tenant ID when safe;
- provider;
- delivery attempt;
- error category.

## Step 12: Security And Privacy

Every system design must address data protection, access control, and compliance. The specific concerns depend on the data the system processes.

Key questions to address:

- **Authentication**: how does the system verify the identity of callers? (API keys, OAuth2, JWT, mutual TLS)
- **Authorization**: what can each authenticated caller do? (RBAC, ABAC, per-resource ACLs)
- **Data in transit**: is all communication encrypted? (TLS 1.2+)
- **Data at rest**: is sensitive data encrypted in the database or object storage?
- **Secrets management**: how are API keys, database credentials, and provider tokens stored and rotated?
- **Audit trail**: are state-changing operations logged with identity, timestamp, and before/after state?
- **Compliance**: does the system handle regulated data (PII, PCI, HIPAA)? If so, what specific controls are required (retention limits, access logs, right-to-delete)?
- **Least privilege**: do service-to-service calls use only the permissions they need?

## ADR Example

Architecture Decision Records keep decisions understandable later.

```md
# ADR-003: Use Asynchronous Notification Delivery

## Context

Notification providers can be slow or unavailable. The API must accept requests quickly and reliably.

## Decision

Store notification records in SQL Server, write outbox messages in the same transaction, and deliver through queue-backed workers.

## Consequences

Delivery is eventually consistent. The system needs retry, DLQ, worker monitoring, and user-visible delivery status.

## Revisit When

Provider latency becomes negligible or product requires synchronous delivery confirmation.
```

## Common System Design Building Blocks

- Load balancer
- API Gateway
- Cache
- Database
- Read replica
- Message queue
- Worker
- Object storage
- CDN
- Search engine
- Rate limiter
- Monitoring

## Engineering Checklist

For any design, mention:

- idempotency;
- retry and backoff;
- timeout;
- rate limiting;
- data consistency;
- observability;
- deployment and rollback;
- security and privacy;
- cost and operational complexity.
