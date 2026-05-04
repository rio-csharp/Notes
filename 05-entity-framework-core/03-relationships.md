# EF Core Relationships

## Core Idea

EF Core relationships define how entities are connected and how those connections map to relational database foreign keys.

Chinese notes:

- `one-to-many`: 一对多.
- `one-to-one`: 一对一.
- `many-to-many`: 多对多.
- `navigation property`: 导航属性.
- `foreign key`: 外键.
- `relationship fix-up`: 关系修复, EF connects tracked related objects automatically.

Key takeaway:

> A navigation property is an object-model convenience. The database relationship is represented by foreign keys and constraints.

## Foreign Key vs Navigation Property

Example:

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
}
```

`CustomerId` is the foreign key.

`Customer` is the navigation property.

Important:

> Having a navigation property does not mean the related entity is already loaded. Loading depends on tracking state and query strategy.

## One-to-many

Example:

```text
Customer -> Orders
```

Entity:

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

Fluent API:

```csharp
modelBuilder.Entity<Order>()
    .HasOne(o => o.Customer)
    .WithMany(c => c.Orders)
    .HasForeignKey(o => o.CustomerId)
    .OnDelete(DeleteBehavior.Restrict);
```

What this means:

- each `Order` has one `Customer`;
- each `Customer` can have many `Orders`;
- `Order.CustomerId` is the FK column;
- delete behavior is restricted.

## One-to-one

Example:

```text
User -> UserProfile
```

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

Configuration:

```csharp
modelBuilder.Entity<User>()
    .HasOne(u => u.Profile)
    .WithOne(p => p.User)
    .HasForeignKey<UserProfile>(p => p.UserId);
```

Database note:

> A true one-to-one relationship usually needs a unique constraint or unique index on the dependent foreign key.

Example:

```csharp
modelBuilder.Entity<UserProfile>()
    .HasIndex(p => p.UserId)
    .IsUnique();
```

## Many-to-many

Example:

```text
Student <-> Course
```

Simple many-to-many:

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

EF Core can create a join table automatically.

When the join table has extra data, create an explicit join entity:

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

Configuration:

```csharp
modelBuilder.Entity<Enrollment>()
    .HasKey(e => new { e.StudentId, e.CourseId });

modelBuilder.Entity<Enrollment>()
    .HasOne(e => e.Student)
    .WithMany(s => s.Enrollments)
    .HasForeignKey(e => e.StudentId);

modelBuilder.Entity<Enrollment>()
    .HasOne(e => e.Course)
    .WithMany(c => c.Enrollments)
    .HasForeignKey(e => e.CourseId);
```

Use explicit join entity when the relationship has:

- created date;
- status;
- ordering;
- role;
- audit fields;
- soft-delete flag;
- business behavior.

## Loading Related Data

### Eager Loading

Eager loading loads related data as part of the query.

```csharp
var orders = await _dbContext.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

Use when:

- you need full related entities;
- you are performing domain behavior that needs an aggregate graph;
- query size is controlled.

### Explicit Loading

Explicit loading loads related data after an entity is already loaded.

```csharp
await _dbContext.Entry(order)
    .Collection(o => o.Items)
    .LoadAsync(ct);
```

Use when:

- you conditionally need related data;
- loading logic is deliberate and visible.

### Lazy Loading

Lazy loading loads navigation properties automatically when accessed.

Be careful:

> Lazy loading can hide database queries and cause N+1 problems, especially during JSON serialization or loops.

## N+1 Example

Bad:

```csharp
var orders = await _dbContext.Orders.ToListAsync(ct);

foreach (var order in orders)
{
    Console.WriteLine(order.Customer.Name);
}
```

If lazy loading is enabled, this can run:

```text
1 query for orders
N queries for customers
```

Better with projection:

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

Better with `Include` when full entity graph is needed:

```csharp
var orders = await _dbContext.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

## Projection Is Often Better

For API list pages:

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

This is often better than loading full entity graphs because it:

- selects only needed columns;
- avoids unnecessary tracking;
- reduces memory;
- avoids circular serialization;
- keeps API response shape independent from entity shape.

## Relationship Fix-up

When related entities are tracked in the same `DbContext`, EF Core can connect navigations automatically.

Example:

```csharp
var customer = await _dbContext.Customers
    .FirstAsync(c => c.Id == customerId, ct);

var orders = await _dbContext.Orders
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);
```

EF can set:

```text
customer.Orders -> orders
order.Customer -> customer
```

Why it matters:

> Relationship fix-up is useful, but it can surprise you if a long-lived context has many tracked entities. Another reason to keep `DbContext` short-lived.

## Delete Behavior

```csharp
modelBuilder.Entity<Order>()
    .HasOne(o => o.Customer)
    .WithMany(c => c.Orders)
    .OnDelete(DeleteBehavior.Restrict);
```

Common options:

- `Cascade`: delete dependents automatically;
- `Restrict`: block delete if dependents exist;
- `SetNull`: set nullable FK to null;
- `NoAction`: database enforces behavior without EF client cascade.

Use cascade delete carefully in business systems.

Example risk:

```text
Delete Customer
  -> automatically delete Orders
  -> automatically delete OrderItems
  -> lose financial history
```

Better for many business systems:

- restrict delete;
- soft delete;
- archive;
- require explicit deletion workflow.

## Required vs Optional Relationship

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

Important:

> Nullable reference types and nullable FK properties should match your relationship intent.

## Review Questions

### Include vs projection?

`Include` loads related entities. Projection selects only the fields needed for a DTO. For API read models, projection is often more efficient.

### When should you create explicit many-to-many join entity?

When the relationship has additional data, such as created date, role, ordering, status, audit fields, or behavior.

### Why can lazy loading be dangerous?

It can hide database queries and cause N+1 performance problems, especially in loops and JSON serialization.

### Does a navigation property mean related data is loaded?

No. A navigation property describes the relationship in the object model. Related data is loaded only if it was included, explicitly loaded, lazy-loaded, or already tracked and fixed up.

### What is relationship fix-up?

Relationship fix-up is EF Core connecting navigation properties between tracked entities when it sees matching keys.

### How do you choose delete behavior?

Choose based on business rules. Cascade is convenient but can delete too much. Restrict or soft delete is often safer for financial, audit, or history data.

## Common Mistakes

### Mistake: Loading huge graphs with multiple `Include`s

Why it is wrong:

> It can create large joins, duplicate data, high memory usage, and slow serialization.

Better answer:

> Use projection for API read models, split queries for large graphs, and only include what the use case needs.

### Mistake: Using lazy loading in high-traffic APIs

Why it is wrong:

> It hides database queries and often creates N+1 problems.

Better answer:

> Prefer explicit projection or intentional `Include`.

### Mistake: Not configuring delete behavior

Why it is wrong:

> Default behavior may not match business rules and can either block deletes unexpectedly or delete too much.

Better answer:

> Configure delete behavior deliberately and test it.

### Mistake: Confusing navigation properties with actual database loading

Why it is wrong:

> A navigation property can be null or empty because it was not loaded, not because the relationship does not exist.

Better answer:

> Know which loading strategy the query uses.

### Mistake: Exposing entity graphs directly from controllers

Why it is wrong:

> It can create circular serialization, overexpose fields, and couple API contracts to persistence shape.

Better answer:

> Return DTOs shaped for the endpoint.

## Practice Task

Model:

1. customer and orders;
2. order and order items;
3. user and profile;
4. student and course enrollment;
5. projection query;
6. `Include` query;
7. delete behavior test;
8. one N+1 example and fix.

