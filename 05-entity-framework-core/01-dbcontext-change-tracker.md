# DbContext And Change Tracker

## Core Idea

`DbContext` is the main EF Core object used to query and save data.

Chinese notes:

- `DbContext`: EF Core 数据上下文.
- `Change Tracker`: 变更跟踪器.
- `unit of work`: 工作单元.
- `entity state`: 实体状态.

`DbContext` combines:

- database connection configuration;
- entity mapping;
- LINQ query translation;
- change tracking;
- unit-of-work behavior;
- transaction coordination for `SaveChanges`.

## DbContext Lifetime

In ASP.NET Core, `DbContext` is usually registered as scoped:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default"));
});
```

Why scoped?

- one request often represents one unit of work;
- `DbContext` is not thread-safe;
- change tracker should not live too long;
- sharing across requests can leak state and cause bugs.

## Entity States

EF Core tracks entities in states:

- `Detached`
- `Unchanged`
- `Added`
- `Modified`
- `Deleted`

Example:

```csharp
var order = await _dbContext.Orders.FindAsync(orderId);
order.Status = OrderStatus.Cancelled;

await _dbContext.SaveChangesAsync();
```

EF detects that `Status` changed and generates an `UPDATE`.

## Under The Hood: Identity Map

EF Core uses an identity map（身份映射） inside the `DbContext`.

The idea:

```text
Entity type + primary key -> one tracked object instance
```

Example:

```csharp
var order1 = await _dbContext.Orders.FindAsync(10);
var order2 = await _dbContext.Orders.FirstAsync(o => o.Id == 10);

Console.WriteLine(ReferenceEquals(order1, order2)); // usually true in same DbContext
```

Why:

- prevents two different objects representing the same row in one context;
- makes relationship fix-up possible;
- avoids conflicting changes in one unit of work.

This also explains why long-lived `DbContext` instances are dangerous:

- stale tracked entities;
- memory growth;
- surprising updates;
- identity map contains old state.

## Under The Hood: Original Values And Snapshots

For many entities, EF Core keeps original values so it can detect changes.

Conceptually:

```text
Tracked Order
  Current values:
    Status = Paid
    Total = 100

  Original values:
    Status = Pending
    Total = 100
```

When `SaveChanges` runs, EF can compare current values with original values and generate SQL only for changed columns in many cases.

Example:

```csharp
var order = await _dbContext.Orders.FirstAsync(o => o.Id == id, ct);
order.Status = OrderStatus.Paid;

await _dbContext.SaveChangesAsync(ct);
```

Possible SQL:

```sql
UPDATE Orders
SET Status = @p0
WHERE Id = @p1;
```

Important nuance:

- EF Core can use snapshot change tracking;
- notification-based tracking is possible if entities implement change notification patterns;
- APIs like `Update(entity)` may mark many properties as modified even if only one changed.

## DetectChanges

`DetectChanges` is the process of scanning tracked entities and comparing values.

It can happen automatically before `SaveChanges`.

For large graphs, this can cost CPU.

Example problem:

```csharp
foreach (var item in manyItems)
{
    _dbContext.Items.Add(item);
    await _dbContext.SaveChangesAsync(ct); // bad: repeated change detection and database calls
}
```

Better:

```csharp
_dbContext.Items.AddRange(manyItems);
await _dbContext.SaveChangesAsync(ct);
```

For very large bulk operations, consider:

- batching;
- provider-specific bulk tools;
- raw SQL;
- disabling auto detect changes temporarily only when you deeply understand the code path.

Example:

```csharp
var oldValue = _dbContext.ChangeTracker.AutoDetectChangesEnabled;

try
{
    _dbContext.ChangeTracker.AutoDetectChangesEnabled = false;

    foreach (var item in manyItems)
    {
        _dbContext.Items.Add(item);
    }
}
finally
{
    _dbContext.ChangeTracker.AutoDetectChangesEnabled = oldValue;
}

