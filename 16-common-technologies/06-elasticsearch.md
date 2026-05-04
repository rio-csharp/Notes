# Elasticsearch / OpenSearch

## Core Idea

Elasticsearch and OpenSearch are search engines built around inverted indexes.

Chinese notes:

- `inverted index`: 倒排索引.
- `document`: 文档.
- `shard`: 分片.
- `analyzer`: 分词器.

## Use Cases

- full-text search;
- autocomplete;
- log search;
- product search;
- filtering and aggregations;
- analytics over semi-structured documents.

## Index And Document

Document:

```json
{
  "id": "p-100",
  "name": "Wireless Keyboard",
  "category": "Electronics",
  "price": 49.99
}
```

Index:

```text
products
```

## Inverted Index

Instead of scanning every document, search engine maps terms to documents.

Example:

```text
wireless -> p-100, p-200
keyboard -> p-100
```

## Analyzer

Analyzer controls how text is tokenized and normalized.

It affects:

- full-text search;
- case handling;
- stemming;
- language support.

## Under The Hood: Inverted Index

A relational database index usually maps:

```text
row key -> row location
```

An inverted index maps:

```text
term -> documents containing that term
```

Example documents:

```json
{ "id": "1", "name": "wireless mechanical keyboard" }
{ "id": "2", "name": "wireless mouse" }
```

Simplified inverted index:

```text
wireless    -> doc 1, doc 2
mechanical  -> doc 1
keyboard    -> doc 1
mouse       -> doc 2
```

Search engines can also store metadata such as:

- term frequency;
- document frequency;
- term positions;
- offsets for highlighting;
- doc values for sorting and aggregations.

Chinese notes:

- `term frequency`: 词频.
- `document frequency`: 文档频率.
- `doc values`: 面向排序/聚合的列式存储结构.

Engineering perspective:

> Elasticsearch is fast for text search because it does not scan every document. It uses inverted indexes to jump from search terms to matching documents, then scores and ranks them.

## Analyzer Pipeline: Character Filter, Tokenizer, Token Filter

Analyzer is a pipeline.

```text
raw text
  -> character filters
  -> tokenizer
  -> token filters
  -> indexed tokens
```

Example:

```text
"Wireless Keyboards!"
  -> lowercase
  -> tokens: wireless, keyboards
  -> stemming: wireless, keyboard
```

Simple custom analyzer example:

```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "product_name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "product_name_analyzer"
      }
    }
  }
}
```

Important Key point:

> The analyzer used at index time must be compatible with the analyzer used at search time. Wrong analyzer choice causes "the data is there, but search cannot find it" bugs.

## Mapping: `text` vs `keyword`

`text` fields are analyzed.

Use for:

- full-text search;
- product names;
- article body;
- descriptions.

`keyword` fields are not analyzed.

Use for:

- exact match;
- filtering;
- sorting;
- aggregations;
- IDs;
- status;
- category codes.

Mapping example:

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "name": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "category": { "type": "keyword" },
      "price": { "type": "scaled_float", "scaling_factor": 100 },
      "createdAt": { "type": "date" }
    }
  }
}
```

Why multi-fields matter:

```text
name          -> full-text search
name.keyword  -> exact sort/aggregation
```

Common mistake:

```json
{
  "term": {
    "name": "Wireless Keyboard"
  }
}
```

If `name` is `text`, it may be tokenized into lowercase terms. Exact `term` query on analyzed text often surprises people. Use `match` for full text or `.keyword` for exact matching.

## Shards And Replicas

An index is split into primary shards.

Replicas are copies of primary shards.

```text
Index: products
  primary shard 0 -> replica 0
  primary shard 1 -> replica 1
  primary shard 2 -> replica 2
```

Shards help:

- distribute data;
- parallelize search;
- improve availability with replicas.

But too many shards hurt:

- more memory overhead;
- more file handles;
- more coordination cost;
- slower cluster recovery;
- small shards waste resources.

Chinese note:

- `replica`: 副本.

Practical explanation:

> Shards are not free. I choose shard count based on data size, query load, growth, and operational constraints. Too few shards limit scale; too many shards create overhead.

## Refresh, Flush, Segment Merge, And Near Real-Time Search

Elasticsearch is near real-time, not instantly consistent.

Chinese note:

- `near real-time`: 近实时.

Simplified write path:

```text
document indexed
  -> in-memory buffer
  -> translog for durability
  -> refresh creates searchable segment
  -> flush commits data
  -> merge combines small segments later
