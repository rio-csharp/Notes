# C# Type System

C# has a strong, static type system. Understanding value semantics, reference semantics, nullability, equality, and type design shapes correctness at compile time rather than leaving it entirely to runtime conventions. Generics are part of this story, but their deeper design rules belong to the dedicated generics chapter.

## Value Types

Examples:

- `int`
- `bool`
- `decimal`
- `DateTime`
- `Guid`
- `struct`
- `enum`

Value types contain data directly. Copying a value type copies the value:

```csharp
int a = 10;
int b = a;
b = 20;

Console.WriteLine(a); // 10
```

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

A value type is copied as a value, but the fields inside it retain their own semantics. If a struct contains references, those references are copied as well. Immutable structs are generally easier to reason about than mutable ones because copy semantics remain predictable even when the struct contains references to immutable objects.

## Reference Types

Examples:

- `class`
- `string`
- arrays;
- delegates;
- interfaces.

Reference variables point to objects on the managed heap. Both variables can reference the same object:

```csharp
var user1 = new User { Name = "Alice" };
var user2 = user1;

user2.Name = "Bob";

Console.WriteLine(user1.Name); // Bob
```

Both variables reference the same object, so mutation through either variable is visible to both:

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

A method that reassigns its own parameter does not affect the caller:

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

Reference types are commonly described as "passed by reference," but the more accurate description is that the reference value is passed by value unless `ref` is explicitly used. That model explains why a method can mutate an object but cannot rebind the caller's variable by assigning a new object to its parameter.

## Boxing And Unboxing

Boxing converts a value type to `object` or an interface it implements.

```csharp
int number = 42;
object boxed = number;     // boxing
int unboxed = (int)boxed;  // unboxing
```

Boxing allocates a heap object whose layout consists of three regions: a sync block (used for locking and GC bookkeeping), a method table pointer (identifying the type at runtime), and the raw bytes of the value itself. The value is copied from its current location into that heap allocation, and the resulting reference points to the managed heap like any other reference type.

```text
int number = 42
  -> value stored as int

object boxed = number
  -> new heap object containing [sync block | method table ptr | int 42]
  -> boxed reference points to heap object
```

Unboxing requires the exact underlying value type:

```csharp
object boxed = 42;

int ok = (int)boxed;
// long fail = (long)boxed; // InvalidCastException
```

When boxing occurs inside a hot loop, the cumulative allocation cost becomes measurable. The following comparison uses `List<int>` (no boxing) against `ArrayList` (boxes every `int` on `Add`):

```csharp
// Representative BenchmarkDotNet results on .NET 8:
// | Method         | Mean      | Allocated  |
// |--------------- |----------:|-----------:|
// | ListAdd        |  2.3 ns   |         -- |
// | ArrayListAdd   | 11.8 ns   |      32 B  |
```

Each boxed `int` consumes 24 bytes of heap space on a 64-bit runtime (16 bytes of object header and 8 bytes for the payload, aligned), and each allocation contributes to gen-0 collection frequency. In a loop processing millions of elements, the difference between zero allocations and millions of short-lived heap objects is often the difference between stable throughput and visible GC pauses.

Generic APIs avoid this cost entirely by preserving the concrete value type at every step:

```csharp
var numbers = new List<int>();  // stores raw ints, no boxing
```

The older non-generic collection APIs do not:

```csharp
var objects = new ArrayList();
objects.Add(42); // boxes int to object on every Add
```

Occasional boxing in cold paths is negligible, but boxing in hot paths is often a signal that a type is being forced through a less precise abstraction than the code requires. Modern generic APIs exist partly to eliminate that cost while keeping the call sites strongly typed.

Common hidden boxing locations include interface dispatch on value types and APIs that accept `object`:

```csharp
int value = 10;
Console.WriteLine(value.ToString());    // no boxing: int overrides ToString

object obj = value;                     // boxing
IComparable comparable = value;         // boxing: value type to interface
string s = string.Format("{0}", value); // boxing: Format accepts object[]
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

Records suit DTOs, commands, and read models for this reason. Domain entities, whose identity persists across data changes, should be designed carefully when using records — the underlying question is whether the type is identified by identity or by the data it carries.

### `with` Expressions And Non-Destructive Mutation

Records and record structs support the `with` expression, which creates a copy with selected properties changed:

```csharp
var original = new UserDto(1, "Alice");
var updated = original with { Name = "Bob" };

