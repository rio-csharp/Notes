# Assembly Loading

## Core Idea

Assembly loading is how .NET finds and loads compiled assemblies at runtime.

## Assembly Structure

An assembly is usually a `.dll` or `.exe` containing:

- IL;
- metadata;
- resources;
- referenced assembly information.

Conceptual structure:

```text
MyApp.Application.dll
  -> IL
  -> metadata
  -> manifest
  -> resources
  -> referenced assemblies
```

Why metadata matters:

> The runtime can know what types, methods, and references exist without executing the code first. Reflection, DI, serialization, and extensibility mechanisms rely on this metadata.

## Default Loading

Most applications use default assembly loading.

For example:

```csharp
var service = new OrderService();
```

The runtime loads referenced assemblies automatically based on project dependencies.

Example project reference:

```xml
<ItemGroup>
  <ProjectReference Include="..\MyApp.Application\MyApp.Application.csproj" />
</ItemGroup>
```

When `MyApp.Api` uses a type from `MyApp.Application`, the runtime can load the referenced assembly through normal dependency resolution.

## Dynamic Loading

Sometimes you load assemblies dynamically:

```csharp
var assembly = Assembly.LoadFrom("extensions/MyExtension.dll");
var type = assembly.GetType("MyExtension.ExtensionEntry");
```

Typical use cases include:

- extensibility systems;
- scripting;
- modular applications;
- runtime extension.

Important security note:

> Loading an assembly means executing code from that assembly. Do not load untrusted binaries into your process unless you have a clear sandboxing and trust model. `AssemblyLoadContext` is for loading and version isolation, not a full security sandbox.

Safer dynamic loading shape:

```csharp
var extensionPath = Path.GetFullPath("extensions/MyExtension.dll");
var assembly = Assembly.LoadFrom(extensionPath);
var extensionType = assembly.GetType("MyExtension.ExtensionEntry", throwOnError: true);

if (!typeof(IRuntimeExtension).IsAssignableFrom(extensionType))
{
    throw new InvalidOperationException("ExtensionEntry must implement IRuntimeExtension.");
}

var extension = (IRuntimeExtension)Activator.CreateInstance(extensionType)!;
extension.Execute();
```

This example shows two important practices:

- validate the loaded type;
- fail clearly when the extension shape is wrong.

In practice, a safer plugin boundary often also includes a narrow shared contract assembly:

```csharp
public interface IRuntimeExtension
{
    string Name { get; }
    Task ExecuteAsync(CancellationToken cancellationToken);
}
```

The host then depends on the contract, not on arbitrary concrete plugin types. That reduces accidental coupling and makes versioning expectations clearer across the extension boundary.

## AssemblyLoadContext

Modern .NET uses `AssemblyLoadContext`.

Use it for:

- custom loading;
- plugin isolation;
- unloading plugins.

Conceptual example:

```csharp
public sealed class PluginLoadContext : AssemblyLoadContext
{
    public PluginLoadContext() : base(isCollectible: true)
    {
    }
}
```

More practical shape:

```csharp
public sealed class PluginLoadContext : AssemblyLoadContext
{
    private readonly AssemblyDependencyResolver _resolver;

    public PluginLoadContext(string pluginMainAssemblyPath)
        : base(isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(pluginMainAssemblyPath);
    }

    protected override Assembly? Load(AssemblyName assemblyName)
    {
        var assemblyPath = _resolver.ResolveAssemblyToPath(assemblyName);
        return assemblyPath is null ? null : LoadFromAssemblyPath(assemblyPath);
    }
}
```

Why `AssemblyDependencyResolver` matters:

> Dynamically loaded components often have their own dependencies. The resolver helps locate dependencies relative to that component instead of accidentally using the wrong version from the main application.

## Version Conflicts

Common issue:

```text
Component A needs Library v1
Component B needs Library v2
```

Custom load contexts can help isolate dependencies.

A practical plugin folder might therefore look like:

```text
plugins/
  WeatherExtension/
    WeatherExtension.dll
    WeatherExtension.deps.json
    SupportingLibrary.dll
```

The point is not the folder layout itself. The point is that dynamic loading is a dependency graph problem, not just a single-file problem.

## Unloading

To unload a collectible `AssemblyLoadContext`:

- remove references to loaded types/instances;
- call `Unload`;
- allow GC to collect.

If references remain, unloading fails.

Conceptual unload check:

```csharp
static WeakReference LoadAndUnload(string pluginPath)
{
    var loadContext = new PluginLoadContext(pluginPath);
    var assembly = loadContext.LoadFromAssemblyPath(pluginPath);

    // Create and run the dynamically loaded component here.

    loadContext.Unload();
    return new WeakReference(loadContext);
}

var weakReference = LoadAndUnload("plugins/MyPlugin.dll");

for (var i = 0; weakReference.IsAlive && i < 10; i++)
{
    GC.Collect();
    GC.WaitForPendingFinalizers();
}

Console.WriteLine(weakReference.IsAlive ? "Still loaded" : "Unloaded");
```

If it stays alive, common causes include:

- loaded instance still referenced;
- event handler still subscribed;
- background thread still running;
- static field holding loaded type or instance;
- delegate from the loaded component stored in the host.

These unloading failures are one of the reasons extensibility architectures need explicit lifecycle discipline. `AssemblyLoadContext` is powerful for dependency isolation and unloading, but it does not remove the need to manage references carefully.

Version conflicts are another major design pressure in dynamic loading scenarios. Two components may depend on incompatible versions of the same library, and if both are forced into the same load context, one dependency graph may win and the other component may fail. Separate load contexts can isolate those graphs when the architecture truly needs that flexibility.

The broader architectural design of plugin contracts, host extensibility, and long-term extension boundaries belongs more naturally to later architecture-oriented material. In this chapter, the important platform idea is that assembly loading is both a dependency-resolution problem and a lifetime-management problem.

For real systems, that often leads to a small design guideline: if the host wants unloadability, it should avoid storing arbitrary plugin instances, delegates, or event subscriptions in long-lived global state unless it also has an explicit teardown path.