await _dbContext.SaveChangesAsync(ct);
```

Use this carefully. It is an optimization, not a default style.

## Relationship Fix-up

EF Core can automatically connect navigation properties when related entities are tracked.

Example:

```csharp
var order = await _dbContext.Orders.FirstAsync(o => o.Id == orderId, ct);
var items = await _dbContext.OrderItems
    .Where(i => i.OrderId == orderId)
    .ToListAsync(ct);
```

If relationships are configured, EF can connect:

```text
order.Items -> items
item.Order -> order
```

This is useful but can surprise you when many entities are tracked.

Engineering perspective:

> The change tracker is helpful for unit-of-work updates, but it has memory and CPU cost. For read-only queries, projections and `AsNoTracking` are often better.

## Add / Attach / Update

### Add

Marks entity as `Added`.

```csharp
_dbContext.Orders.Add(order);
```

### Attach

Starts tracking an existing entity as `Unchanged`.

```csharp
_dbContext.Orders.Attach(order);
```

### Update

Marks entire entity graph as `Modified`.

```csharp
_dbContext.Orders.Update(order);
```

Be careful with `Update` in APIs because it can update columns unintentionally.

## Tracking Query

```csharp
var order = await _dbContext.Orders
    .FirstAsync(o => o.Id == id, ct);

order.Status = OrderStatus.Paid;
await _dbContext.SaveChangesAsync(ct);
```

Use tracking when you plan to modify entities.

## No-tracking Query

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        Status = o.Status,
        Total = o.Total
    })
    .ToListAsync(ct);
```

Use no-tracking for read-only queries.

Benefits:

- less memory;
- less CPU;
- avoids unnecessary tracking overhead.

## Identity Resolution

Tracking queries return the same object instance for the same entity key within one `DbContext`.

No-tracking queries do not by default.

Option:

```csharp
.AsNoTrackingWithIdentityResolution()
```

Useful when you need no tracking but want repeated entities resolved to same instance.

## SaveChanges

`SaveChanges`:

1. detects changes;
2. validates mapping constraints;
3. creates SQL commands;
4. executes in transaction where appropriate;
5. updates entity states.

```csharp
await _dbContext.SaveChangesAsync(ct);
```

## Under The Hood: SaveChanges Pipeline

`SaveChanges` is not just "send SQL".

Conceptual flow:

```text
SaveChanges
  -> DetectChanges
  -> collect Added/Modified/Deleted entries
  -> apply value generation if needed
  -> create insert/update/delete commands
  -> order commands based on relationships
  -> execute commands, usually in a transaction
  -> handle database-generated values
  -> accept changes and update entity states
```

Example:

```csharp
var order = new Order(customerId);
order.AddItem(productId, quantity: 2);

_dbContext.Orders.Add(order);
await _dbContext.SaveChangesAsync(ct);
```

EF may need to:

- insert `Orders`;
- get generated `Order.Id`;
- insert `OrderItems` with the generated `OrderId`;
- commit transaction.

This is why EF Core understands relationships and entity states.

## Batching

EF Core can batch multiple SQL commands into fewer round trips.

Example:

```csharp
_dbContext.Products.Add(new Product("A"));
_dbContext.Products.Add(new Product("B"));
_dbContext.Products.Add(new Product("C"));

await _dbContext.SaveChangesAsync(ct);
```

EF Core may send multiple inserts in a batch depending on provider and configuration.

Key point:

> `SaveChanges` is a unit-of-work boundary. Calling it once per row usually creates unnecessary round trips and change tracking overhead. Calling it once for a meaningful business operation is usually better.

## Common Update Pattern

Avoid blindly mapping request to entity with all fields.

Better:

```csharp
public async Task UpdateOrderAddressAsync(
    int orderId,
    UpdateAddressRequest request,
    CancellationToken ct)
{
    var order = await _dbContext.Orders
        .FirstOrDefaultAsync(o => o.Id == orderId, ct);

    if (order is null)
    {
        throw new NotFoundException("Order not found.");
    }

    order.UpdateShippingAddress(
        request.Line1,
        request.City,
        request.PostalCode);

    await _dbContext.SaveChangesAsync(ct);
}
```

