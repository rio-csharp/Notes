# Search Autocomplete System Design

## Problem

Design a search autocomplete system.

Chinese notes:

- `autocomplete`: 自动补全.
- `prefix`: 前缀.
- `ranking`: 排名.

## Requirements

Functional:

- return suggestions as user types;
- rank suggestions by popularity;
- support typo tolerance if needed;
- update suggestions periodically.

Non-functional:

- very low latency;
- high read throughput;
- scalable;
- language support;
- abuse protection.

## API Design

```http
GET /api/search/suggestions?q=iph&limit=10
```

Response:

```json
{
  "items": [
    "iphone",
    "iphone case",
    "iphone charger"
  ]
}
```

## Data Structures

Options:

- Trie;
- Elasticsearch completion suggester;
- Redis sorted sets;
- precomputed prefix table.

## Trie

Trie is good for prefix search.

But distributed, large-scale trie management can be complex.

Simple node model:

```csharp
public sealed class TrieNode
{
    public Dictionary<char, TrieNode> Children { get; } = new();
    public bool IsWordEnd { get; set; }
    public int Frequency { get; set; }
}
```

Trie is excellent for local prefix lookup, but ranking, updates, memory usage, and multi-language tokenization become harder at large scale.

## Elasticsearch Approach

Use search engine for:

- text analysis;
- ranking;
- typo tolerance;
- language support.

## Redis Sorted Set Approach

Key:

```text
suggest:iph
```

Value:

```text
iphone -> score 1000
iphone case -> score 800
```

Good for precomputed popular prefixes.

## Ranking Signals

- query frequency;
- click-through rate;
- product popularity;
- personalization;
- freshness;
- business boosting.

## Query Flow

```text
1. Ignore queries shorter than minimum length.
2. Check cache for normalized prefix.
3. Query precomputed Redis suggestions or Elasticsearch.
4. Apply ranking and filters.
5. Return top N results.
6. Record clicks asynchronously for future ranking.
```

## Frontend Request Control

Use debounce and cancellation.

```tsx
const debouncedQuery = useDebouncedValue(query, 200);

useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/search/suggestions?q=${encodeURIComponent(debouncedQuery)}`, {
    signal: controller.signal
  });

  return () => controller.abort();
}, [debouncedQuery]);
```

## Performance

Autocomplete must be fast.

Use:

- debounce on frontend;
- caching;
- precomputed suggestions;
- CDN for public suggestions;
- request limit.

## Abuse Defense

Autocomplete endpoints can be hit on every keystroke.

Use:

- minimum query length;
- per-user/IP rate limiting;
- caching;
- query normalization;
- bot detection;
- max result limit;
- input length limit.

## Knowledge Checks

### How would you build autocomplete?

For small scale, a trie or database prefix query may work. For production, use precomputed suggestions in Redis or Elasticsearch completion features, with ranking based on popularity and click data.

### How do you reduce frontend requests?

Debounce input, ignore very short queries, cancel obsolete requests, and cache recent suggestions.

### How do you rank suggestions?

Use frequency, click-through, conversion, freshness, and business rules.

## Common Mistakes

- Query database on every keystroke without debounce.
- No minimum query length.
- No ranking strategy.
- No cache.
- No abuse/rate limiting.
- Ignoring language/tokenization.
