# .NET Garbage Collection

## Core Idea

Garbage Collection (GC) automatically manages memory for managed objects in .NET.

Chinese notes:

- `Garbage Collection`: 垃圾回收.
- `managed heap`: 托管堆.
- `GC root`: GC 根对象.
- `allocation pressure`: 分配压力.

GC answers one main question:

> Which objects are still reachable, and which objects can be reclaimed?

## Managed Heap

When you create an object:

```csharp
var user = new User { Name = "Alice" };
```

the object usually lives on the managed heap. The variable `user` holds a reference.

GC tracks object reachability from roots such as:

- local variables on active stacks;
- static fields;
- CPU registers;
- GC handles;
- finalization queue.

If an object cannot be reached from any root, it is eligible for collection.

Reachability diagram:

```text
GC roots
  -> local variable user
      -> User object
          -> Address object

Result:
  User and Address are reachable, so GC keeps them.
```

Unreachable diagram:

```text
GC roots

User object
  -> Address object

Result:
  no root can reach User, so User and Address are eligible for collection.
```

Important wording:

> Eligible for collection does not mean immediately collected. It means GC is allowed to reclaim it during a future collection.

## Generations

.NET GC uses generations:

- Gen 0: short-lived objects;
- Gen 1: buffer between short and long-lived;
- Gen 2: long-lived objects;
- LOH: Large Object Heap.

Why generations exist:

Most objects die young.

Example:

```csharp
public string BuildMessage(string name)
{
    return $"Hello, {name}";
}
```

Temporary strings may become Gen 0 garbage quickly.

Example of short-lived allocations:

```csharp
public string BuildCsvLine(Order order)
{
    return $"{order.Id},{order.CustomerName},{order.Total}";
}
```

If this runs for thousands of orders, many temporary strings may be created. Most die quickly, which is why Gen 0 exists.

Example of long-lived allocation:

```csharp
public static readonly List<Order> CachedOrders = new();
```

Objects referenced by static collections can survive into Gen 2 and stay there until removed.

## Under The Hood: Mark, Sweep, Compact

At a high level, garbage collection answers one question:

> Which objects are still reachable from GC roots?

Conceptual phases:

```text
1. Mark reachable objects from GC roots.
2. Identify unreachable objects.
3. Reclaim unreachable memory.
4. Compact movable heap segments when appropriate.
```

If an object is reachable from a root, it stays alive.

If not, it can be collected.

This is why "memory leak" in C# usually means:

> An object is still reachable even though the application no longer logically needs it.

Common causes:

- static collections;
- event handlers not unsubscribed;
- long-lived caches without eviction;
- timers holding references;
- `AsyncLocal` or logging scopes retaining data longer than expected.

## SOH, LOH, POH

.NET managed heap has several important areas.

SOH: Small Object Heap.

- normal small objects;
- Gen 0, Gen 1, Gen 2;
- usually compacted.

LOH: Large Object Heap.

- large objects, commonly arrays or large strings;
- collected with Gen 2;
- compaction behavior is different and can be costly;
- repeated large allocations create memory pressure.

POH: Pinned Object Heap.

- used for pinned objects;
- helps reduce fragmentation caused by pinned objects in normal heap areas.

Chinese notes:

- `pinned object`: 固定对象，GC 不能移动它.
- `fragmentation`: 内存碎片.

Why this matters:

- large buffers can go to LOH;
- pinned objects can prevent compaction around them;
- repeated allocation of large arrays can cause Gen 2 pressure.

LOH example:

```csharp
var buffer = new byte[100_000]; // likely large enough for LOH
```

If this happens frequently in a request path, it can increase Gen 2 collections and memory fragmentation pressure.

Pinned object example:

```csharp
using System.Runtime.InteropServices;

var buffer = new byte[1024];
var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);

try
{
    // Pass buffer address to native code.
}
finally
{
    handle.Free();
}
```

Pinned objects should be used carefully because they restrict the GC's ability to move objects during compaction.

## Workstation GC vs Server GC

.NET has different GC modes.

Workstation GC:

