# EF Core Value Converters And Owned Entities

## Core Idea

Value converters and owned entities help map rich domain models to relational tables.

Chinese notes:

- `value converter`: 值转换器.
- `owned entity`: 拥有实体.
- `value object`: 值对象.
- `primitive obsession`: 基本类型偏执, overusing raw strings/ints instead of meaningful types.

Key takeaway:

> Value converters map a single property to a database value. Owned entities map value objects with multiple properties and no independent identity.

## Why This Matters

Without value objects, domain code often becomes primitive-heavy:

```csharp
public sealed class User
{
    public string Email { get; set; } = "";
}
```

The problem:

- any string can be assigned;
- validation is scattered;
- method signatures are less meaningful;
- invalid state is easier to represent.

Better domain model:

```csharp
public sealed record Email
{
    public string Value { get; }

    public Email(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('@'))
        {
            throw new ArgumentException("Invalid email.", nameof(value));
        }

        Value = value.Trim().ToLowerInvariant();
    }

    public override string ToString() => Value;
}
```

Now EF needs to know how to persist `Email`.

## Value Converter

Value converters convert between CLR types and database types.

Example enum:

```csharp
public enum OrderStatus
{
    Draft,
    Submitted,
    Approved,
    Cancelled
}
```

Store enum as string:

```csharp
modelBuilder.Entity<Order>()
    .Property(o => o.Status)
    .HasConversion<string>()
    .HasMaxLength(30);
```

Pros:

- database value is readable;
- easier debugging;
- safer than relying on enum numeric order.

Cons:

- strings use more storage;
- renaming enum values can break existing data;
- indexes can be larger than int indexes.

## Custom Value Converter

Value object:

```csharp
public sealed record Email(string Value);
```

Configuration:

```csharp
modelBuilder.Entity<User>()
    .Property(u => u.Email)
    .HasConversion(
        email => email.Value,
        value => new Email(value))
    .HasMaxLength(320);
```

Entity:

```csharp
public sealed class User
{
    public int Id { get; set; }
    public Email Email { get; set; } = new("unknown@example.com");
}
```

Database column:

```text
Users.Email nvarchar(320)
```

## Strongly Typed ID Example

```csharp
public readonly record struct OrderId(int Value);
```

Entity:

```csharp
public sealed class Order
{
    public OrderId Id { get; set; }
    public decimal Total { get; set; }
}
```

Converter:

```csharp
modelBuilder.Entity<Order>()
    .Property(o => o.Id)
    .HasConversion(
        id => id.Value,
        value => new OrderId(value));
```

Why use strongly typed IDs:

- prevents mixing `OrderId`, `CustomerId`, and `ProductId`;
- makes APIs more expressive;
- reduces accidental assignment bugs.

## ValueComparer

For some converted types, EF Core may need a `ValueComparer` to compare values correctly, especially for mutable or collection-like types.

Example concept:

```csharp
var converter = new ValueConverter<IReadOnlyList<string>, string>(
    values => JsonSerializer.Serialize(values, (JsonSerializerOptions?)null),
    json => JsonSerializer.Deserialize<IReadOnlyList<string>>(json, (JsonSerializerOptions?)null)
        ?? Array.Empty<string>());

var comparer = new ValueComparer<IReadOnlyList<string>>(
    (a, b) => a!.SequenceEqual(b!),
    values => values.Aggregate(0, (hash, value) => HashCode.Combine(hash, value.GetHashCode())),
    values => values.ToArray());
```

Note:

> If EF cannot compare converted values correctly, change tracking may miss changes or detect too many changes.

## Owned Entity

Owned entity is used when a value object has multiple fields.

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public Address ShippingAddress { get; set; } = null!;
}

public sealed record Address(
    string Line1,
    string City,
    string PostalCode,
    string Country);
```

Mapping:

```csharp
modelBuilder.Entity<Order>()
    .OwnsOne(o => o.ShippingAddress, address =>
    {
        address.Property(a => a.Line1).HasMaxLength(200);
        address.Property(a => a.City).HasMaxLength(100);
        address.Property(a => a.PostalCode).HasMaxLength(30);
        address.Property(a => a.Country).HasMaxLength(100);
    });
```

By default, owned fields may be stored in the same table:

```text
Orders
  Id
  ShippingAddress_Line1
  ShippingAddress_City
  ShippingAddress_PostalCode
  ShippingAddress_Country
