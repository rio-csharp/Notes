# IL, JIT, ReadyToRun, And Native AOT

The previous chapter established the default execution path: C# compiles to IL, assemblies are loaded, methods are JIT-compiled on first invocation. This chapter examines how .NET can shift compilation work between build time, publish time, and runtime — and what engineering trade-offs each strategy introduces.

## IL And Metadata

Intermediate Language (IL) is the CPU-independent instruction set that the Roslyn compiler produces from C# source. An assembly is not a native binary; it is a container of IL instructions and metadata.

```csharp
public static int Add(int left, int right)
{
    return left + right;
}
```

The conceptual IL for this method is straightforward:

```text
load first argument
load second argument
add
return
```

IL's design serves several engineering purposes simultaneously. It enables language interoperability — F#, Visual Basic, and C# all compile to IL that the same runtime can execute. It defers architecture-specific optimization to the JIT, which can target the exact CPU features of the current machine. It preserves metadata that enables reflection, diagnostics, and tooling. And it provides platform flexibility — the same IL runs on Windows, Linux, and macOS without recompilation.

Metadata is the descriptive layer stored alongside IL. It records type names, method signatures, parameters, return types, attributes, referenced assemblies, and generic type information. When code applies `[Obsolete]` to a method, that attribute is stored as metadata — tools and frameworks inspect it later independently of the IL.

## JIT Compilation

JIT compilation translates IL to native code when a method is first invoked. The compiled code is stored in process memory and reused for subsequent calls. When the process exits, the generated native code is discarded — a new process JITs again.

The cold-start cost is measurable: the first invocation of a method pays compilation overhead, and later invocations in the same process do not. Startup latency and steady-state throughput are separate performance concerns.

```csharp
using System.Diagnostics;

static int Work(int value) => value * 2;

var first = Stopwatch.StartNew();
Work(1);
first.Stop();

var repeated = Stopwatch.StartNew();
for (var i = 0; i < 10_000_000; i++)
    Work(i);
repeated.Stop();

Console.WriteLine($"First call ticks: {first.ElapsedTicks}");
Console.WriteLine($"Repeated calls ms: {repeated.ElapsedMilliseconds}");
```

A single measurement is not a precise benchmark — modern runtimes apply multi-tier compilation, on-stack replacement, and dynamic profile-guided optimization that mask simple timing. The structural fact being demonstrated is that first-use cost exists, and the runtime handles it transparently for subsequent calls.

For a realistic order-of-magnitude comparison across strategies, a medium-sized ASP.NET Core application (roughly 50 controllers, 200 endpoints, EF Core, standard middleware) on .NET 9, measured on a typical cloud VM (4 vCPU, 8 GB):

| Strategy | First request (cold) | Steady-state (warm) | Publish size |
|---|---|---|---|
| Default JIT | 800–1200 ms | 5–15 ms | ~10 MB |
| ReadyToRun | 200–400 ms | 5–15 ms | ~15–20 MB |
| Native AOT | 50–150 ms | 3–8 ms | ~25–35 MB (self-contained) |

These are illustrative ranges, not benchmarks — actual numbers depend on code size, dependency graph, and hardware. The structural relationship is what matters: ReadyToRun cuts cold-start JIT cost roughly in half at the price of larger binaries; Native AOT eliminates JIT entirely but requires self-contained publishing and restricts runtime dynamism.

## Tiered Compilation

Tiered compilation splits JIT work into two phases. Tier 0 compiles quickly with minimal optimization, prioritizing startup speed. Once the runtime observes that a method is frequently executed (via call-count thresholds and other heuristics), it recompiles the method at Tier 1 with aggressive optimizations for throughput. The transition from Tier 0 to Tier 1 is transparent — the runtime patches the call site so subsequent invocations use the optimized code.

```text
Tier 0: quick compilation, lower optimization, fast startup
Tier 1: recompile hot methods, higher optimization, better throughput
```

On-stack replacement (OSR) extends tiered compilation to long-running methods. Without OSR, a method that enters a long loop in Tier 0 code cannot be recompiled until the next invocation. With OSR (enabled by default in .NET 9), the runtime can compile a Tier 1 version of the loop body and redirect execution mid-method. This matters for applications with long-running startup logic: OSR allows the runtime to optimize hot paths without waiting for method boundaries.

The first few requests after deployment do not represent steady-state performance. Warm-up procedures, realistic load testing, and p95/p99 latency measurements are more informative than single-request benchmarks.

In modern .NET, tiered compilation is enabled by default. It can be made explicit through runtime configuration for controlled testing:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.Runtime.TieredCompilation": true,
      "System.Runtime.TieredCompilation.QuickJit": true
    }
  }
}
```

Most teams never toggle these settings. Their value lies in knowing that the startup-to-throughput transition is a real runtime policy, not merely a conceptual tendency — and that measurements should account for the warm-up period during which Tier 0 code is still active.

## ReadyToRun

ReadyToRun (R2R) precompiles a portion of IL to native code at publish time, reducing the JIT work that must happen on first invocation. The trade-off is larger assembly size and the possibility that some methods still require runtime JIT — generic instantiations, dynamic methods, and hot paths that tiered compilation may recompile.

```bash
dotnet publish -c Release -p:PublishReadyToRun=true
```

Or as a project default:

```xml
<PropertyGroup>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>
```

ReadyToRun is a middle ground. It reduces cold-start JIT cost without requiring the application to give up reflection, dynamic loading, or standard library compatibility. A medium-sized ASP.NET Core service in a container platform where cold pods take too long to become ready often benefits from ReadyToRun as a first publishing change. Verification is comparative: publish with and without R2R, measure cold-start behavior, and compare output size and startup traces under identical deployment conditions.

## Native AOT

Native AOT compiles the entire application ahead of time to a platform-specific native executable. The runtime is largely eliminated from the startup path — there is no JIT, and the executable loads and begins execution directly.

```bash
dotnet publish -c Release -p:PublishAot=true
```

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
</PropertyGroup>
```

