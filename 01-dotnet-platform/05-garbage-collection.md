# .NET Garbage Collection

Garbage collection (GC) automatically manages memory for managed objects in .NET. The GC determines which objects are still reachable from GC roots and which can be reclaimed.

This chapter establishes the runtime model that performance and troubleshooting chapters build on. The emphasis is on the mechanism — reachability, generations, heap regions, and the operational consequences of allocation patterns.

## Managed Heap And Reachability

When an object is created with `new`, it lives on the managed heap. The variable holds a reference; the GC tracks object reachability from a set of roots: local variables on active stacks, static fields, CPU registers, GC handles, and the finalization queue.

```csharp
var user = new User { Name = "Alice" };
```

If an object cannot be reached from any root, it is eligible for collection — not immediately collected, but reclaimable during a future collection cycle.

```text
GC roots → local variable user → User object → Address object
Result: User and Address are reachable, GC preserves them.

GC roots
User object → Address object   (no root reaches User)
Result: User and Address are eligible for collection.
```

## Generations

The .NET GC is generational because most objects die young. Collecting only young objects is cheaper than scanning the entire heap every time.

- **Gen 0**: Short-lived objects. Collected most frequently — typically when the allocation budget for Gen 0 is exhausted.
- **Gen 1**: Buffer between short-lived and long-lived objects. Objects that survive a Gen 0 collection are promoted to Gen 1.
- **Gen 2**: Long-lived objects. Collected infrequently and at higher cost. A full Gen 2 collection scans the entire managed heap.
- **LOH** (Large Object Heap): Objects at or above approximately 85,000 bytes. Collected with Gen 2; compaction is optional and expensive. The threshold is not exactly 85 KB in all cases — arrays of doubles (8-byte elements) cross the LOH threshold at around 10,000 elements, and multi-dimensional arrays and strings have their own internal overhead that affects the exact boundary.

Short-lived allocations dominate typical application code:

```csharp
public string BuildCsvLine(Order order)
{
    return $"{order.Id},{order.CustomerName},{order.Total}";
}
```

Each call creates a temporary string. When this runs for thousands of orders, many strings are allocated and quickly become garbage. Gen 0 absorbs this churn efficiently.

Long-lived allocations follow a different path. Objects referenced by static collections survive into Gen 2 and remain there until explicitly removed:

```csharp
public static readonly List<Order> CachedOrders = new();
```

## Mark, Sweep, And Compact

A garbage collection conceptually proceeds through phases:

```text
1. Mark reachable objects from GC roots
2. Identify unreachable objects
3. Reclaim unreachable memory
4. Compact movable heap segments (when appropriate)
```

Objects reachable from any root stay alive. Objects with no reachable path are reclaimed. A "memory leak" in managed code typically means an object remains reachable even though the application no longer logically needs it. Common retention patterns include static collections without eviction, event handlers never unsubscribed, timers holding references, `AsyncLocal` values retaining data, and logging scopes accumulating state.

## SOH, LOH, And POH

The managed heap is divided into regions with different allocation and collection characteristics.

The **Small Object Heap** (SOH) houses ordinary small objects across Gen 0, Gen 1, and Gen 2. It is typically compacted during collection, which reduces fragmentation.

The **Large Object Heap** (LOH) stores objects at or above approximately 85 KB — large arrays, large strings, large byte buffers. LOH is collected with Gen 2, and compaction is more expensive and less frequent. Repeated large allocations create sustained memory pressure.

The **Pinned Object Heap** (POH) isolates pinned objects, reducing fragmentation they would otherwise cause in normal heap regions. Pinning is most common during interop, when a managed buffer must be passed to native code at a fixed address:

```csharp
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

Pinned objects restrict the GC's ability to move objects during compaction. They are necessary for interop but should be freed promptly and minimized in allocation-heavy paths.

## Workstation GC And Server GC

.NET provides two GC modes with different throughput and latency characteristics.

**Workstation GC** is optimized for client applications and lower resource usage. It is the default for desktop and non-server workloads. Workstation GC uses a single heap and collects on the thread that triggered the collection (concurrent with other managed threads for Gen 2 background collections, but Gen 0 and Gen 1 collections are blocking). This mode minimizes memory footprint and thread count at the cost of lower throughput under sustained allocation.

**Server GC** is optimized for throughput on multi-core machines. It creates a separate heap and a dedicated GC thread per logical processor, enabling parallel collection across all heaps simultaneously. Server GC is the default for ASP.NET Core applications. Server GC threads run at `THREAD_PRIORITY_HIGHEST`, and collections happen in parallel across all heaps, reducing pause time for a given allocation rate compared to workstation mode.

Configuration typically lives in the project file:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <ServerGarbageCollection>true</ServerGarbageCollection>
  </PropertyGroup>
</Project>
```

