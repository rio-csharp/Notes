# .NET Execution Model

## What This Topic Means

The .NET execution model explains how C# code becomes running machine code.

High-level flow:

```text
C# source code
  -> Roslyn compiler
  -> IL + metadata inside assembly
  -> CLR loads assembly
  -> JIT compiles IL to native machine code
  -> CPU executes native code
```

Important terms:

- `IL` / `CIL` / `MSIL`: Intermediate Language（中间语言）.
- `CLR`: Common Language Runtime（公共语言运行时）.
- `JIT`: Just-In-Time compilation（即时编译）.
- `Assembly`: compiled `.dll` or `.exe` containing IL and metadata.
- `Managed code`: code executed under CLR control.
- `Native code`: machine code executed directly by CPU.

## Why This Matters

Understanding the execution model helps explain runtime behavior:

- why first request can be slower;
- why reflection has overhead;
- why generics behave differently in .NET compared with Java;
- why GC can pause execution;
- why async code still uses threads at certain points;
- why deployment options like ReadyToRun or Native AOT matter.

## Compilation Flow

### Step 1: C# To IL

Example C#:

```csharp
public static int Add(int a, int b)
{
    return a + b;
}
```

The compiler does not directly create CPU-specific machine code. It creates IL and metadata.

Metadata includes:

- type names;
- method signatures;
- attributes;
- referenced assemblies;
- generic type information.

This is why .NET supports reflection.

Try this small program:

```csharp
public static class Calculator
{
    public static int Add(int left, int right)
    {
        return left + right;
    }
}

Console.WriteLine(Calculator.Add(2, 3));
```

The important point is not the `Add` method itself. The important point is that the C# compiler records both executable IL and metadata describing `Calculator`, `Add`, parameters, return type, and referenced assemblies.

### Step 2: Assembly Loading

When the application runs, CLR loads assemblies. In modern .NET, loading is handled by `AssemblyLoadContext`.

Key points:

- multiple versions of assemblies can be difficult to manage;
- plugins may use custom `AssemblyLoadContext`;
- dynamic loading can cause memory leaks if contexts are not unloaded properly.

### Step 3: JIT Compilation

JIT compiles IL to native code when a method is executed.

Key details:

- The first call may be slower because compilation happens then.
- Subsequent calls reuse compiled native code.
- JIT can optimize based on the current CPU architecture.
- Tiered compilation can first generate quick code, then optimize hot methods later.

JIT caching scope:

> JIT-compiled native code is normally reused inside the same process. If the process exits, that generated native code is gone. A new process will JIT again unless precompiled code such as ReadyToRun or Native AOT is used.

VM/container resource changes:

> Increasing CPU or memory for a VM does not usually cause all already-JIT-compiled methods to be recompiled immediately. More CPU mainly affects parallelism, thread scheduling, thread pool behavior, and server GC capacity. More memory mainly affects GC pressure and memory limits. Restarting the process lets the runtime initialize under the new environment.

Clear wording:

> JIT compilation is per-process. Resource changes affect runtime behavior, especially GC and scheduling, but already generated method code is not generally regenerated just because the VM now has more CPU or memory.

## ReadyToRun And Native AOT

This file gives the runtime path at a high level. The next file, `04-jit-aot-il.md`, focuses more deeply on IL, JIT, ReadyToRun, Native AOT, and their trade-offs.

### ReadyToRun

ReadyToRun precompiles some IL into native code before runtime.

Benefits:

- faster startup;
- less JIT work.

Trade-offs:

- larger binaries;
- less runtime-specific optimization than JIT.

### Native AOT

Native AOT compiles the app ahead of time into native code.

Benefits:

- very fast startup;
- smaller runtime dependency;
- good for CLI tools, serverless, small services.

Trade-offs:

- reflection needs special care;
- dynamic code generation is limited;
- not every library works perfectly.

## Stack And Heap

The stack is used for method calls and local value data.

The heap is used for objects managed by GC.

More precise mental model:

```text
Stack frame:
  local variables
  method call information
  references to heap objects

Managed heap:
  objects created with new
  arrays
  boxed values
  closure objects
```

Example:

```csharp
public class User
{
    public string Name { get; set; } = "";
}

public static void Demo()
{
    int age = 30;              // value stored in stack frame
    User user = new User();    // reference on stack, object on heap
    user.Name = "Alice";       // string object also lives on heap
}
```

Practical explanation:

> In C#, a local variable of reference type usually stores a reference in the stack frame, while the object itself is allocated on the managed heap. Value types can be stored inline, but exact placement depends on context, such as fields, arrays, closures, boxing, and JIT optimizations.

Concrete examples:

```csharp
public sealed class Order
{
    public int Count { get; set; } // int stored inline inside the heap object
}

public static void Demo()
{
    int local = 10;                // usually in stack frame or optimized register
    var order = new Order();       // reference local, object on heap
    int[] numbers = [1, 2, 3];     // reference local, array object on heap
    object boxed = local;          // boxed int copied into a heap object
}
```

Closure example:

```csharp
public static Func<int> CreateCounter()
{
    int count = 0;

    return () =>
    {
        count++;
        return count;
    };
}
```

The lambda can run after `CreateCounter` returns, so `count` cannot behave like an ordinary stack-only local. The compiler creates a closure object so the captured value can live longer.

## Garbage Collection

GC automatically reclaims objects that are no longer reachable.

Core concepts:

- GC roots（GC 根）;
- Gen 0, Gen 1, Gen 2;
- Large Object Heap;
- finalization;
- `IDisposable`;
- allocation pressure;
- memory leak in managed code.

Important nuance:

Managed code can still leak memory if objects remain referenced.

Example:

```csharp
public class EventLeak
{
    public event Action? SomethingHappened;

    public void Subscribe(Action handler)
    {
        SomethingHappened += handler;
    }
}
```

If a long-lived object keeps event handlers referencing short-lived objects, those objects cannot be collected.

Reachability example:

```csharp
public static class UserCache
{
    public static User? Current;
}

public sealed class User
{
    public string Name { get; set; } = "";
}

public static void Demo()
{
    var user = new User { Name = "Alice" };
    UserCache.Current = user;
}
```

After `Demo` returns, the local variable `user` is gone, but the static field `UserCache.Current` still references the object. The object is reachable from a GC root, so GC cannot collect it.

## Async Execution Model

`async/await` does not mean a new thread is created.

For I/O-bound work:

```csharp
public async Task<string> DownloadAsync(HttpClient client)
{
    return await client.GetStringAsync("https://example.com");
}
```

The thread can return to the thread pool while the I/O operation is pending. When the operation completes, the continuation is scheduled.

Bad blocking version:

```csharp
public string DownloadBlocking(HttpClient client)
{
    return client.GetStringAsync("https://example.com").Result;
}
```

Why this is bad:

> The thread is blocked while waiting. In server applications, enough blocked threads can cause thread pool starvation and high latency.

Better version:

```csharp
public async Task<string> DownloadAsync(HttpClient client, CancellationToken ct)
{
    return await client.GetStringAsync("https://example.com", ct);
}
```

Important terms:

- async state machine;
- continuation;
- `SynchronizationContext`;
- `TaskScheduler`;
- thread pool.

## Practical Demo

Create a console app:

```bash
dotnet new console -n RuntimeDemo
cd RuntimeDemo
```

Program:

```csharp
using System.Diagnostics;

static int Add(int a, int b) => a + b;

var sw = Stopwatch.StartNew();
for (int i = 0; i < 1_000_000; i++)
{
    Add(i, i);
}
sw.Stop();

Console.WriteLine($"Elapsed: {sw.ElapsedMilliseconds}ms");
Console.WriteLine($"Process: {Environment.ProcessId}");
Console.WriteLine($".NET version: {Environment.Version}");
```

Run:

```bash
dotnet run -c Release
```

Then publish:

```bash
dotnet publish -c Release
dotnet publish -c Release -p:PublishReadyToRun=true
```

Compare startup and output size.

## Review Questions

### What happens when C# code runs?

Detailed explanation:

