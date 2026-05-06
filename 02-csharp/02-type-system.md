# C# Type System

## Core Idea

C# has a strong, static type system.

Understanding the type system helps you reason about memory, equality, null safety, generics, and API design.

This chapter focuses on the type system itself: value semantics, reference semantics, nullability, equality, and the way type design shapes correctness. Generics are important to that story, but their deeper design rules belong to the dedicated generics chapter later in the chapter sequence.

In practice, this chapter matters because many bugs that appear to be "business logic bugs" are actually type-design bugs. A model that allows contradictory states, ambiguous equality, or accidental nulls often shifts too much correctness work from the compiler into runtime conventions. The type system is one of the main tools C# offers for moving that work back into the design.

## Value Types

Examples:

- `int`
- `bool`
- `decimal`
- `DateTime`
- `Guid`
- `struct`
- `enum`

Value types usually contain the data directly.

The simplest mental model is:

```text
int a = 10;
int b = a;

a and b are two independent values.
Changing b does not change a.
```

```csharp
int a = 10;
int b = a;
b = 20;

Console.WriteLine(a); // 10
```

Copying a value type copies the value.

Struct example:

```csharp
public readonly struct Money
{
    public decimal Amount { get; }
    public string Currency { get; }

    public Money(decimal amount, string currency)
    {
        Amount = amount;
        Currency = currency;
    }
}

var price = new Money(10m, "USD");
var copy = price;
```

`copy` is a separate value. The `Currency` property is still a reference to a string object, but the struct value itself is copied.

That last nuance is important. A value type is copied as a value, but the fields inside it still keep their own semantics. If a struct contains references, those references are copied too. This is one reason immutable structs are usually easier to reason about than mutable ones: copy semantics remain predictable even when the struct contains references to immutable objects.

## Reference Types

Examples:

- `class`
- `string`
- arrays;
- delegates;
- interfaces.

Reference variables point to objects.

The simplest mental model is:

```text
user1 -> User object on managed heap
user2 -> same User object
```

```csharp
var user1 = new User { Name = "Alice" };
var user2 = user1;

user2.Name = "Bob";

Console.WriteLine(user1.Name); // Bob
```

Both variables reference the same object.

This is why changing through `user2` is visible through `user1`.

Example with method call:

```csharp
public static void Rename(User user)
{
    user.Name = "Charlie";
}

var user = new User { Name = "Alice" };
Rename(user);
Console.WriteLine(user.Name); // Charlie
```

The reference is passed by value, but the copied reference still points to the same object.

One important nuance is that:

```csharp
public static void Replace(User user)
{
    user = new User { Name = "New object" };
}

var user = new User { Name = "Alice" };
Replace(user);
Console.WriteLine(user.Name); // Alice
```

The method changed its local copy of the reference. It did not change the caller's variable.

This distinction becomes especially important in API design. Many developers initially describe reference types as "passed by reference," but the more accurate statement is that the reference value is passed by value unless `ref` is explicitly used. That mental model explains why a method can mutate an object but cannot rebind the caller's variable just by assigning a new object to its parameter.

## Boxing And Unboxing

Boxing converts a value type to `object` or interface.

```csharp
int number = 42;
object boxed = number;     // boxing
int unboxed = (int)boxed;  // unboxing
```

Boxing allocates an object on the heap.

Avoid boxing in hot paths.

Example:

```csharp
var numbers = new List<int>(); // no boxing for int values
```

But:

```csharp
var objects = new ArrayList();
objects.Add(42); // boxing
```

Boxing diagram:

```text
int number = 42
  -> value stored as int

object boxed = number
  -> new heap object containing copied int value
  -> boxed reference points to heap object
```

Unboxing requires the exact underlying value type:

```csharp
object boxed = 42;

int ok = (int)boxed;
// long fail = (long)boxed; // InvalidCastException
```

Why performance can suffer:

- boxing allocates;
- unboxing casts;
- repeated boxing in hot loops creates GC pressure.

Boxing is not always a disaster, but it is often a sign that the type system is being forced through a less precise abstraction than the code really wants. Modern generic APIs exist partly to avoid that cost while keeping the call sites strongly typed.

Common hidden boxing:

```csharp
int value = 10;
Console.WriteLine(value.ToString()); // no boxing needed for ToString

object obj = value; // boxing
IComparable comparable = value; // boxing
```

