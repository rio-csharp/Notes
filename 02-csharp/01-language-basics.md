# C# Language Basics

C# is a statically typed language with object-oriented roots and broad support for procedural, functional, and asynchronous styles. In day-to-day .NET development, most code is built from a recurring set of language constructs: types, members, initialization rules, visibility boundaries, and a handful of features that shape how APIs are designed and maintained. Later chapters cover the deeper parts of the type system, generics, asynchronous control flow, and concurrency.

## Language Version And Project Context

Modern C# features do not exist in isolation from the project that compiles them. In practice, the effective language surface is shaped by the SDK, target framework, and project settings:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

Most modern SDK-style projects infer a suitable C# language version from the installed SDK and target framework, so teams often do not set `LangVersion` explicitly. It still matters as an activation point when a codebase wants predictable compiler behavior across machines, CI agents, and future SDK upgrades.

This relationship becomes visible whenever a feature seems to "not work." Primary constructors, collection expressions, nullable reference types, and other modern features are not only syntax choices. They depend on the compiler and project configuration actually supporting them. In practice, the first verification step is usually `dotnet build`: if the language version or project settings are incompatible, the compiler reports the problem before the application ever runs.

On a real machine, teams often inspect the effective toolchain with:

```bash
dotnet --version
dotnet --info
dotnet build
```

Those commands do not replace reading the project file, but they make the language boundary visible. If a feature compiles on one machine and fails on another, the SDK and project context are among the first things worth checking.

## Types, State, And Behavior

Types are design tools that define what state may exist, how that state may change, and which operations make sense for callers.

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

A constructor does not guarantee complete business validity for the lifetime of an object, but it establishes the object's essential identity and basic invariants. Domain objects benefit from constructors that enforce validity immediately. Request and response models are often designed around binding and serialization concerns:

```csharp
public sealed class CreateUserRequest
{
    public required string Email { get; init; }
    public required string Name { get; init; }
}
```

`required` and `init` improve initialization discipline, but they are not substitutes for real validation. They express assignment rules to the compiler. They do not prove that an email address is well-formed or that a business rule has been satisfied.

A fuller application boundary example makes that difference clearer:

```csharp
public sealed class CreateOrderRequest
{
    public required int CustomerId { get; init; }
    public required List<CreateOrderItemRequest> Items { get; init; }
}

public sealed class CreateOrderItemRequest
{
    public required int ProductId { get; init; }
    public required int Quantity { get; init; }
}

public sealed class Order
{
    private readonly List<OrderItem> _items = new();

    public int CustomerId { get; }
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public Order(int customerId)
    {
        if (customerId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(customerId));
        }

        CustomerId = customerId;
    }

    public void AddItem(int productId, int quantity)
    {
        if (productId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(productId));
        }

        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity));
        }

        _items.Add(new OrderItem(productId, quantity));
    }
}

public sealed record OrderItem(int ProductId, int Quantity);
```

The request model expresses assignment intent for the binding boundary. The domain model still owns the business validity of the actual order object. That separation is a recurring pattern in professional C# systems.

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

`protected internal` and `private protected` refine visibility further in inheritance scenarios that cross assembly boundaries. The distinction is precise and worth demonstrating with a concrete example:

```csharp
// Assembly A (Core library)
public class NotificationBase
{
    protected internal void OnCreated() { }   // derived types OR same assembly
    private protected void OnValidated() { }  // derived types AND same assembly
}

// Assembly B (references Assembly A)
public class EmailNotification : NotificationBase
{
    public void Send()
    {
        OnCreated();     // OK: protected internal — derived type in any assembly
        // OnValidated(); // ERROR: private protected — caller must be in same assembly
    }
}

// Back in Assembly A
public class AuditService
{
    public void Audit(NotificationBase notification)
    {
        notification.OnCreated();   // OK: protected internal — same assembly
        // notification.OnValidated(); // ERROR: private protected — not a derived type
    }
}

// Inside Assembly A, a derived type
public class SmsNotification : NotificationBase
{
    public void Send()
    {
        OnCreated();    // OK: same assembly (internal path)
        OnValidated();  // OK: derived type AND same assembly
    }
}
```

`protected internal` is a logical OR: the member is accessible to derived types anywhere or to any code in the same assembly. `private protected` is a logical AND: the member is accessible only to derived types that are also defined in the same assembly. The OR form is the more common choice for framework internals that subclasses may need. The AND form is the narrowest possible visibility short of `private` and is most useful when a base class wants to expose an implementation detail exclusively to derived types it controls — for example, a hook called only by the factory methods defined in the same assembly.

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

