# .NET Execution Model

The .NET execution model describes the path from C# source code to executing machine instructions. This chapter covers the default compilation and execution pipeline. Alternative strategies — ReadyToRun, trimming, and Native AOT — are covered in the next chapter.

## Compilation Flow

```text
C# source code
  Roslyn compiler
  IL + metadata inside assembly (.dll / .exe)
  CLR loads assembly
  JIT compiles IL to native machine code
  CPU executes native code
```

An **assembly** is a compiled `.dll` or `.exe` containing IL and metadata. **Managed code** executes under CLR control; **native code** runs directly on the CPU. The key structural property is that build output is IL and metadata rather than final CPU-specific binaries — which means the runtime, not the compiler, makes the final translation to machine code.

### C# To IL

The Roslyn compiler translates C# into IL and records metadata describing every type, method signature, attribute, referenced assembly, and generic type parameter. This metadata is what enables reflection — the runtime can inspect its own structure because the compiler preserved it.

```csharp
public static int Add(int a, int b)
{
    return a + b;
}
```

The compiler records both the IL instructions for `Add` and metadata describing the method name, parameters, and return type. After `dotnet build -c Release`, the output directory typically contains:

```text
bin/Release/net8.0/RuntimeDemo.dll
bin/Release/net8.0/RuntimeDemo.pdb
bin/Release/net8.0/RuntimeDemo.deps.json
bin/Release/net8.0/RuntimeDemo.runtimeconfig.json
```

The assembly (`RuntimeDemo.dll`) contains IL and metadata. The `.deps.json` file describes dependency assets. The `.runtimeconfig.json` file declares the target framework and runtime requirements. Release builds are preferred for understanding realistic runtime behavior — Debug builds include additional instrumentation that changes JIT optimization and startup characteristics.

### Assembly Loading

When the application starts, the CLR loads assemblies through `AssemblyLoadContext`. In modern .NET, the default load context resolves project references and NuGet packages automatically. Custom `AssemblyLoadContext` instances appear only in specialized scenarios: plugin systems, dependency isolation, or unloadable extensions. Managing multiple versions of the same assembly is inherently difficult; the runtime resolves one version per assembly identity by default, and deliberate isolation requires custom load contexts.

### JIT Compilation

JIT (Just-In-Time) compilation translates IL to native code when a method is first invoked. Several properties follow from this design:

- The first invocation of a method incurs compilation cost. Subsequent calls reuse the compiled native code.
- The JIT can optimize for the specific CPU architecture of the current machine.
- Tiered compilation generates quick code initially, then recompiles hot methods with more aggressive optimizations later.

JIT-compiled code lives inside the process. When the process exits, the generated native code is lost. A new process JITs again unless precompiled code (ReadyToRun or Native AOT) is used. Increasing CPU or memory on a VM does not cause already-compiled methods to regenerate — the new resources mainly affect parallelism, thread scheduling, and GC behavior. Restarting the process allows the runtime to initialize under the new environment.

The cold-start versus warm-process difference is measurable. In a representative ASP.NET Core service on .NET 9, the first request after process start can take 200–800 ms longer than a warm request, depending on the application size and dependency graph. This overhead comes from host startup, assembly loading, first-use JIT compilation, dependency-graph initialization, and application cache warm-up. Later requests avoid most of that cost. A measurement pattern that isolates cold-start behavior:

```bash
# Cold: start process, send first request
dotnet MyApp.dll &
sleep 2  # allow host/runtime startup
time curl -s http://localhost:5000/api/orders/1

# Warm: repeat without restarting
time curl -s http://localhost:5000/api/orders/1
```

The difference between these two timings is the first-use cost. Restarting the process restores the full cost — confirming that JIT compilation is per-process, not machine-global. In CI pipelines that measure startup time, each run must start a fresh process; reusing a warm process hides the cost the production deployment will pay.

## Stack And Heap

The .NET runtime partitions memory into two regions with different allocation and lifetime semantics.

The **stack** stores method call frames: local variables, parameters, return addresses, and references to heap objects. Allocation and deallocation are deterministic — a stack frame is created on method entry and released on return.

The **managed heap** stores objects created with `new`, arrays, boxed value types, and closure objects. Allocation is fast (a pointer bump in the common case), but deallocation is non-deterministic — the GC reclaims objects when they become unreachable, not when they go out of lexical scope.

```csharp
public class User
{
    public string Name { get; set; } = "";
}

public static void Demo()
{
    int age = 30;              // value stored in the stack frame
    User user = new User();    // reference on stack, object on managed heap
    user.Name = "Alice";       // string object also on managed heap
}
```

A local variable of reference type stores a reference in the stack frame; the object itself lives on the heap. Value types can be stored inline, but exact placement depends on context — fields, arrays, closures, boxing, and JIT optimizations all affect the final location:

```csharp
public sealed class Order
{
    public int Count { get; set; } // int stored inline inside the heap object
}

public static void Demo()
{
    int local = 10;                // stack frame or register (JIT decides)
    var order = new Order();       // reference local, object on heap
    int[] numbers = [1, 2, 3];     // reference local, array object on heap
    object boxed = local;          // boxed int copied into a heap object
}
```

Closures demonstrate the practical consequence of the stack/heap distinction. A lambda that captures a local variable must outlive the stack frame it was defined in:

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

The lambda can execute after `CreateCounter` returns, so `count` cannot remain a stack-only local. The compiler lifts it into a compiler-generated closure object on the heap. The underlying principle is that variable lifetime in .NET is governed by reachability, not lexical scope.

## Object Lifetime And Reachability

An object remains alive as long as a reachable reference points to it, regardless of whether the original local variable has gone out of scope.

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

After `Demo` returns, the local variable `user` no longer exists, but `UserCache.Current` still references the object. The object remains reachable from a GC root (the static field) and stays alive. The garbage collection chapter covers generations, heap segments, leaks, pause behavior, and memory diagnostics in detail.

## Async Execution

`async/await` changes how the runtime schedules work and continuations — it does not automatically create threads. For I/O-bound work, the calling thread returns to the thread pool while the operation waits externally. The continuation is scheduled when the I/O completes.

```csharp
public async Task<string> DownloadAsync(HttpClient client, CancellationToken ct)
{
    return await client.GetStringAsync("https://example.com", ct);
}
```

Async execution is part of the runtime model because scheduling and continuation flow are runtime behaviors, not just language syntax. The compiler generates a state machine; awaiters and schedulers decide where continuations run, commonly through the thread pool for server-side code.

File I/O demonstrates how execution characteristics depend on API choice:

```csharp
var bytes = await File.ReadAllBytesAsync(path, ct);
```

versus:

```csharp
await using var stream = File.OpenRead(path);
```

Both read the file successfully, but `ReadAllBytesAsync` allocates a single large buffer proportional to the file size and can spike heap pressure for large files — a 100 MB file produces a 100 MB byte array on the Large Object Heap. A streaming approach cooperates with memory limits by working through smaller buffers (typically 4 KB per read) and releasing them progressively. The distinction is an execution-model concern: same functional outcome, different runtime behavior.