Console.WriteLine(original.Name); // "Alice" — original is unchanged
Console.WriteLine(updated.Name);  // "Bob"
```

The `with` expression calls a compiler-generated copy constructor that copies every field, then applies the property assignments listed in the initializer. For positional records, this means the positional properties; for nominal records, it includes any property with `init` or `set` access. The copy is shallow — reference-type fields are copied by reference, not cloned.

The mechanism differs between `record class` and `record struct`. For `record class`, the copy is a new heap allocation. For `record struct`, the copy is a value copy on the stack (or inlined into the enclosing object), and the `with` expression is simply a convenient syntax over constructing a new value:

```csharp
public readonly record struct Money(decimal Amount, string Currency);

var price = new Money(10m, "USD");
var updated = price with { Amount = 15m }; // new struct value, no heap allocation
```

`with` is the standard pattern for producing updated versions of immutable data. In event-sourced systems, it is the mechanism that applies an event to a projection: `projection with { Status = OrderStatus.Submitted }`. In API layers, it maps an update DTO to a domain object without mutating the original.

## Nullable Reference Types

Enable:

```xml
<Nullable>enable</Nullable>
```

A fuller project example looks like this:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
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

A standard build surfaces nullable warnings directly:

```bash
dotnet build
```

When nullable reference types are enabled, the compiler emits warnings for code paths that may violate the declared nullability contract. The feature is not merely conceptual — it changes the feedback the codebase receives during ordinary compilation, making nullability mistakes visible before any test runs or deployment happens.

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

Before nullable reference types, many codebases treated nullability as a social convention — team agreements, code review norms, and naming patterns carried the burden. With nullable enabled, null becomes part of the documented type contract and the compiler holds every code path to that contract. The feature does not eliminate null bugs entirely, but it makes careless API design far easier to spot during ordinary compilation.

One related feature deserves careful handling:

```csharp
string name = possiblyNull!;
```

The null-forgiving operator tells the compiler to suppress a nullable warning at that location. It does not make the value non-null at runtime. The `!` operator should represent genuine knowledge the code has already established, not a routine way to silence analysis that the design should address more honestly.

### Nullable Reference Types And JSON Deserialization

Nullable reference types operate at compile time, but JSON deserialization happens at runtime. This gap is a recurring source of unexpected nulls in production code. Consider a typical request model:

```csharp
public sealed class CreateOrderRequest
{
    public required string CustomerName { get; init; }
    public required string? Notes { get; init; }
    public decimal Discount { get; init; }
}
```

`System.Text.Json` deserializes JSON into this type without consulting nullable annotations. If the incoming JSON omits `CustomerName`, the deserializer assigns `null` to a property the type declares as non-nullable. No exception is thrown during deserialization — the null propagates to later code that accesses `CustomerName`, where a `NullReferenceException` appears far from the original input boundary:

```csharp
var request = JsonSerializer.Deserialize<CreateOrderRequest>("""{"Discount":5}""");
Console.WriteLine(request!.CustomerName.Length); // NullReferenceException
```

The `required` keyword prevents callers from constructing the type in C# without supplying `CustomerName`, but `required` is also a compile-time constraint. The deserializer bypasses it unless the JSON source generator or a custom converter enforces the requirement.

The `[JsonRequired]` attribute from `System.Text.Json` changes deserialization behavior: the deserializer throws a `JsonException` when the annotated property is missing from the JSON payload. This provides a runtime safety net that aligns with the intent expressed by the non-nullable annotation:

```csharp
using System.Text.Json.Serialization;

