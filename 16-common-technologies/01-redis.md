# Redis

## Core Idea

Redis is an in-memory data store commonly used for caching, distributed locks, rate limiting, pub/sub, and lightweight queues.

## Common Redis Data Types

- String
- Hash
- List
- Set
- Sorted Set
- Stream
- Bitmap
- HyperLogLog
- Geospatial index

## Under The Hood: Redis Execution Model

Redis is often described as single-threaded, but the more precise engineering statement is:

> Redis command execution is mostly single-threaded for core data operations, while Redis may use additional threads for networking I/O, persistence, lazy freeing, or other background work depending on version and configuration.

Single-threaded execution works well because:

- most operations are memory-based and very fast;
- no complex locking is needed for normal commands;
- command execution is deterministic;
- event loop handles many client connections efficiently.

A key consequence of this execution model:

- one slow command can block other commands;
- big keys and expensive operations are dangerous;
- avoid commands that scan or process huge data synchronously in production.

Common risky commands:

```text
KEYS *
LRANGE huge-list 0 -1
HGETALL huge-hash
SMEMBERS huge-set
DEL huge-key
```

Safer ideas:

- use `SCAN` instead of `KEYS`;
- paginate large collections;
- use `UNLINK` for large asynchronous deletion where appropriate;
- split big keys;
- monitor slow log.

## Under The Hood: Redis Data Structures

Redis exposes simple data types, but internally it chooses memory-efficient encodings depending on data size and configuration.

Exact internal encodings can change by Redis version, so use this as an review mental model rather than memorizing implementation constants.

| Redis Type | Common Internal Ideas | Why It Matters |
|---|---|---|
| String | SDS / simple dynamic string | binary-safe, length-aware string |
| Hash | compact listpack or hash table | small hashes are memory-efficient; large hashes need hash table behavior |
| List | quicklist/listpack style linked chunks | efficient push/pop at ends |
| Set | integer set or hash table | small integer sets can be compact |
| Sorted Set | listpack or skip list + hash table | fast rank/range by score |
| Stream | radix-tree/listpack style storage | append-only event-like data |

### String And SDS

Redis strings are binary-safe. They are not just C-style null-terminated strings.

Conceptually, SDS stores:

```text
length
capacity/free space
byte buffer
```

Benefits:

- getting length is `O(1)`;
- binary data is allowed;
- appending can be efficient with extra capacity.

Use cases:

- cache JSON;
- counters;
- tokens;
- distributed lock values.

### Hash

Small hashes can use compact encoding to save memory.

Large hashes use hash-table-like behavior.

Use hash when:

- you store object fields;
- you update individual fields;
- you do not always need the whole object.

Avoid creating a huge hash with unbounded fields. It can become a big key.

### List

Redis lists are optimized for pushing and popping at both ends:

```text
LPUSH queue item
RPOP queue
```

Good for simple queues, but for robust consumer groups and replayable event processing, Redis Streams or a real message broker may be better.

### Sorted Set

Sorted sets combine:

- score-based ordering;
- member lookup;
- range queries.

Good for:

- leaderboard;
- ranking;
- delayed jobs;
- time-window queries.

Conceptually:

```text
member -> score
ordered by score
```

This is why sorted set range operations are useful:

```text
ZRANGEBYSCORE delayed-jobs -inf now
```

### Stream

Redis Streams are append-only message-like structures.

They support:

- stream IDs;
- consumer groups;
- pending entries;
- acknowledgement.

Use cases:

- lightweight event stream;
- activity feed;
- async processing with Redis.

But for large-scale durable event streaming, Kafka is usually a stronger fit.

## Expiration And Eviction

Expiration and eviction are different.

Expiration:

> A key has a TTL and becomes logically expired after time passes.

Eviction:

> Redis removes keys because memory policy requires it.

Expiration is handled with:

- lazy expiration: key is checked when accessed and removed if expired;
- active expiration: Redis periodically samples a subset of keys with TTL and removes expired ones.

Eviction depends on `maxmemory-policy`, such as:

- `noeviction`;
- `allkeys-lru`;
- `volatile-lru`;
- `allkeys-lfu`;
- `volatile-ttl`.

TTL expiration does not mean Redis deletes every expired key at the exact millisecond. Redis combines lazy and active expiration. Eviction is a separate memory-pressure behavior controlled by maxmemory policy.

## String

