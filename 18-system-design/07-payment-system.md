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

## Provider Callback (Webhook)

The payment provider sends webhook events (payment.succeeded, payment.failed, charge.refunded) to a public endpoint. Each event must be processed safely and idempotently.

### Webhook Processing Pipeline

1. **Verify signature**: the provider signs the request body using a shared secret (HMAC-SHA256) or a private key (asymmetric). Compute the expected signature from the raw body and compare. Reject requests with missing or invalid signatures. Return 401 without processing.

2. **Validate event type**: discard events the system does not handle. Log unknown event types for audit visibility.

3. **Deduplicate event**: providers may deliver the same webhook event multiple times (at-least-once delivery). Use a `ProviderEvents` table with the provider's event ID as the primary key. If the event already exists, return 200 without processing again.

4. **Update payment state**: apply the state transition (e.g., Captured, Failed) atomically with the deduplication check.

5. **Publish internal event**: emit an `PaymentCaptured` or `PaymentFailed` internal event for downstream consumers (order service, notification service).

6. **Return 2xx**: acknowledge receipt after successful persistence. If the endpoint returns non-2xx, the provider retries later.

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
1. Query local payments in an intermediate state (Pending, Authorized) updated within a sliding window (e.g., last 24 hours).
2. For each payment, query the provider's API for the current status using the stored `ProviderPaymentId`.
3. Compare the provider status with the local status.
4. If the provider reports a final state (Captured, Failed, Refunded) that differs from the local state, update the local state.
5. If a mismatch persists across multiple reconciliation cycles, alert the operations team.
```

Reconciliation is necessary because:

- webhook callbacks can fail or be delayed;
- the provider may not send events for all state transitions;
- local processing can fail after the provider confirmed success;
- network issues can cause missed webhook deliveries.

Scheduling frequency depends on the payment volume and the risk of unreconciled payments. For high-volume systems, reconciliation every 5-15 minutes is typical. For lower volumes, hourly may suffice.

A reconciliation worker must paginate carefully through local records and respect the provider's rate limits. Querying the provider API for thousands of individual payments in rapid succession can be mistaken for an abuse attempt and result in throttling.

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

## Verification

Key aspects to verify:

1. payment table;
2. idempotency table;
3. create payment endpoint;
4. callback handler;
5. refund endpoint;
6. reconciliation worker;
7. audit log.