## DbContext Pooling

```csharp
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});
```

Pooling can reduce allocation overhead.

Be careful:

- do not store per-request state directly on `DbContext`;
- reset custom state;
- understand tenant context interactions.

## Review Questions

### What does DbContext do?

> `DbContext` represents a session with the database. It handles querying, change tracking, mapping, and saving changes as a unit of work.

### What is change tracking?

> Change tracking is EF Core's mechanism for remembering entity instances and detecting what changed so it can generate insert, update, and delete SQL.

### How does EF Core know what changed?

> For tracked entities, EF Core keeps state and often original value snapshots. Before saving, it detects changes by comparing current values with original values, then generates SQL for added, modified, or deleted entities.

### Tracking vs no-tracking?

> Tracking queries are useful when updating entities. No-tracking queries are better for read-only scenarios because they reduce memory and CPU overhead.

### Is DbContext thread-safe?

> No. A `DbContext` should not be used concurrently from multiple threads.

## Common Mistakes

### Mistake: Using one `DbContext` as singleton

Why it is wrong:

> `DbContext` is stateful and not thread-safe. A singleton context would share tracked entities across requests, grow memory, return stale data, and create concurrency bugs.

Better answer:

> Register `DbContext` as scoped for web requests, or create short-lived contexts/scopes for background units of work.

### Mistake: Returning tracked entities from API

Why it is wrong:

> It leaks persistence models as API contracts, may expose internal fields, can create circular JSON serialization, and keeps API shape coupled to database shape.

Better answer:

> Project to DTOs for API responses, usually with `AsNoTracking`.

### Mistake: Calling `Update` on detached request DTOs blindly

Why it is wrong:

> `Update` can mark the entire entity graph as modified. A client may overwrite columns it should not control, such as `CreatedAt`, `OwnerUserId`, or `RowVersion`.

Better answer:

> Load the existing entity, check authorization, update allowed fields explicitly, then call `SaveChanges`.

### Mistake: Tracking huge read-only query results

Why it is wrong:

> The change tracker keeps entity instances and snapshots, which increases memory and CPU usage.

Better answer:

> Use `AsNoTracking` and DTO projection for read-only list/query endpoints.

### Mistake: Keeping `DbContext` alive too long

Why it is wrong:

> Long-lived contexts accumulate tracked entities, return stale identity-map results, and make unit-of-work boundaries unclear.

Better answer:

> Keep context lifetime short and aligned with a request, command, or background batch.

### Mistake: Parallel operations on the same `DbContext`

Why it is wrong:

> `DbContext` does not support concurrent operations. Parallel queries or saves on the same context can throw exceptions or corrupt tracking assumptions.

Better answer:

> Await each operation sequentially on one context, or create separate contexts for truly parallel work.

### Mistake: Calling `SaveChanges` inside a loop

Why it is wrong:

> It creates many database round trips and repeated change detection. It may also commit partial work unintentionally.

Better answer:

> Add/update a batch and call `SaveChanges` once per meaningful unit of work. For large set-based operations, consider `ExecuteUpdate`, `ExecuteDelete`, raw SQL, or bulk tools.

### Mistake: Assuming `AsNoTracking` is always faster

Why it is wrong:

> It is usually better for read-only queries, but if you load repeated entities in a complex graph, no-tracking can create duplicate instances. Also, if you need updates, no-tracking adds extra attach/update complexity.

Better answer:

> Use tracking for modifications, `AsNoTracking` for read-only DTO queries, and `AsNoTrackingWithIdentityResolution` when identity resolution matters without tracking.

## Practice Task

Build an API with:

1. tracked update endpoint;
2. no-tracking list endpoint;
3. detached update example;
4. concurrency conflict;
5. logging generated SQL;
6. comparison of memory usage for tracking vs no-tracking query.
