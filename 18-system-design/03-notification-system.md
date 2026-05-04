# Notification System Design

## Problem

Design a notification system that can send email, SMS, push, and in-app notifications.

Chinese notes:

- `notification`: 通知.
- `provider`: 第三方服务商.
- `retry`: 重试.
- `dead-letter queue`: 死信队列.

## Requirements

Functional:

- send notifications through multiple channels;
- support templates;
- support user preferences;
- retry failed delivery;
- track delivery status;
- support scheduled notifications.

Non-functional:

- reliable delivery;
- scalable workers;
- low latency for urgent notifications;
- provider failure tolerance;
- observability;
- privacy and compliance.

## API Design

```http
POST /api/notifications
Content-Type: application/json

{
  "userId": "123",
  "type": "OrderShipped",
  "channels": ["email", "push"],
  "templateData": {
    "orderId": "A1001"
  },
  "idempotencyKey": "order-shipped-A1001-user-123"
}
```

Response:

```http
202 Accepted

{
  "notificationId": "n-123",
  "status": "Accepted"
}
```

## High-level Architecture

```text
Client / Service
  -> Notification API
  -> Database
  -> Message Queue
  -> Email Worker -> Email Provider
  -> SMS Worker   -> SMS Provider
  -> Push Worker  -> Push Provider
```

## Data Model

```sql
CREATE TABLE Notifications
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    UserId NVARCHAR(100) NOT NULL,
    Type NVARCHAR(100) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    IdempotencyKey NVARCHAR(200) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);

CREATE UNIQUE INDEX UX_Notifications_IdempotencyKey
ON Notifications (IdempotencyKey);
```

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

Add an outbox table so database write and message publication are reliable.

```sql
CREATE TABLE OutboxMessages
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    Type NVARCHAR(200) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    PublishedAt DATETIMEOFFSET NULL,
    RetryCount INT NOT NULL DEFAULT 0
);
```

## Queue Message Contract

```csharp
public sealed record NotificationDeliveryRequested(
    Guid MessageId,
    Guid NotificationId,
    Guid DeliveryId,
    string UserId,
    string Channel,
    string NotificationType,
    int Attempt);
```

Keep the message contract stable and small. The worker can load full details from the database when needed.

## Template Design

Templates:

```text
OrderShipped.Email.Subject
OrderShipped.Email.Body
OrderShipped.Push.Title
OrderShipped.Push.Body
```

Version templates to avoid breaking old notifications.

## User Preferences

Users may disable certain channels.

```sql
CREATE TABLE NotificationPreferences
(
    UserId NVARCHAR(100) NOT NULL,
    NotificationType NVARCHAR(100) NOT NULL,
    Channel NVARCHAR(50) NOT NULL,
    IsEnabled BIT NOT NULL,
    PRIMARY KEY (UserId, NotificationType, Channel)
);
```

## Retry Strategy

Use exponential backoff:

```text
1 minute
5 minutes
15 minutes
1 hour
```

After max attempts, send to dead-letter queue or mark failed.

## Idempotency

Use idempotency key to prevent duplicate notification creation.

Workers should also be idempotent because queue messages may be delivered more than once.

## Provider Failure

If provider is down:

- retry later;
- use secondary provider for high-priority notifications;
- alert on high failure rate;
- avoid blocking API.

## Worker Flow

```text
1. Receive delivery message.
2. Check whether delivery is already completed.
3. Check user preference.
4. Render template.
5. Send provider request with timeout.
6. Mark delivery as succeeded or schedule retry.
7. Emit metrics.
```

Example worker method:

```csharp
public async Task HandleAsync(
    NotificationDeliveryRequested message,
    CancellationToken ct)
{
    var delivery = await _dbContext.NotificationDeliveries
        .FirstOrDefaultAsync(x => x.Id == message.DeliveryId, ct);

    if (delivery is null || delivery.Status == "Succeeded")
    {
        return;
    }

    try
    {
        await _provider.SendAsync(delivery, ct);
        delivery.Status = "Succeeded";
    }
    catch (Exception ex)
    {
        delivery.AttemptCount++;
        delivery.LastError = ex.Message;
        delivery.NextRetryAt = CalculateNextRetry(delivery.AttemptCount);
        delivery.Status = delivery.AttemptCount >= 5 ? "Failed" : "RetryScheduled";
    }

    await _dbContext.SaveChangesAsync(ct);
}
```

## Scheduled Notifications

Add schedule fields:

```sql
ALTER TABLE Notifications
ADD ScheduledAt DATETIMEOFFSET NULL;
```

A scheduler scans due records and enqueues delivery messages. Use row claiming or status transitions to prevent multiple workers from scheduling the same notification.

## Privacy

Notifications often contain sensitive data.

Do:

- store only needed template data;
- encrypt sensitive provider tokens;
- avoid logging message body;
- apply retention policy;
- audit admin access.

## Knowledge Checks

### Why use queue?

> Sending notifications depends on external providers and may be slow or unreliable. A queue decouples API latency from delivery and allows retry, buffering, and scaling workers independently.

### How do you avoid duplicate notifications?

> Use idempotency keys at API level and idempotent processing at worker level. Store delivery attempts and unique external message identifiers where possible.

### How do you monitor it?

> Track queue depth, delivery success rate, provider latency, retry count, dead-letter count, and per-channel failure rate.

## Common Mistakes

- Sending directly inside request path.
- No retry limit.
- No idempotency.
- No user preference check.
- No provider failure handling.
- Logging sensitive message content.
- No monitoring for dead-letter queue.

## Practice Task

Design and implement:

1. notification API;
2. notification database tables;
3. queue message contract;
4. email worker;
5. retry policy;
6. dead-letter handling;
7. dashboard metrics.