Use for simple values:

```text
user:123:name -> "Alice"
```

Use cases:

- cache JSON;
- counters;
- feature flags;
- temporary tokens.

## Hash

Use for object-like data:

```text
user:123
  name  Alice
  email alice@example.com
```

Good when you update individual fields.

## Set

Use for unique unordered values:

```text
online-users -> { 1, 2, 3 }
```

Use cases:

- tags;
- membership;
- unique visitors.

## Sorted Set

Each item has a score.

Use cases:

- ranking;
- leaderboard;
- delayed jobs;
- time-ordered data.

## Cache Aside Pattern

Most common application caching pattern.

Flow:

```text
Read:
  1. Check cache.
  2. If hit, return cached value.
  3. If miss, query database.
  4. Store result in cache.
  5. Return result.

Write:
  1. Update database.
  2. Invalidate cache.
```

.NET example:

```csharp
public sealed class ProductService
{
    private readonly IDistributedCache _cache;
    private readonly AppDbContext _dbContext;

    public ProductService(IDistributedCache cache, AppDbContext dbContext)
    {
        _cache = cache;
        _dbContext = dbContext;
    }

    public async Task<ProductDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        var cacheKey = $"product:{id}";

        var cached = await _cache.GetStringAsync(cacheKey, ct);
        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await _dbContext.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductDto(p.Id, p.Name, p.Price))
            .FirstOrDefaultAsync(ct);

        if (product is not null)
        {
            await _cache.SetStringAsync(
                cacheKey,
                JsonSerializer.Serialize(product),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10)
                },
                ct);
        }

        return product;
    }
}
```

## Cache Invalidation

Invalidation is often harder than caching.

Common strategies:

- delete cache after database update;
- short TTL;
- versioned keys;
- event-based invalidation;
- background refresh.

Update example:

```csharp
public async Task UpdatePriceAsync(int productId, decimal price, CancellationToken ct)
{
    var product = await _dbContext.Products.FindAsync([productId], ct);
    if (product is null)
    {
        throw new NotFoundException("Product not found.");
    }

    product.Price = price;
    await _dbContext.SaveChangesAsync(ct);

    await _cache.RemoveAsync($"product:{productId}", ct);
}
```

## Cache Penetration, Breakdown, Avalanche

Request asks for data that does not exist. Cache miss every time, database hit every time.

Solutions:

- cache null values for short TTL;
- validate IDs;
- Bloom filter;
- rate limiting.

Under the hood:

```text
Client requests product:-1 or random product IDs.
Redis miss.
Database miss.
Next request repeats with another missing ID.
Database receives all traffic.
```

Null caching example:

```csharp
public async Task<ProductDto?> GetProductAsync(int id, CancellationToken ct)
{
    var key = $"product:{id}";
    var cached = await _cache.GetStringAsync(key, ct);

    if (cached == "__NULL__")
    {
        return null;
    }

    if (cached is not null)
    {
        return JsonSerializer.Deserialize<ProductDto>(cached);
    }

    var product = await LoadProductFromDatabaseAsync(id, ct);

    if (product is null)
    {
        await _cache.SetStringAsync(
            key,
            "__NULL__",
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1)
            },
            ct);

        return null;
    }

    await CacheProductAsync(key, product, ct);
    return product;
}
```

Use short TTL for null values because missing data may be created later.

A hot key expires, many requests hit database simultaneously.

Solutions:

- mutex lock;
- background refresh;
- logical expiration;
- longer TTL for hot keys.

Under the hood:

```text
Hot key: product:iphone
Traffic: 20,000 requests/second
Key expires at 10:00:00
All requests miss Redis
All requests hit database
Database overloads
```

Only one request rebuilds the cache. Other requests wait briefly or return stale data.

Conceptual C#:

```csharp
private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();

public async Task<ProductDto?> GetHotProductAsync(int id, CancellationToken ct)
{
    var key = $"product:{id}";
    var cached = await _cache.GetStringAsync(key, ct);

    if (cached is not null)
    {
        return JsonSerializer.Deserialize<ProductDto>(cached);
    }

    var gate = Locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
    await gate.WaitAsync(ct);

    try
    {
        cached = await _cache.GetStringAsync(key, ct);
        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await LoadProductFromDatabaseAsync(id, ct);
        if (product is not null)
        {
            await CacheProductAsync(key, product, ct);
        }

        return product;
    }
    finally
    {
        gate.Release();
    }
}
```

