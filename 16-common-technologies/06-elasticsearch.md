# Elasticsearch / OpenSearch

## Core Idea

Elasticsearch and OpenSearch are search engines built around inverted indexes.

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

The mapping from terms to document lists is stored in a **term dictionary** -- a sorted data structure (often a variant of a B-tree or a skip list) that allows fast term lookup. For each term, the index maintains a **postings list**: the set of document IDs where that term appears, along with frequency and position data.

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

Elasticsearch is fast for text search because it does not scan every document. It uses inverted indexes to jump from search terms to matching documents, then scores and ranks them.

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

The analyzer used at index time must be compatible with the analyzer used at search time. Wrong analyzer choice causes "the data is there, but search cannot find it" bugs.

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

Multi-fields serve distinct query purposes:

```text
name          -> full-text search
name.keyword  -> exact sort/aggregation
```

A `term` query on a `text` field often produces unexpected results because the field is tokenized. For example:

```json
{
  "term": {
    "name": "Wireless Keyboard"
  }
}
```

If `name` is `text`, it may be tokenized into lowercase terms, so an exact `term` query will not match. Use `match` for full-text search or `.keyword` for exact matching.

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

Shards are not free. Shard count should be chosen based on data size, query load, growth, and operational constraints. Too few shards limit scale; too many shards create overhead.

## Refresh, Flush, Segment Merge, And Near Real-Time Search

Elasticsearch is near real-time, not instantly consistent.

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

The formula does not need to be derived in most full-stack engineering practice, but the intuition is worth understanding.

BM25 considers:

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

Deep pagination is expensive because:

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

Mapping changes should not be treated casually. Versioned indexes and aliases allow rebuilding, validation, switching, and rollback without breaking search.

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

Writing SQL and Elasticsearch directly in the same request without a coordination plan creates several problems:

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

Search authorization must not rely only on frontend filters. The backend query builder must always enforce tenant and permission filters, and the indexed document should avoid unnecessary sensitive fields.

## Troubleshooting Search Problems

A document exists but search cannot find it.

Check:

- refresh delay;
- wrong analyzer;
- `term` query used on `text` field;
- wrong field name;
- tenant/security filter;
- indexing pipeline failed;
- stale alias points to old index.

Search is slow.

Check:

- deep pagination;
- too many shards;
- expensive wildcard/regexp;
- high-cardinality aggregations;
- large result size;
- missing filters;
- overloaded cluster;
- segment merge pressure.

Results are irrelevant.

Check:

- analyzer;
- synonyms;
- field boosts;
- exact match handling;
- phrase queries;
- business ranking signals;
- spelling/fuzzy settings.

The Elasticsearch design patterns in this chapter -- inverted index mapping analysis, alias-based reindexing, outbox-driven synchronization, and multi-tenant query isolation -- address the full lifecycle of production search index management.
