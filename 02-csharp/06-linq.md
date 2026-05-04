# LINQ In C#

## Core Idea

LINQ provides a consistent query syntax for objects, databases, XML, and other data sources.

Chinese notes:

- `LINQ`: Language Integrated Query.
- `deferred execution`: 延迟执行.
- `projection`: 投影.

## Method Syntax

```csharp
var activeUsers = users
    .Where(u => u.IsActive)
    .OrderBy(u => u.Name)
    .Select(u => new UserDto(u.Id, u.Name))
    .ToList();
```

Method syntax is the most common style in modern C# codebases because it composes naturally with method calls and lambdas.

Step-by-step:

```csharp
var activeUsers = users
    .Where(user => user.IsActive)              // filter
    .OrderBy(user => user.Name)                // sort
    .Select(user => new UserDto(user.Id, user.Name)) // project
    .ToList();                                 // execute
```

The important learning habit:

> Read LINQ left to right as a data pipeline.

## Query Syntax

```csharp
var activeUsers =
    from user in users
    where user.IsActive
    orderby user.Name
    select new UserDto(user.Id, user.Name);
```

Query syntax can be easier for joins and grouping:

```csharp
var query =
    from order in orders
    join customer in customers on order.CustomerId equals customer.Id
    select new OrderSummary(order.Id, customer.Name, order.Total);
```

Most teams mix both styles when useful.

## Deferred Execution

```csharp
var query = users.Where(u => u.IsActive);
```

This does not execute immediately.

Execution happens when enumerated:

```csharp
var list = query.ToList();
```

Example:

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

`activeUsers` was defined before Cara was added, but it executed after Cara was added.

This is powerful, but it can surprise you.

## Immediate Execution

Examples:

- `ToList`
- `ToArray`
- `Count`
- `First`
- `Single`
- `Any`

Examples:

```csharp
var list = users.Where(u => u.IsActive).ToList(); // materializes all active users
var count = users.Count(u => u.IsActive);         // executes count
var any = users.Any(u => u.IsActive);             // executes existence check
var first = users.First(u => u.IsActive);         // executes until first match
```

Rule:

> Methods that return a collection-like sequence are often deferred. Methods that return a scalar value or concrete collection usually execute immediately.

## Select vs SelectMany

`Select` projects each item.

```csharp
var names = users.Select(u => u.Name);
```

`SelectMany` flattens nested collections.

```csharp
var allItems = orders.SelectMany(o => o.Items);
```

Example:

```csharp
var orders = new[]
{
    new Order([new OrderItem("Keyboard"), new OrderItem("Mouse")]),
    new Order([new OrderItem("Monitor")])
};

var itemLists = orders.Select(order => order.Items);
var allItems = orders.SelectMany(order => order.Items);
```

Result shape:

```text
Select:
  IEnumerable<IEnumerable<OrderItem>>

SelectMany:
  IEnumerable<OrderItem>
```

Use `SelectMany` when you need one flattened sequence.

## Filtering, Projection, Grouping

Filtering:

```csharp
var paidOrders = orders.Where(order => order.Status == OrderStatus.Paid);
```

Projection:

```csharp
var summaries = orders.Select(order => new OrderSummaryDto(
    order.Id,
    order.Total,
    order.CreatedAt));
```

Grouping:

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

Key point:

> Projection is especially important in APIs because you should return DTOs, not full entities.

## Useful Modern LINQ Operators

Modern .NET includes small LINQ helpers that make common transformations clearer.

### `DistinctBy`

Use `DistinctBy` when uniqueness depends on one key.

```csharp
var uniqueCustomers = orders
    .DistinctBy(order => order.CustomerId)
    .Select(order => order.CustomerId)
    .ToList();
```

This is clearer than manually grouping when you only need one item per key.

### `MaxBy` And `MinBy`

Use `MaxBy` or `MinBy` when you want the item with the largest or smallest derived value.

```csharp
var largestOrder = orders.MaxBy(order => order.Total);
var oldestOrder = orders.MinBy(order => order.CreatedAt);
```

### `Chunk`

Use `Chunk` to split a sequence into fixed-size batches.

```csharp
foreach (var batch in orderIds.Chunk(100))
{
    await SendBatchAsync(batch, ct);
}
```

This is useful for API calls, message publishing, or database operations where unbounded batch size would be risky.

### `ToLookup`

`ToLookup` creates a one-to-many lookup.

```csharp
var ordersByCustomer = orders.ToLookup(order => order.CustomerId);

foreach (var order in ordersByCustomer[customerId])
{
    Console.WriteLine(order.Id);
}
```

Unlike `Dictionary<TKey, TValue>`, a lookup can naturally store multiple values for one key.

Key point:

> These operators improve readability, but the same deferred-execution and EF Core translation rules still matter. Check provider support before assuming every LINQ-to-Objects operator translates to SQL.

## LINQ To Entities

With EF Core:

```csharp
var orders = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Paid)
    .Select(o => new OrderDto(o.Id, o.Total))
    .ToListAsync(ct);
```

