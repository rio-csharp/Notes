# Query Translation And Read Models

## Core Idea

EF Core querying is the process of describing a data request in LINQ, allowing the provider to translate that expression into database commands, and materializing the result into entities or projected read models. LINQ in EF Core is not ordinary in-memory LINQ. It is a query description language whose meaning depends on translation. Query shape influences SQL shape, projection matters enormously, and query boundaries belong in a layered application rather than wherever a `DbContext` happens to be available.

## `IQueryable<T>` As A Deferred Query Description

An EF Core query usually starts as `IQueryable<T>`:

```csharp
IQueryable<Order> query = _dbContext.Orders;
```

At this stage, the application does not yet have results. It has an expression tree describing a potential query. Execution happens only when the query is materialized through methods such as:

- `ToListAsync`
- `FirstOrDefaultAsync`
- `SingleAsync`
- `CountAsync`
- `AnyAsync`

That deferred model is useful because it allows filters, ordering, projection, and pagination to compose into one provider-translated command instead of several disconnected operations.

## Expression Trees, Not Delegates

The distinction between queryable and in-memory LINQ matters because EF Core can inspect expression trees:

```csharp
Expression<Func<Order, bool>> predicate = o => o.Total > 100;
```

It cannot translate arbitrary executable delegates:

```csharp
Func<Order, bool> predicate = o => o.Total > 100;
```

Once a query crosses into `IEnumerable<T>` or `AsEnumerable()`, the provider translation boundary has ended and the remaining operators run in memory. That boundary is one of the most important concepts in EF Core because performance problems often come from crossing it too early or accidentally.

## The Query Translation Pipeline

Conceptually, EF Core querying looks like this:

```text
LINQ expression
  -> expression tree analysis
  -> provider translation
  -> SQL generation and parameterization
  -> database execution
  -> result materialization
  -> optional tracking
```

Internally, EF Core parses the LINQ expression tree into a model-level representation called a `SelectExpression`. This is a normalized tree of projections, filters, joins, groupings, and ordering that abstracts away the LINQ method-call surface. A series of `ExpressionVisitor` subclasses then transform this tree: first to inline or reduce visitor-recognizable patterns, then to apply provider-specific logic (such as translating `String.StartsWith` into a `LIKE` expression for SQL Server), and finally to produce a parameterized SQL string.

Each provider ships its own implementation of `QueryCompilationContext` and `QueryTranslationPreprocessor`, which is why the same LINQ expression can produce different SQL on SQL Server versus PostgreSQL versus SQLite. The translation pipeline is therefore never fully portable in its output, only in its input form.

```csharp
var query = _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        Total = o.Total
    });
```

Before enumeration, this is only a query definition. Once materialized:

```csharp
var items = await query.ToListAsync(ct);
```

the provider translates the expression into database-specific SQL and executes it.

## Provider Translation And Database Reality

EF Core is not one SQL engine. It is a provider-based abstraction over several engines. SQL Server, PostgreSQL, SQLite, and others differ in functions, SQL dialect, indexing behavior, and execution plans. A LINQ expression that looks harmless in C# may translate differently across providers, or may translate in a way that undermines index usage.

For example:

```csharp
query.Where(o => o.CreatedAt.Date == targetDate)
```

often produces less index-friendly SQL than a range predicate:

```csharp
query.Where(o => o.CreatedAt >= start && o.CreatedAt < end);
```

This is why serious EF Core work still requires relational thinking. LINQ is the authoring surface, but the database remains the execution engine.

## Projection As The Default Read Pattern

For API reads and list pages, projection is usually the most important query habit.

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        Total = o.Total,
        CreatedAt = o.CreatedAt
    })
    .ToListAsync(ct);
```

Projection helps because it:

- narrows the selected columns;
- avoids loading entity graphs the API does not need;
- reduces materialization cost;
- usually pairs naturally with no-tracking;
- keeps response shape independent from entity shape.

A common anti-pattern is to load full entities first and shape them later in memory. That approach often turns EF Core into a row-fetching mechanism instead of a query translator.

## Entity Materialization Versus Read Models

Entity materialization is still appropriate when the application intends to update those entities or perform domain behavior over an aggregate. For pure read paths, DTO or read-model projection is usually a better fit.

```csharp
var order = await _dbContext.Orders
    .FirstAsync(o => o.Id == id, ct);
```

This makes sense for update-oriented work. By contrast:

```csharp
var item = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.Id == id)
    .Select(o => new OrderDetailsDto(
        o.Id,
        o.Customer.Name,
        o.Status.ToString(),
        o.Total,
        o.CreatedAt))
    .SingleOrDefaultAsync(ct);
