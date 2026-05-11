# .NET Garbage Collection

Garbage collection (GC) automatically manages memory for managed objects in .NET. The GC determines which objects are still reachable from GC roots and which can be reclaimed.

This chapter establishes the runtime model that performance and troubleshooting chapters build on. The emphasis is on the mechanism — reachability, generations, heap regions, and the operational consequences of allocation patterns.

## Benefits

The GC eliminates manual memory management and the class of bugs that come with it:

- **No manual release for managed objects** — developers don't write `free` or `delete`; the GC removes the class of bugs caused by forgotten deallocations. It does not prevent retention bugs where reachable objects are kept longer than intended.
- **Fast allocation** — allocating from the managed heap is adding a value to a pointer, nearly as fast as stack allocation.
- **Automatic reclamation** — objects no longer reachable become eligible for reclamation, and their space can be reused for future allocations. Managed objects get zero-initialized memory when allocated; constructors need not initialize every field.
- **Memory safety** — in safe managed code, object references remain valid while objects are reachable and cannot be used after the GC reclaims them. `unsafe` code and native interop can still violate memory safety if used incorrectly.

## Virtual Memory Fundamentals

The GC operates on virtual memory, not physical memory directly. Each process has its own virtual address space. On 64-bit processes this address space is large enough that commit limits and memory pressure usually matter more than address-space exhaustion; on 32-bit processes, address-space fragmentation can still be a practical limit. Virtual memory is commonly described in three states:

| State | Meaning |
|-------|---------|
| **Free** | No references; available for allocation. |
| **Reserved** | Blocked for this process but not yet backed by physical storage. |
| **Committed** | Assigned to physical storage (RAM or page file). |

Virtual address space can fragment — a large allocation can fail even with enough total free address space if no single contiguous block is available. The GC reserves and commits memory through operating-system virtual-memory APIs (`VirtualAlloc` / `VirtualFree` on Windows, analogous APIs on Unix-like systems). Committed memory consumes OS commit budget, backed by RAM and, where configured, paging storage.

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
- **LOH** (Large Object Heap): Objects at or above approximately 85,000 bytes. Collected with Gen 2; compaction is optional and expensive. The threshold is not exactly 85 KB in all cases — arrays of doubles (8-byte elements) cross the LOH threshold at around 10,000 elements, and multi-dimensional arrays and strings have their own internal overhead that affects the exact boundary. The LOH is sometimes referred to as *generation 3* — a physical generation logically collected as part of Gen 2.

### Ephemeral Generations and Segments

Gen 0 and Gen 1 are called **ephemeral generations** and live in the GC's young-object allocation area. The exact segment or region sizes are runtime implementation details and change with GC mode, processor count, DATAS, memory limits, and .NET version. The stable rule is conceptual: ephemeral collections focus on young objects, so their cost is normally much lower than a full Gen 2 collection.

### Survival and Promotions

Objects that survive a collection are promoted:

- Gen 0 survivors → promoted to Gen 1.
- Gen 1 survivors → promoted to Gen 2.
- Gen 2 survivors → remain in Gen 2.

When the GC detects a high survival rate in a generation, it **increases the allocation threshold** for that generation so the next collection reclaims more memory. The CLR continuously balances two priorities: not letting the working set grow too large (delaying GC) versus not letting GC run too frequently.

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

### Write Barrier And Card Table

The GC collects Gen 0 without scanning Gen 2, but Gen 2 objects can hold references to Gen 0 objects — for example, a static list updated with a newly allocated item. The GC must discover these cross-generational references without walking the entire Gen 2 heap.

The solution is the **write barrier**, a small piece of code the JIT injects after every reference assignment in managed code. When a reference field is written, the write barrier marks the corresponding entry in the **card table** as dirty. A card represents a small region of heap memory (implementation detail; the exact size is runtime-specific). The dirty mark does **not** mean the Gen 0 object is dirty; it means a region of older-generation memory that stores references may need to be re-examined.

During a Gen 0 collection, the GC scans only the older-generation cards that are marked dirty, not the entire Gen 2 heap. From those cards it discovers the actual old-to-young references and treats the referenced young objects as roots for that collection. After the scan, the dirty mark can be cleared because it has served its purpose: recording that the region changed since the last time the GC examined it.

What happens next is easiest to understand as a timeline:

1. A Gen 2 object is updated to point to a Gen 0 object.
2. The write barrier marks the corresponding card dirty.
3. The next ephemeral GC scans that dirty card, finds the `Gen2 -> Gen0` reference, and keeps the young object alive.
4. If the young object survives, the GC may move and promote it, for example from Gen 0 to Gen 1. The old object's reference is then updated to the object's new address.
5. As long as the target remains in the ephemeral generations (Gen 0 or Gen 1), the GC must continue to discover that old-to-young reference in later ephemeral collections.
6. Once the target is promoted to Gen 2, the reference is no longer old-to-young, so ephemeral collections no longer need to track it.

