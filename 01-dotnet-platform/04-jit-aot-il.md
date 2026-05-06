# IL, JIT, ReadyToRun, And Native AOT

## Core Idea

C# normally compiles to Intermediate Language (IL), not directly to machine code. The question in this chapter is not the basic execution path, which the previous chapter already established, but how .NET can shift compilation work between build time, publish time, and runtime.

## IL

IL is CPU-independent intermediate code.

Its value comes from several properties:

- language interoperability;
- runtime optimization;
- metadata support;
- platform flexibility.

Example C#:

```csharp
public static int Add(int left, int right)
{
    return left + right;
}
```

Conceptual IL shape:

```text
load first argument
load second argument
add
return
```

You do not need to memorize IL instructions for most engineering practice. What matters is the model:

> C# becomes IL plus metadata. The CLR can inspect metadata and JIT IL into native code for the current process and CPU architecture.

## Metadata

Assemblies do not only contain IL. They also contain metadata.

Metadata describes:

- types;
- methods;
- parameters;
- return types;
- attributes;
- referenced assemblies;
- generic type information.

For example:

```csharp
[Obsolete("Use AddNew instead.")]
public static int AddOld(int left, int right)
{
    return left + right;
}
```

The attribute is stored as metadata. Tools and frameworks can inspect it later.

## JIT Compilation

JIT compiles methods when needed.

Its value comes from several properties:

- optimized for current CPU;
- can optimize hot methods;
- supports dynamic runtime behavior.

Cost:

- first execution has compilation overhead.

Per-process behavior:

```text
Process starts
  -> method called first time
  -> JIT compiles method
  -> native code stored in process memory
  -> later calls reuse that native code
  -> process exits
  -> generated code is gone
```

This is why a cold start can be slower than later requests. The rest of the chapter asks how much of that first-use cost can be moved earlier.

Example benchmark shape:

```csharp
using System.Diagnostics;

static int Work(int value)
{
    return value * 2;
}

var first = Stopwatch.StartNew();
Work(1);
first.Stop();

var repeated = Stopwatch.StartNew();
for (var i = 0; i < 10_000_000; i++)
{
    Work(i);
}
repeated.Stop();

Console.WriteLine($"First call ticks: {first.ElapsedTicks}");
Console.WriteLine($"Repeated calls ms: {repeated.ElapsedMilliseconds}");
```

This is not a perfect JIT benchmark because modern runtimes optimize heavily, but it helps you see the idea of first-use cost vs repeated execution.

## Tiered Compilation

Tiered compilation allows the runtime to:

1. compile quickly first;
2. optimize hot methods later.

This improves startup and long-running performance.

The easiest mental model is:

```text
Tier 0:
  compile quickly
  lower optimization
  good for startup

Tier 1:
  optimize hot methods
  better for throughput
  used after runtime observes frequent execution
```

This matters for APIs because the first few requests after deployment may not represent steady-state performance. Warm-up, realistic load testing, and p95/p99 latency matter more than a single first request.

## ReadyToRun

ReadyToRun precompiles some code before runtime.

Publish:

```bash
dotnet publish -c Release -p:PublishReadyToRun=true
```

Operational advantages:

- faster startup;
- less JIT work.

Operational limitations:

- larger binaries;
- still may need JIT for some methods;
- less optimized than runtime JIT in some cases.

Why it may still need JIT:

- generic methods may need runtime-specific instantiations;
- dynamic methods cannot be fully known ahead of time;
- tiered compilation may replace precompiled code for hot paths;
- runtime can still choose optimized code based on actual execution.

Practical use:

> ReadyToRun is often useful when startup time matters but you still want normal .NET compatibility.

A realistic operational example is a medium-sized ASP.NET Core service in a container platform. If cold pods are taking too long to become ready, ReadyToRun may reduce some first-request JIT cost without forcing the team to give up reflection-heavy libraries or ordinary hosting patterns. It is not a universal win, but it is often one of the first publishing changes worth testing.

## Native AOT

Native AOT compiles the app ahead of time to a native executable.

Operational advantages:

- very fast startup;
- smaller runtime footprint;
- useful for serverless, CLI, small services.

Operational limitations:

- reflection limitations;
- dynamic code generation limitations;
- library compatibility issues.

