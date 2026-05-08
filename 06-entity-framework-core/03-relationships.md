# Relationships And Graph Loading

## Core Idea

EF Core relationships connect object-model navigation properties to relational foreign keys and constraints. That mapping is conceptually simple, but the engineering consequences are not. Relationship configuration influences schema shape, delete behavior, aggregate loading, query size, and the difference between a clean read model and an accidental object graph explosion.

Relationships are both a modeling concern and a query concern. The schema definition is only the beginning. The real design work lies in deciding which relationships are required, how they should be deleted, and when related data should be loaded at all.

## Foreign Keys And Navigation Properties

Consider:

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
}
```

`CustomerId` is the relational foreign key. `Customer` is the navigation property in the object model. They describe the same relationship from different directions.

This distinction matters because navigations are not the relationship itself. They are an application-facing representation of it. The database enforces the real referential rule through foreign keys and constraints, while EF Core uses navigations to make that rule easier to work with in code.

One practical consequence follows immediately: the existence of a navigation property does not mean the related entity is loaded. Loading is a separate decision.

## Convention-Based Relationship Discovery

EF Core infers relationships through conventions without requiring explicit configuration for simple cases. If an entity contains a navigation property and a matching foreign key property, EF Core recognizes the relationship automatically:

- `CustomerId` paired with a `Customer` navigation in `Order` is detected as a one-to-many relationship.
- A `List<Order>` on `Customer` paired with `CustomerId` on `Order` is detected as the inverse navigation.

Conventions are convenient, but they have limits. They assume standard naming patterns (`<NavigationName>Id`, `<PrincipalType>Id`), and they may infer cascade delete or optionality choices that do not match business requirements. This is why many production codebases use explicit fluent configuration for all nontrivial relationships, keeping conventions only as a starting scaffold.

## One-To-Many

One-to-many is the most common relationship shape:

```csharp
public sealed class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<Order> Orders { get; set; } = new();
}

public sealed class Order
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public decimal Total { get; set; }
}
```

```csharp
modelBuilder.Entity<Order>()
    .HasOne(o => o.Customer)
    .WithMany(c => c.Orders)
    .HasForeignKey(o => o.CustomerId)
    .OnDelete(DeleteBehavior.Restrict);
```

At the relational level, each `Order` row points to one `Customer`. At the object level, the navigation pair allows the application to traverse the relationship in both directions.

## One-To-One

One-to-one relationships are less common and require more care because the database still needs a uniqueness guarantee on the dependent side.

```csharp
public sealed class User
{
    public int Id { get; set; }
    public UserProfile Profile { get; set; } = null!;
}

public sealed class UserProfile
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string DisplayName { get; set; } = "";
}
```

```csharp
modelBuilder.Entity<User>()
    .HasOne(u => u.Profile)
    .WithOne(p => p.User)
    .HasForeignKey<UserProfile>(p => p.UserId);

modelBuilder.Entity<UserProfile>()
    .HasIndex(p => p.UserId)
    .IsUnique();
```

Without the uniqueness guarantee, the intended one-to-one rule is not fully enforced in relational terms.

## Many-To-Many And Explicit Join Entities

EF Core supports simple many-to-many relationships without an explicit join type:

```csharp
public sealed class Student
{
    public int Id { get; set; }
    public List<Course> Courses { get; set; } = new();
}

public sealed class Course
{
    public int Id { get; set; }
    public List<Student> Students { get; set; } = new();
}
```

That convenience is useful when the relationship really is just membership. Once the join itself carries business meaning, an explicit join entity is usually the correct model:

```csharp
public sealed class Enrollment
{
    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;

    public int CourseId { get; set; }
    public Course Course { get; set; } = null!;

