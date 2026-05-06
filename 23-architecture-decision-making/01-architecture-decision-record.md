# Architecture Decision Records

## Core Idea

An Architecture Decision Record (ADR) documents an important technical decision, its context, the options considered, the trade-offs, and the consequences.

Architecture is not only about choosing tools. It is about making decisions that remain understandable when the team, product, traffic, and constraints change.

## Why ADRs Matter

Architecture decisions often outlive the people who made them.

Without ADRs, teams forget:

An ADR gives future engineers context. It prevents the same debate from restarting every few months with no memory.

## When To Write An ADR

Write ADRs for decisions that are expensive to reverse or affect many parts of the system:

- architecture style;
- database choice;
- messaging technology;
- service boundaries;
- authentication strategy;
- caching strategy;
- deployment model;
- data migration strategy;
- API versioning strategy;
- multi-tenant isolation model;
- frontend state management approach;
- observability standard.

Do not write ADRs for every tiny implementation detail. If a decision is local, obvious, cheap to reverse, and does not affect other teams, a normal code comment or pull request note may be enough.

## ADR Lifecycle

Common statuses:

```text
Proposed
Accepted
Superseded
Deprecated
Rejected
```

Lifecycle:

```text
Draft the context
  -> compare options
  -> discuss with affected people
  -> accept a decision
  -> implement
  -> revisit when assumptions change
  -> supersede if needed
```

An ADR should not be treated as permanent law. It captures the best decision under known constraints.

## ADR Template

```markdown
# ADR-001: Use Redis For Distributed Cache

## Status

Accepted

## Date

2026-05-03

## Context

Explain the problem, constraints, and forces.

## Decision Drivers

- driver 1;
- driver 2;
- driver 3.

## Options Considered

1. Option A
2. Option B
3. Option C

## Decision

State the chosen option clearly.

## Consequences

Positive:

- benefit 1;
- benefit 2.

Negative:

- cost 1;
- risk 1.

## Implementation Notes

Explain important implementation rules.

## Revisit When

- assumption changes;
- traffic changes;
- operational cost changes.
```

## Decision Drivers

Decision drivers are the criteria used to compare options.

Examples:

- correctness;
- operational complexity;
- team familiarity;
- cost;
- performance;
- security;
- compliance;
- time to deliver;
- reversibility;
- observability;
- failure recovery;
- vendor lock-in.

Chinese note:

## Example 1: Redis For Distributed Cache

```markdown
# ADR-001: Use Redis For Product Lookup Cache

## Status

Accepted

## Context

The product catalog API has high read traffic. Category and product summary data are read repeatedly by many users.
Database CPU increases during traffic spikes, and traces show repeated read queries for mostly stable data.

The application runs multiple API instances, so in-memory cache would not be shared across instances.

## Decision Drivers

- reduce database read load;
- improve p95 latency;
- support multiple API instances;
- keep stale data risk controlled;
- avoid adding a read replica before query and cache options are evaluated.

## Options Considered

1. Continue database-only reads.
2. Add in-memory cache in each API instance.
3. Add Redis with cache-aside pattern.
4. Add database read replica.

## Decision

Use Redis as a distributed cache with cache-aside pattern for product lookup data.

## Consequences

Positive:

- lower database load;
- shared cache across API instances;
- better p95 latency for repeated reads.

Negative:

- cache invalidation complexity;
- Redis becomes an operational dependency;
- stale data is possible within the configured TTL.

## Implementation Notes

- cache keys must include tenant ID;
- use randomized TTL to reduce simultaneous expiration;
- track cache hit rate, miss rate, latency, errors, and evictions;
- fallback to database when Redis is temporarily unavailable;
- do not cache strongly consistent payment or order state.

## Revisit When

- Redis errors become a major source of incidents;
- stale data becomes unacceptable;
- database read load remains high after caching;
- product data becomes too large for current cache sizing.
```

## Redis Cache Code Example

