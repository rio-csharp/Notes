# Rate Limiter System Design

## Problem

Design a rate limiter that restricts how many requests a user or client can make in a time window.

Chinese notes:

- `rate limiter`: 限流器.
- `token bucket`: 令牌桶.
- `sliding window`: 滑动窗口.

## Requirements

Functional:

- limit requests per user/API key/IP;
- return `429 Too Many Requests`;
- support different limits for different plans;
- work across multiple API instances.

Non-functional:

- low latency;
- high availability;
- accurate enough;
- horizontally scalable;
- observable.

## Algorithms

### Fixed Window

Allow N requests per fixed window.

Example:

```text
100 requests per minute
```

Problem:

Boundary burst. A client can send 100 requests at 12:00:59 and 100 at 12:01:00.

### Sliding Window

Tracks requests over a moving window.

More accurate but more storage/compute.

### Token Bucket

Tokens refill at a fixed rate. Each request consumes one token.

Allows controlled burst.

### Leaky Bucket

Requests are processed at a steady rate.

Good for smoothing traffic.

## Under The Hood: Algorithm Trade-offs

### Fixed Window

Fixed window is simple:

```text
Limit: 100 requests/minute
Window: 12:00:00 - 12:00:59
```

Problem:

```text
100 requests at 12:00:59
100 requests at 12:01:00
```

The client effectively sends 200 requests in 2 seconds.

Pros:

- simple;
- cheap;
- easy with Redis `INCR` + `EXPIRE`.

Cons:

- boundary burst problem;
- less accurate.

### Sliding Log

Store timestamps for each request.

```text
user:123 -> [10:00:01, 10:00:02, 10:00:07]
```

Pros:

- accurate.

Cons:

- memory-heavy for high traffic;
- requires cleanup.

### Sliding Window Counter

Approximate current usage by combining current and previous fixed windows.

Pros:

- more accurate than fixed window;
- cheaper than sliding log.

Cons:

- still approximate.

### Token Bucket

Tokens refill at a fixed rate up to a maximum capacity.

Allows controlled bursts.

Good for APIs where short bursts are acceptable.

### Leaky Bucket

Requests leave at a steady rate.

Good for smoothing traffic.

Trade-off:

- can add queueing delay;
- may reject when queue is full.

Engineering perspective:

> I choose based on product behavior. Fixed window is simple but has boundary bursts. Sliding log is accurate but expensive. Token bucket is a strong default because it allows controlled burst while enforcing long-term rate.

## Redis Lua For Atomicity

Distributed rate limiting needs atomic updates.

Bad:

```text
GET count
if count < limit:
  INCR count
```

Two requests can race.

Use Redis atomic commands or Lua script.

Conceptual Lua:

```lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call("GET", key) or "0")

if current >= limit then
    return 0
end

current = redis.call("INCR", key)

if current == 1 then
    redis.call("EXPIRE", key, ttl)
end

return 1
```

Key point:

> For a distributed rate limiter, the check and increment must be atomic. Redis Lua or carefully chosen atomic commands prevent race conditions.

## Fail Open vs Fail Closed

If the rate limiter store is unavailable, choose behavior by business risk.

Fail open:

- allow requests;
- better availability;
- risk abuse.

Fail closed:

- reject requests;
- better protection;
- risk blocking legitimate users.

Examples:

| Scenario | Choice |
|---|---|
| public product browsing | often fail open with logging |
| login brute-force protection | often fail closed or stricter |
| payment API protection | fail closed or degraded manual review |
| internal low-risk API | fail open may be acceptable |

Engineering perspective:

> Rate limiter failure behavior is a product/security decision. I explicitly choose fail-open or fail-closed based on abuse risk and availability requirements.

## Redis Fixed Window Example

Key:

```text
rate:{clientId}:{yyyyMMddHHmm}
```

C# concept:

```csharp
public async Task<bool> IsAllowedAsync(string clientId)
{
    var window = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmm");
    var key = $"rate:{clientId}:{window}";

    var count = await _redis.StringIncrementAsync(key);

    if (count == 1)
    {
        await _redis.KeyExpireAsync(key, TimeSpan.FromMinutes(1));
    }

    return count <= 100;
}
```

## Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
```

## High-level Architecture

```text
Client
  -> API Gateway / Middleware
  -> Redis
  -> API Service
```

Rate limiting can happen at:

- CDN;
- API gateway;
- reverse proxy;
- application middleware.

## Trade-offs

Application-level limiter:

- flexible business rules;
- can use user identity;
- adds app latency.

Gateway-level limiter:

- protects services earlier;
- centralized;
- less business context.

## Failure Handling

If Redis is down:

Options:

- fail open: allow requests;
- fail closed: reject requests;
- local fallback limiter.

Engineering perspective:

> For public abuse protection, I may fail closed for suspicious traffic. For critical internal business APIs, I may fail open temporarily and alert, because blocking all traffic could be worse.

## Token Bucket With Redis Lua

Token bucket stores:

```text
tokens remaining
last refill timestamp
```

Conceptual Lua:

```lua
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "updated_at")
local tokens = tonumber(bucket[1]) or capacity
local updated_at = tonumber(bucket[2]) or now

local elapsed = math.max(0, now - updated_at)
local refill = elapsed * refill_rate
tokens = math.min(capacity, tokens + refill)

if tokens < requested then
    redis.call("HMSET", key, "tokens", tokens, "updated_at", now)
    redis.call("EXPIRE", key, 3600)
    return {0, tokens}
end

tokens = tokens - requested
redis.call("HMSET", key, "tokens", tokens, "updated_at", now)
redis.call("EXPIRE", key, 3600)
return {1, tokens}
```

This makes refill and consume atomic.

## ASP.NET Core Middleware Shape

```csharp
public sealed class RateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IRateLimiter _rateLimiter;

    public RateLimitMiddleware(RequestDelegate next, IRateLimiter rateLimiter)
    {
        _next = next;
        _rateLimiter = rateLimiter;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var clientId = context.User.Identity?.Name
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous";

        var result = await _rateLimiter.CheckAsync(
            clientId,
            context.Request.Path,
            context.RequestAborted);

        context.Response.Headers["X-RateLimit-Limit"] = result.Limit.ToString();
        context.Response.Headers["X-RateLimit-Remaining"] = result.Remaining.ToString();

        if (!result.Allowed)
        {
            context.Response.Headers["Retry-After"] = result.RetryAfterSeconds.ToString();
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            return;
        }

        await _next(context);
    }
}
```

## Knowledge Checks

### Which algorithm would you choose?

> For many APIs, token bucket is a good balance because it supports steady refill and controlled burst. Fixed window is simpler but less accurate around boundaries.

### How do you scale it?

> Use a centralized fast store like Redis, or enforce at gateway level. Keys should be designed by client identity and route. Monitor Redis latency and hot keys.

### How do you handle distributed API servers?

> Use shared state such as Redis, or move rate limiting to API gateway/CDN where requests pass through a centralized layer.

## Common Mistakes

- Per-instance in-memory limiter in multi-instance deployment.
- No `429` response.
- No client identity strategy.
- No different limits for different endpoints.
- No Redis failure plan.
- No monitoring.
