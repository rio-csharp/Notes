# Webhook Design

## Core Idea

A webhook is an HTTP callback sent by one system to notify another system about an event.

Chinese notes:

- `webhook`: 回调通知.
- `signature`: 签名.
- `replay attack`: 重放攻击.
- `idempotency`: 幂等性.
- `dead-letter queue`: 死信队列.

Webhooks are common in payments, identity, shipping, Git providers, automation platforms, and integration systems.

## Common Use Cases

- payment provider sends payment result;
- GitHub sends repository event;
- identity provider sends user lifecycle event;
- shipping provider sends delivery update;
- document signing provider sends completion event;
- internal service notifies another service about a business event.

## Receiver Flow

```text
Provider
  -> POST /api/webhooks/provider
  -> verify signature
  -> validate timestamp
  -> parse event
  -> store event ID
  -> enqueue processing
  -> return 2xx quickly
```

The receiver should be secure, idempotent, and fast.

## Sender Flow

```text
Business event occurs
  -> create webhook delivery record
  -> sign payload
  -> send HTTP POST
  -> record response
  -> retry with backoff on failure
  -> dead-letter after max attempts
```

The sender should be reliable and observable.

## Example Receiver Endpoint

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
        var body = await reader.ReadToEndAsync(ct);

        var signature = Request.Headers["X-Signature"].ToString();
        var timestamp = Request.Headers["X-Timestamp"].ToString();
        var eventId = Request.Headers["X-Event-ID"].ToString();

        await _handler.HandleAsync(body, signature, timestamp, eventId, ct);

        return Ok();
    }
}
```

Keep request body size limits. Webhook endpoints should not accept unlimited payloads.

## Signature Verification

Concept:

```csharp
public static bool VerifySignature(
    string body,
    string timestamp,
    string signature,
    string secret)
{
    if (!DateTimeOffset.TryParse(timestamp, out var sentAt))
    {
        return false;
    }

    if ((DateTimeOffset.UtcNow - sentAt).Duration() > TimeSpan.FromMinutes(5))
    {
        return false;
    }

    var signedPayload = $"{timestamp}.{body}";

    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
    var expected = Convert.ToHexString(hash).ToLowerInvariant();

    return CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(expected),
        Encoding.UTF8.GetBytes(signature.ToLowerInvariant()));
}
```

Use constant-time comparison to reduce timing attack risk.

Validate timestamp to reduce replay attack risk.

## Idempotency

Providers may retry webhooks. Receivers must not process the same event twice.

Store event ID:

```sql
CREATE TABLE WebhookEvents
(
    EventId NVARCHAR(200) NOT NULL PRIMARY KEY,
    Provider NVARCHAR(100) NOT NULL,
    EventType NVARCHAR(100) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    ErrorMessage NVARCHAR(1000) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    ProcessedAt DATETIMEOFFSET NULL
);
```

If the event ID already exists and is processed, return success without duplicate processing.

## Return Quickly

Do not perform slow business work directly in the webhook request.

Better flow:

```text
1. Verify signature.
2. Store event.
3. Enqueue processing.
4. Return 200.
5. Worker processes event.
```

Receiver handler:

```csharp
public async Task HandleAsync(
    string body,
    string signature,
    string timestamp,
    string eventId,
    CancellationToken ct)
{
    if (!_verifier.Verify(body, timestamp, signature, _options.Secret))
    {
        throw new UnauthorizedAccessException("Invalid signature.");
    }

    var exists = await _db.WebhookEvents.AnyAsync(e => e.EventId == eventId, ct);

    if (exists)
    {
        return;
    }

    _db.WebhookEvents.Add(new WebhookEvent
    {
        EventId = eventId,
        Provider = "ExampleProvider",
        EventType = DetectEventType(body),
        Payload = body,
        Status = WebhookEventStatus.Received,
        CreatedAt = DateTimeOffset.UtcNow
    });

    _db.OutboxMessages.Add(OutboxMessage.From(
        "WebhookEventReceived",
        new { eventId }));

    await _db.SaveChangesAsync(ct);
}
```

## Processing Worker

```csharp
public async Task ProcessAsync(string eventId, CancellationToken ct)
{
    var evt = await _db.WebhookEvents
        .SingleOrDefaultAsync(e => e.EventId == eventId, ct);

    if (evt is null || evt.Status == WebhookEventStatus.Processed)
    {
        return;
    }

    try
    {
        await _dispatcher.DispatchAsync(evt.EventType, evt.Payload, ct);

        evt.Status = WebhookEventStatus.Processed;
        evt.ProcessedAt = DateTimeOffset.UtcNow;
        evt.ErrorMessage = null;
    }
    catch (Exception ex)
    {
        evt.Status = WebhookEventStatus.Failed;
        evt.ErrorMessage = ex.Message;
        throw;
    }
    finally
    {
        await _db.SaveChangesAsync(ct);
    }
}
```

Workers should be idempotent too. A crash can happen after side effects but before status update.

## Designing A Webhook Sender

If your system sends webhooks to customers, store delivery attempts.

```sql
CREATE TABLE WebhookSubscriptions
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NOT NULL,
    Url NVARCHAR(1000) NOT NULL,
    Secret NVARCHAR(500) NOT NULL,
    EventTypes NVARCHAR(MAX) NOT NULL,
    IsActive BIT NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);