So the dirty bit is not a permanent record of "this reference exists." It is a change-tracking aid that helps the GC find old-to-young references efficiently. The important distinction is:

- **Dirty card** = "this older region may have had reference updates"
- **Live young object** = "this object is reachable from the roots found during the current GC"

```text
managed code:  user.Address = new Address(...);   // writes a reference field
                         │
                         ▼
write barrier:  mark corresponding card(s) in card table as dirty
                         │
                         ▼
next Gen 0 GC:  scan only marked cards in Gen 2 to find cross-gen references
                         │
                         ▼
after scan:     clear the dirty mark; future writes will dirty the card again
```

The card table explains why reference-heavy code patterns carry a GC cost. A loop that writes references into a large array dirties many cards, increasing the work during the next ephemeral collection. A long-lived `Dictionary<int, Order>` stored in a static field dirties cards on every insert, forcing the GC to re-scan those cards on subsequent Gen 0 collections even for entries that have not changed — the card table has only one bit per card and does not track which specific field within the card was written. Understanding this mechanism turns allocation profiling into a concrete exercise: a Gen 0 collection that is unexpectedly slow often correlates with an unusually large set of dirty cards.

## GC Trigger Conditions

A garbage collection occurs when one of the following is true (per official documentation):

1. **Low physical memory** — detected by OS low-memory notification or host indication.
2. **Allocation exceeds threshold** — memory used by allocated objects on the managed heap surpasses an acceptable threshold. This threshold is continuously adjusted as the process runs. This is the most common case.
3. **GC.Collect called** — manual invocation. In almost all cases this is unnecessary; the GC runs continuously on its own. Used primarily for testing and unique scenarios.

## Mark, Relocate, And Compact

A garbage collection proceeds through three phases (the official documentation uses *relocate* rather than *sweep*):

```text
1. Mark phase  — Find and create a list of all live objects from GC roots.
2. Relocate phase — Update references to objects that will be compacted.
3. Compact phase — Reclaim space occupied by dead objects and compact survivors towards the older end of the segment.
```

During the blocking portions of a GC, managed threads are suspended at safe points so the collector can inspect and update object references consistently. Background GC reduces the length of these stop-the-world pauses for Gen 2 collections, but Gen 0/Gen 1 foreground collections and some full-collection phases still suspend managed execution.

Compaction only occurs when the collector decides the benefit justifies moving survivors. If most objects survive, compaction may be skipped or limited. For Gen 2 collections, survivors remain in the oldest generation. The LOH is normally swept rather than compacted because copying large objects is expensive, but it can be compacted on demand via `GCSettings.LargeObjectHeapCompactionMode`. With `System.GC.ConserveMemory` / `DOTNET_GCConserveMemory`, the runtime may also compact the LOH automatically when fragmentation is high.

## SOH, LOH, And POH

The managed heap is divided into regions with different allocation and collection characteristics.

The **Small Object Heap** (SOH) houses ordinary small objects across Gen 0, Gen 1, and Gen 2. It is typically compacted during collection, which reduces fragmentation.

The **Large Object Heap** (LOH) stores objects at or above approximately 85 KB — large arrays, large strings, large byte buffers. LOH is collected with Gen 2, but unlike the SOH it is **not compacted**. Instead, the GC **sweeps** the LOH: dead objects are placed on a free list, and adjacent dead objects are merged into a single free block for reuse. Over time, this can cause fragmentation — free blocks may be too small to satisfy new large allocations, forcing the GC to acquire new segments from the OS. Repeated large allocations create sustained memory pressure.

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

### LOH Performance Implications

**Allocation cost** is dominated by memory clearing. The CLR guarantees that every new object's memory is zeroed. At two cycles per byte, clearing the smallest large object (~85 KB) takes roughly 170,000 CPU cycles; clearing a 16 MB object on a 2 GHz machine takes approximately 16 ms.

**Collection cost** comes from Gen 2 GCs triggered by LOH allocation. If the LOH triggers a Gen 2 collection and Gen 2 is large, the GC time can be substantial. Allocating and discarding many temporary large objects compounds both the clearing cost and the GC frequency.

**Array elements with reference types** make the problem worse: the GC must walk every element of a reference-rich large array. Using integer indices instead of object references avoids this traversal cost:

```csharp
// ❌ GC must traverse every element's references during marking.
class Node { Data d; Node left; Node right; }
Node[] tree = new Node[num_nodes];

// ✅ GC skips the array — no references to walk.
class Node { Data d; uint left_index; uint right_index; }
```

The recommended pattern for LOH-heavy workloads is to **allocate a reusable pool** of large objects rather than creating temporary ones. `ArrayPool<T>.Shared` is the standard built-in mechanism.