```csharp
public sealed class ProductLookupService
{
    private readonly IDistributedCache _cache;
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ILogger<ProductLookupService> _logger;

    public ProductLookupService(
        IDistributedCache cache,
        AppDbContext db,
        ITenantContext tenant,
        ILogger<ProductLookupService> logger)
    {
        _cache = cache;
        _db = db;
        _tenant = tenant;
        _logger = logger;
    }

    public async Task<ProductSummaryDto?> GetAsync(long productId, CancellationToken ct)
    {
        var key = $"tenant:{_tenant.TenantId:N}:product:{productId}:summary";

        var cached = await _cache.GetStringAsync(key, ct);

        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductSummaryDto>(cached);
        }

        var product = await _db.Products
            .AsNoTracking()
            .Where(p => p.Id == productId)
            .Select(p => new ProductSummaryDto
            {
                Id = p.Id,
                Name = p.Name,
                CategoryName = p.Category.Name,
                Price = p.Price
            })
            .SingleOrDefaultAsync(ct);

        if (product is null)
        {
            return null;
        }

        var ttl = TimeSpan.FromMinutes(10)
            .Add(TimeSpan.FromSeconds(Random.Shared.Next(0, 60)));

        try
        {
            await _cache.SetStringAsync(
                key,
                JsonSerializer.Serialize(product),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl
                },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write product summary to cache");
        }

        return product;
    }
}
```

This code follows the ADR rules:

- tenant-aware cache key;
- randomized TTL;
- database fallback;
- read-only DTO projection;
- cache failure does not break the request.

## Example 2: Start With Modular Monolith

```markdown
# ADR-002: Start With Modular Monolith

## Status

Accepted

## Context

The team is building a B2B order management platform. The domain includes orders, approvals, documents, notifications, and reporting.

Domain boundaries are not stable yet. The team is small, and operational capacity is limited.

## Decision Drivers

- deliver features quickly;
- keep deployment simple;
- keep transactions straightforward;
- preserve clear module boundaries;
- avoid distributed system complexity before it is justified.

## Options Considered

1. Traditional layered monolith.
2. Modular monolith.
3. Microservices from the beginning.

## Decision

Start with a modular monolith. Use clear internal module boundaries and avoid direct cross-module data access where possible.

## Consequences

Positive:

- simpler deployment;
- simpler local development;
- easier transactions;
- lower operational cost;
- service extraction remains possible later.

Negative:

- requires discipline to keep module boundaries clean;
- independent scaling is limited;
- build time may grow;
- one deployment unit means one module cannot be deployed independently.

## Implementation Notes

- separate modules by business capability;
- expose module behavior through interfaces or internal APIs;
- avoid one module directly modifying another module's tables;
- use domain events or outbox for cross-module integration when needed.

## Revisit When

- one module requires independent deployment;
- one module has very different scaling needs;
- team ownership becomes clearly separated by module;
- build and deployment cycle becomes too slow.
```

## Modular Boundary Example

```text
src/
  Orders/
    Orders.Application/
    Orders.Domain/
    Orders.Infrastructure/
  Payments/
    Payments.Application/
    Payments.Domain/
    Payments.Infrastructure/
  Notifications/
    Notifications.Application/
    Notifications.Domain/
    Notifications.Infrastructure/
  Api/
```

Application code should depend on module contracts instead of reaching into another module's internals.

```csharp
public interface IPaymentStatusReader
{
    Task<PaymentStatusDto?> GetByOrderIdAsync(Guid orderId, CancellationToken ct);
}
```

Bad boundary:

```csharp
var payment = await _db.Payments
    .SingleOrDefaultAsync(p => p.OrderId == orderId, ct);
```

Better boundary:

```csharp
var payment = await _paymentStatusReader.GetByOrderIdAsync(orderId, ct);
```

## Example 3: Kafka vs Service Bus For Integration Events

```markdown
# ADR-003: Use Service Bus For Workflow Messages

## Status

Accepted

## Context

The application needs reliable asynchronous processing for order approval notifications, export jobs, and payment follow-up tasks.

The system does not currently require long-term event replay or stream analytics. The team wants dead-letter handling, retry behavior, and operational simplicity.

## Decision Drivers

- reliable command/workflow processing;
- dead-letter support;
- simple operational model;
- delayed or scheduled messages;
- duplicate handling;
- team familiarity.

## Options Considered

1. Kafka.
2. Azure Service Bus.
3. Database polling only.
4. RabbitMQ.

## Decision

Use Azure Service Bus for workflow messages.

## Consequences

Positive:

- queue and topic support;
- dead-letter queues;
- good fit for commands and workflows;
- managed Azure operations;
- simpler than operating Kafka for this use case.

Negative:

- not ideal for high-throughput replayable event streams;
- Azure platform dependency;
- message size and throughput limits must be understood.

## Revisit When

- event replay becomes a core requirement;
- analytics consumers need long-term event streams;
- throughput exceeds current broker design;
- platform strategy changes.
```

