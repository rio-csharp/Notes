# Value Converters, Owned Types, And Value Objects

## Core Idea

One of EF Core's most useful strengths is that it can map richer domain models than plain primitive property bags. Value converters and owned types are two of the main tools for doing that. They allow the application to preserve domain concepts such as email addresses, money, strongly typed identifiers, and addresses without flattening everything into loosely meaningful strings and numbers.

The goal is not richness for its own sake. The goal is to keep domain invariants and relational persistence aligned without making either side opaque.

## Primitive Obsession And Persistence Pressure

Without value objects, domain models often collapse into primitive-heavy classes:

```csharp
public sealed class User
{
    public string Email { get; set; } = "";
}
```

This shape is easy to persist but weak in domain meaning. Any string can be assigned, validation tends to scatter, and APIs become more error-prone because conceptually different values all look the same to the compiler.

A richer model might introduce:

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

Once the model becomes richer, EF Core needs explicit mapping guidance.

## Value Converters

A value converter maps one CLR property type to one persisted database representation.

One common example is storing an enum as a string:

```csharp
modelBuilder.Entity<Order>()
    .Property(o => o.Status)
    .HasConversion<string>()
    .HasMaxLength(30);
```

This often improves readability in the database and reduces coupling to enum numeric ordering. The trade-off is larger storage, potentially larger indexes, and the operational risk that renaming enum members requires a corresponding data migration.

Value converters are therefore not just mapping helpers. They are persistence design decisions.

## Single-Value Domain Types

Converters are a natural fit for single-value domain types:

```csharp
modelBuilder.Entity<User>()
    .Property(u => u.Email)
    .HasConversion(
        email => email.Value,
        value => new Email(value))
    .HasMaxLength(320);
```

This works well because the domain type is richer than a string, but the persisted shape is still one column.

The same pattern is useful for strongly typed identifiers:

```csharp
public readonly record struct OrderId(int Value);
```

```csharp
modelBuilder.Entity<Order>()
    .Property(o => o.Id)
    .HasConversion(
        id => id.Value,
        value => new OrderId(value));
```

Strongly typed IDs can prevent accidental cross-assignment between `OrderId`, `CustomerId`, and `ProductId` while still mapping cleanly to relational key columns.

## `ValueComparer` And Change Tracking Semantics

Some converted types need a custom `ValueComparer` so EF Core can compare, hash, and snapshot values correctly.

This is especially relevant for:

- mutable value objects;
- collection-like converted values;
- serialized representations that do not compare correctly by reference.

If EF Core cannot compare the value accurately, change tracking may miss real changes or report changes where none semantically occurred. That is not only a persistence problem. It can also distort concurrency behavior and update generation.

The broader lesson is that conversion and change tracking are linked. A converter answers how to persist the value. A comparer answers how to reason about sameness.

## Owned Types

When a value object spans multiple columns, an owned type is often the better fit.

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

Owned types are useful when the conceptual object has multiple fields but no independent identity outside the owner.

## Owned Types And Domain Meaning

Money is a good example:

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

Treating `Amount` and `Currency` as one concept often produces a better domain model than scattering them as unrelated columns in business code. The database still stores primitive values, but the application works with a value that preserves semantic coupling.

## Owned Collections

EF Core also supports owned collections:

```csharp
public sealed class Order
{
    public int Id { get; set; }
    public List<OrderNote> Notes { get; set; } = new();
}

public sealed record OrderNote(string Text, DateTimeOffset CreatedAt);
```

These can be useful, but they should not be treated as a free extension of object modeling. Owned collections often introduce separate tables, more complex update behavior, and migration consequences that are easy to underestimate from the CLR model alone.

They are best used when the conceptual ownership is strong and the relational cost is justified.

## Choosing Between Converter And Owned Type

The choice usually follows data shape.

A value converter is a strong fit when:

- one conceptual value maps to one column;
- the type is a single-field value object;
- querying inside the representation is not a major need.

An owned type is a stronger fit when:

- the value spans multiple columns;
- the fields belong together conceptually;
- the type has no separate identity but should remain structurally visible.

That distinction keeps the model honest. A converter should not be used to hide structured data that the application needs to query relationally in rich ways. In those cases, flattening everything into one serialized column may simplify mapping but weaken queryability and indexing.

## Queryability And Operational Trade-Offs

Rich domain modeling does not remove the need to think about database behavior.

For converted columns, translation depends on the converter and the provider. For owned types, indexing and query shape still have to match real access patterns. This means a model can be conceptually elegant and still operationally awkward if the persistence design ignores how the data is actually queried.

That trade-off is especially visible with:

- enums stored as strings;
- serialized JSON-like conversions;
- custom value objects that appear inside filters and order clauses;
- owned types that are heavily used in search predicates.

The right question is therefore not only "can EF Core map this?" but also "will the resulting schema and queries behave well in production?"

## Design Consequences

Value converters and owned types are most useful when they protect meaningful domain concepts without obscuring persistence behavior. They should strengthen the model, not romanticize it. If a richer type preserves invariants and still maps cleanly to the actual relational access pattern, it is often worth the extra configuration. If it makes querying, indexing, or migration behavior opaque, the design should be reconsidered.

The best EF Core models are the ones where domain clarity and persistence clarity reinforce each other rather than compete.
