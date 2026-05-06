# C# Language Basics

## Core Idea

C# is a statically typed language with object-oriented roots and broad support for procedural, functional, and asynchronous styles. In day-to-day .NET development, however, most code is built from a smaller set of recurring language constructs: types, members, initialization rules, visibility boundaries, and a handful of features that shape how APIs are designed and maintained.

This chapter establishes that working vocabulary. It does not attempt to survey the entire language. Later chapters cover the deeper parts of the type system, generics, asynchronous control flow, and concurrency in their own right. The goal here is to build a reliable mental model for the constructs that appear constantly in application code.

## Types, State, And Behavior

The first important habit in C# is to treat types as design tools rather than mere containers for data. A type defines what state may exist, how that state may change, and which operations make sense for callers.

```csharp
public sealed class User
{
    public int Id { get; }
    public string Email { get; private set; }
    public bool IsActive { get; private set; }

    public User(int id, string email)
    {
        if (id <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(id));
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ArgumentException("Email is required.", nameof(email));
        }

        Id = id;
        Email = email;
        IsActive = true;
    }

    public void ChangeEmail(string email)
    {
        if (!email.Contains('@'))
        {
            throw new ArgumentException("Invalid email.", nameof(email));
        }

        Email = email;
    }

    public void Deactivate()
    {
        IsActive = false;
    }
}
```

This class is useful not because it stores three values, but because it defines a small and coherent model. A caller cannot create a user without an identifier and email, cannot assign an arbitrary invalid email later, and cannot mutate `IsActive` directly. That combination of state and behavior is the normal shape of robust C# code.

## Fields And Properties

Fields and properties both relate to state, but they play different roles.

```csharp
private string _name = "";
public string Name { get; private set; } = "";
```

A field is direct storage inside the type. A property is part of the type's public or internal surface and can enforce access rules, validation, computed values, or framework-friendly binding semantics.

```csharp
private string _email = "";

public string Email
{
    get => _email;
    private set
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Email is required.", nameof(value));
        }

        _email = value;
    }
}
```

Properties are usually the correct boundary for observable state because they preserve freedom of implementation. A simple auto-property can later grow into a validated or computed property without forcing callers to change how they interact with the type.

```csharp
public string Name { get; private set; } = "";
```

Exposed mutable fields remove that flexibility and also bypass the conventions expected by serializers, mappers, data-binding systems, and many frameworks in the .NET ecosystem. A private field backed by a property remains the normal default when the type wants to control its own invariants.

## Construction And Valid State

Constructors define the minimum state required for an object to exist meaningfully.

```csharp
public sealed class Order
{
    public int CustomerId { get; }
    public OrderStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; }

    public Order(int customerId, DateTimeOffset createdAt)
    {
        if (customerId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(customerId));
        }

        CustomerId = customerId;
        Status = OrderStatus.Draft;
        CreatedAt = createdAt;
    }
}
```

This design is stronger than a type with unrestricted setters because invalid intermediate states become harder to create in the first place. A constructor does not guarantee complete business validity for the lifetime of an object, but it should at least establish the object's essential identity and basic invariants.

There is a useful distinction between domain objects and transport models here. Domain objects often benefit from constructors that enforce validity immediately. Request and response models, by contrast, are often designed around binding and serialization concerns:

```csharp
public sealed class CreateUserRequest
{
    public required string Email { get; init; }
    public required string Name { get; init; }
}
```

`required` and `init` improve initialization discipline, but they are not substitutes for real validation. They express assignment rules to the compiler. They do not prove that an email address is well-formed or that a business rule has been satisfied.

## Access Modifiers As Design Boundaries

C# access modifiers are not merely visibility keywords. They define who is allowed to depend on which parts of a type.

- `public`
- `private`
- `protected`
- `internal`
- `protected internal`
- `private protected`

In well-structured code, public members form a deliberate contract and private members remain free to change. That is why starting with the narrowest practical access level is usually the safest approach.

```csharp
public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public IReadOnlyCollection<OrderItem> Items => _items;

    public void AddItem(OrderItem item)
    {
        _items.Add(item);
    }
}
```

The list itself remains private because the object should own mutation rules. Callers can observe the items, but they cannot arbitrarily clear or reorder them. This is a small example of a broader principle: visibility choices are part of invariant protection.

`internal` is especially important in multi-project solutions. It allows sharing within an assembly while avoiding accidental public surface area. Public APIs tend to become sticky over time, so reducing unnecessary visibility early makes future refactoring easier.

## Static Members And Shared State

Static members belong to the type rather than to an instance.

```csharp
public static class OrderStatuses
{
    public const string Draft = "Draft";
    public const string Submitted = "Submitted";
}
```

This is harmless because the type exposes stable shared values. The danger appears when static members carry mutable state:

```csharp
public static class CurrentUser
{
    public static int UserId { get; set; }
}
```

In a server application, mutable static state is shared across requests, users, and threads. That creates coupling between otherwise unrelated execution paths and often leads to race conditions, test contamination, or incorrect cross-request behavior. When state should vary per request or per operation, instance-based design and dependency injection are usually the better fit.

```csharp
public interface ICurrentUser
{
    int UserId { get; }
}
```

The important rule is not "never use static." It is "use static only when the value is truly process-wide and semantically shared."

## Partial Types And Generated Code

Partial classes exist primarily to support generated code and framework integration.

```csharp
public partial class AppJsonContext
{
}
```

This allows one part of a type to be generated while another part is maintained by hand. Source generators, WinForms designers, and similar tools rely on this split so that generated output can be replaced safely without overwriting manual logic.

