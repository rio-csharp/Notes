# Search Autocomplete System Design

## Problem

Design a search autocomplete system.

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

A trie (prefix tree) organizes strings by their shared prefixes. Each node represents a single character; a path from root to a node spells a prefix. This makes prefix lookups fast: finding all suggestions for "iph" requires traversing only three nodes and then collecting all descendant completions.

### Mechanism

```csharp
public sealed class TrieNode
{
    public Dictionary<char, TrieNode> Children { get; } = new();
    public bool IsWordEnd { get; set; }
    public int Frequency { get; set; }
}
```

To find completions for a prefix:

1. Traverse from the root, following each character in the prefix. If a character is missing, return empty.
2. From the final node, perform a depth-first (or best-first) traversal to collect candidate completions, using the `Frequency` score for ranking.

### Scaling Challenges

A trie is excellent for in-memory local prefix lookup, but distributed, large-scale deployment introduces challenges:

- **Memory**: a trie of common English words with frequency data can consume hundreds of megabytes. If the trie is rebuilt periodically from search logs, each rebuild creates a new trie before swapping out the old one, doubling peak memory.
- **Ranking by popularity**: the trie stores per-node frequencies, but if the popular queries change, the trie must be rebuilt. Real-time frequency updates require atomic increment operations on shared nodes, which is impractical in a distributed setting.
- **Multi-language tokenization**: languages without clear word boundaries (Chinese, Japanese) require segmentation before trie indexing, adding complexity.
- **Sharding**: distributing the trie across machines requires splitting the key space (e.g., by first-character prefix), but this creates hot partitions for popular prefixes like "a" or "s".

Because of these constraints, production autocomplete systems often combine multiple approaches: a trie for the hot prefix cache, Elasticsearch for the full suggestion corpus, and Redis sorted sets for trending queries.

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
