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

Redirect is read-heavy.

Use Redis:

```text
shorturl:abc123 -> long URL
```

Cache aside:

1. check Redis;
2. if miss, query database;
3. cache result;
4. redirect.

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
