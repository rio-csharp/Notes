# .NET Execution Model

## Core Idea

The .NET execution model explains how C# code becomes running machine code.

This chapter focuses on the path from source code to executing instructions. It is intentionally narrower than the next chapter. Here the concern is execution flow. The next chapter concentrates on alternative compilation and publishing strategies such as ReadyToRun, trimming, and Native AOT.

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

- `Assembly`: compiled `.dll` or `.exe` containing IL and metadata.
- `Managed code`: code executed under CLR control.
- `Native code`: machine code executed directly by CPU.

## Operational Significance

Understanding the execution model helps explain runtime behavior:

- why build artifacts are IL and metadata instead of final CPU-specific binaries;
- why startup and steady-state performance can differ;
- why runtime services such as JIT and GC affect application behavior even when the source code does not change;
- why deployment choices can change startup characteristics.

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

If you inspect build output after:

```bash
dotnet build
```

you will typically see assemblies such as:

```text
bin/Release/net8.0/RuntimeDemo.dll
bin/Release/net8.0/RuntimeDemo.pdb
bin/Release/net8.0/RuntimeDemo.deps.json
bin/Release/net8.0/RuntimeDemo.runtimeconfig.json
```

That file set helps reinforce the model. The assembly contains IL and metadata. The `.deps.json` and `.runtimeconfig.json` files help the runtime determine dependencies and framework requirements when the application starts.

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
- extensibility scenarios may use custom `AssemblyLoadContext`;
- dynamic loading requires careful reference management if unloadability matters.

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

JIT compilation is per-process. Resource changes affect runtime behavior, especially GC and scheduling, but already generated method code is not generally regenerated just because the VM now has more CPU or memory.

In real services, this often appears as a cold-start versus warm-process difference. The first request after process start may pay:

- host startup;
- assembly loading;
- first-use JIT compilation;
- dependency graph initialization;
- cache warm-up inside the application.

Later requests usually avoid much of that first-use work, which is why startup latency and steady-state throughput should be measured separately.

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

For example:

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

In C#, a local variable of reference type usually stores a reference in the stack frame, while the object itself is allocated on the managed heap. Value types can be stored inline, but exact placement depends on context, such as fields, arrays, closures, boxing, and JIT optimizations.

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

A closure makes this more concrete:

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

## Object Lifetime And Reachability

Object lifetime in .NET depends on reachability rather than lexical scope alone.

If a reference to an object remains reachable from a GC root, the object can stay alive even after the local variable that first referenced it has gone out of scope.

For example:

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

After `Demo` returns, the local variable `user` is gone, but the static field `UserCache.Current` still references the object. The object remains reachable and therefore stays alive.

The dedicated garbage collection chapter covers generations, heap segments, leaks, pause behavior, and memory diagnostics in detail.

## Async As Part Of Runtime Execution

`async/await` does not automatically create a new thread. Instead, it changes how the runtime schedules work and continuations.

For I/O-bound work, the current thread can return to the thread pool while the operation is waiting externally, and the continuation can be scheduled later when the work completes.

```csharp
public async Task<string> DownloadAsync(HttpClient client, CancellationToken ct)
{
    return await client.GetStringAsync("https://example.com", ct);
}
```

This matters in the execution model because runtime behavior is not only about native code generation. It is also about scheduling, continuation flow, and how managed execution cooperates with external I/O.

Another concrete example is file processing. Compare:

```csharp
var bytes = await File.ReadAllBytesAsync(path, ct);
```

with:

```csharp
await using var stream = File.OpenRead(path);
```

Both may succeed functionally, but they produce very different execution characteristics. The first tends to allocate one large buffer and can increase heap pressure. The second streams work through a disposable resource boundary and often cooperates better with memory limits.

## Relationship To Publishing Strategy

The model in this chapter describes the default path: source code becomes IL and metadata, assemblies are loaded, methods are compiled to native code, and the runtime executes them inside the process. The next chapter changes the question from "how does code execute?" to "how much of that work happens at runtime versus publish time?"

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

Then publish and compare startup behavior or output characteristics in the next chapter, which focuses specifically on JIT, ReadyToRun, and Native AOT.
