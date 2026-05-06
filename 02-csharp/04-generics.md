# C# Generics

## Core Idea

Generics are one of the most important reasons modern C# code can be both reusable and type-safe. They allow APIs to abstract over families of types without collapsing everything into `object`, manual casts, or runtime type checks.

This matters far beyond syntax. Generics shape collections, dependency injection, equality, high-performance library code, and many of the framework abstractions used throughout .NET. In practice, they are part of how C# keeps reusable code precise rather than vague.

## Why Generics Matter

Without generics, reusable APIs tend to lose type information at exactly the point where correctness matters most.

```csharp
public object? FirstOrDefaultObject(IEnumerable<object> items, Func<object, bool> predicate)
{
    foreach (var item in items)
    {
        if (predicate(item))
        {
            return item;
        }
    }

    return null;
}
```

This works mechanically, but it forces callers to cast, permits accidental type mismatches, and often introduces boxing for value types. A generic API preserves the actual type all the way through:

```csharp
public T? FirstOrDefault<T>(IEnumerable<T> items, Func<T, bool> predicate)
{
    foreach (var item in items)
    {
        if (predicate(item))
        {
            return item;
        }
    }

    return default;
}
```

```csharp
var numbers = new[] { 1, 2, 3, 4 };
var firstEven = FirstOrDefault(numbers, x => x % 2 == 0);

var names = new[] { "Alice", "Bob" };
var bob = FirstOrDefault(names, x => x == "Bob");
```

The same logic now works for both `int` and `string`, but the compiler still understands the exact result type. That combination of reuse and precision is the central value of generics.

## Generic Types As API Contracts

Generic classes allow abstractions to remain specific about the data they hold or return.

```csharp
public sealed class Result<T>
{
    private Result(bool isSuccess, T? value, string? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static Result<T> Success(T value)
    {
        return new Result<T>(true, value, null);
    }

    public static Result<T> Failure(string error)
    {
        return new Result<T>(false, default, error);
    }
}
```

```csharp
public Result<UserDto> GetUser(int id)
{
    if (id <= 0)
    {
        return Result<UserDto>.Failure("Invalid user id.");
    }

    return Result<UserDto>.Success(new UserDto(id, "Alice"));
}
```

`Result<UserDto>` tells the caller exactly what success contains. The API does not need a separate non-generic result type plus ad hoc payload property or out-of-band casting convention. Generic types are often most valuable when they make contracts more honest.

## Constraints And Expressing Assumptions

Generic code is only safe when its assumptions about the type parameter are made explicit. Constraints let the compiler enforce those assumptions.

```csharp
public interface IEntity
{
    int Id { get; }
}

public static int GetEntityId<T>(T entity)
    where T : IEntity
{
    return entity.Id;
}
```

Without the constraint, `entity.Id` would not compile because `T` could be anything. The constraint tells both the compiler and the reader that the generic algorithm depends on a specific capability.

Common constraints include:

- `where T : class`
- `where T : struct`
- `where T : new()`
- `where T : BaseClass`
- `where T : IInterface`
- `where T : notnull`

Each one narrows the legal type arguments and communicates design intent. `notnull` is especially useful in APIs such as dictionaries, caches, and identifiers where null keys would violate the abstraction.

```csharp
public sealed class EntityMap<TKey, TValue>
    where TKey : notnull
{
    private readonly Dictionary<TKey, TValue> _items = new();
}
```

Constraints are part of API design, not just compiler appeasement. Weak or missing constraints often force generic code to compensate with reflection, runtime exceptions, or poorly documented assumptions.

## Generics And Performance

Generics are also important because they avoid some of the runtime cost associated with object-based abstractions.

```csharp
var numbers = new List<int>();
```

Compare that with an older non-generic collection:

```csharp
var list = new ArrayList();
list.Add(1); // boxing
```

With a generic collection, value types such as `int` remain strongly typed and do not need boxing just to participate in a reusable API.

```csharp
var generic = new List<int>();
var nonGeneric = new ArrayList();

for (var i = 0; i < 1000; i++)
{
    generic.Add(i);
    nonGeneric.Add(i);
}
```

The generic version avoids a stream of boxed heap allocations. That does not mean every generic API is automatically fast, but it does mean generics often improve both correctness and runtime behavior at the same time.

This is also why equality helpers in modern .NET often rely on generic abstractions:

```csharp
public static bool AreEqual<T>(T left, T right)
{
    return EqualityComparer<T>.Default.Equals(left, right);
}
```

The code remains reusable without forcing everything through `object`.

## Variance And Why Some Conversions Work

One of the more subtle parts of generics is variance: whether one generic type can be treated as another when their type arguments have an inheritance relationship.

Covariance applies to output-producing abstractions:

```csharp
IEnumerable<string> strings = new List<string>();
IEnumerable<object> objects = strings;
```

This is safe because a sequence that produces strings can also be observed as a sequence that produces objects.

Contravariance applies to input-consuming abstractions:

```csharp
Action<object> handleObject = obj => Console.WriteLine(obj);
Action<string> handleString = handleObject;
```

This is safe because something that can handle any object can certainly handle a string.

What is often more important than the terminology is understanding why mutable collections are not variant:

```csharp
// List<string> names = new();
// List<object> objects = names; // does not compile
```

If that conversion were allowed, a caller could add a non-string object through the `List<object>` view and violate the original list's type safety. Variance therefore depends on the shape of the abstraction. Read-only producers can often be variant. Mutable containers generally cannot.

## Generic Type Design In Real Systems

Generics become especially valuable when they preserve domain meaning while still enabling reuse.

A repository contract is a common example:

```csharp
public interface IRepository<T>
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct);
}
```

ASP.NET Core dependency injection can register such contracts as open generics:

```csharp
public sealed class EfRepository<T> : IRepository<T>
    where T : class
{
    private readonly AppDbContext _db;

    public EfRepository(AppDbContext db)
    {
        _db = db;
    }

    public Task<T?> GetByIdAsync(int id, CancellationToken ct)
    {
        return _db.Set<T>().FindAsync([id], ct).AsTask();
    }
}
```

```csharp
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
```

This is powerful, but it also reveals an important design limit. A generic abstraction is only helpful while the shared behavior is genuinely generic. Once the application needs domain-specific queries, projections, batching rules, or provider-specific optimizations, an excessively generic repository may start hiding useful details rather than simplifying them.

In other words, generics improve reuse only when the reused abstraction is conceptually real.

## Static Abstract Interface Members And Modern Generic Math

Modern C# extends generics further by allowing certain static members in interfaces to participate in generic constraints.

```csharp
using System.Numerics;

public static T Add<T>(T left, T right)
    where T : INumber<T>
{
    return left + right;
}
```

This feature matters because older generic constraints could express instance capabilities but not static operators such as `+`. Static abstract interface members make generic numeric code possible without resorting to `dynamic`, reflection, or type-specific overload explosion.

Most application developers will use these features more often indirectly through libraries than directly in line-of-business code. They still belong in a professional understanding of modern C# because they show how the language continues to extend generic expressiveness without abandoning compile-time checking.
