# URL Shortener System Design

## Problem

Design a URL shortener like Bitly.

## Requirements

Functional:

- create short URL;
- redirect short URL to long URL;
- custom alias;
- expiration;
- analytics.

Non-functional:

- high read traffic;
- low latency redirects;
- high availability;
- durable mappings;
- abuse prevention.

## API Design

Create:

```http
POST /api/urls

{
  "longUrl": "https://example.com/very/long/path",
  "customAlias": "promo2026"
}
```

Response:

```json
{
  "shortUrl": "https://sho.rt/abc123"
}
```

Redirect:

```http
GET /abc123
```

Response:

```http
302 Found
Location: https://example.com/very/long/path
```

## Data Model

```sql
CREATE TABLE ShortUrls
(
    Id BIGINT IDENTITY PRIMARY KEY,
    Code NVARCHAR(20) NOT NULL UNIQUE,
    LongUrl NVARCHAR(2048) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    ExpiresAt DATETIMEOFFSET NULL,
    CreatedByUserId INT NULL
);
```

## Code Generation

Options:

- base62 encode database ID;
- random code with collision check;
- hash long URL with collision handling.

Base62 characters:

```text
0-9 a-z A-Z
```

Example:

```csharp
public static class Base62
{
    private const string Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    public static string Encode(long value)
    {
        if (value == 0)
        {
            return "0";
        }

        var builder = new StringBuilder();

        while (value > 0)
        {
            builder.Insert(0, Alphabet[(int)(value % 62)]);
            value /= 62;
        }

        return builder.ToString();
    }
}
```

Use a unique database constraint on `Code`. Code generation reduces collision probability, but the database enforces correctness.

## Caching

The redirect path is read-heavy: a short URL may be accessed millions of times while its long URL is set once at creation. Every redirect must be fast, so caching is critical.

### Cache Layout

```text
Key:  shorturl:abc123
Value: {"longUrl": "https://example.com/very/long/path", "expiresAt": "..."}
TTL:  1 hour (sliding reset on each hit)
```

### Cache-Aside Flow

1. Check Redis for the short code.
2. On cache hit, redirect immediately (no database query).
3. On cache miss, query the database for the mapping.
4. If the mapping exists and has not expired, store in Redis and redirect.
5. If the mapping does not exist or is expired, return 404.

### Cache Population Strategy

- **On read (lazy population)**: first redirect fills the cache from the database. Simple and works for all codes. Warmup time: the first redirect for each code is slow.
- **On write (eager population)**: when a short URL is created, pre-populate Redis. Eliminates the cold-start latency for new URLs but requires the cache to be updated if the long URL is changed.

For a production URL shortener, combine both: populate on create for popular expected links and rely on lazy loading for the long tail of infrequently accessed URLs.

Redirect service:

```csharp
public async Task<IActionResult> RedirectAsync(string code, CancellationToken ct)
{
    var cacheKey = $"shorturl:{code}";
    var cached = await _cache.GetStringAsync(cacheKey, ct);

    if (cached is not null)
    {
        return new RedirectResult(cached, permanent: false);
    }

    var entry = await _dbContext.ShortUrls
        .AsNoTracking()
        .FirstOrDefaultAsync(x => x.Code == code, ct);

    if (entry is null || entry.ExpiresAt <= DateTimeOffset.UtcNow || entry.IsDisabled)
    {
        return new NotFoundResult();
    }

    await _cache.SetStringAsync(
        cacheKey,
        entry.LongUrl,
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1)
        },
        ct);

    _clickPublisher.Publish(new UrlClickedEvent(code, DateTimeOffset.UtcNow));

    return new RedirectResult(entry.LongUrl, permanent: false);
}
```

## Analytics

Do not block redirect path on analytics writes.

Better:

```text
Redirect API -> Queue/Kafka -> Analytics Worker
```

Track:

- timestamp;
- user agent;
- IP region;
- referrer;
- short code.

## Abuse Prevention

- rate limit creation;
- malware URL scanning;
- blocklist domains;
- user reporting;
- admin takedown.

Add a disable flag:

```sql
ALTER TABLE ShortUrls
ADD IsDisabled BIT NOT NULL DEFAULT 0;
```
