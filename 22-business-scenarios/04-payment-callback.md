# Payment Callback Design

## Core Idea

Payment callbacks notify a system about payment events from a payment provider.

Payment is a high-risk domain. Correctness, auditability, and recovery matter more than cleverness.

## Typical Flow

```text
User
  -> Checkout API
  -> create local Payment record
  -> call Payment Provider
  -> return payment page/client secret

Payment Provider
  -> Webhook Callback
  -> verify signature
  -> store provider event
  -> update local payment state idempotently
  -> publish PaymentCaptured event

Order Service
  -> confirms order after payment event
```

The provider callback should be treated as the source of payment status changes, but local state transitions must still be controlled.

## Payment States

Example states:

```text
Pending
Authorized
Captured
Failed
Cancelled
Refunded
PartiallyRefunded
```

State transitions:

```text
Pending -> Authorized
Pending -> Captured
Pending -> Failed
Authorized -> Captured
Authorized -> Cancelled
Captured -> Refunded
Captured -> PartiallyRefunded
```

Bad:

```csharp
payment.Status = request.Status;
```

Better:

```csharp
payment.MarkCaptured(evt.TransactionId, evt.CreatedAt);
```

Domain model:

```csharp
public sealed class Payment
{
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string ProviderPaymentId { get; private set; } = "";
    public PaymentStatus Status { get; private set; } = PaymentStatus.Pending;
    public string? ProviderTransactionId { get; private set; }
    public DateTimeOffset? CapturedAt { get; private set; }

    public void MarkCaptured(string providerTransactionId, DateTimeOffset capturedAt)
    {
        if (Status == PaymentStatus.Captured)
        {
            return;
        }

        if (Status is PaymentStatus.Cancelled or PaymentStatus.Refunded)
        {
            throw new DomainException($"Cannot capture payment from status {Status}.");
        }

        ProviderTransactionId = providerTransactionId;
        CapturedAt = capturedAt;
        Status = PaymentStatus.Captured;
    }

    public void MarkFailed(string reason)
    {
        if (Status == PaymentStatus.Captured)
        {
            throw new DomainException("Captured payment cannot be marked as failed.");
        }

        Status = PaymentStatus.Failed;
    }
}
```

## Webhook Endpoint

The endpoint needs the raw request body for signature verification. (For a broader discussion of webhook receiver and sender design, including retry strategies and observability, see Chapter 22, "Webhook Design". The payment-specific webhook pattern below focuses on the unique requirements of payment providers.)

```csharp
[ApiController]
[Route("api/webhooks/payments")]
public sealed class PaymentWebhookController : ControllerBase
{
    private readonly PaymentWebhookHandler _handler;

    public PaymentWebhookController(PaymentWebhookHandler handler)
    {
        _handler = handler;
    }

    [HttpPost]
    public async Task<IActionResult> Handle(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var payload = await reader.ReadToEndAsync(ct);

        var signature = Request.Headers["X-Payment-Signature"].ToString();
        var timestamp = Request.Headers["X-Payment-Timestamp"].ToString();

        await _handler.HandleAsync(payload, signature, timestamp, ct);

        return Ok();
    }
}
```

Do not bind the JSON model before verifying the signature if the provider signs the raw body.

## Signature Verification

Always verify provider signature before trusting payload.

```csharp
public sealed class PaymentSignatureVerifier
{
    public bool Verify(
        string payload,
        string timestamp,
        string signature,
        string secret)
    {
        if (!DateTimeOffset.TryParse(timestamp, out var sentAt))
        {
            return false;
        }

        var age = DateTimeOffset.UtcNow - sentAt;

        if (age.Duration() > TimeSpan.FromMinutes(5))
        {
            return false;
        }

        var signedPayload = $"{timestamp}.{payload}";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(signature.ToLowerInvariant()));
    }
}
```

Timestamp validation reduces replay attack risk.

## Webhook Event Table

Store provider events for idempotency and audit.