Example publish:

```bash
dotnet publish -c Release -p:PublishAot=true
```

AOT-friendly code tends to be:

- explicit;
- less reflection-heavy;
- source-generator-friendly;
- less dependent on runtime type discovery.

For example, code shaped like this is more AOT-friendly:

```csharp
builder.Services.AddScoped<IOrderHandler, OrderHandler>();
```

while code shaped like this is more runtime-dynamic and therefore harder for trimming or AOT tooling to reason about:

```csharp
var typeName = configuration["HandlerType"];
var type = Type.GetType(typeName!);
var handler = Activator.CreateInstance(type!);
```

The second pattern is not automatically wrong. It simply shifts the design toward runtime discovery and away from publish-time predictability.

## Trimming

Trimming removes unused code during publish to reduce output size.

It is closely related to Native AOT because both require the build process to understand what code and metadata the application needs.

Example publish option:

```bash
dotnet publish -c Release -p:PublishTrimmed=true
```

Trimming works best when code paths are visible at build time.

Risky pattern:

```csharp
var typeName = configuration["HandlerType"];
var type = Type.GetType(typeName!);
var handler = Activator.CreateInstance(type!);
```

The trimmer may not know that the dynamically named type must be preserved.

More predictable pattern:

```csharp
builder.Services.AddScoped<IOrderHandler, OrderHandler>();
```

JIT gives the most runtime flexibility. ReadyToRun moves some compilation earlier. Trimming and Native AOT move more decisions to publish time, which can improve startup and footprint but requires more explicit code and a more predictable dependency model.

Reflection-sensitive example:

```csharp
var type = Type.GetType("MyApp.Features.OrderHandler");
var instance = Activator.CreateInstance(type!);
```

This can be fragile under trimming/AOT because the compiler may not know that `OrderHandler` must be preserved.

More AOT-friendly shape:

```csharp
builder.Services.AddScoped<IOrderHandler, OrderHandler>();
```

Here the type relationship is visible to the compiler and framework tooling.

## Comparison

```text
JIT:
  More flexible, runtime optimized, startup cost.

ReadyToRun:
  Faster startup, larger output, still partly runtime-dependent.

Native AOT:
  Very fast startup, less dynamic flexibility.
```

Decision table:

| Option | Best For | Main Trade-off |
| --- | --- | --- |
| JIT | normal ASP.NET Core apps, dynamic frameworks | startup JIT cost |
| ReadyToRun | faster startup with broad compatibility | larger output, partial JIT still possible |
| Native AOT | CLI, serverless, small services, fast cold start | reflection/dynamic limitations |

## Practical Scenario

Consider the following scenario:

```text
Our serverless .NET function cold start is too slow. What can we do?
```

> I would first measure cold start and separate platform startup, app initialization, dependency loading, and first request JIT. Then I would reduce startup work, avoid heavy reflection, trim dependencies, consider ReadyToRun or Native AOT if compatible, and verify with realistic deployment measurements.

This trade-off exists because C# usually does not compile straight to machine code. It first becomes IL, and then the CLR JIT-compiles that IL into native machine code at runtime. ReadyToRun and Native AOT move more of that compilation work to publish time.

Native AOT is most useful when fast startup, smaller runtime footprint, and simple deployment are especially valuable, such as in CLI tools, serverless functions, or small focused services. It becomes harder to adopt when the application or its dependencies rely heavily on reflection, dynamic loading, or runtime code generation.

JIT normally does not compile every method at startup. Methods are usually compiled when they are first executed, which reduces startup work but means first use can pay a compilation cost.

JIT-generated native code is scoped to the running process. Once the process exits, that generated code is gone. ReadyToRun and Native AOT exist specifically to move more of that work earlier so cold-start behavior becomes more predictable. The real engineering decision is therefore not "JIT versus AOT" in the abstract, but which compilation strategy fits the application's startup sensitivity, dynamism requirements, and operational constraints.

That is why these publishing choices should be measured in the context of the actual workload:

- short-lived CLI tools care heavily about startup;
- serverless functions care about cold start and package size;
- long-running APIs may care more about compatibility and steady-state throughput than about a small first-request penalty;
- plugin-heavy or reflection-heavy systems may not be good Native AOT candidates without architectural change.
