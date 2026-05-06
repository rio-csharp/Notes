# Distributed Systems Foundations

## Core Idea

A distributed system has multiple components communicating over a network.

The hard part is not just splitting code. The hard part is handling failure, latency, and consistency.

## Key Realities

Networks are unreliable:

- requests timeout;
- messages duplicate;
- messages arrive out of order;
- services restart;
- clocks differ;
- dependencies become slow.

## CAP Theorem

CAP:

- Consistency;
- Availability;
- Partition tolerance.

In real distributed systems, network partitions can happen, so trade-offs between consistency and availability matter.

## Consistency Models

Strong consistency:

- all reads see latest write;
- easier reasoning;
- can reduce availability/performance.

Eventual consistency:

- data becomes consistent over time;
- better availability/scalability;
- requires user and system tolerance.

## Under The Hood: Consistency Patterns

Distributed consistency is not one feature. It is a design choice across storage, APIs, messages, retries, and user experience.

Common patterns:

| Pattern | Use Case | Trade-off |
|---|---|---|
| Idempotency key | retry-safe commands | extra storage and request hashing |
| Unique constraint | prevent duplicate business records | database coupling but strong protection |
| Outbox | reliable event publish after DB commit | eventual publish delay |
| Inbox / processed message table | idempotent consumer | extra writes and cleanup |
| Saga | multi-step distributed workflow | compensation complexity |
| Read-your-writes | user sees own recent update | routing/session/cache complexity |
| Versioning / ETag | optimistic concurrency | conflict handling required |

## Outbox, Inbox, Saga

### Outbox

Problem:

```text
Save order to database.
Publish OrderCreated event.
```

If DB succeeds and publish fails, the system is inconsistent.

Outbox solution:

```text
Same DB transaction:
  save order
  save outbox message

Background worker:
  read unpublished outbox messages
  publish to broker
  mark published
```

### Inbox

Inbox means the consumer records which messages it has processed.

```text
Receive message
  -> check processed message table
  -> apply business change
  -> insert processed message id
  -> commit
```

This makes duplicate delivery safe.

### Saga

Saga coordinates a business process across services without one distributed transaction.

Example:

```text
Create order
  -> reserve inventory
  -> authorize payment
  -> confirm order
```

If payment fails:

```text
release inventory
cancel order
```

Engineering perspective:

> In distributed systems, I avoid assuming one ACID transaction across services. I use outbox for reliable publish, inbox/idempotency for duplicate handling, and saga/compensation for multi-step workflows.

## Cache Consistency In System Design

Cache consistency must be explicit.

Common strategies:

- cache-aside with TTL;
- delete cache after DB update;
- versioned cache keys;
- event-driven invalidation;
- background refresh;
- local cache plus distributed cache.

Trade-off:

- stronger freshness increases complexity;
- simple TTL accepts temporary stale reads.

Example answer:

> For product details, slight staleness is acceptable, so cache-aside plus TTL and invalidation is fine. For account balance or payment status, I avoid relying on stale cache and read from the source of truth.

## Message Ordering And Consistency

Messages may be:

- duplicated;
- delayed;
- reordered;
- processed after newer events.

Defenses:

- partition by aggregate ID where ordering matters;
- include event version or sequence number;
- make consumers idempotent;
- ignore stale events when version is older;
- design DLT and replay carefully.

Example:

```json
{
  "orderId": 123,
  "version": 5,
  "eventType": "OrderPaid"
}
```

Consumer rule:

```text
Apply event only if event.version > current.version.
```

## Idempotency

Repeated operation should not create duplicate effects.

Use for:

- retries;
- webhooks;
- message consumers;
- payment APIs.

## Timeout

Every remote call should have a timeout.

No timeout means resources can wait forever.

Example:

```csharp
builder.Services.AddHttpClient<IInventoryClient, InventoryClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Inventory:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(3);
});
```

Per-call cancellation:

