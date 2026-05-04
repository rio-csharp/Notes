# C# Language Basics

## Core Idea

C# is a strongly typed, object-oriented, multi-paradigm language used heavily in .NET backend development.

Chinese notes:

- `strongly typed`: 强类型.
- `property`: 属性.
- `method`: 方法.
- `constructor`: 构造函数.

## Class

```csharp
public sealed class User
{
    public int Id { get; private set; }
    public string Name { get; private set; }

    public User(int id, string name)
    {
        Id = id;
        Name = name;
    }
}
```

A class usually represents a concept with state and behavior.

Example with behavior:

```csharp
public sealed class User
{
    public int Id { get; }
    public string Email { get; private set; }
    public bool IsActive { get; private set; }

    public User(int id, string email)
    {
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

Why this matters:

> Classes are not only data containers. They can protect valid state and expose meaningful behavior.

## Property vs Field

Field:

```csharp
private string _name;
```

Property:

```csharp
public string Name { get; private set; }
```

Properties can control access and support framework binding/serialization better.

Field example:

```csharp
private int _retryCount;
```

Property with validation:

```csharp
private string _email = "";

public string Email
{
    get => _email;
    private set
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Email is required.");
        }

        _email = value;
    }
}
```

Auto-property:

```csharp
public string Name { get; private set; } = "";
```

Clear wording:

> A field is storage. A property is an access boundary. A property can expose state safely, hide implementation, support validation, and work better with frameworks.

## Constructor

```csharp
public Order(int customerId)
{
    CustomerId = customerId;
    Status = OrderStatus.Draft;
}
```

Use constructors to enforce required state.

Bad constructor:

```csharp
public sealed class Order
{
    public int CustomerId { get; set; }
    public string Status { get; set; } = "";
}
```

Problem:

> This allows invalid orders such as `CustomerId = 0` or empty status.

Better:

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

Key point:

> Constructors should help create valid objects. If every property can be set freely after construction, invariants are easy to break.

## Access Modifiers

- `public`
- `private`
- `protected`
- `internal`
- `protected internal`
- `private protected`

Practical advice:

> Keep things as private as possible and public only when needed.

Example:

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

Here `_items` is private because callers should not mutate the collection directly. `Items` is public but read-only from the caller's perspective.

Practical rule:

> Start private. Make something public only when another part of the system genuinely needs it.

## Static

```csharp
public static class DateTimeProvider
{
    public static DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
```

Be careful with static state because it can hurt testability and cause shared-state bugs.

Safe static example:

```csharp
public static class OrderStatuses
{
    public const string Draft = "Draft";
    public const string Submitted = "Submitted";
}
```

Risky static mutable state:

```csharp
public static class CurrentUser
{
    public static int UserId { get; set; }
}
```

Why risky:

> In a web app, many requests run concurrently. Static mutable state is shared by all requests and users, so one request can accidentally affect another.

Better:

```csharp
public interface ICurrentUser
{
    int UserId { get; }
}
```

Register it as a scoped service in ASP.NET Core so each request gets the correct user context.

## Partial Class

```csharp
public partial class User
{
}
```

Useful for generated code and large framework types, but avoid using partial classes to hide poor organization.

Common use with source generation:

```csharp
public partial class AppJsonContext
{
}
```

Good use:

> Generated code and manually written code can live in separate files without editing generated output.

Bad use:

> Splitting one messy class into five partial files does not make the design cleaner.

## Common C# Keywords And Features

Small language features matter because they reveal code behavior, not only syntax.

Chinese notes:

- `immutable`: 不可变.
- `deferred execution`: 延迟执行.
- `resource disposal`: 资源释放.

### `var` vs `dynamic` vs `object`

`var` is still statically typed. The compiler infers the type.

```csharp
var name = "Alice"; // string at compile time
```

`object` loses compile-time specific members unless you cast.

```csharp
object value = "Alice";
// value.Length does not compile
```

`dynamic` skips compile-time member checking and resolves at runtime.

```csharp
dynamic value = "Alice";
Console.WriteLine(value.Length); // resolved at runtime
```

Use `dynamic` rarely. It can be useful for interop or dynamic JSON-like scenarios, but it moves errors from compile time to runtime.

Runtime failure example:

```csharp
dynamic value = "Alice";
Console.WriteLine(value.DoesNotExist()); // compiles, fails at runtime
```

Typed alternative:

```csharp
public sealed record UserDto(string Name);

UserDto user = new("Alice");
Console.WriteLine(user.Name);
```

Key point:

> `var` is usually fine because the type is still known by the compiler. `dynamic` should be rare because it gives up compile-time safety.

### `const`, `readonly`, And `static readonly`

`const` is compile-time constant.

```csharp
public const int MaxRetryCount = 3;
```

`readonly` is assigned in declaration or constructor.

```csharp
private readonly IClock _clock;
```

`static readonly` is runtime-initialized once per type.

```csharp
public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
```

Practical explanation:

> I use `const` for true compile-time constants that will not change. I use `readonly` for injected dependencies and instance values assigned during construction. I use `static readonly` for runtime-created values shared by the type.

Important versioning detail:

```csharp
public const int ApiVersion = 1;
```

`const` values can be inlined into consuming assemblies at compile time. If a library changes a public `const`, consumers may need recompilation to see the new value.

For public values that may change:

```csharp
public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
```

### `init` And `required`

`init` allows setting a property during object initialization but not later.

```csharp
public sealed class CreateUserRequest
{
    public required string Email { get; init; }
    public required string Name { get; init; }
}
```

This is useful for DTOs and immutable request models.

Important:

- `required` is compile-time help;
- it does not replace runtime validation;
- APIs still need model validation.

Example:

```csharp
var request = new CreateUserRequest
{
    Email = "alice@example.com",
    Name = "Alice"
};
```

This is good for request/response models because it makes object initialization clear and reduces accidental mutation.

But this still needs validation:

```csharp
var request = new CreateUserRequest
{
    Email = "not-an-email",
    Name = "Alice"
};
```

`required` only says the property must be assigned. It does not prove the value is valid.

### Primary Constructors

Modern C# supports primary constructors for classes and structs.

Example:

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

This can reduce boilerplate for dependency injection.

Use it when:

- dependencies are simple;
- the class remains easy to read;
- constructor logic is minimal.

Avoid it when:

- constructor validation or setup is complex;
- field naming would be clearer;
- the team prefers explicit constructors for consistency.

Traditional constructor style is still perfectly valid:

```csharp
public sealed class OrderService
{
    private readonly IOrderRepository _repository;
    private readonly ILogger<OrderService> _logger;

