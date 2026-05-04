# Pagination, Filtering, And Sorting APIs

## Core Idea

List APIs must support pagination, filtering, and sorting to stay fast and usable.

Chinese notes:

- `pagination`: 分页.
- `filtering`: 筛选.
- `sorting`: 排序.
- `cursor`: 游标.

## Offset Pagination

Request:

```http
GET /api/orders?page=1&pageSize=20
```

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 1000
}
```

Backend:

```csharp
var page = Math.Max(request.Page, 1);
var pageSize = Math.Clamp(request.PageSize, 1, 100);

var items = await query
    .OrderByDescending(o => o.CreatedAt)
    .ThenByDescending(o => o.Id)
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync(ct);
```

Complete request/response models:

```csharp
public sealed record OrderListRequest(
    OrderStatus? Status,
    DateTimeOffset? From,
    DateTimeOffset? To,
    string Sort = "-createdAt",
    int Page = 1,
    int PageSize = 20);

public sealed record PagedResponse<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int Total,
    bool HasNext);
```

Complete offset query:

```csharp
public async Task<PagedResponse<OrderListItemResponse>> SearchAsync(
    OrderListRequest request,
    CancellationToken ct)
{
    var page = Math.Max(request.Page, 1);
    var pageSize = Math.Clamp(request.PageSize, 1, 100);

    IQueryable<Order> query = _dbContext.Orders.AsNoTracking();

    if (request.Status is not null)
    {
        query = query.Where(order => order.Status == request.Status);
    }

    if (request.From is not null)
    {
        var from = request.From.Value;
        query = query.Where(order => order.CreatedAt >= from);
    }

    if (request.To is not null)
    {
        var to = request.To.Value;
        query = query.Where(order => order.CreatedAt < to);
    }

    query = ApplySorting(query, request.Sort);

    var total = await query.CountAsync(ct);

    var items = await query
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(order => new OrderListItemResponse(
            order.Id,
            order.Status.ToString(),
            order.Total,
            order.CreatedAt))
        .ToListAsync(ct);

    return new PagedResponse<OrderListItemResponse>(
        items,
        page,
        pageSize,
        total,
        page * pageSize < total);
}
```

## Cursor Pagination

Request:

```http
GET /api/orders?cursor=eyJjcmVhdGVkQXQiOiIyMDI2...&limit=50
```

Good for:

- infinite scroll;
- large datasets;
- stable next-page navigation.

Trade-off:

- harder to jump to arbitrary page;
- cursor format must be stable and protected.

Cursor shape:

```csharp
public sealed record OrderCursor(DateTimeOffset CreatedAt, int Id);
```

Encode/decode:

```csharp
public static class CursorCodec
{
    public static string Encode(OrderCursor cursor)
    {
        var json = JsonSerializer.Serialize(cursor);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }

    public static OrderCursor? Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor))
        {
            return null;
        }

        var json = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
        return JsonSerializer.Deserialize<OrderCursor>(json);
    }
}
```

Cursor query:

```csharp
public async Task<CursorPage<OrderListItemResponse>> SearchByCursorAsync(
    string? cursor,
    int limit,
    CancellationToken ct)
{
    var safeLimit = Math.Clamp(limit, 1, 100);
    var decoded = CursorCodec.Decode(cursor);

    var query = _dbContext.Orders
        .AsNoTracking()
        .OrderByDescending(order => order.CreatedAt)
        .ThenByDescending(order => order.Id)
        .AsQueryable();

    if (decoded is not null)
    {
        query = query.Where(order =>
            order.CreatedAt < decoded.CreatedAt ||
            (order.CreatedAt == decoded.CreatedAt && order.Id < decoded.Id));
    }

    var rows = await query
        .Take(safeLimit + 1)
        .Select(order => new OrderListItemResponse(
            order.Id,
            order.Status.ToString(),
            order.Total,
            order.CreatedAt))
        .ToListAsync(ct);

    var items = rows.Take(safeLimit).ToList();
    var nextCursor = rows.Count > safeLimit
        ? CursorCodec.Encode(new OrderCursor(items[^1].CreatedAt, items[^1].Id))
        : null;

    return new CursorPage<OrderListItemResponse>(items, nextCursor);
}
```

Response:

```csharp
public sealed record CursorPage<T>(
    IReadOnlyList<T> Items,
    string? NextCursor);
```

For public APIs, consider signing or encrypting cursors if clients must not tamper with cursor contents.

## Filtering

```http
GET /api/orders?status=Paid&customerId=123&from=2026-01-01&to=2026-02-01
```

Backend:

```csharp
if (request.Status is not null)
{
    query = query.Where(o => o.Status == request.Status);
}

if (request.CustomerId is not null)
{
    query = query.Where(o => o.CustomerId == request.CustomerId);
}
```

## Sorting

Simple:

```http
GET /api/orders?sort=-createdAt
```

Meaning:

- `createdAt`: ascending;
- `-createdAt`: descending.

Validate allowed sort fields.

```csharp
query = request.Sort switch
{
    "createdAt" => query.OrderBy(o => o.CreatedAt),
    "-createdAt" => query.OrderByDescending(o => o.CreatedAt),
    "total" => query.OrderBy(o => o.Total),
    "-total" => query.OrderByDescending(o => o.Total),
    _ => query.OrderByDescending(o => o.CreatedAt)
};
```

Do not directly convert arbitrary user input to dynamic SQL without validation.

Reusable sorting helper:

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

Stable ordering matters because duplicate `CreatedAt` or `Total` values can otherwise make rows jump between pages.

## Response Metadata

Useful fields:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 1000,
  "hasNext": true
}
```

Controller endpoint:

```csharp
[HttpGet]
public async Task<ActionResult<PagedResponse<OrderListItemResponse>>> Search(
    [FromQuery] OrderListRequest request,
    CancellationToken ct)
{
    var result = await _orders.SearchAsync(request, ct);
    return Ok(result);
}
```

## Review Questions

### Why must list APIs be paginated?

> Unbounded list APIs can overload the database, network, API server, and frontend. Pagination controls resource usage and improves user experience.

### Offset vs cursor pagination?

> Offset pagination is simple and supports page numbers, but deep pages can be slow and inconsistent under writes. Cursor pagination is better for large or continuously changing datasets but is more complex.

### How do you design sorting safely?

> Define a whitelist of allowed sort fields and map them to known expressions. Do not pass arbitrary user input into SQL order clauses.

## Common Mistakes

- No maximum page size.
- No stable ordering.
- No indexes for filters/sorts.
- Counting total on very expensive queries without thought.
- Dynamic SQL injection through sort field.
- Returning all rows for export.

## Practice Task

Build:

1. offset paginated order list;
2. cursor paginated order list;
3. status/date filters;
4. safe sorting whitelist;
5. indexes supporting the query.
