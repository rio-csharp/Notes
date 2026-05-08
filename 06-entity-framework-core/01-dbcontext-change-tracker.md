# DbContext And The Change Tracker

## Core Idea

`DbContext` is the operational center of EF Core. It is the object through which the application queries the database, tracks entity instances, coordinates updates, and commits a unit of work. The change tracker is not a secondary convenience attached to that process. It is one of the main reasons EF Core can translate object-level changes into relational commands. Query behavior, relationship fix-up, update patterns, concurrency handling, and performance trade-offs all depend on how long a context lives, what it tracks, and when that tracked state is converted into SQL.

This chapter assumes familiarity with basic relational database concepts such as tables, keys, and SQL queries. The previous chapter on database and SQL foundations covers those topics in depth. Readers who need a refresher may wish to review that chapter before continuing here.

## `DbContext` As A Unit Of Work Boundary

In ASP.NET Core applications, `DbContext` is usually registered as scoped (the DI chapter explains scoped lifetime in more detail):

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default"));
});
```

That default is not merely conventional. It reflects the fact that a web request often maps naturally to one application-level unit of work. A single request loads some entities, applies domain decisions, and saves the resulting state changes before the scope ends.

This lifetime matches several important EF Core assumptions:

- the context is not thread-safe;
- tracked state should remain short-lived;
- the identity map should describe one coherent working set rather than the entire application;
- disposal should release database-related resources promptly.

When a `DbContext` is allowed to live too long, the cost is not only memory growth. The tracked graph becomes stale, entity identity becomes harder to reason about, and writes may accidentally include state that no longer belongs to the current operation.

## Context Responsibilities

From the application's perspective, a `DbContext` performs several related responsibilities:

- it exposes entity sets through `DbSet<T>`;
- it holds model metadata and mapping rules;
- it translates LINQ expressions into provider-specific commands;
- it tracks entity state when tracking is enabled;
- it coordinates insert, update, and delete operations during `SaveChanges`;
- it manages transactions for a single save operation when the provider supports them.

These responsibilities are closely connected. EF Core is not just a query library and not just an update library. It is a persistence unit that combines object graph tracking with relational command generation.

## `DbSet<T>` And Query Roots

`DbSet<T>` is the usual entry point for entity queries and persistence operations.

```csharp
public sealed class AppDbContext : DbContext
{
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Customer> Customers => Set<Customer>();
}
```

At runtime, a `DbSet<T>` is not a preloaded collection. It is a query root and a persistence boundary for one entity type. A call such as:

```csharp
var orders = await _dbContext.Orders
    .Where(o => o.Status == OrderStatus.Submitted)
    .ToListAsync(ct);
```

describes a database query. A call such as:

```csharp
_dbContext.Orders.Add(order);
```

adds an entity to the current unit of work so that the change tracker can later include it in the save pipeline.

## Entity State And Change Tracking

The change tracker represents each tracked entity with a state such as:

- `Detached`
- `Unchanged`
- `Added`
- `Modified`
- `Deleted`

These states are not bookkeeping trivia. They determine which SQL operations EF Core will generate.

```csharp
var order = await _dbContext.Orders.FirstAsync(o => o.Id == orderId, ct);
order.Status = OrderStatus.Cancelled;

await _dbContext.SaveChangesAsync(ct);
```

In this example, EF Core tracks the loaded entity as `Unchanged`, observes a property mutation, marks the relevant entry as modified, and then emits an `UPDATE` during `SaveChanges`.

This is one of the major differences between EF Core and a thin SQL abstraction. The application changes objects. EF Core interprets those changes in terms of relational persistence.

## Identity Map And Object Consistency

Within one `DbContext`, EF Core normally keeps one tracked object instance per entity key. This is the identity map.

```text
Entity type + primary key -> one tracked instance in one context
```

```csharp
var order1 = await _dbContext.Orders.FindAsync([10], ct);
var order2 = await _dbContext.Orders.FirstAsync(o => o.Id == 10, ct);