    public OrderService(IOrderRepository repository, ILogger<OrderService> logger)
    {
        _repository = repository;
        _logger = logger;
    }
}
```

### Collection Expressions

Modern C# also supports collection expressions.

```csharp
int[] numbers = [1, 2, 3];
List<string> names = ["Alice", "Bob"];
```

They are concise, but the underlying collection choice still matters. A `List<T>` is still a dynamic array, a `HashSet<T>` still uses hashing, and an array is still fixed-size.

### `using` And `IDisposable`

Use `using` for deterministic disposal of resources.

```csharp
using var stream = File.OpenRead("orders.csv");
```

Async disposal:

```csharp
await using var connection = new SqlConnection(connectionString);
```

Common disposable resources:

- streams;
- database connections;
- timers;
- cancellation token registrations;
- unmanaged handles.

Common misconception:

> Garbage collection releases managed memory, but it does not immediately release external resources such as file handles or sockets. That is why `IDisposable` still matters in C#.

Equivalent `try/finally` shape:

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

`using` is the cleaner syntax for this pattern.

### Extension Methods

Extension methods add method-like syntax without changing the original type.

```csharp
public static class StringExtensions
{
    public static bool IsBlank(this string? value)
    {
        return string.IsNullOrWhiteSpace(value);
    }
}
```

Use them for small, reusable operations.

Avoid using extension methods to hide complex dependencies or business workflows.

Good extension method:

```csharp
public static bool IsValidEmail(this string value)
{
    return value.Contains('@');
}
```

Questionable extension method:

```csharp
public static Task ApproveOrderAsync(this Order order, AppDbContext db)
{
    // Hidden database dependency inside extension method.
}
```

Why questionable:

> It makes a method look like simple object behavior while hiding infrastructure work.

### `yield return`

`yield return` creates an iterator with deferred execution.

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

The method does not execute fully when called. It executes as the result is enumerated.

Common risk:

```csharp
var query = GetEvenNumbers(numbers);
numbers.Clear();
var result = query.ToList();
```

Because execution is deferred, later changes to the source can affect results.

### `ref`, `out`, And `in`

`out` is used when the method must assign the value.

```csharp
if (int.TryParse(input, out var number))
{
    Console.WriteLine(number);
}
```

`ref` allows the method to read and modify the caller's variable.

`in` passes by readonly reference and is mainly useful for large structs in performance-sensitive code.

Use these carefully. For normal business code, clear return types are usually easier to read.

`ref` example:

```csharp
public static void Increment(ref int value)
{
    value++;
}

var count = 1;
Increment(ref count);
Console.WriteLine(count); // 2
```

`in` example:

```csharp
public readonly struct LargeValue
{
    public readonly decimal A;
    public readonly decimal B;
    public readonly decimal C;
}

public static decimal Sum(in LargeValue value)
{
    return value.A + value.B + value.C;
}
```

In normal API/business code, `out` appears often with `TryParse`. `ref` and `in` are more specialized.

### `Span<T>` And `Memory<T>`

`Span<T>` represents a contiguous region of memory without allocation.

```csharp
ReadOnlySpan<char> text = "ORDER-123".AsSpan();
var prefix = text[..5];
```

Use cases:

- parsing;
- high-performance text/binary processing;
- reducing allocations in hot paths.

Important:

- `Span<T>` is stack-only and cannot be stored in fields of normal classes;
- `Memory<T>` can be stored and used across async boundaries;
- most full-stack business code does not need direct `Span<T>`, but engineers should recognize it when reading high-performance code.

Parsing example:

```csharp
public static string GetOrderPrefix(string orderNumber)
{
    ReadOnlySpan<char> span = orderNumber.AsSpan();
    return span[..5].ToString();
}
```

Async boundary rule:

```csharp
public async Task ProcessAsync(Memory<byte> data)
{
    await Task.Delay(10);
    Console.WriteLine(data.Length);
}
```

Use `Memory<T>` when data must live across `await`. Use `Span<T>` for synchronous, stack-only high-performance work.

## Review Questions

### What is the difference between field and property?

> A field stores data directly. A property exposes data through accessors and can control access, validation, or computed values.

### Why use private setters?

> Private setters protect object invariants by preventing arbitrary external mutation.

### What does `sealed` mean?

> `sealed` prevents a class from being inherited. It can make intent clearer and avoid unexpected inheritance behavior.

### `var` vs `dynamic`?

> `var` is compile-time type inference, so the variable is still statically typed. `dynamic` bypasses compile-time member checks and resolves calls at runtime, so it is more flexible but less safe.

### Why does `IDisposable` matter if C# has garbage collection?

> Garbage collection manages memory, but external resources such as file handles, sockets, and database connections need deterministic cleanup. `IDisposable` and `using` release those resources promptly.

### What does `yield return` do?

> It creates an iterator and enables deferred execution. The method body runs as the sequence is enumerated, not necessarily when the method is called.

## Common Mistakes

### Mistake: Public setters on domain entities everywhere.

Why it is wrong:

> Any caller can change state without business validation.

Better answer:

> Keep setters private where possible and expose behavior methods that protect invariants.

### Mistake: Static mutable state.

Why it is wrong:

> Static mutable data is shared across requests and threads. It can cause race conditions, data leaks, and difficult tests.

Better answer:

> Use scoped services for request-specific state and immutable static values for constants.

### Mistake: Constructors that allow invalid objects.

Why it is wrong:

> Invalid objects force every caller to remember validation rules later.

Better answer:

> Validate required state in constructors or factory methods.

### Mistake: Too many public methods.

Why it is wrong:

> A large public surface area is harder to maintain and harder to change safely.

Better answer:

> Expose only the operations the rest of the system needs.

### Mistake: Using `dynamic` when generics or typed DTOs would be safer.

Why it is wrong:

> `dynamic` moves errors from compile time to runtime.

Better answer:

> Prefer typed models, interfaces, or generics unless the data is genuinely dynamic.

### Mistake: Forgetting to dispose resources.

Why it is wrong:

> External resources such as streams and database connections may stay open longer than intended.

Better answer:

> Use `using`, `await using`, or DI-managed lifetimes.

### Mistake: Assuming `required` replaces API validation.

Why it is wrong:

> `required` only ensures assignment at compile time. It does not validate format, range, length, or business rules.

Better answer:

> Use `required` for initialization safety and validation for correctness.

### Mistake: Returning deferred sequences after the underlying resource has been disposed.

Why it is wrong:

> The query may execute later, after the database context, stream, or collection is no longer available.

Better answer:

> Materialize results before disposing the resource, or keep the resource alive for the enumeration.