```sql
CREATE TABLE PaymentWebhookEvents
(
    ProviderEventId NVARCHAR(200) NOT NULL PRIMARY KEY,
    Provider NVARCHAR(100) NOT NULL,
    PaymentId UNIQUEIDENTIFIER NULL,
    EventType NVARCHAR(100) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    ErrorMessage NVARCHAR(1000) NULL,
    ProcessedAt DATETIMEOFFSET NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

Possible event statuses:

```text
Received
Processed
Ignored
Failed
```

## Idempotent Handler

Providers retry callbacks. The handler must be idempotent. (For a general treatment of idempotency keys, race-safe storage, and request identity detection, see Chapter 7, "Idempotency, Retries, And Duplicate-Safe Operations".)

```csharp
public async Task HandleAsync(
    string payload,
    string signature,
    string timestamp,
    CancellationToken ct)
{
    if (!_signatureVerifier.Verify(payload, timestamp, signature, _options.Secret))
    {
        throw new UnauthorizedAccessException("Invalid payment signature.");
    }

    var evt = JsonSerializer.Deserialize<PaymentProviderEvent>(payload)
        ?? throw new InvalidOperationException("Invalid payment payload.");

    var alreadyProcessed = await _db.PaymentWebhookEvents
        .AnyAsync(e =>
            e.ProviderEventId == evt.EventId &&
            e.Status == WebhookEventStatus.Processed,
            ct);

    if (alreadyProcessed)
    {
        return;
    }

    await using var transaction = await _db.Database.BeginTransactionAsync(ct);

    var existingEvent = await _db.PaymentWebhookEvents
        .SingleOrDefaultAsync(e => e.ProviderEventId == evt.EventId, ct);

    if (existingEvent is null)
    {
        _db.PaymentWebhookEvents.Add(new PaymentWebhookEvent
        {
            ProviderEventId = evt.EventId,
            Provider = "ExamplePay",
            EventType = evt.Type,
            Payload = payload,
            Status = WebhookEventStatus.Received,
            CreatedAt = DateTimeOffset.UtcNow
        });
    }

    var payment = await _db.Payments
        .SingleOrDefaultAsync(p => p.ProviderPaymentId == evt.PaymentId, ct);

    if (payment is null)
    {
        throw new NotFoundException("Payment not found.");
    }

    if (evt.Type == "payment.captured")
    {
        payment.MarkCaptured(evt.TransactionId, evt.CreatedAt);

        _db.OutboxMessages.Add(OutboxMessage.From(
            "PaymentCaptured",
            new PaymentCapturedEvent(payment.Id, payment.OrderId)));
    }
    else if (evt.Type == "payment.failed")
    {
        payment.MarkFailed(evt.Reason ?? "Provider reported failure.");
    }

    await _db.SaveChangesAsync(ct);
    await transaction.CommitAsync(ct);
}
```

In a real implementation, the event row should be updated to `Processed` inside the same transaction after successful state changes.

## Database Uniqueness For Idempotency

Application checks are not enough under concurrency.

Add a unique constraint:

```sql
ALTER TABLE PaymentWebhookEvents
ADD CONSTRAINT UQ_PaymentWebhookEvents_ProviderEventId
UNIQUE (ProviderEventId);
```

If the same event arrives twice at the same time, one insert wins and the other should be handled as duplicate.

## Outbox For Payment Events

Avoid publishing messages directly inside the request after database save. The process could crash after saving payment state but before publishing the event.

Outbox table:

```sql
CREATE TABLE OutboxMessages
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    Type NVARCHAR(200) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    ProcessedAt DATETIMEOFFSET NULL
);
```

Outbox helper:

```csharp
public static OutboxMessage From<T>(string type, T payload)
{
    return new OutboxMessage
    {
        Id = Guid.NewGuid(),
        Type = type,
        Payload = JsonSerializer.Serialize(payload),
        Status = OutboxStatus.Pending,
        CreatedAt = DateTimeOffset.UtcNow
    };
}
```

The payment state update and outbox insert happen in one local transaction. A background publisher sends the event later.

## Return Codes

General rules:

- invalid signature -> `401` or `400`;
- duplicate already processed event -> `200`;
- temporary internal failure before commit -> `500` so provider retries;
- event accepted for async processing -> `200` or `202`;
- unsupported event type -> often `200` after storing/ignoring.

Avoid returning `500` after state was committed successfully. That can cause unnecessary retries.

## Reconciliation

Callbacks can be delayed, duplicated, or missed.

Reconciliation job:

```text
Every hour:
  query provider for payments updated recently
  compare provider status with local status
  fix safe mismatches
  create alerts for unsafe mismatches
```

Example:

```csharp
public async Task ReconcileAsync(CancellationToken ct)
{
    var pendingPayments = await _db.Payments
        .Where(p => p.Status == PaymentStatus.Pending)
        .Where(p => p.CreatedAt < DateTimeOffset.UtcNow.AddMinutes(-30))
        .Take(100)
        .ToListAsync(ct);

    foreach (var payment in pendingPayments)
    {
        var providerStatus = await _provider.GetPaymentAsync(
            payment.ProviderPaymentId,
            ct);

        if (providerStatus.Status == "captured")
        {
            payment.MarkCaptured(providerStatus.TransactionId, providerStatus.CapturedAt);
        }
    }

    await _db.SaveChangesAsync(ct);
}
```

## Sensitive Data

Do not log:

- card numbers;
- CVV;
- full provider payload if it contains sensitive data;
- secrets;
- raw authorization headers.

Log safe identifiers:

```csharp
_logger.LogInformation(
    "Processed payment event {EventId} for payment {PaymentId}",
    evt.EventId,
    payment.Id);
```