In distributed systems, a local lock only protects one application instance. For multi-instance protection, consider a Redis lock, background refresh, or stale-while-revalidate design.

Many keys expire at the same time.

Solutions:

- randomize TTL;
- stagger expiration;
- protect database with rate limiting;
- pre-warm cache.

Under the hood:

```text
10,000 cache keys loaded at deployment time.
All keys use TTL = 30 minutes.
At 10:30, most keys expire together.
Redis miss rate spikes.
Database receives a traffic wave.
```

TTL jitter:

```csharp
private static TimeSpan WithJitter(TimeSpan baseTtl)
{
    var jitterSeconds = Random.Shared.Next(0, 300);
    return baseTtl + TimeSpan.FromSeconds(jitterSeconds);
}

await _cache.SetStringAsync(
    key,
    json,
    new DistributedCacheEntryOptions
    {
        AbsoluteExpirationRelativeToNow = WithJitter(TimeSpan.FromMinutes(30))
    },
    ct);
```

For critical hot data:

- pre-warm cache before traffic;
- refresh in background before expiration;
- use local memory fallback for read-mostly data;
- rate-limit database fallback;
- degrade gracefully if Redis or database is overloaded.

## Hot Key And Big Key Problems

### Hot Key

A hot key receives very high traffic.

Symptoms:

- one Redis node has high CPU/network;
- latency spikes;
- many app requests depend on one key;
- Redis cluster does not help much if all traffic targets one slot.

Solutions:

- local in-memory cache for very hot read-only data;
- split/shard the hot key if the data model allows;
- use CDN for public content;
- background refresh;
- request coalescing;
- read replicas where appropriate.

### Big Key

A big key stores too much data.

Examples:

- a huge JSON string;
- a list with millions of items;
- a hash with too many fields.

Problems:

- slow read/write;
- network overhead;
- blocking Redis event loop;
- memory fragmentation;
- slow deletion.

Solutions:

- split into smaller keys;
- paginate large collections;
- avoid storing huge object graphs;
- use `UNLINK` instead of `DEL` for large asynchronous deletion when appropriate;
- monitor key sizes.

## Redis Outage And Degradation

For cache usage, Redis should usually improve performance, not become the only path for correctness.

If Redis is down:

```text
Read cache fails
  -> fallback to database
  -> apply rate limit / circuit breaker
  -> log and alert
```

But for some use cases, behavior depends on business risk:

| Use Case | Possible Failure Mode |
|---|---|
| product cache | fallback to DB with protection |
| login rate limiting | often fail closed or stricter |
| feature flags | use local last-known-good values |
| distributed lock | fail safely; do not assume lock acquired |
| session storage | user may need to re-login |

The decision to fail open or fail closed depends on business risk. For cache reads, degrade to database with rate protection. For security controls, failing closed is often appropriate.

## Distributed Lock

Basic idea:

```text
SET lock:order:123 uniqueValue NX PX 30000
```

Meaning:

- `NX`: only set if not exists;
- `PX`: expiration in milliseconds.

Release safely only if the value matches.

Lua script:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

Warning:

Distributed locks are subtle. Prefer database constraints, idempotency keys, or queue-based serialization when possible.

## Rate Limiting

Simple fixed window:

```text
INCR rate:user:123:202604281930
EXPIRE rate:user:123:202604281930 60
```

Better algorithms:

- sliding window;
- token bucket;
- leaky bucket.

## StackExchange.Redis Example

```csharp
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis")!));
```

Usage:

```csharp
public sealed class LoginRateLimiter
{
    private readonly IDatabase _redis;

    public LoginRateLimiter(IConnectionMultiplexer connection)
    {
        _redis = connection.GetDatabase();
    }

    public async Task<bool> IsAllowedAsync(string email)
    {
        var key = $"login-rate:{email}:{DateTimeOffset.UtcNow:yyyyMMddHHmm}";
        var count = await _redis.StringIncrementAsync(key);

        if (count == 1)
        {
            await _redis.KeyExpireAsync(key, TimeSpan.FromMinutes(1));
        }

        return count <= 5;
    }
}
```

These patterns -- cache-aside reads, null-value caching, TTL jitter, explicit invalidation on writes, and rate limiter construction -- represent the core caching and Redis usage patterns in production .NET applications.