```csharp
using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
    timeoutCts.Token,
    requestAborted);

var result = await inventoryClient.ReserveAsync(orderId, linkedCts.Token);
```

Timeouts should be shorter than the caller's total request timeout. Otherwise the upstream caller may give up while downstream work continues unnecessarily.

## Retry

Use retry for transient failures.

But:

- retry can amplify outages;
- use backoff and jitter;
- do not retry non-idempotent operations blindly.

Example retry policy with jitter:

```csharp
static TimeSpan CalculateDelay(int attempt)
{
    var exponential = TimeSpan.FromMilliseconds(100 * Math.Pow(2, attempt));
    var jitter = TimeSpan.FromMilliseconds(Random.Shared.Next(0, 100));
    return exponential + jitter;
}

for (var attempt = 0; attempt < 3; attempt++)
{
    try
    {
        await SendAsync(ct);
        break;
    }
    catch (HttpRequestException) when (attempt < 2)
    {
        await Task.Delay(CalculateDelay(attempt), ct);
    }
}
```

Retries need idempotency.

```csharp
public sealed record CreatePaymentRequest(
    Guid IdempotencyKey,
    int OrderId,
    decimal Amount,
    string Currency);
```

The receiver stores the idempotency key and returns the original result for duplicate requests.

## Circuit Breaker

Stops calling a failing dependency temporarily.

Benefits:

- prevents cascading failure;
- gives dependency time to recover.

Simple mental model:

```text
Closed: calls are allowed.
Open: calls are blocked temporarily.
Half-open: a small number of trial calls are allowed.
```

Circuit breakers are useful for repeated downstream failure, but they should not hide serious business failures. They are an availability tool, not a correctness tool.

## Bulkhead

Bulkhead isolates resources so one dependency does not consume everything.

Example:

```csharp
public sealed class LimitedPaymentClient : IPaymentClient
{
    private readonly IPaymentClient _inner;
    private readonly SemaphoreSlim _semaphore = new(50);

    public LimitedPaymentClient(IPaymentClient inner)
    {
        _inner = inner;
    }

    public async Task<PaymentResult> AuthorizeAsync(
        AuthorizePaymentRequest request,
        CancellationToken ct)
    {
        await _semaphore.WaitAsync(ct);

        try
        {
            return await _inner.AuthorizeAsync(request, ct);
        }
        finally
        {
            _semaphore.Release();
        }
    }
}
```

This prevents payment calls from using unlimited concurrency inside one service instance.

## Clock And Time Issues

Distributed systems should not assume all machines have exactly the same time.

Common problems:

- comparing timestamps from different services;
- using local time instead of UTC;
- expiring tokens based on skewed clocks;
- ordering events only by timestamp.

Prefer:

- UTC timestamps;
- database-generated sequence where strict order matters;
- event version per aggregate;
- clock skew tolerance for tokens and signatures.

## Correlation ID

Every distributed request should carry a correlation ID.

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var value)
            ? value.ToString()
            : Guid.NewGuid().ToString("N");

        context.Response.Headers[HeaderName] = correlationId;

        using (context.RequestServices
            .GetRequiredService<ILogger<CorrelationIdMiddleware>>()
            .BeginScope(new Dictionary<string, object>
            {
                ["CorrelationId"] = correlationId
            }))
        {
            await _next(context);
        }
    }
}
```

Also forward it in outgoing calls:

```csharp
public sealed class CorrelationIdHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CorrelationIdHandler(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var correlationId = _httpContextAccessor.HttpContext?
            .Response.Headers["X-Correlation-Id"]
            .ToString();

        if (!string.IsNullOrWhiteSpace(correlationId))
        {
            request.Headers.TryAddWithoutValidation("X-Correlation-Id", correlationId);
        }

        return base.SendAsync(request, cancellationToken);
    }
}
```

## Practice Task

Design resilient communication between:

1. Order service;
2. Payment service;
3. Inventory service;
4. Notification service.

Include timeouts, retries, idempotency, events, and monitoring.