```

## Money Example

```csharp
public sealed record Money(decimal Amount, string Currency);
```

```csharp
modelBuilder.Entity<Order>()
    .OwnsOne(o => o.Total, money =>
    {
        money.Property(m => m.Amount)
            .HasColumnName("TotalAmount")
            .HasPrecision(18, 2);

        money.Property(m => m.Currency)
            .HasColumnName("Currency")
            .HasMaxLength(3);
    });
```

Why owned entity:

> `Money` has two values that belong together. It has no independent identity outside the owning `Order`.

## Owned Collections

Owned collections are possible:

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public List<OrderNote> Notes { get; set; } = new();
}

public sealed record OrderNote(string Text, DateTimeOffset CreatedAt);
```

Mapping:

```csharp
modelBuilder.Entity<Order>()
    .OwnsMany(o => o.Notes, notes =>
    {
        notes.WithOwner().HasForeignKey("OrderId");
        notes.Property<int>("Id");
        notes.HasKey("Id");
        notes.Property(n => n.Text).HasMaxLength(500);
    });
```

Be careful:

> Owned collections can create additional tables and update behavior that is more complex than simple owned single objects. Review generated migrations.

## When To Use

Use value converter for:

- enum as string;
- strongly typed IDs;
- single-field value objects;
- simple encrypted/serialized values when query needs are limited.

Use owned entity for:

- address;
- money;
- date range;
- multi-field value objects.

Avoid value converter when:

- you need to query inside the converted value frequently;
- the converted value is large JSON but needs relational querying;
- the type needs independent identity;
- database indexing/querying becomes awkward.

## Querying Converted Columns

Converted columns are still database columns, but translation depends on the converter and provider.

Good:

```csharp
var users = await _dbContext.Users
    .Where(u => u.Email == new Email("alice@example.com"))
    .ToListAsync(ct);
```

If mapped correctly, EF can compare the converted database value.

Potential problem:

```csharp
var users = await _dbContext.Users
    .Where(u => u.Email.Value.EndsWith("@example.com"))
    .ToListAsync(ct);
```

Depending on mapping and provider, this may not translate as expected.

Engineering perspective:

> Rich value objects are good for domain correctness, but I still review query translation and indexing needs.

## Review Questions

### What is a value converter?

A value converter maps between a CLR property type and a database column type, such as converting an enum to string or a value object to its primitive value.

### What is an owned entity?

An owned entity is an EF Core type that belongs to another entity and does not have independent identity. It is useful for value objects with multiple fields.

### Why use value objects with EF Core?

Value objects can protect domain invariants and make invalid states harder to represent. EF Core mapping allows them to be persisted without exposing primitive obsession everywhere.

### Value converter vs owned entity?

Use a value converter for a single-value mapping. Use an owned entity when the value object has multiple columns or structure.

### What risk exists when storing enum as string?

Renaming enum members can break existing data unless you migrate the stored values.

### What is `ValueComparer` used for?

It tells EF Core how to compare, hash, and snapshot custom converted values for change tracking.

## Common Mistakes

### Mistake: Making every small type an owned entity unnecessarily

Why it is wrong:

> It can make mapping and migrations more complex without adding meaningful domain value.

Better answer:

> Use value objects where they protect invariants or clarify the model.

### Mistake: Renaming enum strings without data migration

Why it is wrong:

> Existing database rows still contain the old string value.

Better answer:

> Add a data migration or keep stable stored values.

### Mistake: Complex owned collections without understanding generated schema

Why it is wrong:

> Owned collections can generate extra tables, shadow keys, and update behavior that may surprise you.

Better answer:

> Review migrations and test update/delete behavior.

### Mistake: Ignoring indexing needs for converted columns

Why it is wrong:

> Converted values still need appropriate column type, length, and indexes for query performance.

Better answer:

> Configure column length/type/indexes explicitly and inspect generated SQL.

### Mistake: Putting query-heavy JSON into a converter

Why it is wrong:

> Relational databases cannot efficiently query arbitrary serialized data without provider-specific JSON support and indexes.

Better answer:

> Use normal relational columns for frequently queried fields, or use provider-specific JSON features deliberately.

## Practice Task

Model:

1. `Email` value object with converter;
2. `OrderId` strongly typed ID with converter;
3. `Money` owned entity;
4. `Address` owned entity;
5. enum stored as string;
6. migration output review;
7. one query against a converted column and inspect generated SQL.

