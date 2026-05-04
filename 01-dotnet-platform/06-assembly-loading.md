# Assembly Loading

## Core Idea

Assembly loading is how .NET finds and loads compiled assemblies at runtime.

Chinese notes:

- `assembly`: 程序集.
- `AssemblyLoadContext`: 程序集加载上下文.
- `plugin`: 插件.

## What Is An Assembly?

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

> The runtime can know what types, methods, and references exist without executing the code first. Reflection, DI, serialization, and plugin discovery rely on this metadata.

## Default Loading

Most applications use default assembly loading.

Example:

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
var assembly = Assembly.LoadFrom("plugins/MyPlugin.dll");
var type = assembly.GetType("MyPlugin.PluginEntry");
```

Use cases:

- plugin systems;
- scripting;
- modular applications;
- runtime extension.

Important security note:

> Loading an assembly means executing code from that assembly. Do not load untrusted plugin binaries into your process unless you have a clear sandboxing and trust model. `AssemblyLoadContext` is for loading and version isolation, not a full security sandbox.

Safer dynamic loading shape:

```csharp
var pluginPath = Path.GetFullPath("plugins/MyPlugin.dll");
var assembly = Assembly.LoadFrom(pluginPath);
var pluginType = assembly.GetType("MyPlugin.PluginEntry", throwOnError: true);

if (!typeof(IPlugin).IsAssignableFrom(pluginType))
{
    throw new InvalidOperationException("PluginEntry must implement IPlugin.");
}

var plugin = (IPlugin)Activator.CreateInstance(pluginType)!;
plugin.Execute();
```

This example shows two important practices:

- validate the loaded type;
- fail clearly when the plugin shape is wrong.

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

> Plugins often have their own dependencies. The resolver helps locate dependencies relative to the plugin instead of accidentally using the wrong version from the main application.

## Plugin Contract

A plugin system should define a small stable contract assembly.

Example:

```csharp
public interface IPlugin
{
    string Name { get; }
    Task ExecuteAsync(CancellationToken cancellationToken);
}
```

The host and plugin should both reference the contract assembly. The host can then load the plugin implementation without needing to know every concrete plugin type at compile time.

Keep the contract stable:

- avoid changing method signatures frequently;
- version the contract deliberately;
- pass simple DTOs instead of framework-heavy objects;
- define cancellation and error behavior.

## Version Conflicts

Common issue:

```text
Plugin A needs Library v1
Plugin B needs Library v2
```

Custom load contexts can help isolate dependencies.

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

    // Create and run plugin here.

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

- plugin instance still referenced;
- event handler still subscribed;
- background thread still running;
- static field holding plugin type/instance;
- delegate from plugin stored in host.

## Review Questions

### What is AssemblyLoadContext?

> `AssemblyLoadContext` controls assembly loading in modern .NET. It is useful for plugin systems, dependency isolation, and unloading dynamically loaded assemblies.

### Why can plugin systems leak memory?

> If objects, delegates, static references, or loaded types remain referenced, the collectible load context cannot be unloaded.

### What is in an assembly?

> IL, metadata, manifest, resources, and references to other assemblies.

### Default context vs custom context?

> The default context is used for normal application dependencies. A custom `AssemblyLoadContext` is useful when you need plugin isolation, custom dependency resolution, or unloading.

### Why do version conflicts happen?

> Two components may require different versions of the same dependency. If they share one load context, one version may be chosen and the other component may fail. Separate load contexts can isolate dependency graphs.

## Common Mistakes

### Mistake: Loading plugins into default context when isolation is required.

Why it is wrong:

> The default load context is shared by the application. Plugins loaded there are harder to isolate, unload, or version independently.

Better answer:

> Use a custom `AssemblyLoadContext` for plugin isolation and possible unloading.

### Mistake: Treating AssemblyLoadContext as a security sandbox.

Why it is wrong:

> A loaded assembly runs inside the process and can execute code with the process permissions. Load context isolation does not make untrusted code safe.

Better answer:

> Only load trusted plugins, or isolate untrusted code in a separate process/container with a restricted permission model.

### Mistake: Keeping references that prevent unloading.

Why it is wrong:

> An `AssemblyLoadContext` cannot unload if objects, types, delegates, threads, or static references from that context are still referenced.

Better answer:

> Remove references, stop plugin work, unsubscribe events, and verify unload with weak references if unloading matters.

### Mistake: Ignoring dependency version conflicts.

Why it is wrong:

> Different plugins may need different versions of the same dependency. Without isolation, one version can accidentally satisfy another plugin and cause runtime failures.

Better answer:

> Plan dependency resolution and isolate plugins that need independent dependency graphs.

### Mistake: Using reflection-heavy loading without error handling.

Why it is wrong:

> Dynamic loading can fail because files are missing, versions differ, types are absent, constructors throw, or permissions/configuration are wrong.

Better answer:

> Validate plugin metadata, handle load failures clearly, and log enough detail to diagnose version/type issues.
