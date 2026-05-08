# Collection Endpoints, Pagination, Filtering, And Sorting

## Core Idea

Collection endpoints are where many APIs begin to show their real design quality. A single-resource endpoint can remain acceptable even with weak conventions. List endpoints quickly become expensive, ambiguous, and difficult to evolve unless pagination, filtering, and sorting are designed deliberately.

## The Need For Structured Collection Endpoints

An unbounded list endpoint is rarely acceptable in a production API. It places too much trust in dataset size, client restraint, and network capacity. Even when it works initially, it tends to degrade quietly as data volume grows.

Pagination therefore serves two purposes:

- it protects the system from unbounded result sets;
- it gives the client a predictable way to navigate large collections.

Filtering and sorting serve a similar role. They make the collection query expressive without forcing the client to download and process far more data than it needs.

## Offset Pagination

Offset pagination is familiar and easy to explain:

```http
GET /api/orders?page=1&pageSize=20
```

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 1000
}
```

It works well when:

- clients need page numbers;
- result sets are not extremely deep;
- simplicity matters more than perfect stability under concurrent writes.

The server still needs guardrails such as minimum and maximum page size, deterministic ordering, and a predictable response envelope.

## Cursor Pagination

Cursor pagination is often better for large, continuously changing datasets:

```http
GET /api/orders?cursor=eyJjcmVhdGVkQXQiOiIyMDI2...&limit=50
```

This model is valuable because it navigates from one known boundary to the next rather than skipping an arbitrary number of rows. That usually makes it more stable under concurrent inserts and more efficient for deep traversal.

Its costs are also real:

- clients cannot jump naturally to page 87;
- cursor format becomes part of the contract;
- sorting rules must remain stable and deterministic.

Cursor pagination is therefore not universally better. It is better for specific collection-access patterns.

## Keyset Pagination

Keyset pagination (also called seek pagination) is a variant that uses a unique sort key to navigate pages rather than an opaque cursor token. The client specifies the last seen key value, and the server returns rows after that value:

```http
GET /api/orders?afterId=123&limit=50
```

```csharp
query = query
    .Where(o => o.Id > afterId)
    .OrderBy(o => o.Id)
    .Take(limit);
```

This approach is efficient because the database can use an index seek rather than a full scan plus offset. It also avoids the O(n) performance degradation that offset pagination suffers on deep pages. The trade-off is that the client must understand the key structure, and jumping to arbitrary pages is not possible without scanning to a known key.

## Deterministic Ordering

Pagination only works well if ordering is stable. Sorting solely by a non-unique field such as `CreatedAt` can lead to row movement between pages when duplicate values exist.

That is why a secondary tie-breaker is often required:

```csharp
query = query
    .OrderByDescending(order => order.CreatedAt)
    .ThenByDescending(order => order.Id);
```

This is not merely a database optimization. It is contract hygiene for collection traversal.

## Filter Design

Filtering should let clients narrow the collection through a predictable set of allowed dimensions:

```http
GET /api/orders?status=Paid&customerId=123&from=2026-01-01&to=2026-02-01
```

Each filter should have clear semantics:

- does it represent exact match, range, or inclusion;
- is it optional or required;
- how does it interact with pagination and sorting;
- what happens if the filter is invalid or contradictory.

A well-designed filter surface is explicit and enumerable. A loosely defined "query object" that tries to support every imagined combination often becomes harder for both server and client to reason about.

## Sorting As A Whitelisted Contract

Sorting looks simple until clients can choose it dynamically. At that point, the sorting surface becomes part of the contract and should be whitelisted explicitly:

```http
GET /api/orders?sort=-createdAt
```

```csharp
private static IQueryable<Order> ApplySorting(IQueryable<Order> query, string sort)
{
    return sort switch
    {
        "createdAt" => query.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id),
        "-createdAt" => query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id),
        "total" => query.OrderBy(o => o.Total).ThenBy(o => o.Id),
        "-total" => query.OrderByDescending(o => o.Total).ThenByDescending(o => o.Id),
        _ => query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
    };
}
```

Sorting fields belong to a known contract. Arbitrary field names or raw SQL order fragments should not flow directly from user input into the query layer.

## Total Count And Performance

Offset pagination often includes a `total` field that tells the client how many items exist in the full result set. That total count usually requires a separate `COUNT(*)` query, which can become expensive on large tables, especially with complex filters.

Several strategies help manage this cost:

- Caching the total count and refreshing it on a schedule or after writes.
- Showing an approximate count from index statistics instead of an exact count.
- Omitting the total in cursor-based pagination, where the client navigates forward with `hasNext` and does not need to know the total depth.
- Using `COUNT(*)` with the same filtering but without ordering, which still scans but avoids sort overhead.

The choice depends on how critical the exact total is for the client experience. Showing "about 1,000 results" rather than "1,047 results" is often acceptable and avoids forcing a potentially expensive query on every request.

## Generic Pagination Envelope

A reusable pagination envelope keeps collection responses consistent across the API:

```csharp
public sealed record PagedResult<T>
{
    public required IReadOnlyList<T> Items { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int Total { get; init; }
    public bool HasNext => Page * PageSize < Total;
}
```

For cursor-based pagination, a separate envelope avoids mixing concepts:

```csharp
public sealed record CursorResult<T>
{
    public required IReadOnlyList<T> Items { get; init; }
    public string? NextCursor { get; init; }
    public bool HasNext { get; init; }
}
```

## Metadata In Collection Responses

Collection responses often benefit from metadata such as:

- `page`;
- `pageSize`;
- `total`;
- `hasNext`;
- `nextCursor`.

That metadata should reflect the chosen pagination model rather than mixing incompatible concepts. Offset-style responses and cursor-style responses usually deserve different envelopes because they support different navigation behavior.

## Backend Query Shape And Contract Design

Collection design is not purely an API concern. The contract and the database access path influence one another. A filter or sort option should usually exist only if the backend can support it predictably with appropriate query shape and indexing.

This is one reason collection endpoints become such a strong test of overall system design. They reveal whether contract design, persistence design, and operational constraints are aligned.

## Design Consequences

Strong collection endpoints are bounded, explicit, and deterministic. They expose a clear filter and sort surface, use pagination that matches the client access pattern, and avoid pretending that unbounded lists are acceptable just because they are convenient to code.

When those choices are made deliberately, list APIs become far easier to evolve and far less likely to turn into the system's hidden scalability failure point.