> C# is compiled by Roslyn into IL and metadata inside an assembly. At runtime, the CLR loads the assembly, verifies types, manages memory and exceptions, and JIT-compiles IL methods into native machine code when needed. The CPU executes that native code. GC manages heap memory, and the runtime also provides services like reflection, thread pool, and exception handling.

### Is C# interpreted?

Good answer:

> Normally no. C# is compiled to IL first, then IL is JIT-compiled to native machine code. There are also ahead-of-time options like ReadyToRun and Native AOT.

### Why can reflection be slower?

Answer:

> Reflection reads metadata and often resolves members dynamically at runtime. It bypasses some compile-time checks and may involve dynamic invocation, boxing, and access checks. For hot paths, cached delegates or generated code are usually faster.

### What happens if CPU or memory changes after JIT?

> Existing JIT-generated code is usually reused in the current process. More CPU can improve parallelism and thread scheduling. More memory can reduce GC pressure. The runtime does not normally recompile every method only because VM resources changed. Restarting the process or tiered compilation can produce different optimized code paths.

## Common Mistakes

### Mistake: "C# directly compiles to machine code."

Why it is wrong:

> In normal .NET execution, C# compiles to IL and metadata first. The CLR loads the assembly, then the JIT compiles IL methods into native machine code at runtime. Native AOT is a special deployment model, not the default mental model.

Better answer:

> C# usually compiles to IL, then the CLR JIT-compiles IL to native code when methods run.

### Mistake: "All value types are always on the stack."

Why it is wrong:

> Value type placement depends on context. A value type can be stored inside an object on the heap, inside an array, boxed into an object, captured by a closure, or optimized by the JIT.

Better answer:

> Value types have value semantics, but their physical storage location depends on where and how they are used.

### Mistake: "Async creates a new thread."

Why it is wrong:

> For I/O-bound work, `await` usually lets the current thread return to the thread pool while the operating system waits for I/O completion. When the I/O finishes, the continuation is scheduled. A new thread is not automatically created for every async operation.

Better answer:

> `async/await` is about non-blocking asynchronous control flow. It may use thread pool threads for continuations, but it does not mean "start a new thread."

### Mistake: "The .NET SDK and .NET Runtime are the same."

Why it is wrong:

> The SDK contains tools for building and publishing apps, such as the compiler and CLI. The runtime is what is needed to run an already-built app.

Better answer:

> Developers usually install the SDK. Production servers may only need the runtime unless they build code on the server.

### Mistake: "GC prevents all memory leaks."

Why it is wrong:

> GC can collect unreachable managed objects, but it cannot collect objects that are still referenced. Long-lived collections, static references, event subscriptions, caches without eviction, and unclosed unmanaged resources can still cause memory problems.

Better answer:

> GC prevents many manual memory management bugs, but managed applications can still leak memory through unintended references or unmanaged resources.

## Deeper Checks

### How does tiered compilation improve performance?

> Tiered compilation starts by generating code quickly so startup is faster. If a method becomes hot, the runtime can recompile it with stronger optimizations later. This balances startup time and long-running performance.

### When would you consider Native AOT?

> I would consider Native AOT for CLI tools, serverless functions, small services, or workloads where startup time, memory footprint, and deployment size matter. I would be careful if the app depends heavily on reflection, dynamic loading, runtime code generation, or libraries that are not AOT-friendly.

### Why can reflection-heavy libraries have issues with Native AOT?

> Native AOT needs to know what code and metadata to keep at publish time. Reflection-heavy code may access types or members dynamically, so the compiler may trim metadata that the app later expects. Those members need explicit configuration, source generation, or a different library approach.

### How does GC affect latency-sensitive services?

> GC can pause managed threads to collect and compact memory. In latency-sensitive services, allocation rate, large object allocations, Gen 2 collections, and memory pressure can increase tail latency. The practical fix is to measure allocation hot spots, reduce unnecessary allocations, tune runtime settings only when needed, and load test.

### How would you investigate high memory usage in a .NET service?

> I would first check whether memory is steadily growing or stabilizing. Then I would inspect metrics, GC counters, allocation rate, heap dumps, top object types, large object heap usage, caches, event subscriptions, static references, and recent deployments. I would also check container memory limits if running in Docker or Kubernetes.