```

Refresh:

- makes new documents visible to search;
- happens periodically by default;
- can be forced, but forcing too often hurts performance.

Flush:

- commits data and trims translog;
- more about durability and recovery than immediate search visibility.

Segment merge:

- combines smaller immutable segments;
- reduces search overhead;
- can consume I/O and CPU.

Common misconception:

> If you index a document and immediately search for it, it may not appear until refresh. That is expected behavior unless you force refresh or read by ID from the realtime get path.

## Relevance Scoring And BM25

Elasticsearch commonly uses BM25 scoring.

You do not need to derive the formula in most full-stack engineering practice, but you should know the intuition.

BM25 considers:

- how often the term appears in the document;
- how rare the term is across all documents;
- document length normalization.

Example:

```text
Search: "wireless keyboard"

Document A: "wireless keyboard"
Document B: "wireless wireless wireless keyboard keyboard ..."
Document C: "keyboard"
```

The engine scores documents based on matching terms and relevance, not only whether a row matches.

Practical tuning tools:

- field boosts;
- exact match boosting;
- phrase queries;
- function score;
- synonyms;
- business ranking signals such as popularity or inventory.

Example boosted query:

```json
{
  "query": {
    "multi_match": {
      "query": "wireless keyboard",
      "fields": ["name^3", "description"]
    }
  }
}
```

## Filtering vs Querying

Query context asks:

```text
How relevant is this document?
```

Filter context asks:

```text
Does this document match yes/no?
```

Example:

```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "name": "wireless keyboard" } }
      ],
      "filter": [
        { "term": { "category": "electronics" } },
        { "range": { "price": { "lte": 100 } } }
      ]
    }
  }
}
```

Use filters for:

- category;
- status;
- tenant ID;
- numeric ranges;
- exact constraints.

Filters can be cached and do not affect relevance score.

## Query Types

Full-text:

```json
{
  "query": {
    "match": {
      "name": "wireless keyboard"
    }
  }
}
```

Exact:

```json
{
  "query": {
    "term": {
      "category.keyword": "Electronics"
    }
  }
}
```

## Pagination

Avoid deep `from/size` pagination.

Use:

- `search_after`;
- scroll for batch processing;
- index sorting where useful.

Why deep pagination is expensive:

```text
from = 10000
size = 20
```

The search engine may need to gather and sort many skipped results across shards before returning only 20.

Use `search_after` for user-facing deep pagination:

```json
{
  "size": 20,
  "query": {
    "match": {
      "name": "keyboard"
    }
  },
  "sort": [
    { "createdAt": "desc" },
    { "id": "asc" }
  ],
  "search_after": ["2026-04-01T10:00:00Z", "p-100"]
}
```

Requirements:

- stable sort order;
- include a tie-breaker such as `id`;
- store the last sort values from the previous page.

Use scroll for batch processing, not normal interactive pagination.

## Index Alias And Reindex Strategy

Mappings cannot always be changed safely in-place.

A common production strategy:

```text
products_v1
products_v2
alias: products_current -> products_v1
```

Reindex flow:

```text
1. Create products_v2 with new mapping.
2. Backfill data from SQL source of truth.
3. Keep v2 updated from events/CDC/outbox.
4. Validate counts and sample queries.
5. Switch alias products_current from v1 to v2.
6. Keep rollback window.
7. Delete old index later.
```

Alias switch example:

```json
{
  "actions": [
    { "remove": { "index": "products_v1", "alias": "products_current" } },
    { "add": { "index": "products_v2", "alias": "products_current" } }
  ]
}
```

Engineering perspective:

> I do not treat mapping changes casually. I use versioned indexes and aliases so I can rebuild, validate, switch, and roll back without breaking search.

## Syncing Data

Search index is usually not source of truth.

Source of truth:

- SQL database.

Sync methods:

- application writes to both with outbox;
- event-driven indexing;
- CDC;
- scheduled reindex.

## Consistency With SQL Source Of Truth

Elasticsearch is usually a derived read model.

Common architecture:

```text
SQL transaction
  -> write business data
  -> write outbox event
background publisher
  -> publish ProductChanged event
indexer
  -> update Elasticsearch document