Or in `runtimeconfig.json`:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.GC.Server": true
    }
  }
}
```

A runtime check confirms what the process is using:

```csharp
Console.WriteLine($"Server GC: {System.Runtime.GCSettings.IsServerGC}");
```

### Container Memory Limits And GC

In containerized environments, .NET reads cgroup memory limits to determine GC heap sizing. When a container has a 512 MB memory limit, the GC sizes its heaps accordingly — not as if it had the full machine memory. This has several consequences:

- **GC heap count in Server GC** depends on the CPU count visible to the container. A container limited to 1 CPU gets one GC heap even with Server GC enabled, reducing parallelism benefits.
- **GC triggering thresholds** are calculated as a fraction of the container memory limit, not the host's physical memory. A 512 MB container triggers Gen 2 collections earlier than the same application on a 16 GB VM.
- **Memory pressure** is reported through `GC.GetGCMemoryInfo()`, which reflects the container's perspective: `TotalAvailableMemoryBytes` shows what the cgroup allows, not what the host has.
- **`DOTNET_GCHeapHardLimit`** and `DOTNET_GCHeapHardLimitPercent` provide explicit control over the GC heap's maximum size, overriding cgroup-derived values:

```bash
# Limit GC heap to 256 MB regardless of container memory
export DOTNET_GCHeapHardLimit=0x10000000
# Or as a percentage of container memory
export DOTNET_GCHeapHardLimitPercent=50
```

The decision between Workstation and Server GC is workload-dependent. Server GC suits throughput-oriented web services and multi-core server processes. Workstation GC suits lighter client processes and cases where lower resource usage matters more than maximum throughput. In memory-constrained containers, Workstation GC with its single heap and lower overhead can sometimes outperform Server GC — the reduced thread count and simpler collection mechanics can offset the parallelism loss when memory is the bottleneck rather than CPU. Measurements under realistic load and actual container limits are the only reliable guide.

## GC Pauses

The GC pauses managed threads during certain collection phases — often called stop-the-world pauses. Modern .NET uses background GC to reduce pause impact, especially for Gen 2 collections, but pauses can still affect tail latency under load.

Pause impact depends on allocation rate, live object graph size, Gen 2 frequency, LOH pressure, pinned objects, finalizers, and container memory limits. Reducing GC pressure involves deliberate allocation discipline in hot paths:

- Avoid unnecessary allocations in loops and request handlers.
- Reuse buffers with `ArrayPool<T>`.
- Avoid boxing in hot loops.
- Use streaming instead of loading entire files into memory.
- Bound caches with eviction policies.
- Measure before optimizing — allocation reduction that complicates code without measurable benefit is rarely worth it.

## IDisposable Is Not GC

`IDisposable` releases unmanaged or external resources deterministically. The GC eventually reclaims managed memory; `Dispose` releases resources immediately.

```csharp
using var stream = File.OpenRead("data.txt");
// stream.Dispose() called at end of scope — file handle released now
```

In ASP.NET Core, scoped services like `DbContext` are disposed by the DI container at the end of each request:

```csharp
builder.Services.AddDbContext<AppDbContext>();
```

Finalizers provide a safety net for unmanaged resources but are expensive. The GC must promote objects with finalizers by at least one generation and schedule finalizer thread execution. Prefer `SafeHandle` for native handles and `IDisposable` for deterministic cleanup.

## Managed Memory Leaks

Managed memory leaks occur when objects remain reachable through references the application no longer needs.

The classic pattern is an event subscription from a short-lived object to a long-lived publisher:

```csharp
public sealed class LongLivedPublisher
{
    public event EventHandler? Changed;
}

public sealed class ShortLivedSubscriber
{
    public ShortLivedSubscriber(LongLivedPublisher publisher)
    {
        publisher.Changed += HandleChanged;  // subscriber is now reachable from publisher
    }

    private void HandleChanged(object? sender, EventArgs e) { }
}
```

The publisher holds a delegate reference to the subscriber's handler, which keeps the subscriber alive as long as the publisher exists. Implementing `IDisposable` and unsubscribing resolves this:

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

    private void HandleChanged(object? sender, EventArgs e) { }
}
```

Unbounded caches create a similar retention problem:

```csharp
public static class ProductCache
{
    public static readonly ConcurrentDictionary<int, ProductDto> Items = new();
}
```

This is not automatically a leak, but it becomes leak-like behavior when entries are never removed and the cache accumulates data the application no longer needs. Most managed memory leaks are retention-policy bugs, not GC failures.

## Allocation Discipline

Reducing allocations in hot paths is a practical skill that builds on the GC model:

```csharp
var builder = new StringBuilder();

foreach (var item in items)
{
    builder.Append(item.Name).Append(',');
}

return builder.ToString();
```

`StringBuilder` avoids the intermediate string allocations that concatenation in a loop would create. For large temporary buffers, pooling avoids repeated LOH allocations:

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

Pooling is not required everywhere, but knowing where large-array churn originates — file upload handlers, compression paths, JSON processing, image transformation, HTTP integration — is part of professional runtime awareness.

The GC model connects allocation patterns to operational symptoms. High Gen 0 collection frequency indicates heavy short-lived allocation. Elevated Gen 2 collections suggest long-lived object retention or LOH pressure. Latency spikes under load often correlate with GC activity. The conceptual framework — reachability, generations, heap regions, and retention — guides the decision between code review, allocation measurement, and deeper production diagnostics.
