# LINQ In C#

## Core Idea

LINQ provides a uniform language for querying and transforming data. The same surface style appears across in-memory collections, database queries, XML, and other providers. Similar-looking queries, however, do not always share the same execution model.

## LINQ As A Data Pipeline

Method syntax is the most common LINQ style in modern C# codebases:

```csharp
var activeUsers = users
    .Where(u => u.IsActive)
    .OrderBy(u => u.Name)
    .Select(u => new UserDto(u.Id, u.Name))
    .ToList();
```

Treating LINQ as a left-to-right pipeline clarifies how query stages compose:

- `Where` filters
- `OrderBy` sorts
- `Select` projects
- `ToList` materializes

LINQ is less about isolated operators and more about how query stages compose.

## Query Syntax And Method Syntax

LINQ also supports query comprehension syntax:

```csharp
var activeUsers =
    from user in users
    where user.IsActive
    orderby user.Name
    select new UserDto(user.Id, user.Name);
```

This is not a separate query engine. It is alternative syntax over the same underlying method-based operations.

Query syntax can be clearer for joins, grouping, and some multi-range expressions:

```csharp
var query =
    from order in orders
    join customer in customers on order.CustomerId equals customer.Id
    select new OrderSummary(order.Id, customer.Name, order.Total);
```

Method syntax is the dominant style in modern C# codebases, with query syntax used where it improves readability — particularly for joins and grouping. The concern is not stylistic purity but whether the query remains straightforward to reason about.

## Deferred Execution

Deferred execution is a defining behavior of LINQ.

```csharp
var query = users.Where(u => u.IsActive);
```

This usually does not execute immediately. The query describes work that will occur later, when the result is enumerated.

```csharp
var list = query.ToList();
```

That timing has visible consequences:

```csharp
var users = new List<User>
{
    new("Alice", isActive: true),
    new("Bob", isActive: false)
};

var activeUsers = users.Where(user => user.IsActive);

users.Add(new User("Cara", isActive: true));

Console.WriteLine(activeUsers.Count()); // 2
```

The query was defined before Cara existed, but evaluated after she was added. Deferred execution is valuable because it enables composition and streaming. It also creates bugs when code assumes a query captured a snapshot when it really captured logic.

Understanding the exact point of execution is especially important in provider-backed queries. Consider an EF Core query where the SQL generation and database round-trip happen at materialization, not at operator construction:

```csharp
// No SQL generated yet — just an expression tree is built
IQueryable<Order> query = _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt);

// Still no SQL — adding more operators just extends the tree
var projected = query.Select(o => new { o.Id, o.Total });

Console.WriteLine(projected.ToQueryString());
// At this point the provider inspects the full expression tree and
// produces the final SQL: SELECT [o].[Id], [o].[Total] FROM [Orders] AS [o]
// WHERE [o].[Status] = 1 ORDER BY [o].[CreatedAt] DESC

// The database round-trip happens here:
var results = await projected.ToListAsync(ct);
```

Calling `ToQueryString()` at different points in the pipeline reveals the complete translated query — the WHERE, ORDER BY, and SELECT all appear together, even though they were added across separate statements. This confirms that the provider accumulated the full query shape before executing anything.

## Immediate Execution And Materialization

Some LINQ operations force execution immediately. These include:

- `ToList`
- `ToArray`
- `Count`
- `First`
- `Single`
- `Any`

```csharp
var list = users.Where(u => u.IsActive).ToList();
var count = users.Count(u => u.IsActive);
var any = users.Any(u => u.IsActive);
var first = users.First(u => u.IsActive);
```

The practical distinction is that deferred queries describe a pipeline, while terminal operations ask for a concrete result now. Materialization is especially important at boundaries where code needs a stable snapshot, wants to avoid multiple enumeration, or must intentionally shift work from a provider-backed query into local memory.

## Projection, Flattening, And Shaping Data

The most common LINQ operations shape the result into the form the next layer requires.

Projection with `Select`:

```csharp
var summaries = orders.Select(order => new OrderSummaryDto(
    order.Id,
    order.Total,
    order.CreatedAt));
```