Native AOT delivers very fast startup and reduced runtime footprint. It is well-suited to CLI tools, serverless functions, and small services where cold-start latency or package size is a primary constraint.

The cost is reduced runtime dynamism. Native AOT depends on the build pipeline understanding the complete application shape at publish time. Reflection, dynamic type loading, and runtime code generation become constrained because the compiler cannot prove that dynamically-discovered code paths will exist in the final output.

```csharp
// Predictable at build time — AOT-friendly
builder.Services.AddScoped<IOrderHandler, OrderHandler>();

// Runtime type discovery — fragile under AOT
var typeName = configuration["HandlerType"];
var type = Type.GetType(typeName!);
var handler = Activator.CreateInstance(type!);
```

The second pattern is not incorrect, but it shifts design toward runtime discovery and away from publish-time predictability. Native AOT requires the application code to be explicit enough that the build tooling can trace every code path and preserve every required type.

### NativeAOT Limitations in .NET 9

Native AOT in .NET 9 has specific constraints beyond the general reflection limitation:

- **No `Assembly.Load`** — assemblies cannot be loaded dynamically from files or byte arrays. All code must be known at publish time.
- **No `System.Reflection.Emit`** — `DynamicMethod`, `MethodBuilder`, `TypeBuilder`, and expression-tree compilation to delegates all depend on runtime IL generation. `Expression<T>.Compile()` falls back to interpretation mode, which is significantly slower than JIT-compiled delegates.
- **Limited `MakeGenericType`/`MakeGenericMethod`** — generic instantiation works for type parameters that the static analysis can trace. A `Dictionary<string, T>` instantiated for a type `T` resolved at runtime via `Type.GetType` may fail because the AOT compiler did not pre-generate that instantiation.
- **`Assembly.Location` returns empty string** — the concept of "the assembly file on disk" does not exist in a native executable.

The NativeAOT publish output includes trim warnings that identify code patterns the compiler cannot prove are safe. Running with `<PublishAot>true</PublishAot>` and `<TrimmerSingleWarn>false</TrimmerSingleWarn>` produces per-location warnings:

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <TrimmerSingleWarn>false</TrimmerSingleWarn>
</PropertyGroup>
```

A typical warning from a reflection-dependent path:

```text
ILC: Trim analysis warning IL2026: Program.GetHandler():
  Using member 'Type.GetType(String)' which has 'RequiresUnreferencedCodeAttribute'
  can break functionality when trimming application code.
```

Each warning must be resolved by either annotating the calling code with `[RequiresUnreferencedCode]` (accepting the risk), suppressing via `[UnconditionalSuppressMessage]` (if the path is provably safe), replacing reflection with source generation, or excluding the application from NativeAOT.

## Trimming

Trimming removes unused code during publish to reduce output size. It is closely related to Native AOT because both require the build process to determine what code and metadata the application needs.

```bash
dotnet publish -c Release -p:PublishTrimmed=true
```

```xml
<PropertyGroup>
  <PublishTrimmed>true</PublishTrimmed>
</PropertyGroup>
```

Trimming works best when code paths are statically visible. Runtime type discovery via `Type.GetType` is fragile under trimming because the trimmer cannot determine that the dynamically-named type must be preserved. The .NET trimmer uses static analysis to trace reachable code from the application entry point; any type, method, or metadata reachable only through reflection is at risk of removal.

Publish-time warnings are the primary verification mechanism. A warning means the build pipeline cannot prove that a runtime-discovered code path or metadata dependency will survive publish. For example, enabling trim warnings produces output like:

```text
warning IL2072: Program.Main(): 'type.GetMethod("Process")'
  'type' argument does not satisfy 'DynamicallyAccessedMemberTypes.PublicMethods' in call to
  'System.Type.GetMethod(String)'. The parameter 'type' of method 'Program.Main()'
  does not have matching annotations.
```

Resolution strategies are the same as for Native AOT: annotate with `[DynamicallyAccessedMembers]` to inform the trimmer, use `[RequiresUnreferencedCode]` to document risk, replace reflection with source-generator alternatives, or suppress with `[UnconditionalSuppressMessage]` when the path is provably safe. Teams verify safety by publishing with trimming enabled, running representative request flows, and confirming no trim-related runtime failures occur.

## Choosing A Compilation Strategy

| Strategy | Best For | Primary Trade-off |
|---|---|---|
| JIT (default) | Server APIs, dynamic frameworks, broad compatibility | Startup JIT cost |
| ReadyToRun | Faster startup with full .NET compatibility | Larger binaries, partial JIT still possible |
| Native AOT | CLI tools, serverless, small services | Limited reflection and dynamic code generation |
| Trimming | Reduced deployment size | Same static-analysis constraints as AOT |

The decision depends on workload characteristics, not abstract preference. Short-lived CLI tools prioritize startup above all else. Serverless functions care about cold start and package size. Long-running APIs care about compatibility and steady-state throughput more than a small first-request penalty. Plugin-heavy or reflection-heavy systems may require architectural changes before Native AOT or aggressive trimming are practical options.

JIT-generated native code is scoped to the running process; ReadyToRun and Native AOT move compilation work to publish time so cold-start behavior becomes more predictable. The engineering decision is not "JIT versus AOT" in isolation, but which strategy fits the application's startup sensitivity, dynamism requirements, and operational constraints — measured against the actual workload.