Console.WriteLine(ReferenceEquals(order1, order2)); // typically true
```

The identity map matters because it prevents one context from carrying multiple conflicting in-memory representations of the same row. It also enables relationship fix-up, consistent updates, and more predictable graph behavior.

The cost is that a long-lived context gradually accumulates tracked objects. Once that happens, queries may reuse old in-memory instances, navigation properties may reconnect unexpectedly, and memory pressure rises with the size of the working set. The identity map is therefore one reason short-lived contexts are an architectural requirement rather than a performance preference.

## Snapshot Tracking And Change Detection

For many entities, EF Core keeps original values so it can compare them with current values later.

```text
Tracked Order
  Original Status = Pending
  Current  Status = Paid
```

That comparison is part of change detection. Conceptually, EF Core needs to know:

- which entities are new;
- which are deleted;
- which properties changed on existing rows;
- whether any concurrency tokens must be checked.

In many applications, this happens automatically and invisibly enough that it is easy to forget there is real work involved. That work becomes visible once the tracked graph becomes large or once `SaveChanges` is called too frequently inside loops.

## `DetectChanges` Mechanism

When EF Core begins tracking an entity, the change tracker stores a snapshot of each property value in an internal data structure keyed by the entity's primary key and entry identity. `DetectChanges` iterates over all tracked entries and compares each property's current value against that stored snapshot using `Object.Equals`. If any value differs, the entry's state transitions from `Unchanged` to `Modified` and the affected properties are recorded.

This comparison is not free. For a small number of tracked entities the overhead is negligible, but the cost grows linearly with both the number of tracked entities and the number of properties per entity. Additionally, `DetectChanges` performs relationship fix-up during the same pass: it examines foreign key values to wire navigation properties together.

EF Core calls `DetectChanges` implicitly at several points -- most notably before `SaveChanges` and when using methods such as `Find`, `Local`, or `Entry`. Applications can suppress this automatic behavior through:

```csharp
context.ChangeTracker.AutoDetectChangesEnabled = false;
```

Disabling it is appropriate only when the application controls change detection explicitly and understands which operations depend on it. In most ordinary request-scoped work, the default automatic behavior is correct and the cost is unimportant.

## `DetectChanges` Cost Model

For small units of work, that cost is often negligible. For large graphs or repeated save calls, it becomes material. A pattern such as:

```csharp
foreach (var item in manyItems)
{
    _dbContext.Items.Add(item);
    await _dbContext.SaveChangesAsync(ct);
}
```

usually performs poorly for two reasons:

- it creates many database round trips;
- it repeatedly runs change detection on a growing tracked set.

The better default is to preserve a meaningful unit-of-work boundary:

```csharp
_dbContext.Items.AddRange(manyItems);
await _dbContext.SaveChangesAsync(ct);
```

For large batch-style operations, EF Core may still not be the best mechanism. Set-based updates, raw SQL, or provider-specific bulk tooling may be more appropriate because the change tracker is optimized for ordinary application units of work, not for arbitrarily large data movement jobs.

## The `Local` View Of Tracked Entities

Each `DbSet<T>` exposes a `Local` property that returns an `ObservableCollection<T>` representing all entities currently tracked in the `Unchanged`, `Modified`, or `Added` state for that entity type. This collection stays synchronized with the change tracker: adding an item to `Local` calls `Add` on the underlying set, and entities that become `Detached` or `Deleted` are removed.

`Local` is valuable when an application needs to work with a cached, in-memory view of tracked data for a given unit of work:

```csharp
var existingCustomers = _dbContext.Customers.Local;

if (!existingCustomers.Any(c => c.Email == request.Email))
{
    var customer = new Customer { Email = request.Email, Name = request.Name };
    _dbContext.Customers.Add(customer);
}
```

`Local` does not trigger a database query. It reflects only the entities the context is already tracking. If the needed entities are not yet loaded, the application must first issue a query or use `Find`, which checks the identity map before hitting the database.

## Tracking Queries And No-Tracking Queries

Tracking is valuable when the application intends to update the loaded entities:

```csharp
var order = await _dbContext.Orders
    .FirstAsync(o => o.Id == id, ct);