This ADR does not say Kafka is bad. It says Kafka is not the best fit for this specific context.

## Example 4: Token Strategy

```markdown
# ADR-004: Use Short-Lived JWT Access Tokens With Refresh Flow

## Status

Accepted

## Context

The React frontend calls an ASP.NET Core API. The system uses an OIDC identity provider.
The API needs to validate user identity and permissions on each request.

## Decision Drivers

- API should validate tokens without calling identity provider on every request;
- stolen tokens should have limited lifetime;
- permissions may change and should not remain stale for too long;
- browser storage must avoid unnecessary token exposure.

## Options Considered

1. Long-lived JWT access tokens.
2. Short-lived JWT access tokens with refresh flow.
3. Opaque tokens with introspection.
4. Backend-for-Frontend session cookies.

## Decision

Use short-lived JWT access tokens and a refresh flow. Keep access token lifetime short and enforce backend authorization policies.

## Consequences

Positive:

- API can validate tokens locally;
- stolen access token lifetime is limited;
- works well with distributed API instances.

Negative:

- refresh flow adds complexity;
- permission changes may still be stale until token refresh;
- frontend token handling must be carefully designed.

## Revisit When

- token theft risk increases;
- permissions require immediate revocation;
- frontend architecture moves toward Backend-for-Frontend;
- compliance requires centralized token introspection.
```

## Comparing Options With A Decision Matrix

A lightweight matrix helps make trade-offs visible.

```markdown
| Option | Reliability | Complexity | Cost | Team Familiarity | Fit |
| --- | --- | --- | --- | --- | --- |
| Database polling | Medium | Low | Low | High | Good for small workload |
| Service Bus | High | Medium | Medium | Medium | Best current fit |
| Kafka | High | High | High | Low | Better for replayable streams |
```

Do not let a matrix pretend to be objective math. It is a thinking tool, not a replacement for judgment.

## Good ADR Characteristics

Good ADRs are:

- specific to one decision;
- short enough to read;
- clear about context;
- honest about trade-offs;
- explicit about consequences;
- linked to implementation;
- easy to revisit;
- free of blame.

## Weak ADR Example

```text
We chose Kafka because Kafka is popular and scalable.
```

Why weak:

- no context;
- no alternatives;
- no trade-offs;
- no operational impact;
- no revisit condition.

Better:

```text
We chose Kafka because the analytics pipeline requires replayable event streams,
high throughput, long-term event retention, and multiple independent consumers.
Service Bus was considered but rejected because replay and stream retention are
core requirements for this use case.
```

## ADR Index

Keep an index so decisions are discoverable.

```markdown
# Architecture Decision Records

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| ADR-001 | Use Redis For Product Lookup Cache | Accepted | 2026-05-03 |
| ADR-002 | Start With Modular Monolith | Accepted | 2026-05-03 |
| ADR-003 | Use Service Bus For Workflow Messages | Accepted | 2026-05-03 |
| ADR-004 | Use Short-Lived JWT Access Tokens | Accepted | 2026-05-03 |
```

## How ADRs Connect To Code

An ADR should influence implementation. If the ADR says cache keys must include tenant ID, code review should check that rule.

Example checklist from an ADR:

```text
Redis cache ADR implementation checks:
  - cache key includes TenantId;
  - TTL has jitter;
  - cache miss falls back to database;
  - Redis failure is logged and tolerated for read path;
  - metrics track hit/miss/error/latency;
  - strongly consistent state is not cached.
```

This turns architecture into practical engineering behavior.

## Practice Task

Write ADRs for:

1. Redis vs database-only reads.
2. Service Bus vs Kafka.
3. Modular monolith vs microservices.
4. JWT tokens vs opaque tokens.
5. SQL Server vs PostgreSQL.
6. API gateway vs direct service routing.
7. App Service vs Kubernetes.

For each ADR, include:

```text
Context:
Decision drivers:
Options:
Decision:
Positive consequences:
Negative consequences:
Implementation notes:
Revisit when:
```
