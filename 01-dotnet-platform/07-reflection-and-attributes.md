# Reflection And Attributes In .NET

## Core Idea

Reflection lets code inspect types, methods, properties, and attributes at runtime.

Attributes attach metadata to code elements. Reflection and attributes are related because attributes only become useful when some code, framework, or tool reads that metadata and acts on it.

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

A common framework-style example is a serializer, mapper, or extensibility point discovering types by convention. A common application mistake is copying that same dynamic style into ordinary business code where the dependencies were actually known all along. Reflection is powerful, but explicit code is often better when no real runtime variability exists.

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

Attributes are metadata. They do not run by themselves. They are declarative markers that become meaningful only when a framework, library, or application explicitly interprets them.

For example:

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

For example:

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

Attributes are useful when metadata is stable and declarative. They work well for permissions, serialization hints, routing hints, validation rules, and mapping conventions that should stay close to the code element they describe. If the behavior needs complex runtime decisions, evolving state, or significant branching logic, normal code is often clearer than encoding too much intent into attributes.

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

These examples show a broader pattern: attributes are often used as a compact metadata contract between application code and framework code. They describe intent, but a separate runtime component still has to consume that intent.

ASP.NET Core routing is a simple illustration:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<OrderDto> GetById(int id)
    {
        return Ok();
    }
}
```

The attributes do not execute the routing behavior by themselves. Framework code reads that metadata and builds endpoint behavior around it.

## Reflection Performance

Reflection can be slower than direct calls because the runtime must inspect metadata, resolve members, and often box values or use more general invocation paths than ordinary compiled code.

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

That trade-off appears often in serializers, object mappers, validation frameworks, and plugin systems. Reflection gives flexibility at startup or configuration time. Cached delegates or generated code become more attractive when the same operation is repeated on hot request paths.

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

This can improve startup, reduce reflection overhead, and work better with trimming and Native AOT. In practice, source generation is one of the clearest examples of the platform shifting work from runtime discovery to build-time knowledge.

Example idea:

```csharp
[JsonSerializable(typeof(OrderDto))]
public partial class AppJsonContext : JsonSerializerContext
{
}
```

The JSON serializer can use generated metadata instead of discovering everything dynamically at runtime.

Reflection therefore remains most appropriate for startup work, configuration, framework glue, diagnostics, tests, and other lower-frequency operations. In hot paths, repeated reflection should usually be cached, converted to delegates, or replaced with generated code. The important architectural distinction is that reflection provides flexibility, while generated or explicit code provides predictability. The right choice depends on whether the system values dynamism more than startup, throughput, trimming safety, and operational transparency.