Flattening with `SelectMany`:

```csharp
var allItems = orders.SelectMany(order => order.Items);
```

The distinction matters because `Select` preserves one output item per input item, while `SelectMany` flattens nested sequences into a single stream.

```csharp
var itemLists = orders.Select(order => order.Items);
var allItems = orders.SelectMany(order => order.Items);
```

For API and application design, projection is especially important. Queries should usually return DTOs or purpose-built shapes rather than whole entities by default. LINQ makes that shaping cheap and expressive when done deliberately.

## Grouping And Aggregation

LINQ also expresses grouping and aggregation in a form that reads much closer to the business question being asked.

```csharp
var totalsByStatus = orders
    .GroupBy(order => order.Status)
    .Select(group => new
    {
        Status = group.Key,
        Count = group.Count(),
        Total = group.Sum(order => order.Total)
    })
    .ToList();
```

This expresses transformations at the sequence level rather than requiring manual loops and accumulator variables. Manual loops remain valid when they are clearer, but LINQ is strongest when the operation is genuinely query-like.

## Useful Modern Operators

Recent .NET versions added several operators that make common query shapes easier to express.

`DistinctBy` removes duplicates according to a chosen key:

```csharp
var uniqueCustomers = orders
    .DistinctBy(order => order.CustomerId)
    .Select(order => order.CustomerId)
    .ToList();
```

`MaxBy` and `MinBy` return the whole item associated with the extreme key:

```csharp
var largestOrder = orders.MaxBy(order => order.Total);
var oldestOrder = orders.MinBy(order => order.CreatedAt);
```

`Chunk` splits a sequence into bounded batches:

```csharp
foreach (var batch in orderIds.Chunk(100))
{
    await SendBatchAsync(batch, ct);
}
```

`ToLookup` builds a one-to-many lookup:

```csharp
var ordersByCustomer = orders.ToLookup(order => order.CustomerId);
```

**`AggregateBy` and `CountBy` ( .NET 9 )** offer simpler alternatives to the `GroupBy`-followed-by-`Select` pattern for common aggregation scenarios:

```csharp
// Before .NET 9: GroupBy + Select
var totalsByStatus = orders
    .GroupBy(o => o.Status)
    .Select(g => new { Status = g.Key, Total = g.Sum(o => o.Total) });

// .NET 9: AggregateBy
var totalsByStatus = orders.AggregateBy(
    o => o.Status,
    seed: 0m,
    (total, order) => total + order.Total);
```

`CountBy` is even simpler when only the count per key is needed:

```csharp
var orderCountByStatus = orders.CountBy(o => o.Status);
```

Both methods avoid the intermediate grouping objects that `GroupBy` allocates, which can reduce memory pressure when the number of groups is large. The trade-off is that `AggregateBy` and `CountBy` are LINQ to Objects operators only — they do not have an `IQueryable<T>` counterpart and cannot participate in provider translation.

These operators improve readability, but they do not remove the need to reason about execution. In provider-backed scenarios, translation support still matters. In LINQ to Objects, deferred execution and materialization still matter.

## LINQ To Objects

When the source is an `IEnumerable<T>`, the query normally runs as ordinary .NET code over in-memory values.

```csharp
IEnumerable<User> activeUsers = users
    .Where(user => user.IsActive)
    .OrderBy(user => user.Name);
```

Here the predicates, selectors, and comparers are normal delegates. The runtime executes them locally as the sequence is enumerated. Expensive predicates, repeated enumeration, and unnecessary materialization directly affect application CPU and memory behavior.

LINQ to Objects applies when the data is already in memory or when the transformation logic is inherently local and cannot be delegated to an external system.

## Provider-Backed LINQ And Translation

When the source is `IQueryable<T>`, the execution model differs.

```csharp
var orders = await _dbContext.Orders
    .Where(order => order.Status == OrderStatus.Paid)
    .OrderByDescending(order => order.CreatedAt)
    .Select(order => new OrderListItemDto(
        order.Id,
        order.Total,
        order.CreatedAt))
    .ToListAsync(ct);
```

