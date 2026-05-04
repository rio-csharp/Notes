# C# Generics

## Core Idea

Generics allow type-safe reusable code without losing specific type information.

Chinese notes:

- `generic`: 泛型.
- `type parameter`: 类型参数.
- `constraint`: 约束.
- `variance`: 变体.

## Generic Method

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

Usage:

```csharp
var numbers = new[] { 1, 2, 3, 4 };
var firstEven = FirstOrDefault(numbers, x => x % 2 == 0);

var names = new[] { "Alice", "Bob" };
var bob = FirstOrDefault(names, x => x == "Bob");
```

The same method works for `int` and `string`, but the compiler keeps the correct type.

Without generics, you might write:

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

Problems:

- caller must cast;
- value types may be boxed;
- compiler cannot protect type-specific mistakes.

## Generic Class

```csharp
public sealed class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }
}
```

More practical implementation:

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

Usage:

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

Why this matters:

> `Result<UserDto>` tells the caller exactly what successful data type to expect. You do not lose type safety.

## Constraints

```csharp
public interface IEntity
{
    int Id { get; }
}

public sealed class Repository<TEntity>
    where TEntity : class, IEntity
{
}
```

Common constraints:

- `where T : class`
- `where T : struct`
- `where T : new()`
- `where T : BaseClass`
- `where T : IInterface`
- `where T : notnull`

Why constraints matter:

```csharp
public static int GetEntityId<T>(T entity)
{
    return entity.Id; // does not compile without a constraint
}
```

Better:

```csharp
public static int GetEntityId<T>(T entity)
    where T : IEntity
{
    return entity.Id;
}
```

Constructor constraint:

```csharp
public static T Create<T>()
    where T : new()
{
    return new T();
}
```

`notnull` constraint:

```csharp
public sealed class EntityMap<TKey, TValue>
    where TKey : notnull
{
    private readonly Dictionary<TKey, TValue> _items = new();
}
```

`Dictionary<TKey, TValue>` needs keys that behave correctly for equality and hashing; `notnull` helps prevent null key mistakes in generic code.

## Generics And Boxing

Generic collections avoid boxing for value types.

Good:

```csharp
var numbers = new List<int>();
```

Old non-generic collection:

```csharp
var list = new ArrayList();
list.Add(1); // boxing
```

Example with many values:

```csharp
var generic = new List<int>();
var nonGeneric = new ArrayList();

for (var i = 0; i < 1000; i++)
{
    generic.Add(i);    // no boxing
    nonGeneric.Add(i); // boxes each int
}
```

Why it matters:

> Boxing allocates heap objects and increases GC pressure. Generic collections avoid that for value types.

Generic method without boxing:

```csharp
public static bool AreEqual<T>(T left, T right)
{
    return EqualityComparer<T>.Default.Equals(left, right);
}
```

This works for value types and reference types without forcing everything through `object`.

## Covariance And Contravariance

Covariance:

```csharp
IEnumerable<string> strings = new List<string>();
IEnumerable<object> objects = strings;
```

Contravariance:

```csharp
Action<object> handleObject = obj => Console.WriteLine(obj);
Action<string> handleString = handleObject;
```

Note:

> Variance applies only in certain generic interfaces/delegates and only for reference type conversions.

Covariance means producer/output:

```csharp
IEnumerable<string> names = new List<string> { "Alice" };
IEnumerable<object> objects = names;
```

This is safe because reading a `string` as an `object` is always valid.

Contravariance means consumer/input:

```csharp
IComparer<object> objectComparer = Comparer<object>.Default;
IComparer<string> stringComparer = objectComparer;
```

This is safe because something that can compare any `object` can also compare `string` values.

Not allowed:

```csharp
// List<string> names = new();
// List<object> objects = names; // does not compile
```

Why not:

```csharp
// If this were allowed:
// objects.Add(new object());
// names would now contain a non-string object.
```

Mutable generic collections are invariant to protect type safety.

## Static Abstract Interface Members

Modern C# supports static abstract members in interfaces. This enables generic math and other compile-time generic operations over static members.

Example:

```csharp
public interface IHasZero<TSelf>
    where TSelf : IHasZero<TSelf>
{
    static abstract TSelf Zero { get; }
}
```

Generic math example:

```csharp
using System.Numerics;

public static T Add<T>(T left, T right)
    where T : INumber<T>
{
    return left + right;
}
```

Usage:

```csharp
var intResult = Add(1, 2);
var decimalResult = Add(1.5m, 2.5m);
```

Why it matters:

> Older generic constraints could say "T implements an interface", but could not easily express static operators like `+`. Static abstract interface members make high-performance generic numeric code possible without falling back to `dynamic` or `object`.

Most business applications do not need to write generic math often, but understanding this feature helps when reading modern library code.

## Open Generics In Dependency Injection

ASP.NET Core DI can register open generic services.

```csharp
public interface IRepository<T>
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct);
}

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

Registration:

```csharp
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
```

Use with care:

> Open generic registrations are powerful, but generic repositories can become too generic. If a domain needs specific query behavior, a specific repository or query service may be clearer.

## Review Questions

### Why use generics?

> Generics provide reusable type-safe code, reduce casting, and avoid boxing for value types in generic collections.

### What are generic constraints?

> Constraints restrict what type arguments are allowed and let generic code safely use members from those constraints.

### What is covariance?

> Covariance allows a more derived generic type to be used where a less derived type is expected, such as `IEnumerable<string>` assigned to `IEnumerable<object>`.

### Why does `List<string>` not assign to `List<object>`?

> Because `List<T>` is mutable. If `List<string>` could be treated as `List<object>`, someone could add a plain `object` into a list that should contain only strings.

### What does `where T : notnull` mean?

> It tells the compiler the generic type argument should not be nullable. It is useful for dictionary keys and APIs where null would break assumptions.

### When are generic repositories useful?

> They can be useful for simple shared persistence operations, but they should not hide important EF Core features or domain-specific queries. For complex domains, specific repositories or query services are often better.

## Common Mistakes

### Mistake: Using `object` instead of generics.

Why it is wrong:

> `object` loses compile-time type safety and often requires casts. Value types may also be boxed.

Better answer:

> Use generics when the same logic should work for multiple types while preserving type information.

### Mistake: Overusing generic repositories.

Why it is wrong:

> A generic repository can hide EF Core features and produce weak APIs like `GetAll`, `Update`, and `Delete` that ignore domain-specific query and consistency needs.

Better answer:

> Use repositories when they express meaningful domain boundaries, not just because every entity needs a generic CRUD wrapper.

### Mistake: Not constraining generics when needed.

Why it is wrong:

> Without constraints, the compiler cannot guarantee the members or constructors your generic code needs.

Better answer:

> Add constraints such as `where T : class`, `where T : IEntity`, or `where T : new()` only when the generic implementation truly depends on them.

### Mistake: Confusing covariance and contravariance.

Why it is wrong:

> Variance controls whether generic types can be substituted in inheritance relationships. Output positions and input positions have different safety rules.

Better answer:

> Covariance (`out`) is for returning more derived values; contravariance (`in`) is for accepting less derived inputs.
