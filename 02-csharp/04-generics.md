# C# Generics

## Core Idea

Generics allow APIs to abstract over families of types without collapsing everything into `object`, manual casts, or runtime type checks. They shape collections, dependency injection, equality, high-performance library code, and many of the framework abstractions used throughout .NET. They keep reusable code precise rather than vague.

Unlike Java's type-erasure approach, .NET generics are **reified**: the CLR preserves generic type information in metadata and IL, and the JIT generates specialized native code for each value-type instantiation — sharing native code only across reference-type instantiations. This is why `typeof(List<int>)` returns a runtime type distinct from `typeof(List<string>)`, why constraints are enforced at both compile time and load time, and why value-type instantiations avoid boxing. The CLR chapter covers the runtime infrastructure behind this model.

## Reuse Without Losing Type Information

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

The generic version also avoids boxing for value types. When `T` is `int`, the `FirstOrDefault<int>` method operates on `int` values directly — no heap allocation, no indirection. The non-generic `FirstOrDefaultObject` boxes every `int` into `object` just to pass it through the collection and predicate, then forces the caller to unbox the result. For a call executed once, boxing is noise. For a call executed millions of times, the allocation and garbage collection pressure become measurable.

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

Constraints are part of the API contract. Weak or missing constraints force generic code to compensate with reflection, runtime exceptions, or poorly documented assumptions.

A more realistic example makes the design pressure clearer:

```csharp
public interface IHasTimestamps
{
    DateTimeOffset CreatedAt { get; }
}

public static T GetLatest<T>(IEnumerable<T> items)
    where T : IHasTimestamps
{
    return items.MaxBy(item => item.CreatedAt)
        ?? throw new InvalidOperationException("Sequence was empty.");
}
```

Without the constraint, the API could not honestly express why the generic algorithm works. With the constraint, the compiler and the reader both know the generic method depends on a timestamp capability rather than on a vague convention.

### The `unmanaged` Constraint And `sizeof(T)`

The `unmanaged` constraint restricts `T` to types that have no managed references and can be represented as a contiguous block of memory: primitive numeric types, `enum` types, and structs composed entirely of unmanaged fields. It enables low-level patterns that are otherwise impossible in safe generic code.

```csharp
public static unsafe int SizeOf<T>() where T : unmanaged
{
    return sizeof(T);
}
```

`sizeof(T)` with an unmanaged constraint is evaluated at runtime — the JIT emits the correct size for each concrete instantiation. This is useful in interop, custom serialization, and pooled memory scenarios where knowing the exact byte layout of a value type matters.

```csharp
public static void ZeroMemory<T>(Span<T> buffer) where T : unmanaged
{
    buffer.Clear();
}
```

`Span<T>.Clear()` is itself constrained to `unmanaged` types because it operates on raw memory. The constraint propagates up to any generic API that delegates to memory-level operations.

### The `INumber<T>` Constraint (.NET 7+)

The `INumber<T>` constraint, introduced with .NET 7 and C# 11's static abstract interface members, enables generic algorithms over any numeric type.

```csharp
public static T Sum<T>(IEnumerable<T> values) where T : INumber<T>
{
    var total = T.Zero;
    foreach (var value in values)
    {
        total += value;
    }
    return total;
}
```

This works for `int`, `double`, `decimal`, `Half`, and any type that implements `INumber<T>`. Before `INumber<T>`, a generic sum required either `dynamic` (runtime overhead, no compile-time safety), separate overloads for each numeric type, or code generation. The constraint expresses the numeric capability at the type-system level, and the compiler enforces it.

`INumber<T>` is part of a larger hierarchy in `System.Numerics`: `IAdditionOperators`, `IMultiplicationOperators`, `IComparisonOperators`, and others. A generic method can constrain to the narrowest interface that captures the operations it needs rather than pulling in the entire `INumber<T>` surface.

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

## Variance And The `out`/`in` Keywords

One of the more subtle parts of generics is variance: whether one generic type can be treated as another when their type arguments have an inheritance relationship. Variance in C# is controlled by the `out` and `in` annotations on generic type parameters, and it applies only to interface and delegate type parameters — never to class type parameters.

### Covariance With `out`

`IEnumerable<T>` is covariant because its definition marks `T` with `out`:

```csharp
public interface IEnumerable<out T>
{
    IEnumerator<T> GetEnumerator();
}
```

The `out` annotation means `T` appears only in output positions (return types, read-only properties, but never method parameters). This structural guarantee is what makes covariance safe:

```csharp
IEnumerable<string> strings = new List<string>();
IEnumerable<object> objects = strings;
```

This is safe because a sequence that produces strings can also be observed as a sequence that produces objects. The `out` keyword is the compiler-enforced contract that `T` is only produced, never consumed.

### Contravariance With `in`

`Action<T>` is contravariant because its definition marks `T` with `in`:

```csharp
public delegate void Action<in T>(T obj);
```

The `in` annotation means `T` appears only in input positions (method parameters, never return types). This structural guarantee makes contravariance safe:

```csharp
Action<object> handleObject = obj => Console.WriteLine(obj);
Action<string> handleString = handleObject;
```

This is safe because something that can handle any object can certainly handle a string. The `in` keyword is the compiler-enforced contract that `T` is only consumed, never produced.

### Variance Limited To Interfaces And Delegates

Class type parameters cannot be variant. Variance requires that the compiler verify `T` appears only in output positions (for covariance) or only in input positions (for contravariance). A class can store `T` in a field, which is both an input and output position — the field can be written and read. Interfaces and delegates, by contrast, declare only method signatures without fields, so the compiler can verify the position rules. This is why `IEnumerable<out T>` compiles but a hypothetical `List<out T>` would not: `List<T>` has an `Add(T item)` method, which consumes `T`, and a `this[int]` indexer, which both produces and consumes `T`.

```csharp
// List<string> names = new();
// List<object> objects = names; // does not compile
```

If that conversion were allowed, a caller could add a non-string object through the `List<object>` view and violate the original list's type safety. Variance therefore depends on the shape of the abstraction. Read-only producers can often be variant. Mutable containers generally cannot.

A fuller contrast helps make the rule concrete:

```csharp
public static void PrintAll(IEnumerable<object> values)
{
    foreach (var value in values)
    {
        Console.WriteLine(value);
    }
}

IEnumerable<string> names = new[] { "Alice", "Bob" };
PrintAll(names); // covariance is fine
```

But this would be unsafe if it were allowed:

```csharp
// List<string> names = new() { "Alice" };
// List<object> objects = names;
// objects.Add(42);
```

`IEnumerable<T>` only produces `T`, while `List<T>` both produces and consumes `T`. The language permits covariance for the former and rejects it for the latter based on this structural difference.

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

The registration also does not do anything interesting by itself until the application requests a closed generic such as `IRepository<User>`. That is the real activation path. In practice, teams verify this kind of setup either by resolving a concrete closed generic through dependency injection in a running application or by covering the registration with an integration test.

In other words, generics improve reuse only when the reused abstraction is conceptually real.

A larger slice shows both the benefit and the limit:

```csharp
public interface IRepository<T>
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct);
    Task AddAsync(T entity, CancellationToken ct);
}

public sealed class EfRepository<T> : IRepository<T>
    where T : class
{
    private readonly AppDbContext _dbContext;

    public EfRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<T?> GetByIdAsync(int id, CancellationToken ct)
    {
        return _dbContext.Set<T>().FindAsync([id], ct).AsTask();
    }

    public async Task AddAsync(T entity, CancellationToken ct)
    {
        await _dbContext.Set<T>().AddAsync(entity, ct);
    }
}

public sealed class UserService
{
    private readonly IRepository<User> _users;

    public UserService(IRepository<User> users)
    {
        _users = users;
    }

    public Task<User?> GetUserAsync(int id, CancellationToken ct)
    {
        return _users.GetByIdAsync(id, ct);
    }
}
```

This is useful when the operation is truly generic: retrieve or add an entity. The abstraction starts to lose honesty when callers need domain-specific behaviors such as `GetActiveUsersByTenantAsync`, `LoadUserWithPermissionsAsync`, or provider-specific batching and projection rules. That is where generic reuse stops being a benefit and starts concealing important meaning.

### The Specification Pattern With Open Generics

A more honest generic pattern for querying is the specification pattern, where a generic interface defines a query predicate and concrete specifications carry domain meaning.

```csharp
public interface ISpecification<T>
{
    Expression<Func<T, bool>> ToExpression();
}

public sealed class ActiveOrderSpecification : ISpecification<Order>
{
    public Expression<Func<Order, bool>> ToExpression()
    {
        return order => order.Status == OrderStatus.Submitted
                       || order.Status == OrderStatus.Shipped;
    }
}

public sealed class OrdersByCustomerSpecification : ISpecification<Order>
{
    private readonly int _customerId;

    public OrdersByCustomerSpecification(int customerId)
    {
        _customerId = customerId;
    }

    public Expression<Func<Order, bool>> ToExpression()
    {
        return order => order.CustomerId == _customerId;
    }
}
```

Specifications compose without a generic base class:

```csharp
public static class SpecificationExtensions
{
    public static ISpecification<T> And<T>(
        this ISpecification<T> left,
        ISpecification<T> right)
    {
        return new AndSpecification<T>(left, right);
    }
}
```

The generic repository can then accept specifications:

```csharp
public interface IRepository<T>
{
    Task<IReadOnlyList<T>> ListAsync(
        ISpecification<T> specification,
        CancellationToken ct);
}
```