Using partial classes to spread one oversized design across many files is usually a sign that the type itself should be broken apart. Partial types preserve compilation structure, but they do not repair conceptual cohesion.

## Everyday Language Features That Affect Design

Many C# features look small in isolation but have outsized effects on readability, correctness, and API shape.

### `var`, `object`, And `dynamic`

`var` preserves static typing and only asks the compiler to infer the local type.

```csharp
var name = "Alice"; // string
```

`object` can hold any reference or boxed value, but specific members are unavailable until the value is cast.

```csharp
object value = "Alice";
// value.Length does not compile
```

`dynamic` defers member resolution until runtime.

```csharp
dynamic value = "Alice";
Console.WriteLine(value.Length);
```

That flexibility is sometimes useful for interop or late-bound frameworks, but it weakens one of C#'s main strengths: compile-time feedback. In most application code, `dynamic` should be exceptional rather than routine.

### `const`, `readonly`, And `static readonly`

These keywords all describe immutability in different ways.

```csharp
public const int MaxRetryCount = 3;
private readonly IClock _clock;
public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
```

`const` values are compile-time constants and may be inlined into consuming assemblies. That makes them suitable for truly fixed values, but less suitable for public library values that might need to change over time. `readonly` fits instance-level state assigned during construction. `static readonly` fits shared runtime-initialized values.

### Primary Constructors

Modern C# allows primary constructors for classes and structs:

```csharp
public sealed class OrderService(IOrderRepository repository, ILogger<OrderService> logger)
{
    public async Task<OrderDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        logger.LogInformation("Loading order {OrderId}", id);
        return await repository.GetByIdAsync(id, ct);
    }
}
```

This can reduce ceremony for dependency-heavy service classes. It works best when constructor logic is simple and the resulting type remains easy to scan. Where initialization is complex, explicit constructors often remain clearer.

### Collection Expressions

Collection expressions improve clarity for small literal collections:

```csharp
int[] numbers = [1, 2, 3];
List<string> names = ["Alice", "Bob"];
```

They do not change the underlying collection semantics. Choosing between arrays, lists, sets, and dictionaries still requires the same design judgment around mutability, lookup behavior, ordering, and allocation.

## Resource Lifetime And Deterministic Cleanup

Garbage collection manages managed memory, but it does not guarantee prompt release of external resources such as file handles, sockets, database connections, or timers. That is why `IDisposable` and `IAsyncDisposable` remain important language-level patterns.

```csharp
using var stream = File.OpenRead("orders.csv");
await using var connection = new SqlConnection(connectionString);
```

The `using` forms are compact syntax over `try/finally` cleanup:

```csharp
var stream = File.OpenRead("orders.csv");

try
{
    // Read stream.
}
finally
{
    stream.Dispose();
}
```

For engineering work, this distinction matters because resource leaks often appear long before memory exhaustion does. An application can remain memory-stable and still fail because it has exhausted connections, file handles, or other external resources.

## Extension Methods And API Shape

Extension methods add method syntax to existing types without modifying their source definitions.

```csharp
public static class StringExtensions
{
    public static bool IsBlank(this string? value)
    {
        return string.IsNullOrWhiteSpace(value);
    }
}
```

They are most useful for lightweight operations that genuinely feel like part of the consumer's language. LINQ is the canonical example. The danger appears when extension methods hide infrastructure, persistence, or heavy side effects behind what looks like a simple instance call.

```csharp
public static Task ApproveOrderAsync(this Order order, AppDbContext db)
{
    // Hidden database dependency inside extension method.
}
```

That style weakens clarity because the call site resembles domain behavior while quietly depending on infrastructure. Extension methods are best when they improve expression without obscuring responsibility.

## Deferred Execution With Iterators

`yield return` creates iterators whose execution is deferred until enumeration.

```csharp
public static IEnumerable<int> GetEvenNumbers(IEnumerable<int> numbers)
{
    foreach (var number in numbers)
    {
        if (number % 2 == 0)
        {
            yield return number;
        }
    }
}
```

This is powerful because it allows streaming behavior and composition without eagerly allocating full intermediate results. It also changes timing:

```csharp
var query = GetEvenNumbers(numbers);
numbers.Clear();
var result = query.ToList();
```

Since the iterator runs during enumeration, changes to the source sequence can change the eventual result. The same deferred-execution mindset appears again in LINQ, which is why understanding it early is useful.

## By-Reference Features And Performance-Oriented Constructs

Some C# features are common in libraries and performance-sensitive code, even when they are less central in routine business applications.

`out` is widely used for APIs such as `TryParse`:

```csharp
if (int.TryParse(input, out var number))
{
    Console.WriteLine(number);
}
```

`ref` allows a method to mutate the caller's variable directly, and `in` passes a value by readonly reference. These features are powerful but more specialized. In normal application APIs, clear return types are usually easier to reason about than heavy by-reference semantics.

`Span<T>` and `Memory<T>` serve a similar role for memory-oriented work:

```csharp
ReadOnlySpan<char> text = "ORDER-123".AsSpan();
var prefix = text[..5];
```

`Span<T>` enables allocation-conscious parsing and slicing but cannot cross `await` boundaries or live as a normal heap field. `Memory<T>` is the heap-friendly counterpart used when data must survive asynchronous flow.

```csharp
public async Task ProcessAsync(Memory<byte> data)
{
    await Task.Delay(10);
    Console.WriteLine(data.Length);
}
```

Most application chapters in this book do not depend heavily on spans, but professional readers should recognize them because modern .NET libraries use them extensively in performance-sensitive APIs.
