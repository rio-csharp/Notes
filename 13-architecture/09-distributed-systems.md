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

CAP describes three properties of distributed systems:

- Consistency (all nodes see the same data at the same time);
- Availability (every request receives a response);
- Partition tolerance (the system continues operating despite network failures).

The classical framing says you can pick at most two. In practice, this framing is misleading because network partitions are a given in distributed systems -- you do not get to choose whether to tolerate them. The real trade-off is between consistency and availability when a partition occurs.

Modern systems treat this as a spectrum rather than a binary choice. Techniques include tunable consistency (Cassandra's QUORUM vs ONE, MongoDB read concerns), CRDT-based approaches that converge without coordination, and hybrid strategies that layer CP subsystems (etcd for cluster metadata) with AP subsystems (DynamoDB for user-facing workloads). The PACELC theorem extends CAP by noting that even without a partition, there is a trade-off between latency and consistency.

For most business applications, eventual consistency is acceptable for read paths while strong consistency is maintained for critical write paths through idempotency, outbox patterns, and saga orchestration.

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

When a database write succeeds but a subsequent event publish fails, the system becomes inconsistent.

```text
Save order to database.
Publish OrderCreated event.
```

The outbox approach writes both the business data and the outbox message in a single database transaction:

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

In distributed systems, avoid assuming one ACID transaction across services. Use outbox for reliable publish, inbox/idempotency for duplicate handling, and saga/compensation for multi-step workflows.

## Cache Consistency In System Design

Cache consistency must be explicit.

Common strategies:

- cache-aside with TTL;
- delete cache after DB update;
- versioned cache keys;
- event-driven invalidation;
- background refresh;
- local cache plus distributed cache.

- stronger freshness increases complexity;
- simple TTL accepts temporary stale reads.

For product details, slight staleness is acceptable, so cache-aside plus TTL and invalidation is fine. For account balance or payment status, avoid relying on stale cache and read from the source of truth.

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

When consuming versioned events, apply an event only if its version is newer than the current version.

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

A circuit breaker operates in three states:

- **Closed:** Requests flow through normally. The breaker tracks failures; when failures exceed a threshold within a time window, it transitions to Open.
- **Open:** Requests are rejected immediately without calling the downstream service. A timer runs; after a configured duration, the breaker transitions to Half-Open.
- **Half-Open:** A limited number of trial requests are allowed. If they succeed, the breaker returns to Closed. If any fail, it returns to Open and resets the cooldown.

In .NET, the Polly library provides circuit breaker policies. Starting with .NET 8, `Microsoft.Extensions.Http.Resilience` offers preconfigured resilience pipelines that include circuit breaking, retries with jitter, and timeout enforcement:

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payment:BaseUrl"]!);
})
.AddStandardResilienceHandler(options =>
{
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
    options.CircuitBreaker.FailureRatio = 0.5;
    options.CircuitBreaker.BreakDuration = TimeSpan.FromSeconds(10);
});
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

## Consensus

Consensus is the problem of getting multiple nodes to agree on a single value or sequence of values despite failures. It underlies leader election, distributed locking, and replicated state machines.

The Raft protocol decomposes consensus into leader election, log replication, and safety. A cluster elects a leader that accepts log entries and replicates them to followers. Once a majority acknowledges an entry, it is committed. Raft is designed to be easier to understand than Paxos while providing equivalent guarantees.

In the .NET ecosystem, consensus is typically consumed through infrastructure rather than implemented directly. etcd and ZooKeeper expose consensus-backed primitives (distributed locks, configuration watches, leader election) that .NET services can call via client libraries.

## Leader Election

When only one instance of a service should perform work at a time — a scheduled job, a partition consumer, an outbox publisher — leader election prevents duplicate execution.

Simple approaches use database-level locking:

```sql
-- A single row acts as the leader lock
UPDATE LeaderLock SET OwnerId = @instanceId, LockedUntil = @expiry
WHERE LockedUntil < @now;
```

If the UPDATE affects one row, this instance is the leader. The lease must be renewed periodically; if an instance crashes, its lease expires and another instance claims leadership.

Infrastructure-based approaches use etcd or Azure Blob leases. For Kubernetes workloads, a `Lease` resource from the coordination API provides leader election without external dependencies:

```yaml
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: outbox-publisher-leader
spec:
  holderIdentity: pod-abc123
  leaseDurationSeconds: 15
```

The Kubernetes client library for .NET (`KubernetesClient`) can acquire and renew leases.

## Distributed Locking

When multiple services need exclusive access to a shared resource, a distributed lock ensures only one holder at a time. Common backends include Redis (via RedLock or `IDistributedLock` with `StackExchange.Redis`) and Azure Blob Storage leases.

```csharp
await using var handle = await distributedLock.TryAcquireAsync(
    "resource:order-123",
    TimeSpan.FromSeconds(30),
    cancellationToken);

if (handle is not null)
{
    // exclusive access
}
```

Distributed locks should always include a timeout to prevent deadlock if the holder crashes. They are best-effort in truly adversarial network conditions; for correctness-critical exclusivity, use a database unique constraint or a consensus-backed lock.

Distributed systems demand explicit handling of failure, latency, and consistency at every level. Timeouts, retries with jitter, circuit breakers, and bulkheads protect services from cascading failures. Idempotency, outbox and inbox patterns, and sagas maintain data integrity across service boundaries. Correlation IDs tie together requests across services for debugging and observability. These patterns form the foundation of resilient distributed communication, and their absence is the most common cause of hard-to-diagnose production incidents in distributed architectures.
