# .NET Garbage Collection

## Core Idea

Garbage Collection (GC) automatically manages memory for managed objects in .NET.

GC answers one main question:

> Which objects are still reachable, and which objects can be reclaimed?

For this chapter, the important goal is not to turn the reader into a memory diagnostics specialist immediately. The goal is to establish the runtime model that later performance and troubleshooting chapters can build on.

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

Eligible for collection does not mean immediately collected. It means GC is allowed to reclaim it during a future collection.

## Generations

.NET GC uses generations:

- Gen 0: short-lived objects;
- Gen 1: buffer between short and long-lived;
- Gen 2: long-lived objects;
- LOH: Large Object Heap.

Why generations exist:

Most objects die young.

For example:

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

These heap regions matter because not all allocations behave the same way:

- large buffers can go to LOH;
- pinned objects can prevent compaction around them;
- repeated allocation of large arrays can cause Gen 2 pressure.

For example, an LOH-sized allocation may look like this:

```csharp
var buffer = new byte[100_000]; // likely large enough for LOH
```

If this happens frequently in a request path, it can increase Gen 2 collections and memory fragmentation pressure.

A pinned object example looks like this:

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

Pinned objects should be used carefully because they restrict the GC's ability to move objects during compaction. At this stage, the important lesson is conceptual: some allocations and interop patterns create disproportionately expensive memory behavior even when the source code looks simple.

## Workstation GC vs Server GC

.NET has different GC modes.

Workstation GC:

- optimized for client apps and lower resource usage;
- common for desktop-like workloads.

Server GC:

- optimized for throughput on multi-core servers;
- uses multiple heaps;
- common for ASP.NET Core server applications.

Server GC is usually preferred for high-throughput server apps, while workstation GC is lighter. The best choice depends on workload, latency requirements, CPU cores, and memory behavior.

## Background GC And Pauses

GC can pause managed threads at certain points. This is often called stop-the-world pause.

Modern .NET has background GC to reduce pause impact, especially for Gen 2 collections, but GC pauses can still matter.

Pause impact depends on:

- allocation rate;
- live object graph size;
- Gen 2 frequency;
- LOH pressure;
- pinned objects;
- finalizers;
- memory limits in containers.

Common ways to reduce GC pressure include:

- avoid unnecessary allocations in hot paths;
- reuse buffers with pooling;
- avoid boxing in hot loops;
- avoid huge temporary strings;
- use streaming instead of loading entire files;
- keep caches bounded;
- measure before optimizing.

During some GC phases, managed threads are paused so the GC can safely inspect and update object references. Modern .NET works hard to reduce pause time, but high allocation rate and large live object graphs can still hurt tail latency.

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

This pattern appears in ordinary web work more often than it first seems. File upload handlers, compression paths, JSON processing, image transformation, and outbound HTTP integration can all allocate large temporary buffers if written carelessly. Pooling is not required everywhere, but knowing where large-array churn comes from is part of professional runtime awareness.

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

An async dispose example looks like this:

```csharp
await using var stream = File.OpenRead("large-file.dat");
```

In ASP.NET Core, the same principle appears like this:

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

An event subscription leak looks like this.

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

A cache example is equally common:

```csharp
public static class ProductCache
{
    public static readonly ConcurrentDictionary<int, ProductDto> Items = new();
}
```

This is not automatically a leak, but it becomes leak-like behavior if entries are never removed, never expired, and the application keeps accumulating data it no longer truly needs. In managed systems, many "memory leaks" are really retention-policy bugs.

## Reducing Allocations

Common techniques:

- avoid unnecessary string concatenation in loops;
- use `StringBuilder` for repeated string building;
- use pooling for large buffers;
- use `Span<T>` and `Memory<T>` where appropriate;
- avoid unnecessary LINQ in hot paths;
- avoid boxing;
- reuse expensive objects if thread-safe.

For example:

```csharp
var builder = new StringBuilder();

foreach (var item in items)
{
    builder.Append(item.Name).Append(',');
}

return builder.ToString();
```

.NET GC tracks objects on the managed heap and decides whether they are still reachable from GC roots. Objects that are no longer reachable can be reclaimed. Generational collection exists because most allocations are short-lived, so collecting younger generations is usually cheaper than scanning the entire heap each time.

Managed memory leaks are still possible in C#. When objects remain referenced through static collections, event subscriptions, timers, caches without eviction, or long-lived closures, the GC cannot collect them even if the application no longer needs them logically.

`Dispose` and GC solve different problems. GC reclaims managed memory automatically. `Dispose` releases external resources deterministically, such as file handles, sockets, database connections, and native handles.

## Practical Reading Of GC Pressure

In production systems, GC often becomes visible indirectly through symptoms such as latency spikes, rising memory usage, or sustained allocation pressure.

At the chapter level, the key point is not to memorize every diagnostic command. The key point is to understand the conceptual questions:

- Is allocation rate unusually high?
- Is the live object graph larger than expected?
- Are large buffers or pinned objects increasing pressure?
- Are objects being retained for logical reasons such as caches, events, timers, or static references?

Detailed operational investigation belongs more naturally to the later performance and troubleshooting chapters. What belongs here is the ability to connect symptoms such as latency spikes, rising memory usage, or large object churn back to the basic GC model of reachability, generations, heap regions, and retention.

A useful first-pass engineering checklist is therefore:

- Are we allocating too much in hot paths?
- Are large buffers being created repeatedly?
- Are long-lived references, caches, or event subscriptions retaining objects unexpectedly?
- Are latency spikes correlated with heavier Gen 2 or LOH pressure?

That level of reasoning is often enough to decide whether the next step should be code review, allocation measurement, or deeper production diagnostics.
