# LINQ In C#

## Core Idea

LINQ gives C# a uniform language for querying and transforming data. That promise is powerful because the same surface style appears across in-memory collections, database queries, XML, and other providers. The danger is that similar-looking queries do not always have the same execution model.

This chapter is therefore about two related but importantly different experiences. One is LINQ to Objects, where the query runs as normal .NET code over already-realized values. The other is provider-backed LINQ, where the query expression may be translated into SQL or another query language. Professional use of LINQ depends on understanding both the shared syntax and the sharp boundary between them.

## LINQ As A Data Pipeline

Method syntax is the most common LINQ style in modern C# codebases:

```csharp
var activeUsers = users
    .Where(u => u.IsActive)
    .OrderBy(u => u.Name)
    .Select(u => new UserDto(u.Id, u.Name))
    .ToList();
```

The most useful reading habit is to treat LINQ as a left-to-right pipeline:

- `Where` filters
- `OrderBy` sorts
- `Select` projects
- `ToList` materializes

That pipeline mindset matters because LINQ is less about isolated operators and more about how query stages compose.

## Query Syntax And Method Syntax

LINQ also supports query comprehension syntax:

```csharp
var activeUsers =
    from user in users
    where user.IsActive
    orderby user.Name
    select new UserDto(user.Id, user.Name);
```

This is not a separate query engine. It is largely alternative syntax over the same underlying method-based operations.

Query syntax can feel clearer for joins, grouping, and some multi-range expressions:

```csharp
var query =
    from order in orders
    join customer in customers on order.CustomerId equals customer.Id
    select new OrderSummary(order.Id, customer.Name, order.Total);
```

Most teams use method syntax by default and switch to query syntax when it reads better. The key issue is not stylistic purity but whether the query remains easy to reason about.

## Deferred Execution

One of the defining behaviors of LINQ is deferred execution.

```csharp
var query = users.Where(u => u.IsActive);
```

This usually does not execute immediately. The query describes work that will happen later when the result is enumerated.

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

The query was defined before Cara existed, but evaluated after she was added. Deferred execution is valuable because it enables composition and streaming. It is also a source of bugs when code assumes a query captured a snapshot when it really captured logic.

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

The most common LINQ operations are not just filtering. They are about shaping the result into the form the next layer actually needs.

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

This is more than syntax convenience. It encourages code to express transformations at the sequence level rather than dropping immediately into manual loops and accumulator variables. Manual loops remain valid when they are clearer, but LINQ is strongest when the operation is genuinely query-like.

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

These operators improve readability, but they do not remove the need to reason about execution. In provider-backed scenarios, translation support still matters. In LINQ to Objects, deferred execution and materialization still matter.

## LINQ To Objects

When the source is an `IEnumerable<T>`, the query normally runs as ordinary .NET code over in-memory values.

```csharp
IEnumerable<User> activeUsers = users
    .Where(user => user.IsActive)
    .OrderBy(user => user.Name);
```

Here the predicates, selectors, and comparers are normal delegates. The runtime executes them locally as the sequence is enumerated. This is often straightforward and predictable, but it also means that expensive predicates, repeated enumeration, and unnecessary materialization directly affect application CPU and memory behavior.

LINQ to Objects is often the right tool when the data is already in memory or when the transformation logic is inherently local and cannot be delegated to an external system.

## Provider-Backed LINQ And Translation

When the source is `IQueryable<T>`, the situation changes.

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

In this case the query logic is represented as an expression tree that the provider may inspect and translate. With EF Core, that often means SQL generation. The code still looks like LINQ, but the work may happen in the database rather than in the CLR.

This distinction drives several important engineering rules:

- filtering should usually happen before materialization;
- projection should usually select only the needed columns;
- custom local methods may not translate;
- shifting too early to in-memory execution can destroy performance.

The common bad pattern is to materialize too soon:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

var paidOrders = orders
    .Where(order => IsPaid(order.Status))
    .ToList();
```

This loads all rows and filters locally. Sometimes that is necessary. More often it is an accidental loss of provider translation.

## `IEnumerable<T>` Versus `IQueryable<T>`

This boundary deserves explicit attention because it changes where the query runs.

`IEnumerable<T>` means the query is now about local enumeration over realized values.

`IQueryable<T>` means the query is still data that a provider may translate or rewrite.

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