EF Core translates expression tree to SQL.

Not every C# method can be translated.

Good EF query:

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

Why good:

- filter runs in SQL;
- sorting runs in SQL;
- projection selects only needed columns;
- materialization happens once at the end.

Bad EF query:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

var paidOrders = orders
    .Where(order => IsPaid(order.Status))
    .ToList();
```

Problem:

> This loads all orders first, then filters in memory.

## IEnumerable vs IQueryable

`IEnumerable<T>`:

- in-memory sequence;
- uses delegates;
- LINQ to Objects.

`IQueryable<T>`:

- query expression;
- provider can translate it;
- EF Core uses it for SQL.

Common pitfall:

```csharp
var orders = _dbContext.Orders.AsEnumerable()
    .Where(o => ExpensiveLocalMethod(o.Status))
    .ToList();
```

This may load too much data into memory.

Better:

```csharp
var orders = await _dbContext.Orders
    .Where(order => order.Status == OrderStatus.Paid)
    .ToListAsync(ct);
```

If custom logic cannot be translated, decide intentionally:

```csharp
var candidates = await _dbContext.Orders
    .Where(order => order.CreatedAt >= cutoff)
    .ToListAsync(ct);

var filtered = candidates
    .Where(order => ExpensiveLocalMethod(order.Status))
    .ToList();
```

Here at least the database reduces the candidate set first.

## Multiple Enumeration

Bad:

```csharp
IEnumerable<Order> query = GetOrders();

var count = query.Count();
var total = query.Sum(order => order.Total);
```

If `GetOrders()` is expensive or database-backed, this may enumerate twice.

Better:

```csharp
var orders = GetOrders().ToList();

var count = orders.Count;
var total = orders.Sum(order => order.Total);
```

For EF Core, prefer one query when possible:

```csharp
var summary = await _dbContext.Orders
    .GroupBy(_ => 1)
    .Select(group => new
    {
        Count = group.Count(),
        Total = group.Sum(order => order.Total)
    })
    .SingleAsync(ct);
```

## First, FirstOrDefault, Single, SingleOrDefault

`First`:

```csharp
var user = users.First(user => user.Email == email);
```

Use when at least one match should exist and extra matches are acceptable.

`FirstOrDefault`:

```csharp
var user = users.FirstOrDefault(user => user.Email == email);
```

Use when zero matches are allowed.

`Single`:

```csharp
var user = users.Single(user => user.Email == email);
```

Use when exactly one match must exist. It throws if zero or multiple matches exist.

`SingleOrDefault`:

```csharp
var user = users.SingleOrDefault(user => user.Email == email);
```

Use when zero or one match is valid, but multiple matches mean data is wrong.

Key point:

> `Single` communicates uniqueness expectation. `First` communicates "give me one." Choose based on business meaning.

## Review Questions

### What is deferred execution?

> Deferred execution means a LINQ query is not executed when defined. It executes when enumerated, such as by `foreach`, `ToList`, `Count`, or `First`.

### First vs Single?

> `First` returns the first matching item and allows more matches. `Single` expects exactly one matching item and throws if there are zero or more than one.

### Any vs Count?

> Use `Any` when checking existence because it can stop after finding one item. `Count` counts all matching items.

### What is projection?

> Projection means shaping data into another form, usually with `Select`. In APIs, this often means selecting entity data into DTOs.

### When is `Chunk` useful?

> `Chunk` is useful when processing a large sequence in bounded batches, such as sending 100 messages at a time instead of starting thousands of operations at once.

### Why can `AsEnumerable()` be dangerous in EF Core?

> It switches from provider translation to in-memory LINQ. If called too early, it can load too much data and make filtering happen in application memory instead of SQL.

## Common Mistakes

### Mistake: Calling `ToList()` too early.

Why it is wrong:

> It forces immediate execution. If you call it before `Where`, `Select`, or pagination, you may load too much data into memory.

Better answer:

> Keep the query as `IQueryable`/`IEnumerable` until all filters and projections are composed, then materialize once.

### Mistake: Using local methods inside EF queries.

Why it is wrong:

> EF Core can only translate supported expression tree operations to SQL. A normal local C# method often cannot be translated.

Better answer:

> Keep EF queries translatable or move the operation after materialization intentionally.

### Mistake: Multiple enumeration of expensive queries.

Why it is wrong:

> Enumerating a query twice may execute it twice. With EF Core, that can mean two database calls.

Better answer:

> Materialize once if you need to reuse the result, or structure the query to avoid repeated enumeration.

### Mistake: Using `Count() > 0` instead of `Any()`.

Why it is wrong:

> `Count()` may need to count all matching rows/items. `Any()` can stop when it finds the first match.

Better answer:

> Use `Any()` when you only need to know whether at least one item exists.

### Mistake: Forgetting deferred execution side effects.

Why it is wrong:

> LINQ queries often do not run when declared. They run when enumerated, so changes to source data or disposed resources can affect the result later.

Better answer:

> Know where a query is materialized and avoid returning deferred queries over disposed resources.