## Workstation GC And Server GC

.NET provides two GC modes with different throughput and latency characteristics.

**Workstation GC** is optimized for client applications and lower resource usage. It is the default for desktop and non-server workloads. Workstation GC uses a single heap and collects on the thread that triggered the collection (concurrent with other managed threads for Gen 2 background collections, but Gen 0 and Gen 1 collections are blocking). This mode minimizes memory footprint and thread count at the cost of lower throughput under sustained allocation.

**Server GC** is optimized for throughput on multi-core machines and is the default for ASP.NET Core applications. Traditionally, Server GC creates multiple heaps and dedicated GC threads so collection work can run in parallel. In .NET 9 and later, Server GC enables Dynamic Adaptation to Application Sizes (DATAS) by default: the GC can start with fewer heaps and dynamically add or remove heaps based on load, reducing memory usage in bursty or containerized workloads. `GCHeapCount` and related settings still allow explicit tuning when a workload needs it. Server GC improves throughput under sustained allocation, but it can use more memory and threads than Workstation GC.

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

## Background GC And Concurrent GC

### Background GC (.NET 4+)

Background GC is **enabled by default** and replaces the older concurrent GC. It allows ephemeral generations (0 and 1) to be collected **while a Gen 2 collection is in progress** on dedicated background threads. When enough objects are allocated in Gen 0 during a background Gen 2 GC, the CLR performs a **foreground GC** on Gen 0 or Gen 1. During foreground GC, all managed threads are suspended. The background thread checks at frequent safe points whether a foreground GC is requested; if so, it suspends itself until the foreground GC completes.

Background GC removes the allocation restrictions of the older concurrent GC, because ephemeral GCs can still occur during background Gen 2 collection.

| | Workstation | Server |
|---|---|---|
| Dedicated threads | 1 | One per logical CPU |
| Thread timeout | Yes | No |
| Available since | .NET Framework 4 | .NET Framework 4.5 |

### Concurrent GC (legacy, .NET 3.5 / .NET 4)

The older concurrent GC affected only Gen 2 collections (Gen 0/1 are always non-concurrent because they finish fast). It allowed managed threads to run concurrently with a dedicated GC thread for most of a Gen 2 collection's duration. It is fully replaced by background GC in later versions.

## Latency Modes

`GCSettings.LatencyMode` controls the intrusiveness of garbage collections:

| Mode | Behavior |
|------|----------|
| **Batch** | Maximizes throughput. Allows concurrent Gen 2 collections. Default for non-interactive applications. |
| **Interactive** | Balances throughput and responsiveness. Default for most applications. |
| **SustainedLowLatency** | Only allows Gen 0/1 foreground collections; suppresses Gen 2 foreground GCs except under low memory. Used for time-sensitive windows. |
| **NoGCRegion** | Prevents GC entirely for a specified period (caller pre-specifies how much memory to reserve). Fails if the allocation budget is exceeded. |

In practice, `SustainedLowLatency` is the most commonly used non-default mode — useful for short time-critical phases like trading system order windows or game frame rendering.

## GC Pauses

The GC pauses managed threads during certain collection phases — often called stop-the-world pauses. Modern .NET uses background GC to reduce pause impact, especially for Gen 2 collections, but pauses can still affect tail latency under load.

Pause impact depends on allocation rate, live object graph size, Gen 2 frequency, LOH pressure, pinned objects, finalizers, and container memory limits. Reducing GC pressure involves deliberate allocation discipline in hot paths:

- Avoid unnecessary allocations in loops and request handlers.
- Reuse buffers with `ArrayPool<T>`.
- Avoid boxing in hot loops.
- Use streaming instead of loading entire files into memory.
- Bound caches with eviction policies.
- Measure before optimizing — allocation reduction that complicates code without measurable benefit is rarely worth it.

## Performance Monitoring

### Performance Counters

The `.NET CLR Memory` category in Performance Monitor provides quick signals:

- **# Gen 2 Collections** — incremented after each full GC. A rising rate signals LOH pressure or long-lived object retention.
- **Large Object Heap size** — current LOH size in bytes (including free space). Updated at the end of each GC, not at each allocation.
- **% Time in GC** — the percentage of elapsed time spent in GC since the last GC. Sustained values above 5–10% warrant investigation.

Counters can be queried programmatically:

```csharp
var counter = new PerformanceCounter(".NET CLR Memory", "# Gen 2 Collections", "<instance>");
Console.WriteLine(counter.NextValue());
```

### ETW Events (PerfView)

ETW events provide much richer information than performance counters. The PerfView tool from Microsoft is the standard collection method:

```bash
# Collect GC-only events
perfview /GCCollectOnly /AcceptEULA /nogui collect

# Collect GC events with allocation callstacks
perfview /GCOnly /AcceptEULA /nogui collect
```

