# Reflection And Attributes In .NET

## Core Idea

Reflection lets code inspect types, methods, properties, and attributes at runtime.

Attributes attach metadata to code elements.

Chinese notes:

- `reflection`: 反射.
- `attribute`: 特性.
- `metadata`: 元数据.

## Reflection Example

```csharp
var type = typeof(User);

foreach (var property in type.GetProperties())
{
    Console.WriteLine($"{property.Name}: {property.PropertyType.Name}");
}
```

Example model:

```csharp
public sealed class User
{
    public int Id { get; init; }
    public string Email { get; init; } = "";
}
```

Reflection lets you inspect the shape of `User` at runtime:

```csharp
var type = typeof(User);

Console.WriteLine(type.Name);

foreach (var property in type.GetProperties())
{
    Console.WriteLine($"{property.Name} -> {property.PropertyType.Name}");
}
```

Output shape:

```text
User
Id -> Int32
Email -> String
```

Frameworks use this idea to bind JSON, validate models, create services, and map data.

## Creating Objects With Reflection

Reflection can also create instances dynamically:

```csharp
var type = typeof(User);
var instance = Activator.CreateInstance(type);
```

This is useful for frameworks and plugin systems, but application code should not default to it. Constructor injection and explicit factories are usually easier to read, test, and optimize.

## Attribute Example

```csharp
[AttributeUsage(AttributeTargets.Class)]
public sealed class AuditableAttribute : Attribute
{
}

[Auditable]
public sealed class Order
{
}
```

Reading attributes:

```csharp
var isAuditable = typeof(Order)
    .GetCustomAttributes(typeof(AuditableAttribute), inherit: true)
    .Any();
```

Important:

> Attributes are metadata. They do not run by themselves.

Example:

```csharp
[Auditable]
public sealed class Payment
{
}
```

Nothing happens unless some code checks for `[Auditable]`:

```csharp
public static bool ShouldAudit(Type type)
{
    return type.GetCustomAttributes(typeof(AuditableAttribute), inherit: true).Any();
}
```

## AttributeUsage

`AttributeUsage` controls where an attribute can be applied.

Example:

```csharp
[AttributeUsage(
    AttributeTargets.Class | AttributeTargets.Method,
    AllowMultiple = false,
    Inherited = true)]
public sealed class RequiresPermissionAttribute : Attribute
{
    public string Permission { get; }

    public RequiresPermissionAttribute(string permission)
    {
        Permission = permission;
    }
}
```

Meaning:

- `AttributeTargets.Class | AttributeTargets.Method`: can be placed on classes and methods;
- `AllowMultiple = false`: cannot apply the same attribute multiple times to the same target;
- `Inherited = true`: derived classes or overridden members can inherit the attribute depending on reflection usage.

Attributes are useful when metadata is stable and declarative. If the behavior needs complex runtime decisions, normal code is often clearer.

## Common Framework Uses

ASP.NET Core:

- `[ApiController]`;
- `[HttpGet]`;
- `[Authorize]`;
- model validation attributes.

EF Core:

- `[Key]`;
- `[Required]`;
- `[Timestamp]`.

Testing:

- `[Fact]`;
- `[Theory]`.

Serialization:

- `[JsonPropertyName]`;
- `[JsonIgnore]`.

## Reflection Performance

Reflection can be slower than direct calls.

If used in hot paths:

- cache metadata;
- compile expressions;
- use source generators;
- use delegates.

Slow repeated reflection:

```csharp
public static object? GetValueSlow(object target, string propertyName)
{
    var property = target.GetType().GetProperty(propertyName);
    return property?.GetValue(target);
}
```

Better when repeated often:

```csharp
private static readonly ConcurrentDictionary<(Type Type, string Name), PropertyInfo?> PropertyCache = new();

public static object? GetValueCached(object target, string propertyName)
{
    var key = (target.GetType(), propertyName);
    var property = PropertyCache.GetOrAdd(key, item => item.Type.GetProperty(item.Name));
    return property?.GetValue(target);
}
```

For very hot paths, cached delegates or source-generated code can be faster than `PropertyInfo.GetValue`.

## Source Generators

Source generators create code at compile time.

They can reduce runtime reflection.

Examples:

- JSON serialization source generation;
- mapping code generation;
- API client generation.

Why source generators help:

```text
Runtime reflection:
  discover shape while app is running

Source generation:
  generate code during build
  use normal compiled code at runtime
```

This can improve startup, reduce reflection overhead, and work better with trimming and Native AOT.

Example idea:

```csharp
[JsonSerializable(typeof(OrderDto))]
public partial class AppJsonContext : JsonSerializerContext
{
}
```

The JSON serializer can use generated metadata instead of discovering everything dynamically at runtime.

## Review Questions

### What is reflection?

> Reflection is the ability to inspect and interact with type metadata at runtime, such as properties, methods, constructors, and attributes.

### Why can reflection be expensive?

> It resolves metadata dynamically and may involve access checks, boxing, dynamic invocation, and less compile-time optimization.

### What are attributes?

> Attributes are metadata attached to code elements. Frameworks can read them through reflection or source generation.

### Do attributes execute automatically?

> No. Attributes only store metadata. Some framework or custom code must read the attribute and perform behavior based on it.

### Reflection vs source generation?

> Reflection discovers metadata at runtime. Source generation creates code at build time. Source generation can improve startup and AOT compatibility, but reflection is more flexible for dynamic scenarios.

### When is reflection acceptable?

> Reflection is fine for startup, configuration, framework glue, diagnostics, tests, and low-frequency operations. Be careful in hot paths and cache metadata when repeated.

## Common Mistakes

### Mistake: Using reflection repeatedly without caching.

Why it is wrong:

> Repeated metadata lookup and dynamic invocation can be expensive in hot paths.

Better answer:

> Cache reflected metadata, compiled delegates, or use source generation when performance matters.

### Mistake: Putting business logic only in attributes.

Why it is wrong:

> Attributes are metadata. If core business behavior is hidden in attributes and reflection, the flow can become hard to test and understand.

Better answer:

> Use attributes for declarative metadata, but keep important business logic explicit and testable.

### Mistake: Assuming attributes execute by themselves.

Why it is wrong:

> An attribute does nothing unless some framework or code reads it and acts on it.

Better answer:

> Attributes describe intent; runtime behavior comes from code that inspects those attributes.

### Mistake: Forgetting Native AOT limitations with reflection.

Why it is wrong:

> Native AOT/trimming may remove metadata that reflection expects unless the app preserves it.

Better answer:

> For AOT-friendly code, prefer source generators or explicitly configure required metadata.
