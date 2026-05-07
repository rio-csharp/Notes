# Idempotency, Retries, And Duplicate-Safe Operations

## Core Idea

Networks fail, clients retry, proxies repeat requests, and users submit forms twice. Idempotency is the discipline that keeps those ordinary failures from producing duplicate business effects. It is therefore not a niche payment concern. It is a core reliability property for APIs that create or trigger important state transitions.

## HTTP Idempotency And Business Idempotency

Some HTTP methods are naturally idempotent by semantics, such as `PUT` and `DELETE`, at least when implemented correctly. `POST` is not idempotent by default because repeated submission often creates repeated side effects.

That distinction matters, but it is only part of the story. Business idempotency asks a stronger question: if the same intent is delivered again, will the system accidentally perform it twice?

For operations such as:

- payment creation;
- order submission;
- refund requests;
- webhook processing;
- message consumption;

the answer must often be no, even when the transport is retry-prone.

## Idempotency Keys

One common design is the idempotency key:

```http
POST /api/orders
Idempotency-Key: create-order-user-123-cart-456
```

The server stores:

- the key;
- a hash of the request intent;
- the resulting status code;
- the serialized response or resource reference;
- an expiration window.

If the same key arrives again with the same request identity, the server returns the original result rather than performing the operation twice. If the same key is reused with a meaningfully different request, the server should treat that as a contract conflict rather than as a retry.

## Storage And Race Safety

Idempotency design is only reliable if the storage boundary is race-safe. That usually means a unique constraint on the key and a transactional design that keeps the business write and the idempotency record aligned.

The naive implementation pattern is:

1. check whether the key exists;
2. if not, perform the operation;
3. insert the key record.

That pattern is vulnerable to concurrent races unless the write path is protected properly.

The stronger pattern is:

- use a unique key in storage;
- keep the business effect and the idempotency record within one atomic boundary when possible;
- handle concurrent duplicate insertion safely by reloading the stored result.

A concrete implementation might use a service layer that mediates between the controller and storage, guaranteeing atomicity through a unique constraint:

```csharp
public sealed class IdempotentOrderService
{
    private readonly OrdersDbContext _db;
    private readonly IOrderProcessingEngine _engine;

    public IdempotentOrderService(OrdersDbContext db, IOrderProcessingEngine engine)
    {
        _db = db;
        _engine = engine;
    }

    public async Task<OrderCreatedResult> CreateOrderAsync(
        CreateOrderRequest request,
        string idempotencyKey,
        CancellationToken ct)
    {
        // Attempt to claim the idempotency key — fails atomically if taken
        var record = await _db.IdempotencyRecords
            .FirstOrDefaultAsync(r => r.Key == idempotencyKey, ct);

        if (record is not null)
        {
            // Key already processed — return the stored result
            return DeserializeResult(record.ResultData);
        }

        // Compute a hash of the request for conflict detection
        var requestHash = ComputeHash(request);

        using var transaction = await _db.Database.BeginTransactionAsync(ct);

        // Insert idempotency record with a unique constraint — catches races
        var newRecord = new IdempotencyRecord
        {
            Key = idempotencyKey,
            RequestHash = requestHash,
            Status = "Processing",
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.IdempotencyRecords.Add(newRecord);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (IsUniqueConstraintViolation())
        {
            // Another request won the race; reload and return its result
            await transaction.RollbackAsync(ct);
            var existing = await _db.IdempotencyRecords
                .FirstAsync(r => r.Key == idempotencyKey, ct);
            return DeserializeResult(existing.ResultData);
        }

        // We own the key — perform the actual business operation
        var order = await _engine.CreateOrderAsync(request, ct);

        // Store the result and mark as complete
        newRecord.Status = "Completed";
        newRecord.ResultData = SerializeResult(order);
        await _db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);

        return order;
    }
}
```

The controller then delegates responsibility without needing to reason about concurrency or storage details:

```csharp
[HttpPost]
public async Task<ActionResult<OrderCreatedResult>> Create(
    CreateOrderRequest request,
    [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
    CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(idempotencyKey))
        return BadRequest("Idempotency-Key header is required.");

    var result = await _idempotentService.CreateOrderAsync(
        request, idempotencyKey, ct);

    return result.IsExisting
        ? Ok(result)           // Returned previous result
        : CreatedAtAction(     // First-time creation
            nameof(GetById), new { id = result.OrderId }, result);
}
```

## Request Identity And Conflict Detection

The idempotency key alone is not enough. The server should also know whether the repeated request is semantically the same request.

That is why implementations often store a request hash. If the same key is reused with a different payload, the system should not silently replay the prior response or create a second resource. It should surface a conflict because the caller is no longer asking to repeat the same intent.

Retries should be repeatable, not ambiguous.

## Response Replay

A good idempotency implementation often stores enough result information to replay the original response or reconstruct it reliably. This is valuable because the client experience should remain consistent under retry.

If the first attempt returned `201 Created`, the retry should normally return the same effective outcome rather than a different ad hoc success shape.

That consistency makes idempotency visible to the client as a stable contract rather than as a server-side hidden optimization.

## Webhooks And Message Consumers

Idempotency is not limited to synchronous HTTP clients. Webhooks and message consumers often receive duplicate delivery by design. In those cases, duplicate protection usually depends on an externally supplied event identifier or message identifier recorded in durable storage.

The same principles apply:

- deduplicate by stable identity;
- make processing safe under repeat delivery;
- rely on durable uniqueness rather than in-memory assumptions;
- keep the side effect and the "processed" record aligned as closely as possible.

## Expiration And Operational Limits

Idempotency records should not remain forever without policy. They need retention rules, cleanup strategy, and clear scope.

Questions that matter include:

- how long clients are allowed to retry;
- whether idempotency scope is global or tenant-local;
- how large stored replay payloads may become;
- what happens when records expire and the client retries later.

These are operational design choices as much as API design choices.

## Design Consequences

Idempotency is what makes important operations safe under normal network unreliability. The contract should distinguish repeated intent from conflicting intent, the storage layer should enforce uniqueness safely, and the system should replay prior outcomes consistently enough that clients can retry without fear of duplicate business effects.

When that discipline is missing, retries stop being a reliability feature and become a data corruption risk.