    public DateTimeOffset EnrolledAt { get; set; }
    public string Status { get; set; } = "";
}
```

An explicit join entity is appropriate when the relationship has its own:

- timestamps;
- status;
- ordering;
- role semantics;
- audit fields;
- domain behavior.

At that point, the join is no longer hidden infrastructure. It is part of the domain model.

When the join entity has additional payload properties that should be configured in the model, `UsingEntity` provides explicit control:

```csharp
modelBuilder.Entity<Student>()
    .HasMany(s => s.Courses)
    .WithMany(c => c.Students)
    .UsingEntity<Enrollment>(
        e => e.HasOne(e => e.Course).WithMany(),
        e => e.HasOne(e => e.Student).WithMany(),
        e => e.Property(p => p.EnrolledAt).HasDefaultValueSql("GETUTCDATE()"));
```

This keeps the relationship mapping explicit while still allowing EF Core to manage the join table schema through migrations.

## Required And Optional Relationships

Required and optional relationships should be expressed consistently in both CLR shape and relational mapping.

Required:

```csharp
public int CustomerId { get; set; }
public Customer Customer { get; set; } = null!;
```

Optional:

```csharp
public int? CustomerId { get; set; }
public Customer? Customer { get; set; }
```

This is not just a style preference. Mismatches between nullable reference intent, foreign-key nullability, and business rules create confusion both for developers and for generated schema.

## Delete Behavior As A Business Decision

Delete behavior is one of the most underestimated relationship decisions.

```csharp
modelBuilder.Entity<Order>()
    .HasOne(o => o.Customer)
    .WithMany(c => c.Orders)
    .OnDelete(DeleteBehavior.Restrict);
```

Common options include:

- `Cascade`
- `Restrict`
- `SetNull`
- `NoAction`
- `ClientCascade`
- `ClientSetNull`

The first four control both the database foreign key constraint and EF Core's in-memory behavior. `ClientCascade` and `ClientSetNull` are EF Core-specific options that apply cascade behavior only to loaded tracked entities without configuring a database cascade. These can be useful when the database schema must remain conservative but the application still benefits from automatic graph cleanup within a unit of work.

The correct choice depends on business semantics, not on what is most convenient for the ORM. Cascading through a graph may be acceptable for clearly owned technical data. It is often dangerous for financial, audit, or historical data.

Deleting a customer and automatically deleting related orders may be operationally disastrous even if the cascade path is technically valid. In such systems, soft delete, archival, or explicit removal workflows are often more appropriate than automatic cascade deletion.

## Loading Related Data

Schema configuration and loading strategy should be kept conceptually separate. A relationship may exist without being loaded, and loading should follow actual use rather than object-model convenience.

EF Core supports three broad loading styles:

- eager loading;
- explicit loading;
- lazy loading.

## Eager Loading

Eager loading retrieves related data as part of the query:

```csharp
var orders = await _dbContext.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

`Include` translates the navigation into a SQL `JOIN`. For a one-to-many relationship, this produces a query roughly equivalent to:

```sql
SELECT o.*, c.*
FROM Orders o
INNER JOIN Customers c ON o.CustomerId = c.Id
```

With a required (non-nullable) foreign key, EF Core generates `INNER JOIN`. With an optional foreign key, it generates `LEFT JOIN` instead. The choice follows relational normal form: a required relationship guarantees a matching principal row exists, so an inner join is sufficient.

When multiple `Include` calls or nested `ThenInclude` chains are used, the generated SQL may contain multiple JOINs, potentially creating a wide result set with duplicated parent data.

This can be appropriate when the application truly needs related entities as entities. It is less appropriate when the output is a read model that only needs a few related columns, because projection is often more efficient and more explicit.

## Auto-Including Navigations

When a navigation property is always needed whenever its parent entity is loaded, the model can be configured to include it automatically on every query:

```csharp
modelBuilder.Entity<Order>()
    .Navigation(o => o.Customer)
    .AutoInclude();
```

With this configuration, every query returning `Order` entities will automatically join `Customer` without an explicit `Include` call. The automatic include can still be overridden per query using `IgnoreAutoIncludes()`:

```csharp
var orders = await _dbContext.Orders
    .IgnoreAutoIncludes()
    .ToListAsync(ct);
```

Auto-include is convenient for consistently loaded graphs, but it should be used sparingly. Applying it too broadly makes every query heavier, and the implicit join can surprise developers who expect a lightweight query.

## Split Queries For Large Graphs

When eager loading involves multiple related collections, the cartesian explosion of row duplication can become significant. For example, loading customers with their orders and order items as entities:

```csharp
var customers = await _dbContext.Customers
    .Include(c => c.Orders)
    .ThenInclude(o => o.Items)
    .AsSplitQuery()
    .ToListAsync(ct);
```

`AsSplitQuery` tells EF Core to issue multiple queries instead of one. The first query loads customers, the second loads orders for those customers, and the third loads items for those orders. EF Core then reconciles the results using relationship fix-up in memory.

The trade-off is more round trips but less redundant data transfer and potentially simpler execution plans. Split queries are not a universal improvement; they should be evaluated based on actual query shape and data volume.

## Explicit Loading

Explicit loading fetches related data later and visibly:

```csharp
await _dbContext.Entry(order)
    .Collection(o => o.Items)
    .LoadAsync(ct);
```

This style is useful when the need for related data depends on a prior business decision. It makes the loading boundary explicit, which is often preferable to implicit behavior in complex application flows.

## Lazy Loading And Hidden Query Behavior

Lazy loading retrieves related data automatically when a navigation is accessed. The convenience is obvious, but so is the risk: query execution becomes implicit.

That implicitness is the real problem. Hidden round trips are difficult to reason about during code review, easy to trigger accidentally in loops, and especially dangerous near serialization boundaries.

For that reason, many teams either avoid lazy loading entirely or use it only under tightly controlled circumstances.

## The N+1 Problem

The classic failure mode is the N+1 query problem:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

foreach (var order in orders)
{
    Console.WriteLine(order.Customer.Name);
}
```

If lazy loading is enabled, this may execute one query for the orders and then one additional query per order for customers. That destroys performance not because any single query is terrible, but because round-trip count explodes with result size.

In most API read paths, the better pattern is projection:

```csharp
var orders = await _dbContext.Orders
    .AsNoTracking()
    .Select(o => new OrderListItemDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name,
        Total = o.Total
    })
    .ToListAsync(ct);
```

The query stays relational, the data shape stays small, and the controller receives exactly the response shape it needs.

## Relationship Fix-Up And Tracked Graphs

When related entities are tracked in the same context, EF Core can connect their navigations automatically.

```csharp
var customer = await _dbContext.Customers
    .FirstAsync(c => c.Id == customerId, ct);

var orders = await _dbContext.Orders
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);
```

After both queries, EF Core can often wire:

```text
customer.Orders -> orders
order.Customer  -> customer
```

This relationship fix-up is useful within one unit of work, but it reinforces a broader lesson from the previous chapter: large tracked graphs acquire behavior that is helpful only if the unit-of-work boundary remains disciplined.

## `Include` Versus Projection

One of the most important practical choices in EF Core is deciding whether the application needs related entities or only related values.

`Include` is appropriate when:

- the application will traverse a real aggregate graph;
- update behavior depends on loaded related entities;
- the object graph itself is the needed shape.

Projection is usually better when:

- building API DTOs;
- rendering list or detail pages;
- returning read-oriented application models;
- avoiding unnecessary tracking and navigation materialization.

This distinction helps prevent one of the most common EF Core misuses: treating entity graphs as default response models.

## Design Consequences

Relationship design in EF Core is not finished when the mapping compiles. The important questions are whether the relationship matches real business ownership, whether delete behavior is safe, and whether related data should be loaded as entities at all.

Strong EF Core codebases usually have a clear answer to all three. They model relationships deliberately, restrict or soften destructive cascades where the domain requires it, and prefer projection over graph loading in read paths that do not truly need entities.