- optimized for client apps and lower resource usage;
- common for desktop-like workloads.

Server GC:

- optimized for throughput on multi-core servers;
- uses multiple heaps;
- common for ASP.NET Core server applications.

Practical explanation:

> Server GC is usually preferred for high-throughput server apps, while workstation GC is lighter. The best choice depends on workload, latency requirements, CPU cores, and memory behavior.

## Background GC And Pauses

GC can pause managed threads at certain points. This is often called stop-the-world（STW） pause.

Modern .NET has background GC to reduce pause impact, especially for Gen 2 collections, but GC pauses can still matter.

Pause impact depends on:

- allocation rate;
- live object graph size;
- Gen 2 frequency;
- LOH pressure;
- pinned objects;
- finalizers;
- memory limits in containers.

Reducing GC pressure:

- avoid unnecessary allocations in hot paths;
- reuse buffers with pooling;
- avoid boxing in hot loops;
- avoid huge temporary strings;
- use streaming instead of loading entire files;
- keep caches bounded;
- measure before optimizing.

What a pause means:

> During some GC phases, managed threads are paused so the GC can safely inspect and update object references. Modern .NET works hard to reduce pause time, but high allocation rate and large live object graphs can still hurt tail latency.

Example:

```text
Symptom:
  API p99 latency spikes every few minutes.

Possible GC angle:
  allocation rate is high, Gen 2 collections are frequent, or LOH pressure is high.

Investigation:
  check dotnet-counters, allocation rate, GC heap size, Gen 2 count, LOH size, and memory dumps.
```

## Large Object Heap

Objects around 85 KB or larger go to the Large Object Heap.

Examples:

- large arrays;
- large strings;
- large byte buffers.

LOH is collected with Gen 2 and can contribute to memory pressure.

For repeated large buffers, consider:

```csharp
var buffer = ArrayPool<byte>.Shared.Rent(1024 * 1024);

try
{
    // use buffer
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer);
}
```

## IDisposable Is Not GC

`IDisposable` releases unmanaged or external resources deterministically.

Examples:

- database connections;
- file handles;
- streams;
- sockets;
- timers.

```csharp
using var stream = File.OpenRead("data.txt");
```

GC eventually reclaims memory. `Dispose` releases resources now.

Async dispose example:

```csharp
await using var stream = File.OpenRead("large-file.dat");
```

ASP.NET Core example:

```csharp
builder.Services.AddDbContext<AppDbContext>();
```

`DbContext` is usually scoped. The DI container disposes it at the end of the request scope, which returns database-related resources promptly.

## Finalizer

Finalizers are expensive and should be rare.

```csharp
~NativeResourceWrapper()
{
    ReleaseNativeHandle();
}
```

Prefer `SafeHandle` for native handles.

## Common Managed Memory Leak

Managed memory can still leak if references remain.

Example: event subscription leak.

```csharp
public sealed class LongLivedPublisher
{
    public event EventHandler? Changed;
}

public sealed class ShortLivedSubscriber
{
    public ShortLivedSubscriber(LongLivedPublisher publisher)
    {
        publisher.Changed += HandleChanged;
    }

    private void HandleChanged(object? sender, EventArgs e)
    {
    }
}
```

If the subscriber does not unsubscribe, the publisher keeps it alive.

Fix:

```csharp
public sealed class ShortLivedSubscriber : IDisposable
{
    private readonly LongLivedPublisher _publisher;

    public ShortLivedSubscriber(LongLivedPublisher publisher)
    {
        _publisher = publisher;
        _publisher.Changed += HandleChanged;
    }

    public void Dispose()
    {
        _publisher.Changed -= HandleChanged;
    }

    private void HandleChanged(object? sender, EventArgs e)
    {
    }
}
```

## Reducing Allocations

Common techniques:

- avoid unnecessary string concatenation in loops;
- use `StringBuilder` for repeated string building;
- use pooling for large buffers;
- use `Span<T>` and `Memory<T>` where appropriate;
- avoid unnecessary LINQ in hot paths;
- avoid boxing;
- reuse expensive objects if thread-safe.

Example:

