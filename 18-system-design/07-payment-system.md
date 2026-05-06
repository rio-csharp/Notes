# Payment System Design

## Problem

Design a payment system that supports payment creation, provider integration, callbacks, refunds, idempotency, and reconciliation.

## Requirements

Functional:

- create payment;
- integrate with provider;
- handle payment callback;
- support refund;
- track payment status;
- reconcile with provider.

Non-functional:

- correctness;
- security;
- idempotency;
- auditability;
- resilience;
- compliance.

## Payment States

```text
Created
Pending
Authorized
Captured
Failed
Cancelled
RefundPending
Refunded
PartiallyRefunded
```

## High-level Architecture

```text
Order Service
  -> Payment API
  -> Payment DB
  -> Payment Provider
  -> Webhook Receiver
  -> Message Broker
  -> Reconciliation Worker
```

## Create Payment API

```http
POST /api/payments
Idempotency-Key: pay-order-123

{
  "orderId": "order-123",
  "amount": 99.99,
  "currency": "USD"
}
```

Response:

```json
{
  "paymentId": "pay-123",
  "providerClientSecret": "secret_for_client_confirmation",
  "status": "Pending"
}
```

## Payment Table

```sql
CREATE TABLE Payments
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    OrderId UNIQUEIDENTIFIER NOT NULL,
    IdempotencyKey NVARCHAR(200) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    Currency NVARCHAR(10) NOT NULL,
    ProviderName NVARCHAR(100) NOT NULL,
    ProviderPaymentId NVARCHAR(200) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL
);

CREATE UNIQUE INDEX UX_Payments_IdempotencyKey
ON Payments (IdempotencyKey);
```

## Idempotency Table

```sql
CREATE TABLE IdempotencyKeys
(
    KeyValue NVARCHAR(200) PRIMARY KEY,
    RequestHash NVARCHAR(256) NOT NULL,
    ResponseJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

If same key with different request body appears, return conflict.

Payment creation flow:

```text
1. Check idempotency key.
2. Validate order and amount.
3. Create local payment row.
4. Call provider to create payment intent.
5. Store provider payment ID.
6. Return client secret or redirect information.
```

## Provider Callback

Webhook must:

- verify signature;
- validate event type;
- deduplicate event;
- update payment state;
- publish event;
- return 2xx after safe processing.

Deduplicate provider events:

```sql
CREATE TABLE ProviderEvents
(
    ProviderEventId NVARCHAR(200) PRIMARY KEY,
    ProviderName NVARCHAR(100) NOT NULL,
    ReceivedAt DATETIMEOFFSET NOT NULL,
    ProcessedAt DATETIMEOFFSET NULL
);
```

```csharp
public async Task HandleWebhookAsync(ProviderWebhook webhook, CancellationToken ct)
{
    var exists = await _dbContext.ProviderEvents
        .AnyAsync(x => x.ProviderEventId == webhook.EventId, ct);

    if (exists)
    {
        return;
    }

    _dbContext.ProviderEvents.Add(new ProviderEvent
    {
        ProviderEventId = webhook.EventId,
        ProviderName = webhook.ProviderName,
        ReceivedAt = DateTimeOffset.UtcNow
    });

    await ApplyPaymentStateChangeAsync(webhook, ct);
    await _dbContext.SaveChangesAsync(ct);
}
```

## Refund

Refund also needs idempotency.

```http
POST /api/payments/pay-123/refunds
Idempotency-Key: refund-pay-123-001
```

Refund state:

```text
Requested
Processing
Succeeded
Failed
```

Refund table:

```sql
CREATE TABLE Refunds
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    PaymentId UNIQUEIDENTIFIER NOT NULL,
    IdempotencyKey NVARCHAR(200) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    ProviderRefundId NVARCHAR(200) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL
);
```

Refunds need their own idempotency key.

## Reconciliation

Scheduled job:

```text
1. Query local payments updated recently.
2. Query provider status.
3. Compare.
4. Fix local status or alert.
```

Why:

- callbacks can fail;
- provider can delay events;
- local processing can fail;
- network issues happen.

## Audit Log

```sql
CREATE TABLE PaymentAuditLogs
(
    Id BIGINT IDENTITY PRIMARY KEY,
    PaymentId UNIQUEIDENTIFIER NOT NULL,
    OldStatus NVARCHAR(50) NULL,
    NewStatus NVARCHAR(50) NOT NULL,
    Reason NVARCHAR(200) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

Payment systems need auditability because money movement must be explainable.

## Security

Do:

- use HTTPS;
- verify signatures;
- store provider tokens securely;
- avoid logging sensitive payment data;
- use least privilege API keys;
- audit all payment state changes.

Do not:

- store raw card data unless compliant;
- trust frontend payment status;
- expose provider secrets to unauthorized clients.

## Practice Task

Design:

1. payment table;
2. idempotency table;
3. create payment endpoint;
4. callback handler;
5. refund endpoint;
6. reconciliation worker;
7. audit log.