Static state that is mutable creates problems in server applications: it is shared across requests, users, and threads, coupling otherwise unrelated execution paths and often leading to race conditions, test contamination, or incorrect cross-request behavior. When state should vary per request or per operation, instance-based design and dependency injection are usually the better fit.

```csharp
public interface ICurrentUser
{
    int UserId { get; }
}
```

Static members should carry values that are truly process-wide and semantically shared.

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

The compiler captures a primary constructor parameter as a private field only when that parameter is referenced in an instance member — a method body, property accessor, or field initializer. Parameters used exclusively in the constructor body itself (for argument validation or passing to a base constructor) remain ordinary constructor parameters and are never stored as fields:

```csharp
public sealed class ReportGenerator(
    ITemplateEngine engine,      // captured: used in GenerateAsync
    IAuditLogger audit,          // captured: used in _logPrefix initializer
    int maxRetries)              // NOT captured: used only in constructor body
{
    private readonly string _logPrefix = $"ReportGen-{audit.Id}";

    public ReportGenerator(ITemplateEngine engine, IAuditLogger audit, int maxRetries)
        : this(engine, audit, maxRetries)
    {
        if (maxRetries <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxRetries));
        }
    }

    public async Task<string> GenerateAsync(ReportRequest request)
    {
        var template = await engine.LoadAsync(request.TemplateId);
        return template.Render(request.Data);
    }
}
```

In this example, `engine` appears in `GenerateAsync` and `audit` appears in a field initializer — both are captured as private fields. The `maxRetries` parameter appears only in the explicit constructor body for validation and is never stored.

This distinction matters for two reasons. First, captured parameters increase the object's size; if a parameter looks like a dependency but is never used beyond construction, it silently adds a field. Second, captured fields follow normal GC reachability rules, so the captured `ITemplateEngine` reference keeps the engine alive for the lifetime of the `ReportGenerator`. For dependency-heavy services this is usually harmless, but it is worth keeping in mind when designing types with primary constructors.

This feature also depends on the effective language version of the project. In most current SDK-style applications, that support comes from the modern SDK and target framework automatically. If a codebase uses an older SDK, pins an older language version, or compiles in a constrained environment, the syntax may fail at build time even though the code looks valid to the reader.

### Collection Expressions

Collection expressions improve clarity for small literal collections:

```csharp
int[] numbers = [1, 2, 3];
List<string> names = ["Alice", "Bob"];
```

They do not change the underlying collection semantics. Choosing between arrays, lists, sets, and dictionaries still requires the same design judgment around mutability, lookup behavior, ordering, and allocation.

Like other modern syntax features, collection expressions are best treated as a readability improvement on top of an existing semantic model. The feature is active only if the compiler in the current project understands it, so build success is again the practical verification point.

## Record Structs

C# 10 introduced `record struct`, combining value-type allocation with compiler-generated equality and `ToString`. A `record struct` lives on the stack (or inlined into a containing object) like any struct, but the compiler synthesizes `Equals`, `GetHashCode`, `ToString`, `==`, `!=`, and `IEquatable<T>` based on the struct's fields — the same machinery that `record class` provides, but without the heap allocation and reference semantics:

```csharp
public readonly record struct Money(decimal Amount, string Currency);

var a = new Money(10m, "USD");
var b = new Money(10m, "USD");

Console.WriteLine(a == b); // true — structural equality
```

The critical differences from a plain `readonly struct` are the compiler-generated equality members. A plain struct inherits `ValueType.Equals`, which uses reflection by default and is slow; a `record struct` gets field-by-field comparison generated at compile time. The difference from a `record class` is value semantics: copying a `record struct` produces an independent copy, and a `record struct` variable can never be null.

`record struct` is a natural fit for small, immutable value objects where structural equality is semantically correct: coordinates, version numbers, measurement units, composite keys. It is less suitable for types that carry many fields (equality cost grows with field count), types that need inheritance (`record struct` does not support `abstract` or `virtual` members beyond what `struct` permits), or types large enough that value-type copying becomes a measurable cost.

The `readonly` modifier on `record struct` is important. An unadorned `record struct` is mutable by default (unlike positional `record class`, which generates `init`-only properties). Omitting `readonly` risks the same problems as any mutable struct: defensive copies at call sites, lost mutations, and confusing behavior when the struct is used as a property or readonly field.

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