public sealed class CreateOrderRequest
{
    [JsonRequired]
    public required string CustomerName { get; init; }
    public required string? Notes { get; init; }
    public decimal Discount { get; init; }
}
```

The deserialization now fails at the boundary:

```csharp
// JsonException: JSON property 'CustomerName' is required.
var request = JsonSerializer.Deserialize<CreateOrderRequest>("""{"Discount":5}""");
```

The broader principle is that nullable reference types describe a static contract, but data from external systems — JSON payloads, database rows, message queues — enters the process at runtime and must be validated at that boundary. Treating deserialized objects as trusted without validation is the most common way nullable reference types fail to deliver their intended benefit.

### Null-Coalescing And Null-Conditional Operators

Working with nullable values in expressions requires compact syntax for fallback and safe navigation. Three operators provide this:

`??` provides a fallback value when the left-hand operand is null:

```csharp
string name = input ?? "Unknown";
```

`??=` assigns the right-hand value only when the left-hand operand is null:

```csharp
_cache ??= new Dictionary<string, User>();
```

`?.` and `?[]` short-circuit to null when the receiver is null, avoiding `NullReferenceException`:

```csharp
int? len = user?.Address?.City?.Length;   // null if user, Address, or City is null
string first = tags?[0];                   // null if tags is null
```

These operators are not merely syntactic conveniences; they reduce the null-checking ceremony that otherwise dominates nullable-annotated code. A chain like `user?.Address?.City?.Length` expresses the intent "give me the length of the city name, or null if anything along the path is missing" without intermediate `if` blocks. The compiler compiles each `?.` into a null check followed by either a member access or a null result — the IL contains explicit branches, not a magic null-safe dispatch.

The combination of nullable reference type annotations and these operators creates a null-handling discipline: the annotations warn where nulls are possible, the operators handle them concisely, and the result is code that explicitly names which variables can be null and what should happen when they are.

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

Modeling types so that invalid states are difficult or impossible to create is one of the type system's most practical engineering benefits.

A common anti-pattern uses multiple independent booleans to track state:

```csharp
public sealed class Payment
{
    public bool IsPaid { get; set; }
    public bool IsFailed { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public string? FailureReason { get; set; }
}
```

This design permits contradictory combinations without compiler feedback:

```text
IsPaid = true
IsFailed = true
PaidAt = null
FailureReason = null
```

The type allows states that make no business sense, and every caller must remember rules the type itself does not enforce.

A clearer representation uses records to express alternatives:

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

This is not a complete algebraic data type system, but it is a practical way to express alternatives in C#. Good type design narrows the set of invalid programs the rest of the system can accidentally write.

A richer application-style example makes the contrast clearer:

```csharp
public sealed class Payment
{
    public int Id { get; init; }
    public PaymentStatus Status { get; private set; } = new PaymentStatus.Pending();

    public void MarkPaid(DateTimeOffset paidAt)
    {
        Status = new PaymentStatus.Paid(paidAt);
    }

    public void MarkFailed(string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new ArgumentException("Failure reason is required.", nameof(reason));
        }

        Status = new PaymentStatus.Failed(reason);
    }
}

public static string BuildAuditMessage(Payment payment)
{
    return payment.Status switch
    {
        PaymentStatus.Pending => $"Payment {payment.Id} is still pending.",
        PaymentStatus.Paid paid => $"Payment {payment.Id} succeeded at {paid.PaidAt:O}.",
        PaymentStatus.Failed failed => $"Payment {payment.Id} failed: {failed.Reason}.",
        _ => throw new ArgumentOutOfRangeException(nameof(payment))
    };
}
```

This example shows how the type choice affects both write-side state transitions and read-side logic that consumes the model later.

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

The dedicated generics chapter goes deeper into constraints, variance, boxing avoidance, open generics, and generic design trade-offs. At the type-system level, generics keep APIs precise without giving up reuse. Once an API falls back to `object`, strings, or loose dictionaries for concepts that could have been modeled precisely, the codebase compensates with more runtime checks and more fragile integration code.

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

Collections such as `Dictionary` and `HashSet` depend on equality and hash codes. An incorrect equality override breaks lookup behavior silently.

Equality design has real downstream consequences. It affects hash-based collections, caching, deduplication, set operations, testing semantics, and sometimes persistence behavior. Equality should be treated as part of the type's meaning, not as a mechanical override required by tooling.

Records receive structural equality through compiler-generated overrides of `Equals(object)`, `GetHashCode`, `==`, `!=`, and `IEquatable<T>.Equals`. Each generated method compares every instance field or positional property for equality. The compiler also overrides `EqualityContract` to ensure that two records of different types (even derived ones) are never equal. This generation is what makes `record class` and `record struct` behave differently from plain `class` and `struct` by default.

The `EqualityComparer<T>.Default` property reflects this distinction:

```csharp
var classComparer = EqualityComparer<UserClass>.Default;
var recordComparer = EqualityComparer<UserDto>.Default;

// For UserClass: calls Object.Equals (reference equality unless overridden)
// For UserDto: calls the generated IEquatable<UserDto>.Equals
```

Hash-based collections depend on the contract that equal objects produce equal hash codes — and that hash codes remain stable while an object is a key. A `record` or `record struct` used as a dictionary key is vulnerable to silent corruption if a property that participates in equality is mutated after insertion:

```csharp
var dict = new Dictionary<UserDto, string>();
var key = new UserDto(1, "Alice");
dict[key] = "value";

