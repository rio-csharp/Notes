# API Idempotency

## Core Idea

Idempotency（幂等性）means repeated requests have the same effect as one request.

This is critical for:

- payments;
- order creation;
- refunds;
- webhooks;
- message consumers;
- retry-safe APIs.

## HTTP Method Idempotency

Generally:

- `GET`: idempotent and safe;
- `PUT`: idempotent;
- `DELETE`: idempotent by effect;
- `POST`: not idempotent by default.

POST can be made idempotent using an idempotency key.

## Idempotency Key

Request:

```http
POST /api/orders
Idempotency-Key: create-order-user-123-cart-456
```

Server stores:

- key;
- request hash;
- response;
- status;
- expiration.

## Table Design

```sql
CREATE TABLE IdempotencyKeys
(
    KeyValue NVARCHAR(200) PRIMARY KEY,
    RequestHash NVARCHAR(256) NOT NULL,
    ResponseJson NVARCHAR(MAX) NULL,
    StatusCode INT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL
);
```

More complete SQL Server design:

```sql
CREATE TABLE IdempotencyKeys
(
    KeyValue NVARCHAR(200) NOT NULL,
    RequestHash NVARCHAR(128) NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    StatusCode INT NULL,
    ResponseJson NVARCHAR(MAX) NULL,
    ResourceType NVARCHAR(100) NULL,
    ResourceId NVARCHAR(100) NULL,
    CreatedAt DATETIME2 NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    CONSTRAINT PK_IdempotencyKeys PRIMARY KEY (KeyValue)
);

CREATE INDEX IX_IdempotencyKeys_ExpiresAt
ON IdempotencyKeys (ExpiresAt);
```

## Flow

```text
1. Client sends request with idempotency key.
2. Server checks whether key exists.
3. If same key and same request hash exists, return stored response.
4. If same key but different request hash, return 409 Conflict.
5. If key does not exist, process request and store response.
```

## Example

```csharp
public async Task<OrderDto> CreateOrderAsync(
    CreateOrderRequest request,
    string idempotencyKey,
    CancellationToken ct)
{
    var requestHash = _hasher.Hash(request);

    var existing = await _dbContext.IdempotencyKeys
        .FirstOrDefaultAsync(k => k.KeyValue == idempotencyKey, ct);

    if (existing is not null)
    {
        if (existing.RequestHash != requestHash)
        {
            throw new ConflictException("Idempotency key reused with different request.");
        }

        return JsonSerializer.Deserialize<OrderDto>(existing.ResponseJson!)!;
    }

    var order = new Order(request.CustomerId);
    _dbContext.Orders.Add(order);

    await _dbContext.SaveChangesAsync(ct);

    var response = new OrderDto(order.Id, order.Status.ToString());

    _dbContext.IdempotencyKeys.Add(new IdempotencyKey
    {
        KeyValue = idempotencyKey,
        RequestHash = requestHash,
        ResponseJson = JsonSerializer.Serialize(response),
        StatusCode = StatusCodes.Status201Created,
        CreatedAt = DateTimeOffset.UtcNow,
        ExpiresAt = DateTimeOffset.UtcNow.AddHours(24)
    });

    await _dbContext.SaveChangesAsync(ct);

    return response;
}
```

Note:

In real implementation, the order insert and idempotency record should be protected against races with a transaction or unique constraint handling. The simplified example above shows the idea, but the complete version below is safer.

## Complete ASP.NET Core Example

Header requirement:

```csharp
public static class IdempotencyHeaders
{
    public const string HeaderName = "Idempotency-Key";
}
```

Entity:

```csharp
public sealed class IdempotencyKey
{
    public string KeyValue { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public int? StatusCode { get; set; }
    public string? ResponseJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
```

Request hash:

```csharp
public static class RequestHasher
{
    public static string Hash<T>(T value)
    {
        var json = JsonSerializer.Serialize(value);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(bytes);
    }
}
```

Controller:

```csharp
[HttpPost]
public async Task<IActionResult> Create(
    CreateOrderRequest request,
    [FromHeader(Name = IdempotencyHeaders.HeaderName)] string? idempotencyKey,
    CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(idempotencyKey))
    {
        return BadRequest("Idempotency-Key header is required.");
    }

    var result = await _orders.CreateOrderAsync(request, idempotencyKey, ct);

    return StatusCode(result.StatusCode, result.Response);
}
```