order.Status = OrderStatus.Paid;
await _dbContext.SaveChangesAsync(ct);
```

For read-only flows, tracking often adds cost without value:

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

No-tracking queries reduce:

- change tracker memory usage;
- snapshot creation work;
- relationship fix-up overhead;
- accidental coupling between read models and later updates in the same scope.

This distinction is foundational. EF Core is often most effective when write-oriented flows and read-oriented flows are treated differently instead of using full tracking everywhere by habit. For contexts that serve predominantly read-heavy workloads, the default tracking behavior can be changed at the context level:

```csharp
public sealed class AppDbContext : DbContext
{
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
    }
}
```

This eliminates the need to append `AsNoTracking()` to every query. Individual queries that require tracking can opt in with `AsTracking()`.

## Identity Resolution Without Full Tracking

EF Core also supports:

```csharp
.AsNoTrackingWithIdentityResolution()
```

This mode can be useful when the application wants read-only behavior but still benefits from reusing the same object instance for repeated entity keys during materialization. It sits between full tracking and ordinary no-tracking.

Even so, it should be used deliberately. The common read path in API work is still no-tracking projection into DTOs rather than materializing large entity graphs for output.

## Batch Range Methods

When adding or attaching many entities at once, the range overloads improve both performance and clarity:

```csharp
_dbContext.Orders.AddRange(order1, order2, order3);
_dbContext.Orders.AttachRange(existingOrder1, existingOrder2);
_dbContext.Orders.UpdateRange(order1, order2);
```

These methods behave identically to their single-entity counterparts but avoid calling `DetectChanges` after each individual operation. For bulk additions, `AddRange` is the preferred pattern over looping with single `Add` calls.

## `Add`, `Attach`, And `Update`

The entry-point methods on `DbSet<T>` express different intent:

```csharp
_dbContext.Orders.Add(order);
_dbContext.Orders.Attach(order);
_dbContext.Orders.Update(order);
```

- `Add` treats the entity as new and marks it `Added`;
- `Attach` begins tracking an existing entity as unchanged;
- `Update` marks the entity, and often its reachable graph, as modified.

This is why `Update` should be used carefully in disconnected scenarios. It is easy to mark far more state as modified than the application actually intended, especially in HTTP APIs that receive partial or loosely validated payloads.

For most business updates, the safer pattern is:

1. load the current entity state;
2. apply deliberate changes;
3. save the context.

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

That pattern keeps the unit of work explicit and preserves domain behavior that would otherwise be bypassed by graph-wide state replacement.

## Relationship Fix-Up

When related entities are tracked in the same context, EF Core can connect navigation properties automatically.

```csharp
var order = await _dbContext.Orders.FirstAsync(o => o.Id == orderId, ct);
var items = await _dbContext.OrderItems
    .Where(i => i.OrderId == orderId)
    .ToListAsync(ct);
```

If the relationship is configured, EF Core can connect:

```text
order.Items -> items
item.Order  -> order
```

This relationship fix-up is convenient because it keeps tracked graphs internally consistent. It is also one more reason that a long-lived context becomes harder to predict. Once enough entities are tracked, the in-memory graph acquires behavior of its own, which may be useful during one unit of work but confusing across unrelated operations.

## Checking Whether Changes Exist

Before calling `SaveChanges`, the change tracker can report whether any tracked changes exist at all:

```csharp
if (_dbContext.ChangeTracker.HasChanges())
{
    await _dbContext.SaveChangesAsync(ct);
}
```

`HasChanges` returns `true` when any tracked entity has been added, modified, or deleted. Calling it before `SaveChanges` can be useful for conditional save logic, though in most request-scoped work the application already knows whether changes were made. The method is most valuable in middleware, background jobs, or reusable infrastructure that must make save decisions generically.

## Clearing The Change Tracker

When a `DbContext` instance must be reused within a scope, or when the tracked graph needs to be reset, `ChangeTracker.Clear()` detaches all tracked entities at once:

```csharp
_dbContext.ChangeTracker.Clear();
```

This is significantly more efficient than detaching entities one at a time. After clearing, all previously tracked entities become `Detached`, and the change tracker starts fresh. Clearing is rarely needed in the standard unit-of-work pattern -- disposing the context at the end of the scope is the normal approach -- but it can be useful in batch-processing scenarios where a single context processes multiple independent units of work.

## The `SaveChanges` Pipeline

`SaveChanges` is not just "send SQL to the database." It is a small execution pipeline:

```text
SaveChanges
  -> detect changes
  -> collect tracked entries by state
  -> generate insert/update/delete commands
  -> order commands according to key and relationship constraints
  -> execute them, usually in a transaction
  -> receive generated values
  -> update tracked state