The query logic is represented as an expression tree that the provider may inspect and translate. With EF Core, that often means SQL generation. The code still looks like LINQ, but the work may happen in the database rather than in the CLR.

When translation behavior matters, the practical verification step should usually be explicit:

```csharp
var query = _dbContext.Orders
    .Where(order => order.Status == OrderStatus.Paid)
    .OrderByDescending(order => order.CreatedAt);

Console.WriteLine(query.ToQueryString());
```

For EF Core, `ToQueryString()` is one of the clearest ways to inspect what the provider is planning to send to the database. It helps verify that filtering, ordering, joins, and projections are still happening on the provider side rather than after premature materialization.

Several engineering rules follow from this distinction:

- filtering should usually happen before materialization;
- projection should usually select only the needed columns;
- custom local methods may not translate;
- shifting too early to in-memory execution can destroy performance.

A frequent source of performance issues is premature materialization:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

var paidOrders = orders
    .Where(order => IsPaid(order.Status))
    .ToList();
```

This loads all rows and filters locally. In rare cases that is necessary; more often it is an accidental loss of provider translation.

A side-by-side comparison makes the boundary concrete:

```csharp
var summaries = await _dbContext.Orders
    .Where(order => order.Status == OrderStatus.Paid)
    .Select(order => new OrderSummaryDto(
        order.Id,
        order.Customer.Name,
        order.Total,
        order.CreatedAt))
    .ToListAsync(ct);
```

Contrast that with:

```csharp
var orders = await _dbContext.Orders
    .Include(order => order.Customer)
    .ToListAsync(ct);

var summaries = orders
    .Where(order => order.Status == OrderStatus.Paid)
    .Select(order => new OrderSummaryDto(
        order.Id,
        order.Customer.Name,
        order.Total,
        order.CreatedAt))
    .ToList();
```

Both versions can produce the same final DTO list. The first asks the provider to filter and shape at the data source. The second loads more data and shifts more work into application memory. LINQ syntax can conceal this boundary entirely.

## `IEnumerable<T>` Versus `IQueryable<T>`

This boundary deserves explicit attention because it changes where the query runs.

`IEnumerable<T>` means the query is about local enumeration over realized values.

`IQueryable<T>` means the query is still data that a provider may translate or rewrite.

The mechanism that makes provider translation possible is the expression tree. When a lambda is passed to an `IQueryable<T>` extension method, the C# compiler does not emit a delegate. It emits an `Expression<T>` — an abstract syntax tree representing the lambda's structure:

```csharp
Expression<Func<Order, bool>> predicate = o => o.Status == OrderStatus.Paid;
// The compiler builds a tree: Lambda -> Equal -> MemberAccess(o.Status), Constant(Paid)
```

The provider — EF Core, for example — walks this tree at runtime, maps property accesses to column names, maps method calls to SQL functions, and builds the corresponding SQL statement. This is fundamentally different from `IEnumerable<T>`, where the lambda compiles to an ordinary delegate that the CLR executes directly.

Because the provider must understand every node in the expression tree, local methods and arbitrary .NET calls cannot translate:

```csharp
// Does not translate: the provider cannot inspect IsPaid's IL
_ = await _dbContext.Orders
    .Where(o => IsPaid(o.Status))
    .ToListAsync(ct);

// Translates: the expression tree contains only known operations
_ = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .ToListAsync(ct);
```

The first form compiles fine. At runtime, EF Core throws `InvalidOperationException` because it encounters a method call it cannot translate into SQL. The solution is either to inline translatable logic into the expression or to materialize before the untranslatable call — and to do so consciously.

```csharp
var orders = _dbContext.Orders.AsEnumerable()
    .Where(o => ExpensiveLocalMethod(o.Status))
    .ToList();
```

`AsEnumerable()` is not harmless decoration. It is an explicit transition out of provider translation and into local execution. That can be correct when local logic truly cannot be translated, but it should happen intentionally and as late as practical.

```csharp
var candidates = await _dbContext.Orders
    .Where(order => order.CreatedAt >= cutoff)
    .ToListAsync(ct);