// UserDto is mutable by default (no init-only, no readonly).
// If UserDto were defined without init-only properties, this would compile:
// key.Name = "Bob";

// The key's hash code changes, but the dictionary indexed by the old hash.
// dict.TryGetValue(key, out _) now returns false — the entry is orphaned.
```

Positional records using `init`-only properties or `readonly record struct` avoid this problem because the compiler prevents post-construction mutation. For mutable records, the danger is real and the compiler offers no warning.

## Compile-Time Type And Runtime Type

A variable can have different types at compile time and at runtime. The compile-time type is the declared or inferred type in source code — it determines which members are available at the call site and guides overload resolution. The runtime type is the actual type of the instance the variable points to — it determines virtual method dispatch, `is` pattern matching, and `switch` expression evaluation.

```csharp
object boxed = "Hello, world!";              // compile-time: object, runtime: string
IEnumerable<char> chars = "abcdefghij";      // compile-time: IEnumerable<char>, runtime: string
```

The runtime type must be assignment-compatible with the compile-time type. A `string` can be assigned to an `object` variable because `string` derives from `object`. The reverse requires a cast and may fail at runtime with `InvalidCastException` if the runtime type does not match.

The distinction matters operationally in several familiar scenarios. Virtual method calls dispatch against the runtime type, not the compile-time type, which is why `obj.ToString()` calls `string.ToString()` when `obj` holds a `string`. Pattern matching (`is`, `switch`) tests against the runtime type. Generic variance (`IEnumerable<string>` assigned to `IEnumerable<object>`) preserves the compile-time abstraction while the runtime type remains concrete.

## Type Design Notes

Value types generally contain data directly and are copied by value. Reference types store references to objects, and copying the variable copies the reference rather than the object itself.

Value types are not guaranteed to live on the stack. Their storage location depends on the enclosing context:

- **Local variable in a non-async method**: typically on the stack, though the JIT may enregister the value entirely.
- **Field of a class**: on the managed heap, inside the containing object.
- **Element of an array**: on the managed heap, inlined into the array's payload (arrays are heap-allocated reference types).
- **Boxed value type**: a new heap object wrapping a copy of the value.
- **Captured by a lambda or async state machine**: lifted to a field on the compiler-generated closure class, and therefore on the heap.
- **Static field**: on the heap as part of the type's static data region, regardless of whether the enclosing type is a class or struct.

Boxing wraps a value type in an object so it can be treated as `object` or an interface. That introduces heap allocation and can matter in hot paths.

Records are useful for immutable data models, DTOs, commands, and values where value-based equality is the natural design.

By default, C# passes a reference value by value. A method receives a copy of the reference, so it can mutate the same object, but reassigning the parameter does not reassign the caller's variable. `ref` should be used only when the caller's variable itself must be changed.

Nullable reference types provide compile-time warnings about possible null misuse. They improve local correctness, but they do not guarantee that runtime data from JSON, databases, or external systems is valid.

Several booleans often permit invalid combinations. Separate types or discriminated state shapes usually express valid alternatives more clearly and make business rules easier to enforce.

## The `default` Keyword And Nullability

The `default` expression and `default(T)` produce the zero-initialized value for any type. For reference types, the default is `null`. For value types, it is the struct with all fields zeroed:

```csharp
string? name = default;          // null
int count = default;             // 0
DateTime date = default;         // DateTime.MinValue (0001-01-01)
UserDto? dto = default;          // null (UserDto is a reference type)
Money money = default;           // Amount=0, Currency=null
```

The interaction with nullable reference types is subtle. `default(string)` produces `null`, but the compiler does not warn when assigning it to a non-nullable `string` variable if the variable is uninitialized at the point of assignment — the flow analysis tracks definite assignment, not value correctness. Explicit use of `default!` (null-forgiving) suppresses warnings for reference types:

```csharp
string name = default!; // Compiler is silenced, but name is null at runtime.
```

The `default` keyword is most useful in generic code, where the type parameter may be either a value type or a reference type and the code must produce a neutral starting value:

```csharp
public sealed record Result<T>(bool IsSuccess, T? Value, string? Error)
{
    public static Result<T> Failure(string error) => new(false, default, error);
    // default produces null for reference types and the zero value for value types.
}
```

In non-generic code, explicit initialization with a meaningful value is generally clearer than relying on `default`.
