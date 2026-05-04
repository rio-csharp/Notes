# IL, JIT, ReadyToRun, And Native AOT

## Core Idea

C# normally compiles to Intermediate Language (IL), not directly to machine code. At runtime, the CLR compiles IL to native machine code using JIT.

Chinese notes:

- `IL`: Intermediate Language, 中间语言.
- `JIT`: Just-In-Time, 即时编译.
- `AOT`: Ahead-of-Time, 预先编译.

## IL

IL is CPU-independent intermediate code.

Benefits:

- language interoperability;
- runtime optimization;
- metadata support;
- platform flexibility.

Example flow:

```text
C# -> IL -> JIT -> native machine code
```

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

Example:

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

Benefits:

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

This is why a cold start can be slower than later requests.

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

Mental model:

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

Pros:

- faster startup;
- less JIT work.

Cons:

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

## Native AOT

Native AOT compiles the app ahead of time to a native executable.

Pros:

- very fast startup;
- smaller runtime footprint;
- useful for serverless, CLI, small services.

Cons:

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

Key takeaway:

> JIT gives the most runtime flexibility. ReadyToRun moves some compilation earlier. Trimming and Native AOT move more decisions to publish time, which improves startup and size but requires more explicit code.

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

Scenario:

```text
Our serverless .NET function cold start is too slow. What can we do?
```

Detailed explanation:

> I would first measure cold start and separate platform startup, app initialization, dependency loading, and first request JIT. Then I would reduce startup work, avoid heavy reflection, trim dependencies, consider ReadyToRun or Native AOT if compatible, and verify with realistic deployment measurements.

## Review Questions

### Does C# compile to machine code?

> Usually C# first compiles to IL. Then the CLR JIT-compiles IL into native machine code at runtime. There are also AOT options like ReadyToRun and Native AOT.

### When would you use Native AOT?

> I would consider it for fast-startup services, CLI tools, serverless functions, or small services where reflection-heavy libraries are controlled.

### Why can Native AOT break some libraries?

> Libraries that depend heavily on reflection, dynamic loading, or runtime code generation may need extra configuration or may not work well with Native AOT.

### Does JIT compile every method at startup?

> Usually no. JIT compiles methods when they are first executed. This reduces startup work but means first use of a method may pay compilation cost.

### Does JIT code survive process restart?

> Normally no. JIT-generated native code is stored for the current process. When the process exits, that generated code is gone. ReadyToRun and Native AOT are ways to move some compilation work earlier.

## Common Mistakes

### Mistake: Saying JIT means interpreted.

Why it is wrong:

> JIT compiles IL into native machine code at runtime. Interpreted code is executed by an interpreter without producing normal native method code in the same way.

Better answer:

> JIT means runtime compilation, not interpretation.

### Mistake: Assuming Native AOT is always better.

Why it is wrong:

> Native AOT can improve startup and reduce runtime dependency, but it can limit reflection, dynamic loading, and runtime code generation. It can also require more publish-time configuration.

Better answer:

> Native AOT is excellent for some workloads, but you choose it based on startup, memory, deployment, library compatibility, and dynamic feature needs.

### Mistake: Ignoring reflection limitations.

Why it is wrong:

> AOT and trimming may remove metadata that reflection-based code expects. Reflection-heavy libraries may fail unless metadata is preserved or source generation is used.

Better answer:

> For AOT, prefer source-generation-friendly libraries and explicitly preserve required metadata.

### Mistake: Not measuring startup vs throughput trade-offs.

Why it is wrong:

> ReadyToRun or AOT can improve startup but may not always improve steady-state throughput. JIT can optimize hot methods at runtime with tiered compilation.

Better answer:

> Measure startup, p95 latency, memory, binary size, and throughput before deciding.
