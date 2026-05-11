# Assembly Loading

Assembly loading is the mechanism by which .NET locates, resolves, and loads compiled assemblies at runtime. Most applications never interact with it directly — the default load context resolves project references and NuGet packages automatically. When an application requires plugins, dynamic extensions, or dependency isolation, assembly loading becomes an explicit engineering concern.

## Assembly Structure

An assembly is a `.dll` or `.exe` containing IL, metadata, resources, and referenced assembly information. The metadata describes every type, method, and dependency without executing the code — which is why reflection, dependency injection, serialization, and extensibility mechanisms can inspect assemblies at runtime.

## Default Loading

Normal application code triggers assembly loading implicitly. Creating an instance of a type defined in another project causes the runtime to resolve and load that project's assembly through the default load context:

```csharp
var service = new OrderService();
```

Project references in the `.csproj` file declare these dependencies:

```xml
<ItemGroup>
  <ProjectReference Include="..\MyApp.Application\MyApp.Application.csproj" />
</ItemGroup>
```

The runtime resolves the assembly graph from these declarations. Most applications never need custom loading logic because the default resolution is sufficient for the standard project-and-package dependency model.

## Dynamic Loading

Explicit assembly loading is required when the set of assemblies is not known at build time — plugin systems, modular applications, and runtime extension frameworks:

```csharp
var assembly = Assembly.LoadFrom("extensions/MyExtension.dll");
var type = assembly.GetType("MyExtension.ExtensionEntry");
```

Loading an assembly makes its code available to the process; creating types, invoking members, or running module/static initializers can then execute that code. Untrusted binaries should not be loaded into a process without a clear trust model. `AssemblyLoadContext` provides loading and version isolation — it is not a security sandbox.

A safer loading pattern validates the loaded type against a known contract and fails clearly when expectations are violated:

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

A narrow shared contract assembly keeps the host and plugin decoupled:

```csharp
public interface IRuntimeExtension
{
    string Name { get; }
    Task ExecuteAsync(CancellationToken cancellationToken);
}
```

The host depends on the contract, not on arbitrary concrete plugin types. This reduces accidental coupling and makes versioning expectations explicit across the extension boundary.

## AssemblyLoadContext

`AssemblyLoadContext` is the modern .NET mechanism for custom assembly loading, plugin isolation, and unloadable extensions. A collectible load context enables unloading plugins when they are no longer needed:

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

`AssemblyDependencyResolver` locates a plugin's dependencies relative to the plugin itself. Without it, plugins that depend on their own versions of shared libraries could accidentally resolve against the host's versions, causing runtime failures.

The host must explicitly create the load context and load the plugin into it:

```csharp
var pluginPath = Path.GetFullPath("plugins/WeatherExtension/WeatherExtension.dll");
var loadContext = new PluginLoadContext(pluginPath);
var assembly = loadContext.LoadFromAssemblyPath(pluginPath);
var extensionType = assembly.GetType("WeatherExtension.WeatherExtensionEntry", throwOnError: true)!;
var extension = (IRuntimeExtension)Activator.CreateInstance(extensionType)!;

await extension.ExecuteAsync(CancellationToken.None);
```

A plugin folder typically includes the plugin assembly and its dependencies:

```text
plugins/
  WeatherExtension/
    WeatherExtension.dll
    WeatherExtension.deps.json
    SupportingLibrary.dll
```

Dynamic loading is a dependency graph problem, not a single-file concern. The `.deps.json` file and `AssemblyDependencyResolver` together allow each plugin to carry and resolve its own dependency closure.

## Version Conflicts

When two components require incompatible versions of the same library, loading both into the same context causes one to resolve incorrectly. Separate `AssemblyLoadContext` instances can isolate these dependency graphs:

```text
Component A needs Library v1
Component B needs Library v2
```

Each component loads into its own context with its own resolver, and each resolves its dependencies independently. This works when isolation is architecturally necessary but adds complexity — the host must manage multiple contexts and their lifecycles.

## Unloading

Collectible `AssemblyLoadContext` instances can be unloaded by removing all external references to types and instances from that context, calling `Unload`, and allowing the GC to collect the context. A weak-reference check verifies that unloading succeeded:

```csharp
static WeakReference LoadAndUnload(string pluginPath)
{
    var loadContext = new PluginLoadContext(pluginPath);
    var assembly = loadContext.LoadFromAssemblyPath(pluginPath);

    // Create and use the dynamically loaded component.

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

If the context remains alive, a reference is still anchoring it: a loaded instance, an event handler subscription, a background thread, a static field, or a delegate stored in the host. Without an explicit unload test, teams often assume a collectible context is unloadable when a lingering reference is preventing collection.

### Hot-Reload Plugin Scenario

A realistic hot-reload scenario for a plugin system demonstrates the lifecycle concerns in practice. Consider an application that loads monitoring plugins from a directory and replaces them at runtime when new versions are deployed:

```csharp
public sealed class PluginManager : IDisposable
{
    private readonly Dictionary<string, (AssemblyLoadContext Context, IRuntimeExtension Extension)> _plugins = new();
    private readonly string _pluginDirectory;
    private FileSystemWatcher? _watcher;

    public PluginManager(string pluginDirectory)
    {
        _pluginDirectory = Path.GetFullPath(pluginDirectory);
    }

    public async Task LoadAllAsync(CancellationToken ct)
    {
        foreach (var pluginDir in Directory.GetDirectories(_pluginDirectory))
        {
            var pluginName = Path.GetFileName(pluginDir);
            var assemblyPath = Path.Combine(pluginDir, $"{pluginName}.dll");

            if (!File.Exists(assemblyPath)) continue;

            await LoadPluginAsync(pluginName, assemblyPath, ct);
        }
    }

    private async Task LoadPluginAsync(string name, string assemblyPath, CancellationToken ct)
    {
        // Unload previous version if present
        if (_plugins.TryGetValue(name, out var existing))
        {
            existing.Context.Unload();
            _plugins.Remove(name);

            // Allow GC to collect the old context before loading the new one
            for (var i = 0; i < 5; i++)
            {
                GC.Collect();
                GC.WaitForPendingFinalizers();
            }
        }

        var context = new PluginLoadContext(assemblyPath);
        var assembly = context.LoadFromAssemblyPath(assemblyPath);
        var extensionType = assembly.GetType($"{name}.{name}Entry", throwOnError: true)!;

        if (!typeof(IRuntimeExtension).IsAssignableFrom(extensionType))
        {
            context.Unload();
            throw new InvalidOperationException(
                $"Plugin '{name}' entry type does not implement IRuntimeExtension.");
        }

        var extension = (IRuntimeExtension)Activator.CreateInstance(extensionType)!;
        _plugins[name] = (context, extension);
        await extension.ExecuteAsync(ct);
    }
}
```

The critical details: the old context is unloaded and GC-forced before the new one is created, the host removes its own reference to the old extension (from `_plugins`), and the contract type `IRuntimeExtension` is defined in a shared assembly that both host and plugins reference — crucially, the same assembly instance, not a copy loaded into each context. If the shared contract assembly is loaded into each plugin context separately, `IsAssignableFrom` returns false and the cast fails with an `InvalidCastException`, even though the source code is identical. This is resolved by having the host load the contract assembly into the default context and configuring the plugin context to resolve it from the default rather than loading a duplicate:

```csharp
protected override Assembly? Load(AssemblyName assemblyName)
{
    if (assemblyName.Name == "SharedContracts")
    {
        return null; // Let the default context resolve it
    }
    var assemblyPath = _resolver.ResolveAssemblyToPath(assemblyName);
    return assemblyPath is null ? null : LoadFromAssemblyPath(assemblyPath);
}
```

`AssemblyLoadContext` provides the mechanism for dependency isolation and unloading, but it does not remove the need for reference discipline. Extensibility architectures require explicit lifecycle management — the host should avoid storing arbitrary plugin instances, delegates, or event subscriptions in long-lived global state unless it also has a teardown path.

Assembly loading spans two concerns simultaneously: dependency resolution (which assemblies are loaded, from where, in which versions) and lifetime management (when can loaded assemblies and their types be safely unloaded). Understanding both is necessary for any system that extends its behavior at runtime.