```

Command ordering is one of the most important internal steps. EF Core builds a dependency graph from the entity metadata: parent rows must be inserted before children that reference them, and children must be deleted before their parents. The ordering logic inspects foreign key relationships, principal-dependent direction, and key generation strategy to determine the correct sequence. Without this step, a single `SaveChanges` call that adds both an `Order` and its `OrderItems` would fail with a foreign key violation because the order row's primary key (needed as the child's foreign key) might not yet exist.

```csharp
var order = new Order(customerId);
order.AddItem(productId, quantity: 2);

_dbContext.Orders.Add(order);
await _dbContext.SaveChangesAsync(ct);
```

The context understands enough about the tracked graph to translate that object change into the right relational sequence: it inserts the `Order` row first, retrieves the generated key from the database, applies that key to the child's foreign key property, and then inserts the `OrderItem` row -- all within one transaction.

For providers that support it, EF Core may also batch multiple commands into a single round trip rather than issuing them individually, reducing network latency for operations that affect many rows.

## Context Pooling

EF Core also supports context pooling:

```csharp
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});
```

Pooling can reduce allocation overhead in high-throughput applications, but it should not be treated as a free optimization. A pooled context instance is reused across scopes, so any custom mutable state placed directly on the context becomes dangerous unless it is correctly reset.

This is one reason a `DbContext` should primarily represent persistence infrastructure, not a container for arbitrary request-specific flags. Pooling is most effective when the context remains lean and the rest of the request state lives elsewhere.

## DbContext Factory Pattern

For application types where scoped lifetime does not align with the desired unit-of-work boundary -- such as Blazor Server, background services, or batch processors -- EF Core provides `IDbContextFactory<T>`:

```csharp
builder.Services.AddDbContextFactory<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});
```

The factory can then be injected and used to create short-lived context instances on demand:

```csharp
public sealed class OrderProcessingService
{
    private readonly IDbContextFactory<AppDbContext> _contextFactory;

    public OrderProcessingService(IDbContextFactory<AppDbContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    public async Task ProcessOrdersAsync(CancellationToken ct)
    {
        await using var dbContext = await _contextFactory.CreateDbContextAsync(ct);

        // Use the context for one unit of work
    }
}
```

Each call to `CreateDbContext` produces a fresh, independent context instance. The application is responsible for disposing it. This pattern is essential when a single service scope must execute multiple units of work, or when the DI container does not naturally create scoped instances per work item.

## OnConfiguring And DI Configuration

When `AddDbContext` is used in ASP.NET Core, `OnConfiguring` is still called on the context instance. This means configuration can be split: the DI setup provides the provider and connection string, while `OnConfiguring` adds cross-cutting concerns such as logging, interceptors, or default tracking behavior:

```csharp
protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
{
    optionsBuilder
        .LogTo(Console.WriteLine, LogLevel.Information)
        .EnableSensitiveDataLogging();
}
```

Configuration applied in both places is additive. Options set in `OnConfiguring` do not replace those from `AddDbContext` unless they conflict. This composability is useful for reusable base classes or testing infrastructure.

## Design Consequences

Keep `DbContext` short-lived and aligned with a real unit of work. Treat tracking as an intentional cost paid for update-oriented behavior rather than as the default shape of every query. Preserve explicit update boundaries instead of trying to force EF Core into bulk-processing or graph-replacement patterns it was not primarily designed to optimize.

These principles explain a large share of both EF Core's strengths and its failure modes.