In PerfView's GC stats view, check the **Trigger Reason** column:
- `AllocSmall` — GC triggered by SOH allocation budget exhaustion.
- `AllocLarge` — GC triggered by an LOH allocation. If most Gen 2 GCs show `AllocLarge` and **LOH Survival Rate %** is low, temporary large-object allocations are the root cause.

The GC Heap Alloc view in PerfView shows call stacks for allocations — essential for identifying the code responsible for LOH pressure.

### SoS Debugger Extension

For memory dumps, the SoS debugger extension provides heap analysis:

```
!eeheap -gc          — Show generation sizes and LOH segments.
!dumpheap -stat      — Object type statistics within a heap range.
!dumpheap -type Free — Identify fragmentation (free space between managed objects).
```

For LOH fragmentation investigation, set a breakpoint on `VirtualAlloc` to find code acquiring large segments from the OS:

```
bp kernel32!virtualalloc "j (dwo(@esp+8)>800000) 'kb';'g'"
```

This breaks only when allocations exceed 8 MB, revealing callers that trigger new LOH segment acquisition.

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

Finalizers provide a safety net for unmanaged resources, but they are expensive in ways that are not obvious from the syntax. When an object with a finalizer becomes unreachable, the GC does not reclaim it immediately. Instead, the GC places it on the **f-reachable queue** — an internal list of objects pending finalization. A dedicated finalizer thread runs the finalizers on that queue. Only after the finalizer executes does the object become truly dead — eligible for reclamation in a **second collection cycle**. An object with a finalizer always survives at least one GC, and often two: one to discover it and enqueue it, another to reclaim it after finalization.

```text
Object with ~Finalizer created
        │
        ▼
Gen 0 collection → object is unreachable, but has a finalizer
        │
        ▼
Object placed on f-reachable queue (NOT reclaimed)
  Promoted to Gen 1 (at minimum)
        │
        ▼
Finalizer thread runs ~Finalizer()
  Object removed from f-reachable queue
        │
        ▼
Next collection → object now truly dead, reclaimed
```

This is why finalizers increase memory pressure: the object and everything it references (its entire reachable graph) survives longer, promoting into higher generations and accumulating before reclamation. A burst of finalizable objects — a batch of un-disposed `FileStream` instances, for example — fills the f-reachable queue and delays reclamation for all of them. Prefer `SafeHandle` for native handles and `IDisposable` for deterministic cleanup.

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

### Weak References And ConditionalWeakTable

A strong reference — the normal kind — prevents the GC from collecting the target object. A **weak reference** allows collection to proceed. `WeakReference<T>` provides a handle to an object that the GC can reclaim when no strong references remain:

```csharp
var cache = new Dictionary<int, WeakReference<ExpensiveData>>();

// Store: the cache holds only a weak reference.
cache[id] = new WeakReference<ExpensiveData>(data);

// Retrieve: the data may have been collected.
if (cache.TryGetValue(id, out var weakRef)
    && weakRef.TryGetTarget(out var cached))
{
    return cached;  // still alive
}

// Rebuild — the GC reclaimed the previous instance.
var fresh = LoadExpensiveData(id);
cache[id] = new WeakReference<ExpensiveData>(fresh);
return fresh;
```

The cache entry itself (the `WeakReference<T>` object) is a small managed object that stays in the dictionary. When memory pressure triggers a collection and the target `ExpensiveData` has no other strong references, the GC reclaims the data but leaves the `WeakReference` wrapper intact. This gives the application a chance to rebuild the entry on next access.

`ConditionalWeakTable<TKey, TValue>` extends this idea to attach arbitrary data to an object without affecting its lifetime. The canonical use case is associating private data with a type you do not control:

```csharp
// Thread-safe map that does not keep keys alive.
private static readonly ConditionalWeakTable<Order, OrderMetadata> _metadata = new();

public static void AttachMetadata(Order order, OrderMetadata meta)
{
    _metadata.AddOrUpdate(order, meta);
}

public static OrderMetadata? GetMetadata(Order order)
{
    return _metadata.TryGetValue(order, out var meta) ? meta : null;
}
```

When `order` becomes unreachable, the `OrderMetadata` entry automatically becomes eligible for collection — no explicit cleanup needed. This pattern is widely used in the BCL itself: expression tree compiler caches, `System.Text.Json` serialization metadata, and regex compilation internals all rely on `ConditionalWeakTable` to avoid rooting intermediate structures.

Weak references are not a universal cache solution. They defer to memory pressure — entries evaporate under load, and the GC cadence is unpredictable. A weak-reference cache is appropriate when reconstruction is cheap and cache entries are expected to be large. When reconstruction is expensive (database calls, network fetches) or when predictable eviction matters, a bounded strong-reference cache with explicit eviction (`MemoryCache`, `ConcurrentLru`) is the better choice.

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
