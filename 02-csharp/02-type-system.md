# C# Type System

## Core Idea

C# has a strong, static type system.

Chinese notes:

- `value type`: 值类型.
- `reference type`: 引用类型.
- `boxing`: 装箱.
- `nullable reference type`: 可空引用类型.

Understanding the type system helps you reason about memory, equality, null safety, generics, and API design.

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

Mental model:

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

## Reference Types

Examples:

- `class`
- `string`
- arrays;
- delegates;
- interfaces.

Reference variables point to objects.

Mental model:

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

Important nuance:

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

Key point:

> Nullable reference types are a static analysis feature. They reduce null bugs, but runtime input still needs validation.

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

Chinese note:

- `algebraic data type`: 代数数据类型，一种用类型表达“几种可能形态”的建模方式.

Key point:

> Good type design reduces the number of runtime checks needed later. The compiler becomes part of the design feedback loop.

## Generics

```csharp
public interface IRepository<TEntity>
{
    Task<TEntity?> GetByIdAsync(int id, CancellationToken ct);
}
```

Generic constraints:

```csharp
public sealed class EntityRepository<TEntity>
    where TEntity : class, IEntity
{
}
```

Benefits:

- type safety;
- reusable code;
- avoids boxing for generic collections.

Generic result example:

```csharp
public sealed record Result<T>(bool IsSuccess, T? Value, string? Error)
{
    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, error);
}
```

Usage:

```csharp
Result<UserDto> result = Result<UserDto>.Success(new UserDto(1, "Alice"));
```

The compiler knows that `Value` is a `UserDto?`, not just `object`.

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

## Review Questions

### Value type vs reference type?

> Value types generally contain data directly and are copied by value. Reference types store references to objects, and copying the variable copies the reference, not the object.

### Is every value type stored on the stack?

> No. Placement depends on context. A value type can be inside an object on the heap, inside an array, boxed, captured by a closure, or optimized by the JIT.

### What is boxing?

> Boxing wraps a value type in an object so it can be treated as `object` or an interface. It creates heap allocation and can affect performance in hot paths.

### When would you use record?

> Records are useful for immutable data models, DTOs, commands, and values where value-based equality is desired.

### Passing reference type by value vs by reference?

> By default, C# passes the reference value by value. The method receives a copy of the reference, so it can mutate the same object, but reassigning the parameter does not reassign the caller's variable. Use `ref` only when the method must change the caller's variable itself.

### What does nullable reference type actually guarantee?

> It gives compile-time warnings about possible null usage. It does not guarantee that runtime data from JSON, databases, or external APIs is valid.

### Why model state with different types instead of several booleans?

> Several booleans can represent invalid combinations. Separate types or records can express valid alternatives directly and make business rules easier to read.

## Common Mistakes

### Mistake: Saying value types are always on stack.

Why it is wrong:

> Value types can live inside heap objects, arrays, closures, boxed objects, or be optimized by the JIT. Stack vs heap is an implementation detail, while value semantics are the language concept.

Better answer:

> Value types are copied by value; their storage location depends on context.

### Mistake: Using mutable structs.

Why it is wrong:

> Structs are copied by value. If they are mutable, changes to a copy may not affect the original, which creates subtle bugs.

Better answer:

> Prefer small immutable structs.

### Mistake: Ignoring nullable warnings.

Why it is wrong:

> Nullable reference types help catch possible null bugs at compile time. Ignoring warnings removes much of their value.

Better answer:

> Treat nullable warnings as design feedback and model optional values explicitly with `?`.

### Mistake: Using `object` where generics are better.

Why it is wrong:

> `object` loses type safety and may require casts or boxing. Generics keep compile-time type information and avoid many runtime errors.

Better answer:

> Use generics when the operation should work over different types while preserving type safety.

### Mistake: Confusing reference equality and value equality.

Why it is wrong:

> Two variables can reference different objects with the same values, or the same object through two references. These are different questions.

Better answer:

> Reference equality asks "same object?" Value equality asks "same value?"

### Mistake: Using records for entities with identity without thinking.

Why it is wrong:

> Records default to value-based equality, but domain entities often use identity-based equality. A user entity changing its name is still the same user.

Better answer:

> Use records for DTOs and value-like data; be careful using them for mutable domain entities.

### Mistake: Modeling mutually exclusive states with unrelated flags.

Why it is wrong:

> Boolean flags can accidentally create impossible combinations, such as an order being both cancelled and shipped.

Better answer:

> Use enums for simple finite states, or separate record/class types when each state carries different data.