```csharp
var builder = new StringBuilder();

foreach (var item in items)
{
    builder.Append(item.Name).Append(',');
}

return builder.ToString();
```

## Review Questions

### How does .NET GC work?

> .NET GC tracks objects on the managed heap and determines reachability from GC roots. Unreachable objects are reclaimed. It uses generations because most objects are short-lived, and collecting younger generations is cheaper.

### Can memory leak happen in C#?

> Yes. If objects remain referenced, GC cannot collect them. Common causes include static collections, event subscriptions, timers, caches without eviction, and long-lived closures.

### What is the difference between Dispose and GC?

> GC reclaims managed memory automatically. `Dispose` releases external resources deterministically, such as file handles, database connections, and native handles.

## Production Troubleshooting

For high memory:

1. Check whether memory is managed heap, native memory, or container limit.
2. Capture dump.
3. Analyze object types and retention paths.
4. Look for static collections, cache growth, event leaks, large arrays.
5. Check GC frequency and Gen 2 collections.

In containers, memory behavior can look different from a normal VM:

- the process may be killed when it exceeds the container memory limit;
- high managed heap is not the only possible cause of high working set;
- native memory, thread stacks, memory-mapped files, and loaded assemblies also matter;
- server GC and heap count can affect memory usage on multi-core machines.

Useful first question:

> Is memory growing without bound, or did it grow to a stable working set?

Stable memory can be normal for a server process. Constant unbounded growth is more suspicious.

Useful tools:

- `dotnet-counters`
- `dotnet-gcdump`
- `dotnet-dump`
- Visual Studio profiler
- JetBrains dotMemory
- PerfView

Example `dotnet-counters` command:

```bash
dotnet-counters monitor --process-id 12345 System.Runtime
```

Useful counters to watch:

- GC heap size;
- allocation rate;
- Gen 0/1/2 collection count;
- time in GC;
- thread pool queue length;
- working set.

Useful dump questions:

- Which object types use the most memory?
- Why are those objects still reachable?
- Are they retained by static fields, caches, events, timers, or async locals?
- Are large arrays or strings dominating memory?
- Did the problem begin after a recent deployment?

Explanation structure:

> I first determine whether memory is managed heap, native memory, or container pressure. Then I check runtime counters, capture a dump if needed, inspect top object types and retention paths, and look for caches, static references, event subscriptions, large arrays, or recent changes.

## Common Mistakes

### Mistake: Assuming GC prevents all memory leaks.

Why it is wrong:

> GC only collects unreachable managed objects. If static fields, long-lived collections, event handlers, or caches still reference objects, those objects remain alive.

Better answer:

> Managed memory leaks are usually unwanted references, not missing `free()`.

### Mistake: Forgetting to dispose streams and timers.

Why it is wrong:

> GC handles managed memory, but streams, timers, sockets, and handles may hold external resources that should be released deterministically.

Better answer:

> Use `using`, `await using`, or dependency lifetime management for disposable resources.

### Mistake: Creating large arrays repeatedly.

Why it is wrong:

> Large objects can go to the Large Object Heap and increase memory pressure. Repeated large allocations can trigger expensive collections and hurt latency.

Better answer:

> Reuse buffers where appropriate, stream large data, and measure allocation hot spots.

### Mistake: Using unbounded memory cache.

Why it is wrong:

> A cache without size limits or expiration can keep growing until it causes high memory usage or container restarts.

Better answer:

> Set cache limits, TTLs, eviction rules, and monitor hit rate and memory.

### Mistake: Keeping per-request data in static fields.

Why it is wrong:

> Static fields can live for the lifetime of the process. Storing request/user data there can leak memory and create cross-request data bugs.

Better answer:

> Keep request data in scoped services, method parameters, or `HttpContext` where appropriate.

### Mistake: Using finalizers unnecessarily.

Why it is wrong:

> Finalizers add GC overhead and delay object cleanup. Most classes do not need them unless they directly own unmanaged resources.

Better answer:

> Prefer `IDisposable`/`SafeHandle`; add finalizers only for true unmanaged resource ownership.