```

is often the better design for a read endpoint because it expresses read intent directly.

## Dynamic Query Composition

One of `IQueryable<T>`'s strengths is that it allows conditional composition while still keeping one database query boundary.

```csharp
public async Task<PagedResult<OrderListItemDto>> SearchAsync(
    OrderSearchRequest request,
    CancellationToken ct)
{
    IQueryable<Order> query = _dbContext.Orders.AsNoTracking();

    if (request.Status is not null)
    {
        query = query.Where(o => o.Status == request.Status);
    }

    if (request.CustomerId is not null)
    {
        query = query.Where(o => o.CustomerId == request.CustomerId);
    }

    if (request.CreatedFrom is not null)
    {
        query = query.Where(o => o.CreatedAt >= request.CreatedFrom.Value);
    }

    if (request.CreatedTo is not null)
    {
        query = query.Where(o => o.CreatedAt < request.CreatedTo.Value);
    }

    var total = await query.CountAsync(ct);

    var items = await query
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Skip((request.Page - 1) * request.PageSize)
        .Take(request.PageSize)
        .Select(o => new OrderListItemDto
        {
            Id = o.Id,
            Total = o.Total,
            CreatedAt = o.CreatedAt
        })
        .ToListAsync(ct);

    return new PagedResult<OrderListItemDto>(items, total, request.Page, request.PageSize);
}
```

This pattern is useful because it preserves query translation until the last responsible moment while still keeping the read model explicit.

## Provider-Specific Functions With `EF.Functions`

When a LINQ expression needs provider-specific behavior -- such as a full-text search predicate, a date-difference function, or a `LIKE` with escaped patterns -- EF Core exposes `EF.Functions`:

```csharp
var results = await _dbContext.Products
    .Where(p => EF.Functions.Like(p.Name, "%gaming%"))
    .ToListAsync(ct);
```

`EF.Functions` acts as a gateway to provider-specific extension methods. Each provider can implement its own set of functions. The benefit is that the application still works within the LINQ translation boundary instead of falling back to raw SQL for every provider-specific need.

The limitation is portability: a method such as `EF.Functions.FreeText` works only on SQL Server because it translates to SQL Server's full-text index predicate. Applications that target multiple providers must account for such differences or wrap them behind abstraction boundaries.

## Client Evaluation And Translation Failures

A common source of confusion is introducing logic into a query that the provider cannot translate.

```csharp
var orders = await _dbContext.Orders
    .Where(o => IsImportant(o.Status))
    .ToListAsync(ct);
```

If `IsImportant` is an arbitrary .NET method, EF Core cannot convert it into SQL and, by default, throws an `InvalidOperationException` describing the translation failure. The safer alternative is to express the condition in provider-translatable terms:

```csharp
var importantStatuses = new[] { OrderStatus.Paid, OrderStatus.PendingReview };

var orders = await _dbContext.Orders
    .Where(o => importantStatuses.Contains(o.Status))
    .ToListAsync(ct);
```

This is not merely about avoiding exceptions. The larger rule is that database filters should remain database-shaped as long as they are part of the provider query.

## `First`, `Single`, `Any`, And Execution Semantics

Terminal operators also communicate intent:

- `First` means the application wants one row but does not assert uniqueness;
- `Single` means the application expects exactly one row and treats duplicates as a correctness failure;
- `Any` asks for existence and usually maps more efficiently than counting rows and comparing against zero.

```csharp
var exists = await _dbContext.Users
    .AnyAsync(u => u.Email == email, ct);
```

Choosing the right terminal operator improves both readability and execution semantics.

## Parameterization Control: `EF.Constant` And `EF.Parameter`

EF Core parameterizes query values by default, which helps the database reuse cached execution plans across different predicate values. In EF Core 8 and later, the application can control this behavior explicitly.

`EF.Constant` forces a value to be embedded as a SQL literal rather than as a parameter:

```csharp
var active = await _dbContext.Users
    .Where(u => u.IsActive == EF.Constant(true))
    .ToListAsync(ct);
```

This is useful when a value is truly constant (for example, filtering a lookup table by a known sentinel) and the application wants to produce a more predictable query shape or avoid parameter-sniffing issues on that specific predicate.

`EF.Parameter` forces the value to be parameterized, which is the default behavior but can be made explicit when the code should signal intent clearly.

In most application queries, the default parameterization strategy is correct. These markers should be used deliberately when the generated SQL needs specific tuning for plan quality.

## Query Boundaries In Application Architecture

One of the recurring design mistakes in EF Core codebases is leaking `IQueryable<T>` upward into controllers or unrelated layers.

At first, this can look flexible. In practice, it often blurs ownership of:

- which filters are allowed;
- when execution occurs;
- whether tracking is enabled;
- which joins and includes are acceptable;
- where persistence concerns stop.

It is usually better for query composition to live in the application or data-access layer, with materialization happening at a clear boundary. A controller should ideally receive read models or application-level results, not an unfinished persistence query.

## Inspecting Generated SQL

During development and troubleshooting, EF Core can expose the generated SQL:

```csharp
var sql = _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .ToQueryString();
```

This is one of the most useful ways to verify that the LINQ query is expressing the database query the team intended. It also provides a bridge between application reasoning and database reasoning, which is essential when diagnosing slow reads, incorrect joins, or surprising translation choices.

## Design Consequences

Good EF Core query design usually follows a consistent pattern. Keep the query provider-translatable for as long as possible, project into read models for API output, use no-tracking by default for reads, and inspect generated SQL when the query becomes important enough that translation details matter.

Those choices make the read side more predictable and also reduce the temptation to use entity materialization where a read model would be cleaner and cheaper.