```

Why not write SQL and Elasticsearch directly in the request without a plan?

- SQL write may succeed but indexing may fail;
- indexing may succeed but SQL transaction may roll back;
- retries can duplicate events;
- search may briefly show stale data;
- deletes are easy to forget.

Outbox-style event:

```json
{
  "eventId": "01J...",
  "type": "ProductChanged",
  "productId": "p-100",
  "version": 27,
  "occurredAt": "2026-04-30T10:00:00Z"
}
```

Indexer safety:

- use idempotent updates;
- include entity version;
- ignore older events when a newer version was already indexed;
- support full reindex from SQL;
- monitor indexing lag.

Example:

```csharp
public async Task IndexProductAsync(ProductChanged message, CancellationToken ct)
{
    var product = await _db.Products
        .AsNoTracking()
        .SingleOrDefaultAsync(x => x.Id == message.ProductId, ct);

    if (product is null)
    {
        await _search.DeleteAsync<ProductDocument>(message.ProductId, ct);
        return;
    }

    var document = ProductDocument.From(product);
    await _search.IndexAsync(document, message.ProductId, ct);
}
```

## Multi-Tenancy And Security

For multi-tenant systems, every query must enforce tenant isolation.

Example:

```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "name": "keyboard" } }
      ],
      "filter": [
        { "term": { "tenantId": "tenant-a" } }
      ]
    }
  }
}
```

Risks:

- missing tenant filter leaks data;
- indexing sensitive fields exposes them to search operators;
- logs may include query terms with private data;
- snapshots/backups need access control.

Engineering perspective:

> Search authorization must not rely only on frontend filters. The backend query builder must always enforce tenant and permission filters, and the indexed document should avoid unnecessary sensitive fields.

## Troubleshooting Search Problems

Problem: document exists but search cannot find it.

Check:

- refresh delay;
- wrong analyzer;
- `term` query used on `text` field;
- wrong field name;
- tenant/security filter;
- indexing pipeline failed;
- stale alias points to old index.

Problem: search is slow.

Check:

- deep pagination;
- too many shards;
- expensive wildcard/regexp;
- high-cardinality aggregations;
- large result size;
- missing filters;
- overloaded cluster;
- segment merge pressure.

Problem: results are irrelevant.

Check:

- analyzer;
- synonyms;
- field boosts;
- exact match handling;
- phrase queries;
- business ranking signals;
- spelling/fuzzy settings.

## Knowledge Checks

### Why use Elasticsearch instead of SQL LIKE?

> Elasticsearch is designed for full-text search, relevance scoring, analyzers, inverted indexes, fuzzy search, and aggregations at scale. SQL LIKE is limited and often inefficient for complex search.

### Is Elasticsearch source of truth?

> Usually no. It is typically a derived read model. The primary database remains the source of truth.

### How do you keep search index updated?

> Use events/outbox, CDC, or scheduled indexing. Accept eventual consistency and provide reindex capability.

### What is the difference between `text` and `keyword`?

> `text` is analyzed and used for full-text search. `keyword` is kept as an exact value and used for filtering, sorting, aggregations, IDs, status, and category fields.

### Why should you avoid deep `from/size` pagination?

> Deep pagination forces the engine to gather and sort many skipped results, often across shards. For deep user pagination, `search_after` with stable sorting is usually better. For batch export, scroll or point-in-time style approaches are more appropriate.

### Why is Elasticsearch near real-time?

> Newly indexed documents become visible to search after a refresh creates searchable segments. This usually happens quickly, but not necessarily immediately after the write.

### How do you change a mapping safely?

> I create a new versioned index with the new mapping, backfill from the source of truth, keep it updated, validate it, then switch an alias. This gives a rollback path.

## Common Mistakes

- Treating search index as transactional source of truth.
- Wrong field mapping.
- Deep pagination.
- No reindex strategy.
- No alias strategy.
- Indexing sensitive data unnecessarily.
- Using `term` query on analyzed `text` fields.
- Forgetting tenant filters in backend search queries.
- Forcing refresh after every write.
- Choosing too many shards.
- Ignoring indexing lag and failed indexing events.

## Practice Task

Design product search with:

1. SQL source of truth;
2. product indexed document;
3. event-driven index update;
4. autocomplete;
5. reindex process;
6. search result pagination.
7. tenant filter;
8. versioned index and alias;
9. outbox-based indexing;
10. stale result handling.
