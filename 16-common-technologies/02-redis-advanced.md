# Redis Advanced Notes

## Core Idea

Advanced Redis learning usually focuses on practical production behavior, not only data types.

Important topics include:

- caching strategy;
- cache invalidation;
- distributed locks;
- cache failures;
- hot keys;
- persistence;
- clustering;
- consistency trade-offs.

## Cache Aside Deep Dive

Read:

```text
App -> Redis
  hit  -> return
  miss -> DB -> Redis -> return
```

Write:

```text
App -> DB update -> delete cache
```

Why delete cache instead of update cache?

Deleting is often safer because the next read rebuilds cache from the database source of truth.

## Double Delete Pattern

Sometimes used to reduce stale cache risk:

```text
1. Delete cache.
2. Update database.
3. Wait briefly.
4. Delete cache again.
```

This is not perfect. It is a mitigation for race conditions.

Engineering perspective:

> I prefer simple cache invalidation first. For high-risk consistency, I use versioned keys, event-based invalidation, or avoid cache for strongly consistent operations.

## Cache Consistency

Cache and database can be inconsistent.

Common approaches:

- short TTL;
- explicit invalidation;
- versioned keys;
- write-through cache;
- event-driven invalidation;
- background refresh.

Trade-off:

- stronger consistency means more complexity;
- simpler cache often means temporary stale data.

## Cache Avalanche, Breakdown, And Penetration Deep Dive

These three problems are frequently asked in engineering practice because they test whether you understand production cache failure modes.

### Cache Penetration（缓存穿透）

Request pattern:

```text
Request random/missing IDs
  -> Redis miss
  -> DB miss
  -> Repeat forever
```

Root causes:

- malicious requests;
- invalid IDs;
- missing validation;
- no caching for negative results.

Solutions:

- validate input early;
- cache null values with short TTL;
- Bloom filter for known IDs;
- rate limiting;
- authentication/authorization before expensive lookup.

Practical explanation:

> Cache penetration means requests bypass the cache because the requested data does not exist. I prevent it with validation, short-lived null caching, Bloom filters for large known sets, and rate limiting.

### Cache Breakdown（缓存击穿）

Request pattern:

```text
One hot key expires.
Many concurrent requests miss the cache.
All hit the database at once.
```

Root causes:

- hot key;
- expiration at high traffic time;
- no request coalescing;
- no background refresh.

Solutions:

- mutex/request coalescing;
- logical expiration;
- stale-while-revalidate;
- background refresh before expiry;
- longer TTL for hot keys;
- local cache for extremely hot read-mostly data.

Practical explanation:

> Cache breakdown is a hot-key expiration problem. I prevent it by ensuring only one request rebuilds the hot cache entry, or by refreshing it in the background before it expires.

### Cache Avalanche（缓存雪崩）

Request pattern:

```text
Many keys expire together
  -> Redis miss rate spikes
  -> database receives sudden traffic wave
  -> database slows or fails
```

Root causes:

- same TTL for many keys;
- cache flush;
- Redis outage;
- deployment preloaded many keys at the same time.

Solutions:

- randomized TTL;
- staggered expiration;
- pre-warming;
- background refresh;
- database rate limiting;
- circuit breaker;
- graceful degradation;
- multi-level cache where appropriate.

Practical explanation:

> Cache avalanche is when many cache entries fail or expire at the same time. I use TTL jitter, pre-warming, background refresh, and database protection so the database does not receive the full traffic spike.

## Request Coalescing

Request coalescing means multiple concurrent requests for the same missing key share one database load.

Without coalescing:

```text
1000 concurrent misses -> 1000 database queries
```

With coalescing:

```text
1000 concurrent misses -> 1 database query + 999 waiters/stale responses
```

This can be done with:

- local lock per key;
- distributed lock;
- single-flight library/pattern;
- background refresh;
- stale cache response while refresh happens.

Important:

> A local lock only protects one application instance. In a multi-instance deployment, consider whether you need a distributed lock or whether stale-while-revalidate is simpler.

## Logical Expiration

Logical expiration stores expiration time inside the cached value instead of relying only on Redis TTL.

Example:

```json
{
  "expiresAt": "2026-04-30T10:30:00Z",
  "data": {
    "id": 123,
    "name": "Product A"
  }
}
```

Read flow:

```text
1. Read cached value.
2. If not logically expired, return it.
3. If expired, return stale data and trigger background refresh.
```

Benefits:

- avoids many requests hitting database at once;
- keeps hot key available;
- improves user experience.

Trade-off:

- users may receive stale data briefly;
- refresh logic is more complex.

Use for:

- product detail;
- configuration;
- landing page data;
- read-mostly hot data.

Avoid for:

- account balance;
- payment state;
- permission checks requiring strict freshness.

## Hot Key

A hot key receives extremely high traffic.

Problems:

- one Redis node overloaded;
- high latency;
- single point pressure.

Solutions:

- local in-memory cache;
- key sharding;
- read replica;
- request coalescing;
- background refresh;
- CDN if public content.

## Redis Outage Strategy

Redis design should not stop at "Redis is fast". A complete design explains what happens when Redis is slow or unavailable.

Questions to decide:

- Is Redis a cache or source of truth?
- Can the system fall back to database?
- Should the feature fail open or fail closed?
- How do we protect the database from fallback traffic?
- What do we alert on?

Examples:

| Scenario | Strategy |
|---|---|
| product cache unavailable | fallback to DB with rate limit and circuit breaker |
| permission cache unavailable | fallback to DB or deny high-risk operations |
| login rate limiter unavailable | fail closed or stricter for security |
| distributed lock unavailable | do not enter critical section |
| feature flags unavailable | use local last-known-good config |

Monitoring:

- Redis latency;
- timeout rate;
- error rate;
- hit ratio;
- memory usage;
- evictions;
- hot keys;
- command duration.

## Big Key

A big key stores too much data.

Examples:

- huge string;
- list with millions of items;
- hash with too many fields.

Problems:

- slow commands;
- network overhead;
- blocking;
- memory fragmentation.

Solutions:

- split keys;
- paginate data;
- avoid huge values;
- monitor key size.

## Distributed Lock Reality

Simple Redis lock:

```text
SET lock:resource uniqueValue NX PX 30000
```

Safe release must compare value:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

Engineering caution:

> Distributed locks are easy to misuse. If correctness is critical, prefer database constraints, idempotency keys, or queue serialization where possible.

## Redis Persistence

### RDB

Snapshot persistence.

Pros:

- compact;
- good for backups;
- faster restart than AOF in some cases.

Cons:

- can lose recent writes between snapshots.

### AOF

Append-only file.

Pros:

- better durability;
- logs write commands.

Cons:

- larger files;
- rewrite needed;
- performance trade-off.

## Redis Cluster

Redis Cluster shards data by hash slots.

Important:

- multi-key operations require keys in same hash slot;
- client must support cluster;
- resharding and failover need operational understanding.

Hash tag example:

```text
user:{123}:profile
user:{123}:settings
```

These keys share the same hash tag.

## Knowledge Checks

### How do you handle Redis outage?

> The system should degrade gracefully. For cache use cases, fall back to database with rate protection. For locks or rate limiting, choose fail-open or fail-closed depending on business risk. Alert and monitor Redis latency/error rate.

### How do you prevent cache avalanche?

> Randomize TTL, avoid mass expiration, pre-warm cache, use background refresh, and protect the database with rate limiting or request coalescing.

### Is Redis strongly consistent with database?

> No. Redis cache and database can become temporarily inconsistent. The design must define acceptable staleness and invalidation strategy.

### What should not be stored in Redis?

> Large unbounded objects, highly sensitive data without protection, data requiring strong relational transactions, and data with no eviction or lifecycle strategy.

## Common Mistakes

- No TTL.
- No tenant ID in cache key.
- Huge cached values.
- Treating Redis as source of truth accidentally.
- No Redis timeout configuration.
- No fallback plan.
- Using distributed lock for everything.

## Practice Scenarios

Explain designs for:

1. product detail cache;
2. permission cache;
3. login rate limiter;
4. flash sale stock control;
5. hot key mitigation;
6. Redis outage fallback.