## Class vs Struct vs Record

### Class

Reference type.

Use for:

- entities;
- services;
- mutable objects;
- objects with identity.

Entity example:

```csharp
public sealed class User
{
    public Guid Id { get; }
    public string Email { get; private set; }

    public User(Guid id, string email)
    {
        Id = id;
        Email = email;
    }
}
```

Even if the email changes, it is still the same user because identity is `Id`.

### Struct

Value type.

Use for:

- small immutable values;
- no identity;
- performance-sensitive value objects.

Example:

```csharp
public readonly struct Money
{
    public decimal Amount { get; }
    public string Currency { get; }

    public Money(decimal amount, string currency)
    {
        Amount = amount;
        Currency = currency;
    }
}
```

Struct guidance:

- keep structs small;
- prefer immutable structs;
- avoid using large mutable structs in ordinary business code;
- use structs for true value concepts such as `Money`, `DateRange`, or coordinates.

### Record

Designed for value-like data models.

```csharp
public sealed record UserDto(int Id, string Name);
```

Records provide value-based equality by default.

Good for:

- DTOs;
- commands;
- immutable data.

Record equality example:

```csharp
public sealed record UserDto(int Id, string Name);

var left = new UserDto(1, "Alice");
var right = new UserDto(1, "Alice");

Console.WriteLine(left == right); // true
```

Class equality example:

```csharp
public sealed class UserClass
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
}

var left = new UserClass { Id = 1, Name = "Alice" };
var right = new UserClass { Id = 1, Name = "Alice" };

Console.WriteLine(left == right); // false by default
```

This is why records are nice for DTOs but should be used carefully for domain entities.

The underlying design question is whether the type is identified by who it is or by what data it contains. DTOs, commands, settings objects, and immutable projections often fit value-based equality naturally. Domain entities usually do not, because two separate customers with the same visible data are not the same customer.

## Nullable Reference Types

Enable:

```xml
<Nullable>enable</Nullable>
```

Example:

```csharp
public sealed class User
{
    public string Name { get; set; } = "";
    public string? MiddleName { get; set; }
}
```

`string` means should not be null.

`string?` means may be null.

This is compile-time help, not runtime enforcement.

Example warning:

```csharp
public sealed class User
{
    public string Name { get; set; }
}
```

With nullable enabled, the compiler warns because `Name` is non-nullable but not initialized.

Good options:

```csharp
public string Name { get; set; } = "";
```

or:

```csharp
public required string Name { get; init; }
```

Null check example:

```csharp
public static int GetLength(string? text)
{
    if (text is null)
    {
        return 0;
    }

    return text.Length;
}
```

Nullable reference types are a static analysis feature. They reduce null-related bugs, but runtime input still needs validation.

This is one of the healthiest changes in modern C#. Before nullable reference types, many codebases treated nullability as a social convention. With nullable enabled, null becomes part of the documented type contract. That does not eliminate null bugs entirely, but it makes careless API design far easier to spot.

## Pattern Matching

```csharp
public string GetDisplayName(User? user)
{
    return user switch
    {
        null => "Anonymous",
        { IsDeleted: true } => "Deleted user",
        { Name.Length: > 0 } => user.Name,
        _ => "Unknown"
    };
}
```

Pattern matching helps write expressive type and shape checks.

Type pattern:

```csharp
public static decimal CalculateDiscount(object customer)
{
    return customer switch
    {
        VipCustomer vip => vip.Level >= 5 ? 0.2m : 0.1m,
        RegularCustomer => 0.05m,
        null => 0m,
        _ => 0m
    };
}
```

Property pattern:

```csharp
public static bool CanApprove(Order order)
{
    return order is { Status: OrderStatus.Submitted, Total: <= 10_000m };
}
```

Pattern matching is especially useful when it makes business rules easier to read.

It also encourages a style of code where the shape of the data is expressed directly in the control flow rather than through deeply nested `if` statements and manual casts. That improves readability when the patterns represent real distinctions in the model. When pattern matching becomes excessively dense, however, it can also hide complexity, so clarity still matters more than novelty.

## Modeling State With Types

A useful habit in C# is to model impossible states as impossible, or at least harder to create.

Bad model:

```csharp
public sealed class Payment
{
    public bool IsPaid { get; set; }
    public bool IsFailed { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public string? FailureReason { get; set; }
}
```

Problem:

```text
IsPaid = true
IsFailed = true
PaidAt = null
FailureReason = null
```

The type allows contradictory states. Every caller must remember extra rules.

Better model with records:

```csharp
public abstract record PaymentStatus
{
    public sealed record Pending : PaymentStatus;
    public sealed record Paid(DateTimeOffset PaidAt) : PaymentStatus;
    public sealed record Failed(string Reason) : PaymentStatus;
}
```

Usage:

```csharp
public static string Describe(PaymentStatus status)
{
    return status switch
    {
        PaymentStatus.Pending => "Payment is pending",
        PaymentStatus.Paid paid => $"Paid at {paid.PaidAt:O}",
        PaymentStatus.Failed failed => $"Failed: {failed.Reason}",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };
}
```

This is not a full algebraic data type system, but it is a practical C# way to express alternatives.

Good type design reduces the number of runtime checks needed later. The compiler becomes part of the design feedback loop.

This is one of the central professional uses of the type system. Good type design does not merely store data neatly. It narrows the set of invalid programs that the rest of the system can accidentally write.

## Type Parameters As Part Of Type Design

Generic type parameters are one of the reasons the C# type system scales well across libraries and application code. They allow types and APIs to preserve specific type information instead of collapsing everything to `object`.

```csharp
public sealed record Result<T>(bool IsSuccess, T? Value, string? Error)
{
    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, error);
}
```

Here the compiler knows that `Value` is a `UserDto?`, not just `object`, which means the type system continues to protect the API all the way to the call site.

The dedicated generics chapter later in this part of the book goes deeper into constraints, variance, boxing avoidance, open generics, and generic design trade-offs. At this stage, the important idea is simply that generics are part of the type system's ability to keep APIs precise without giving up reuse.

That precision matters operationally as well as aesthetically. Once an API falls back to `object`, strings, loosely structured dictionaries, or parallel booleans for concepts that could have been modeled precisely, the codebase often compensates with more runtime checks, more documentation burden, and more fragile integration code.

## Equality

Reference equality:

```csharp
object.ReferenceEquals(a, b)
```

Value equality:

```csharp
a.Equals(b)
```

Records:

```csharp
var a = new UserDto(1, "Alice");
var b = new UserDto(1, "Alice");

Console.WriteLine(a == b); // true for record
```

Classes:

```csharp
var a = new UserClass(1, "Alice");
var b = new UserClass(1, "Alice");

Console.WriteLine(a == b); // usually false unless overloaded
```

Custom equality example:

```csharp
public sealed class ProductId : IEquatable<ProductId>
{
    public Guid Value { get; }

    public ProductId(Guid value)
    {
        Value = value;
    }

    public bool Equals(ProductId? other)
    {
        return other is not null && Value == other.Value;
    }

    public override bool Equals(object? obj)
    {
        return Equals(obj as ProductId);
    }

    public override int GetHashCode()
    {
        return Value.GetHashCode();
    }
}
```

Why `GetHashCode` matters:

> Collections such as `Dictionary` and `HashSet` depend on equality and hash codes. If you override equality incorrectly, lookups can behave incorrectly.

Equality design has real downstream consequences. It affects hash-based collections, caching, deduplication, set operations, testing semantics, and sometimes persistence behavior. That is why equality should be treated as part of the type's meaning, not just as a mechanical override required by tooling.

## Type Design Notes

Value types generally contain data directly and are copied by value. Reference types store references to objects, and copying the variable copies the reference rather than the object itself.

Value types are not guaranteed to live on the stack. Placement depends on context. A value type can appear inside an object on the heap, inside an array, boxed, captured by a closure, or optimized by the JIT in other ways.

Boxing wraps a value type in an object so it can be treated as `object` or an interface. That introduces heap allocation and can matter in hot paths.

Records are useful for immutable data models, DTOs, commands, and values where value-based equality is the natural design.

By default, C# passes a reference value by value. A method receives a copy of the reference, so it can mutate the same object, but reassigning the parameter does not reassign the caller's variable. `ref` should be used only when the caller's variable itself must be changed.

Nullable reference types provide compile-time warnings about possible null misuse. They improve local correctness, but they do not guarantee that runtime data from JSON, databases, or external systems is valid.

Several booleans often permit invalid combinations. Separate types or discriminated state shapes usually express valid alternatives more clearly and make business rules easier to enforce.