`await using` only applies when the resource implements `IAsyncDisposable`. That boundary matters in real code because not every type with asynchronous work supports asynchronous disposal. The compiler enforces that distinction, which means the activation and verification path is straightforward: the resource type either supports `await using`, or the code will not compile.

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

The compiler resolves extension methods by scanning `using` directives for static classes that contain a matching method. The search looks for a static method whose first parameter is decorated with `this` and whose type is compatible with the expression at the call site. Only `using`-imported namespaces are considered; a static class in the current namespace but not imported via `using` is invisible to extension resolution:

```csharp
using MyApp.StringHelpers; // Without this, IsBlank is not found.

string? input = null;
var result = input.IsBlank(); // Resolves to StringExtensions.IsBlank
```

Ambiguity arises when two imported static classes define extension methods with the same signature. The compiler reports an error and requires the call to be rewritten as a normal static method call — extension syntax cannot disambiguate between equally applicable candidates:

```csharp
using LibraryA.Extensions;
using LibraryB.Extensions;

string? input = null;
// input.IsBlank(); // CS0121: ambiguous call
var result = StringExtensions.IsBlank(input); // explicit disambiguation
```

Instance methods always take priority over extension methods. If a type defines an instance method with a matching name and compatible parameters, the compiler selects the instance method even when an extension method would also apply. This is why adding an instance method to a type is a breaking change for any consumer that relied on an extension method with the same signature — the extension method becomes silently unreachable.

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

Since the iterator runs during enumeration, changes to the source sequence after the query is composed but before it is materialized can change the eventual result. The same deferred-execution mindset appears throughout LINQ, where queries composed with `Where`, `Select`, and similar operators also defer work until iteration.

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

A more complete comparison helps explain why both exist:

```csharp
public static bool HasOrderPrefix(ReadOnlySpan<char> value)
{
    return value.StartsWith("ORDER-", StringComparison.Ordinal);
}

public static async Task<int> CountNonZeroBytesAsync(
    Memory<byte> buffer,
    CancellationToken ct)
{
    await Task.Delay(10, ct);

    var count = 0;
    foreach (var value in buffer.Span)
    {
        if (value != 0)
        {
            count++;
        }
    }

    return count;
}
```

`Span<T>` is designed for short-lived synchronous access. `Memory<T>` exists when the same data must survive heap-based and asynchronous flow. Both appear extensively in modern .NET library APIs.

The stack-only restriction on `Span<T>` is a direct consequence of its internal representation. A `Span<T>` is a `ref`-like structure — it contains a managed pointer (a `ref` field) to the data it spans, plus a length. Managed pointers cannot appear on the managed heap because the GC cannot track and update them during compaction. The runtime therefore prohibits `Span<T>` from appearing as a class field, a boxed value, an array element, or any other heap-resident location. The compiler enforces this through the `ref struct` declaration, which `Span<T>` uses:

```csharp
public readonly ref struct Span<T>
{
    internal readonly ref T _reference;
    internal readonly int _length;
    // ...
}
```

This is why `Span<T>` cannot cross `await` boundaries (the async state machine lives on the heap), why it cannot be captured by lambdas (the closure class is heap-allocated), and why `Memory<T>` exists as the heap-safe alternative.

A realistic zero-allocation parsing example makes the trade-off concrete. Parsing a CSV line into its fields without any heap allocation:

```csharp
public static int SumSecondColumn(ReadOnlySpan<char> csvLine)
{
    var total = 0;

    foreach (var field in csvLine.Split(','))
    {
        // Split returns a Range, not a string — no allocation.
        var slice = csvLine[field];

        // Take every second column (index 1, 3, 5, ...).
        // In a real parser, field counting would track position.
        if (int.TryParse(slice, out var value))
        {
            total += value;
        }
    }

    return total;
}
```

The `MemoryExtensions.Split` method on `ReadOnlySpan<char>` returns `SpanSplitEnumerator<char>`, another `ref struct`. Each `MoveNext` call slices the original span without copying character data. The entire operation — splitting, slicing, parsing — touches no managed heap beyond any integer boxing that `TryParse` avoids. In high-throughput scenarios such as log processing, ETL pipelines, or network protocol parsing, this allocation-free style can reduce GC frequency by orders of magnitude relative to `string.Split` or `Substring`-based approaches.