CREATE TABLE WebhookDeliveries
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    SubscriptionId UNIQUEIDENTIFIER NOT NULL,
    EventId UNIQUEIDENTIFIER NOT NULL,
    Url NVARCHAR(1000) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    AttemptCount INT NOT NULL,
    NextAttemptAt DATETIMEOFFSET NULL,
    LastStatusCode INT NULL,
    LastError NVARCHAR(1000) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    DeliveredAt DATETIMEOFFSET NULL
);
```

Sign outgoing payload:

```csharp
public static string CreateSignature(string body, string timestamp, string secret)
{
    var signedPayload = $"{timestamp}.{body}";

    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));

    return Convert.ToHexString(hash).ToLowerInvariant();
}
```

Send:

```csharp
public async Task SendAsync(WebhookDelivery delivery, string secret, CancellationToken ct)
{
    var timestamp = DateTimeOffset.UtcNow.ToString("O");
    var signature = CreateSignature(delivery.Payload, timestamp, secret);

    using var request = new HttpRequestMessage(HttpMethod.Post, delivery.Url);
    request.Headers.Add("X-Event-ID", delivery.EventId.ToString());
    request.Headers.Add("X-Timestamp", timestamp);
    request.Headers.Add("X-Signature", signature);
    request.Content = new StringContent(
        delivery.Payload,
        Encoding.UTF8,
        "application/json");

    using var response = await _httpClient.SendAsync(request, ct);

    delivery.AttemptCount++;
    delivery.LastStatusCode = (int)response.StatusCode;

    if (response.IsSuccessStatusCode)
    {
        delivery.Status = WebhookDeliveryStatus.Delivered;
        delivery.DeliveredAt = DateTimeOffset.UtcNow;
        delivery.NextAttemptAt = null;
        return;
    }

    delivery.Status = WebhookDeliveryStatus.Retrying;
    delivery.NextAttemptAt = DateTimeOffset.UtcNow.Add(ComputeBackoff(delivery.AttemptCount));
}
```

## Retry Strategy

Retries should use backoff and jitter.

```csharp
private static TimeSpan ComputeBackoff(int attempt)
{
    var cappedAttempt = Math.Min(attempt, 8);
    var seconds = Math.Pow(2, cappedAttempt);
    var jitter = Random.Shared.Next(0, 1000) / 1000.0;

    return TimeSpan.FromSeconds(seconds + jitter);
}
```

Retry on:

- timeout;
- network failure;
- `429`;
- `5xx`.

Usually do not retry forever. Move to failed/dead-letter state after maximum attempts.

## Security Rules

For receivers:

- require HTTPS;
- verify signature;
- validate timestamp;
- enforce body size limit;
- store event IDs;
- process idempotently;
- log safely;
- monitor failures.

For senders:

- allow customers to rotate webhook secrets;
- sign payloads;
- support retry;
- expose delivery logs;
- avoid sending unnecessary sensitive data;
- validate subscriber URLs if possible;
- protect against SSRF in custom webhook URLs.

Chinese note:

- `SSRF`: Server-Side Request Forgery, 服务端请求伪造.

## SSRF Consideration For Webhook Senders

If customers can configure webhook URLs, they might accidentally or maliciously point to internal addresses.

Block private network targets when appropriate:

```text
http://localhost:5000
http://127.0.0.1
http://169.254.169.254
http://10.0.0.5
http://192.168.1.10
```

Use a controlled outbound network path when possible.

## Observability

Track:

- received event count;
- signature verification failures;
- duplicate event count;
- processing failures;
- delivery attempts;
- delivery success rate;
- retry count;
- dead-letter count;
- oldest unprocessed event age.

Useful log:

```csharp
_logger.LogInformation(
    "Webhook event {EventId} from {Provider} stored with type {EventType}",
    eventId,
    provider,
    eventType);
```

Avoid logging full payloads when they may contain sensitive data.

## Knowledge Checks

### How can webhook endpoints be secured?

Use HTTPS, verify provider signatures, validate timestamps, restrict payload size, store event IDs for idempotency, log safely, and monitor failures.

### Why return 2xx quickly?

Providers often retry on timeout or non-2xx responses. Returning quickly after safe validation and storage reduces duplicate delivery and decouples provider availability from internal processing.

### Why is idempotency required?

Webhook delivery is usually at-least-once. The same event may arrive more than once, so processing must not duplicate side effects.

### What should a webhook sender store?

Store subscriptions, event IDs, delivery attempts, response status, retry schedule, final delivery status, and errors.

## Common Mistakes

- No signature verification.
- No timestamp replay protection.
- No idempotency.
- Processing slow logic synchronously.
- Returning `500` after event was already processed.
- Logging sensitive payloads.
- No dead-letter state.
- No retry backoff.
- No delivery logs for webhook senders.
- Allowing webhook URLs to target internal services.

## Practice Task

Design both sides:

1. webhook receiver endpoint.
2. signature verification.
3. timestamp validation.
4. event storage.
5. idempotent worker.
6. webhook subscription table.
7. delivery attempts table.
8. retry with backoff.
9. dead-letter handling.
10. monitoring metrics.