var filtered = candidates
    .Where(order => ExpensiveLocalMethod(order.Status))
    .ToList();
```

This version at least lets the database shrink the candidate set first. The broader design lesson is that LINQ syntax does not erase the boundary between database work and application work.

### Translation Pitfalls In EF Core

Several common LINQ patterns do not translate to SQL, and the compiler offers no warning. The runtime error appears only when the query executes.

**`string.StartsWith` with `StringComparison`.** The `StringComparison` overload is not translatable because the database's collation rules, not .NET's enum, determine comparison semantics:

```csharp
// Does not translate: StringComparison.OrdinalIgnoreCase has no SQL equivalent
_ = await _dbContext.Users
    .Where(u => u.Name.StartsWith("A", StringComparison.OrdinalIgnoreCase))
    .ToListAsync(ct);

// Translates: the simple overload defers to the column's collation
_ = await _dbContext.Users
    .Where(u => u.Name.StartsWith("A"))
    .ToListAsync(ct);
```

**`DateTime` methods.** Some methods translate; others do not. `DateTime.AddDays` maps to `DATEADD` in SQL Server:

```csharp
// Translates: AddDays -> DATEADD(day, 7, [o].[CreatedAt])
_ = await _dbContext.Orders
    .Where(o => o.CreatedAt.AddDays(7) <= DateTime.UtcNow)
    .ToListAsync(ct);
```

But `DateTime.DayOfWeek` and many formatting methods do not translate. The safe approach is to verify with `ToQueryString()` or to perform date arithmetic using translatable methods.

**`GroupBy` with complex keys.** Simple key selectors translate; anonymous types and nested projections may trigger client evaluation:

```csharp
// Likely translates: simple property key
_ = orders.GroupBy(o => o.Status);

// May trigger client evaluation: composite key with projection
_ = orders.GroupBy(o => new { o.CustomerId, Month = o.CreatedAt.Month });
```

**Detecting client evaluation.** EF Core can be configured to throw when any part of a query evaluates on the client:

```csharp
// In DbContext configuration:
optionsBuilder.ConfigureWarnings(w =>
    w.Throw(RelationalEventId.QueryPossibleUnintendedClientEvaluationWarning));
```

With this warning promoted to an error, any query that falls back to client evaluation — even partially — produces an exception during development rather than silently degrading at runtime. This makes translation boundaries explicit during testing rather than leaving them to be discovered in production.

## Multiple Enumeration

A deferred sequence may execute each time it is enumerated.

```csharp
IEnumerable<Order> query = GetOrders();

var count = query.Count();
var total = query.Sum(order => order.Total);
```

If `GetOrders()` is expensive, provider-backed, or stateful, enumerating twice can be wasteful or even incorrect. Materialization is often the right move when the data should be reused:

```csharp
var orders = GetOrders().ToList();

var count = orders.Count;
var total = orders.Sum(order => order.Total);
```

In database-backed queries, the better solution may be to compute the aggregate in one translated query rather than materializing the whole dataset.

## Choosing Between `First`, `FirstOrDefault`, `Single`, And `SingleOrDefault`

Operator choice should reflect business meaning rather than habit.

`First` means at least one item should exist, and extra matches are acceptable:

```csharp
var user = users.First(user => user.Email == email);
```

`FirstOrDefault` allows zero matches:

```csharp
var user = users.FirstOrDefault(user => user.Email == email);
```

`Single` asserts that exactly one match must exist:

```csharp
var user = users.Single(user => user.Email == email);
```

`SingleOrDefault` allows zero or one, but treats multiple matches as an error:

```csharp
var user = users.SingleOrDefault(user => user.Email == email);
```

The distinction matters because the operator itself communicates invariant strength. If uniqueness matters, `Single` or `SingleOrDefault` often says something valuable that `First` does not.

In provider-backed queries, this choice can also affect failure timing. `Single` and `SingleOrDefault` ask the provider-backed pipeline to enforce uniqueness semantics during execution, which means the operator is not only a readability choice. It is also part of how the code expresses expected data invariants.
