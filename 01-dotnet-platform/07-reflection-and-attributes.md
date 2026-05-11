# Reflection And Attributes In .NET

Reflection enables code to inspect types, methods, properties, and attributes at runtime. Attributes attach declarative metadata to code elements. They are related because attributes become meaningful only when some framework, tool, or application reads that metadata and acts on it.

## Reflection

Reflection inspects the shape of a type at runtime without knowing it at compile time:

```csharp
public sealed class User
{
    public int Id { get; init; }
    public string Email { get; init; } = "";
}

var type = typeof(User);

Console.WriteLine(type.Name);

foreach (var property in type.GetProperties())
{
    Console.WriteLine($"{property.Name} -> {property.PropertyType.Name}");
}
```

Output:

```text
User
Id -> Int32
Email -> String
```

Frameworks use this capability to bind JSON to objects, validate models, create services through dependency injection, and map data between layers. Reflection can also create instances dynamically:

```csharp
var type = typeof(User);
var instance = Activator.CreateInstance(type);
```

This is appropriate for frameworks and plugin systems. In application code, constructor injection and explicit factories are preferable when the dependency graph is known at compile time — they are statically analyzable, easier to test, and compatible with trimming and Native AOT without additional configuration.

## Attributes

Attributes are metadata markers that do not execute by themselves. They describe intent; a separate runtime component must consume them:

```csharp
[AttributeUsage(AttributeTargets.Class)]
public sealed class AuditableAttribute : Attribute { }

[Auditable]
public sealed class Order { }
```

Reading the attribute requires explicit code:

```csharp
var isAuditable = typeof(Order)
    .GetCustomAttributes(typeof(AuditableAttribute), inherit: true)
    .Any();
```

`AttributeUsage` constrains where an attribute can be applied and whether it can appear multiple times or be inherited:

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

Attributes work well for stable, declarative metadata — permissions, serialization hints, routing conventions, validation rules — that should stay close to the code element they describe. When behavior requires complex runtime decisions or evolving state, normal code is usually clearer than encoding intent into attributes.

## Framework Attributes

The .NET ecosystem uses attributes extensively as a compact metadata contract between application code and framework infrastructure:

| Framework | Examples |
|---|---|
| ASP.NET Core | `[ApiController]`, `[HttpGet]`, `[Authorize]`, validation attributes |
| EF Core | `[Key]`, `[Required]`, `[Timestamp]` |
| Testing | `[Fact]`, `[Theory]` |
| Serialization | `[JsonPropertyName]`, `[JsonIgnore]` |

ASP.NET Core routing illustrates the pattern: attributes describe routing intent, and the framework reads that metadata to build the endpoint table:

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

The attributes do not execute the routing. Framework code reads them at startup and constructs the routing infrastructure from the metadata.

## Reflection Performance

Reflection is slower than direct calls because the runtime must inspect metadata, resolve members by name, and often box values or use general invocation paths. In hot paths, repeated reflection creates measurable overhead:

```csharp
// Slow: metadata lookup on every call
public static object? GetValueSlow(object target, string propertyName)
{
    var property = target.GetType().GetProperty(propertyName);
    return property?.GetValue(target);
}

// Cached: metadata lookup once per type-property pair
private static readonly ConcurrentDictionary<(Type Type, string Name), PropertyInfo?> PropertyCache = new();

public static object? GetValueCached(object target, string propertyName)
{
    var key = (target.GetType(), propertyName);
    var property = PropertyCache.GetOrAdd(key, item => item.Type.GetProperty(item.Name));
    return property?.GetValue(target);
}
```

The performance gap is not theoretical. In a tight loop reading a property 1,000,000 times, `PropertyInfo.GetValue` without caching typically takes 200–500 ms on a modern CPU, while cached `PropertyInfo.GetValue` drops to 50–150 ms, and a compiled delegate via `Delegate.CreateDelegate` or expression trees reduces to 5–10 ms — comparable to direct property access. The metadata lookup and boxing are the dominant costs; caching eliminates the lookup, and delegates eliminate both lookup and boxing.

| Approach | Relative throughput | Trimming/NativeAOT compatible |
|---|---|---|
| `PropertyInfo.GetValue` (uncached) | ~1× | Requires annotation |
| `PropertyInfo.GetValue` (cached) | ~5× | Requires annotation |
| `Delegate.CreateDelegate` | ~50× | Requires annotation |
| Source-generated accessor | ~100× | Best compatibility when generated code avoids reflection-only patterns |

For the hottest paths, cached delegates or source-generated code outperform `PropertyInfo.GetValue` entirely. This trade-off appears in serializers, object mappers, validation frameworks, and plugin systems. Reflection provides flexibility at startup or configuration time; cached delegates and generated code become necessary when the same operation is repeated under load.

## Source Generators

Source generators produce code at compile time, shifting work from runtime discovery to build-time knowledge. They improve startup, reduce reflection overhead, and are compatible with trimming and Native AOT:

```csharp
[JsonSerializable(typeof(OrderDto))]
public partial class AppJsonContext : JsonSerializerContext { }
```

The JSON serializer uses the generated metadata instead of discovering type shapes dynamically at runtime. Activation requires wiring the generated context into serializer configuration:

```csharp
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default);
});
```

Source generation is a code artifact and a runtime path simultaneously. The build produces the generated code; the application must still be configured to use it.

### Migration Example: Reflection-Based Serialization To Source Generation

A service that serializes domain events using reflection-based `System.Text.Json` might have code paths like:

```csharp
// Reflection-based: JsonSerializer discovers type shape at runtime
var json = JsonSerializer.Serialize<OrderShipped>(orderShipped);
```

This works but requires the serializer to reflect over `OrderShipped` on every first serialization, and trimming analysis cannot prove the type's properties must be preserved. Migrating to source generation involves three steps:

**Step 1**: Define a JSON serializer context that declares every serialized type:

```csharp
[JsonSerializable(typeof(OrderShipped))]
[JsonSerializable(typeof(OrderCancelled))]
[JsonSerializable(typeof(InventoryUpdated))]
public partial class DomainEventContext : JsonSerializerContext
{
}
```

**Step 2**: Register the context in DI and configure all JSON endpoints to use it:

```csharp
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, DomainEventContext.Default);
});
```

**Step 3**: Verify the migration by publishing with trimming enabled and running integration tests that exercise every serialized event type:

```bash
dotnet publish -c Release -p:PublishTrimmed=true
# Run integration tests against the published output
```

After migration, the serializer reads pre-generated metadata. Serialization of declared types no longer needs runtime type-shape discovery, trim warnings for those types disappear, and the application becomes one step closer to NativeAOT compatibility. The migration is incremental: types can be added to the context one at a time while the rest of the application continues using reflection-based serialization. Types in the context avoid the reflection startup cost; types outside it continue to pay that cost.

Reflection remains appropriate for startup work, configuration, framework glue, diagnostics, tests, and infrequent operations. In hot paths, repeated reflection should be cached, converted to delegates, or replaced with generated code. Reflection provides flexibility; explicit or generated code provides predictability and performance. The right choice depends on whether dynamism or throughput is the primary concern.