A query `ListAsync(new ActiveOrderSpecification().And(new OrdersByCustomerSpecification(42)), ct)` composes two domain concepts without a base class, without a fragile hierarchy, and without the caller knowing how the repository translates expressions to SQL. The generic abstraction (`IRepository<T>`, `ISpecification<T>`) stays thin; domain meaning lives in the concrete specification types.

### Open Generic Validator Registration

The same open-generic registration pattern supports validation:

```csharp
public interface IValidator<T>
{
    ValidationResult Validate(T target);
}

public sealed record ValidationResult(bool IsValid, IReadOnlyList<string> Errors);

public sealed class OrderValidator : IValidator<Order>
{
    public ValidationResult Validate(Order target)
    {
        var errors = new List<string>();

        if (target.Items.Count == 0)
            errors.Add("Order must contain at least one item.");

        if (target.Total <= 0)
            errors.Add("Order total must be greater than zero.");

        return new ValidationResult(errors.Count == 0, errors);
    }
}
```

ASP.NET Core dependency injection resolves closed generics automatically when open generics are registered:

```csharp
builder.Services.AddScoped(typeof(IValidator<>), typeof(OrderValidator));
// Wrong: OrderValidator is a closed validator for Order, not an open generic.
```

The correct open-generic registration requires a matching open-generic implementation:

```csharp
public sealed class FluentValidationAdapter<T> : IValidator<T>
{
    // Wraps a third-party validation library.
}

builder.Services.AddScoped(typeof(IValidator<>), typeof(FluentValidationAdapter<>));
```

The pattern is powerful, but the registration must match: an open generic implementation registered against an open generic interface. A concrete `OrderValidator` cannot satisfy `IValidator<T>` for all `T` — it requires a separate registration or a factory pattern.

## Generics And The `default` Keyword

The `default` keyword in generic code resolves to different values depending on the type parameter:

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

When `T` is `int`, `default` produces `0`. When `T` is `string`, `default` produces `null`. When `T` is a struct, `default` produces the zero-initialized value. This behavior is deterministic but carries design implications in nullable reference type (NRT) contexts.

In NRT-annotated code, `default(T)` for an unconstrained `T` returns `T?` — the nullable form. This is correct because `T` could be a reference type, and `default` for a reference type is `null`. The annotation `T?` communicates that the result may be null even when `T` is a non-nullable reference type:

```csharp
public static T? GetDefault<T>()
{
    return default; // Returns null when T is a reference type.
}
```

The `default` keyword also works with the `where T : struct` constraint, where it produces the zero-initialized struct value and the return type is non-nullable `T` rather than `T?`. With `where T : class`, `default` produces `null` and the return type is `T?`. The constraint narrows what `default` can mean, which narrows what the caller must handle.

## Static Abstract Interface Members And Generic Factories

Static abstract interface members, introduced in C# 11 and .NET 7, allow interfaces to declare static methods, operators, and properties that implementing types must provide. The runtime dispatches these through constrained calls — the JIT emits a direct call to the concrete type's static method rather than a virtual dispatch through an interface slot.

### Generic Math And Beyond

The most visible use of static abstract members is generic math:

```csharp
using System.Numerics;

public static T Add<T>(T left, T right)
    where T : INumber<T>
{
    return left + right;
}
```

This feature matters because older generic constraints could express instance capabilities but not static operators such as `+`. Static abstract interface members make generic numeric code possible without resorting to `dynamic`, reflection, or type-specific overload explosion.

### Generic Factory Pattern

Static abstract members are not limited to numeric operators. A generic factory pattern demonstrates the broader capability:

```csharp
public interface IFactory<T>
{
    static abstract T Create();
}

public sealed record UserCreatedEvent(
    int UserId,
    DateTimeOffset OccurredAt) : IFactory<UserCreatedEvent>
{
    public static UserCreatedEvent Create()
    {
        return new UserCreatedEvent(0, DateTimeOffset.UtcNow);
    }
}

public static T CreateDefault<T>() where T : IFactory<T>
{
    return T.Create();
}
```

`T.Create()` resolves at the call site to the concrete type's static method. The JIT emits a direct call — there is no virtual dispatch, no reflection, no `Activator.CreateInstance`. The constraint `IFactory<T>` guarantees at compile time that `T` has a `Create()` method, and the runtime resolves it through the constrained call mechanism that `callvirt` with a constrained prefix provides.

This pattern replaces patterns that previously required `new()` constraints (which cannot accept parameters) or reflection-based factory registrations. The static abstract member carries the implementation contract without requiring a runtime instance of the interface.

Most application code consumes static abstract members indirectly through libraries — generic math in `System.Numerics`, JSON serialization contracts in `System.Text.Json`, and parsing in `IParsable<T>`. The pattern belongs in a professional understanding of modern C# because it extends generic expressiveness without abandoning compile-time verification.