Result wrapper:

```csharp
public sealed record IdempotentResult<T>(int StatusCode, T Response);
```

Safer service flow:

```csharp
public async Task<IdempotentResult<OrderDto>> CreateOrderAsync(
    CreateOrderRequest request,
    string idempotencyKey,
    CancellationToken ct)
{
    var requestHash = RequestHasher.Hash(request);

    await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

    var existing = await _dbContext.IdempotencyKeys
        .SingleOrDefaultAsync(x => x.KeyValue == idempotencyKey, ct);

    if (existing is not null)
    {
        if (existing.RequestHash != requestHash)
        {
            throw new ConflictException("Idempotency key was reused with a different request.");
        }

        var existingResponse = JsonSerializer.Deserialize<OrderDto>(existing.ResponseJson!)!;
        return new IdempotentResult<OrderDto>(existing.StatusCode ?? 200, existingResponse);
    }

    var order = new Order(request.CustomerId);
    _dbContext.Orders.Add(order);

    await _dbContext.SaveChangesAsync(ct);

    var response = new OrderDto(order.Id, order.Status.ToString());

    _dbContext.IdempotencyKeys.Add(new IdempotencyKey
    {
        KeyValue = idempotencyKey,
        RequestHash = requestHash,
        StatusCode = StatusCodes.Status201Created,
        ResponseJson = JsonSerializer.Serialize(response),
        CreatedAt = DateTimeOffset.UtcNow,
        ExpiresAt = DateTimeOffset.UtcNow.AddHours(24)
    });

    await _dbContext.SaveChangesAsync(ct);
    await transaction.CommitAsync(ct);

    return new IdempotentResult<OrderDto>(StatusCodes.Status201Created, response);
}
```

Important production notes:

- the primary key or unique constraint on `KeyValue` handles concurrent duplicate requests;
- if two identical requests race, one may fail with a unique constraint violation and should reload the stored response;
- store enough response data to replay the same result;
- expire old keys with a cleanup job;
- do not use only in-memory storage for horizontally scaled APIs.

## Webhook Idempotency

Webhook providers often retry events.

```sql
CREATE TABLE ProcessedWebhookEvents
(
    Provider NVARCHAR(100) NOT NULL,
    EventId NVARCHAR(200) NOT NULL,
    ProcessedAt DATETIME2 NOT NULL,
    CONSTRAINT PK_ProcessedWebhookEvents PRIMARY KEY (Provider, EventId)
);
```

Processing idea:

```csharp
public async Task HandleWebhookAsync(WebhookEvent webhook, CancellationToken ct)
{
    var alreadyProcessed = await _dbContext.ProcessedWebhookEvents
        .AnyAsync(x => x.Provider == webhook.Provider && x.EventId == webhook.EventId, ct);

    if (alreadyProcessed)
    {
        return;
    }

    await ApplyWebhookBusinessChangeAsync(webhook, ct);

    _dbContext.ProcessedWebhookEvents.Add(new ProcessedWebhookEvent
    {
        Provider = webhook.Provider,
        EventId = webhook.EventId,
        ProcessedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);
}
```

For high concurrency, use a unique constraint and handle duplicate insert errors safely.

## Review Questions

### Why is idempotency important?

> Networks fail and clients retry. Without idempotency, retries can create duplicate orders, duplicate payments, or duplicate refunds.

### How do you implement idempotency for POST?

> Require an idempotency key, store request hash and response with a unique constraint, return the previous response for duplicate retries, and reject same key with different payload.

### Is idempotency only an API concern?

> No. Message consumers and webhook handlers also need idempotency because duplicate delivery is common.

## Common Mistakes

- No unique constraint.
- Same key allowed with different payload.
- Key never expires.
- Idempotency implemented only in memory.
- Not making payment/refund APIs idempotent.
- Returning duplicate side effects on retry.

## Practice Task

Implement idempotency for:

1. create order;
2. create payment;
3. refund payment;
4. webhook event processing;
5. message consumer.
