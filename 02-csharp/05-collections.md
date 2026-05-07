# C# Collections

## Core Idea

Collections are one of the places where language design meets algorithmic reality. Two code samples can look equally simple at the call site while having very different behavior in memory, lookup cost, mutation cost, and concurrency characteristics. The right collection makes invariants clearer and algorithms cheaper. The wrong one can quietly introduce linear scans, accidental duplicates, or thread-safety problems.

## Choosing A Collection By Access Pattern

Collection selection starts from the dominant access pattern.

| Need | Good Choice | Reason |
| --- | --- | --- |
| Fixed-size indexed data | `T[]` | minimal overhead and direct indexing |
| Ordered resizable sequence | `List<T>` | efficient append and index access |
| Key-based lookup | `Dictionary<TKey, TValue>` | average constant-time lookup |
| Uniqueness or membership checks | `HashSet<T>` | average constant-time membership |
| FIFO workflow | `Queue<T>` | natural enqueue/dequeue semantics |
| LIFO workflow | `Stack<T>` | natural push/pop semantics |
| Concurrent key-value access | `ConcurrentDictionary<TKey, TValue>` | thread-safe dictionary operations |

Collection choice is a statement about dominant operations. The best collection for appending is not always the best collection for repeated membership checks. The best collection for preserving order may be the wrong one for enforcing uniqueness.

## Arrays And Lists

Arrays and `List<T>` are often confused because both support indexed access, but they represent different design intentions.

An array is fixed-size:

```csharp
var numbers = new int[3];
```

It is useful when the size is known in advance, when an API specifically expects an array, or when minimal abstraction and predictable layout matter.

```csharp
var scores = new[] { 90, 85, 100 };
Console.WriteLine(scores[0]);
```

`List<T>` adds growth and richer collection operations:

```csharp
var orders = new List<Order>();
orders.Add(new Order(1));
orders.Add(new Order(2));
```

```csharp
foreach (var order in orders)
{
    Console.WriteLine(order.Id);
}
```

For most business application code, `List<T>` is the default ordered collection because it provides flexible sizing with efficient append and direct indexing. Arrays remain valuable when the collection is truly fixed or when interop and lower-level APIs demand the shape.

## The Shape Of `List<T>`

`List<T>` is conceptually backed by an internal array plus a count of how many slots are currently in use.

```text
List<int>
  _items: [10, 20, 30, _, _, _]
  _size: 3
```

This design explains most of its performance characteristics.

Appending at the end is usually cheap because the next free slot is already available:

```csharp
var numbers = new List<int>();
numbers.Add(10);
numbers.Add(20);
numbers.Add(30);
```

Index access is also cheap because the list can calculate the array position directly:

```csharp
var second = numbers[1];
```

When the internal array runs out of space, however, the list must allocate a larger array and copy existing elements. That is why append is amortized `O(1)` rather than always strictly `O(1)`.

`Count` and `Capacity` capture this distinction:

```csharp
var list = new List<int>(capacity: 100);

Console.WriteLine(list.Count);    // 0
Console.WriteLine(list.Capacity); // at least 100
```

`Count` is how many business values are present. `Capacity` is how much storage is currently reserved. Pre-sizing can reduce reallocations when the approximate size is known.

The same array-backed design also explains why insertion and removal in the middle are more expensive:

```csharp
list.Insert(0, newItem);
list.RemoveAt(0);
```

These operations shift existing elements, so cost grows with the size of the affected tail. A `List<T>` is therefore a strong default for append-heavy ordered data, but not the right structure for frequent front-insert or front-remove workflows.

## Enumeration And Structural Mutation

Mutating a list while enumerating it is invalid.

```csharp
foreach (var user in users)
{
    if (!user.IsActive)
    {
        users.Remove(user);
    }
}
```

This throws because the list's enumerator expects the underlying structure to remain stable during enumeration. Safer alternatives include collecting items to remove separately or using purpose-built operations:

```csharp
users.RemoveAll(user => !user.IsActive);
```

Iteration and mutation are not always independent concerns. Collection APIs encode assumptions about when the structure may change.

## Dictionaries And Key-Based Access

`Dictionary<TKey, TValue>` exists for a different problem: retrieving a value efficiently by key.

```csharp
var usersById = users.ToDictionary(user => user.Id);

if (usersById.TryGetValue(42, out var user))
{
    Console.WriteLine(user.Name);
}
```

This is often much better than repeatedly scanning a list:

```csharp
var user = users.FirstOrDefault(u => u.Id == id);
```

For repeated lookup, the difference between linear search and average constant-time lookup can dominate overall performance.

A dictionary does not merely store pairs. It asserts that key-based lookup is a first-class operation in the model.

## The Shape Of `Dictionary<TKey, TValue>`

Dictionaries use hashing. At a high level, they compute a hash code from the key, map that hash code to a bucket, and then compare keys within that bucket to find the actual entry.

```text
buckets
  [0] -> entry 2
  [1] -> empty
  [2] -> entry 0

entries
  [0] hash=102 key=42 value=Alice next=-1
  [1] hash=205 key=51 value=Bob   next=-1
  [2] hash=309 key=77 value=Cara  next=1
```

The exact implementation can change across runtime versions, but the conceptual model is stable:

```text
compute hash
locate bucket
walk entries for that bucket
compare actual keys
return matching value
```

This explains several practical rules. Good hash distribution matters. Equality and hash code must agree. Collisions are normal and handled by the data structure, but pathological collision patterns can damage performance.

The .NET runtime mitigates hash-collision denial-of-service attacks by randomizing hash codes per process (`HashRandomization`), which prevents attackers from predicting bucket assignments. In .NET 8, `Dictionary<TKey, TValue>` also supports alternate-key lookup via `IAlternateEqualityComparer<TKey, TAlternate>`, which enables key-based operations using a different type without allocating a full key instance — useful when the natural lookup value is a substring, a span, or a composite fragment rather than the full key object.

## Equality, Hash Codes, And Stable Keys

Dictionary correctness depends on the meaning of key equality.

```csharp
public sealed class UserKey
{
    public string TenantId { get; init; } = "";
    public string UserId { get; init; } = "";

    public override bool Equals(object? obj)
    {
        return obj is UserKey other &&
               TenantId == other.TenantId &&
               UserId == other.UserId;
    }

    public override int GetHashCode()
    {
        return HashCode.Combine(TenantId, UserId);
    }
}
```

If two keys are equal, they must produce the same hash code. The reverse is not required: two unequal keys may still share a hash code and force a collision check.

Stable key identity is equally important. Mutating a key after insertion can make the dictionary unable to find the entry correctly:

```csharp
var key = new UserKey { TenantId = "t1", UserId = "u1" };
var map = new Dictionary<UserKey, string>();

map[key] = "Alice";

key.UserId = "u2";
```

Immutable primitives, records, and dedicated value-object identifiers are therefore safer dictionary keys than mutable entities.

Comparer choice is part of the contract too:

```csharp
var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
```

This is not a cosmetic option. It changes lookup semantics for the entire collection. If a key-based collection depends on case-insensitive or culture-specific behavior, the comparer must be chosen at creation time because that choice is part of how the collection defines identity.

## Hash Sets And Uniqueness

`HashSet<T>` uses the same broad hashing principles as a dictionary, but it focuses on membership and uniqueness rather than key-value association.

```csharp
var allowedStatuses = new HashSet<string>
{
    "Draft",
    "Submitted",
    "Approved"
};

if (!allowedStatuses.Contains(inputStatus))
{
    throw new ValidationException("Invalid status.");
}
```

`HashSet<T>` also serves deduplication and efficient membership checks:

```csharp
var seen = new HashSet<int>();

if (seen.Add(orderId))
{
    // first time seeing this order
}
```

When code repeatedly calls `List<T>.Contains` on large data, that is often a sign that the structure should really be a set. Choosing `HashSet<T>` communicates the invariant more clearly and usually improves performance at the same time.

The same comparer issue exists here as well:

```csharp
var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
```

If the business rule says `"Admin"` and `"admin"` are the same tag, the comparer is the activation point for that rule at the collection level rather than an afterthought the callers are expected to remember manually.

## Frozen Collections ( .NET 8 )

`FrozenSet<T>` and `FrozenDictionary<TKey, TValue>`, introduced in .NET 8, invert the usual trade-off between creation cost and read performance. They are expensive to construct but extremely fast to read.

```csharp
using System.Collections.Frozen;

var statusSet = new HashSet<string> { "Draft", "Submitted", "Approved" };
var frozenStatuses = statusSet.ToFrozenSet();
```

The frozen variants precompute an optimized internal structure — typically a perfect hash or a densely packed lookup table — so that `Contains` and `TryGetValue` execute in fewer instructions than the equivalent operations on a standard hash-based collection. The trade-off is that frozen collections are immutable and construction cost scales with the collection size.

A typical application is configuration or service-registration data that is built once at startup and queried many times during request processing:

```csharp
public sealed class FeatureFlags
{
    private readonly FrozenSet<string> _enabledFeatures;

    public FeatureFlags(IEnumerable<string> enabled)
    {
        _enabledFeatures = enabled.ToFrozenSet(StringComparer.OrdinalIgnoreCase);
    }

    public bool IsEnabled(string feature) => _enabledFeatures.Contains(feature);
}
```

After construction, every feature check is a constant-time lookup against the precomputed structure. The same pattern applies to route tables, permission sets, and any data that is known at startup and queried at high frequency throughout the application lifetime.

Frozen collections do not replace `HashSet<T>` or `Dictionary<TKey, TValue>`. They address a narrower scenario where the read-to-write ratio is so extreme that paying a one-time build cost is justified by repeated read savings.

## Performance Characteristics By Operation

Collection choice is often clarified by comparing the algorithmic complexity of common operations across types.

| Operation | `List<T>` | `Dictionary<K,V>` | `HashSet<T>` | `Queue<T>` | `SortedDictionary<K,V>` | `LinkedList<T>` |
| --- | --- | --- | --- | --- | --- | --- |
| Add (append) | O(1)* | O(1)* | O(1)* | O(1)* | O(log n) | O(1) |
| Add (insert) | O(n) | — | — | — | O(log n) | O(1)† |
| Remove (by value) | O(n) | O(1)* | O(1)* | — | O(log n) | O(n) |
| Remove (from front) | O(n) | — | — | O(1) | — | O(1) |
| Lookup by index | O(1) | — | — | — | — | O(n) |
| Lookup by key | — | O(1)* | — | — | O(log n) | — |
| Contains (membership) | O(n) | O(1)* | O(1)* | O(n) | O(log n) | O(n) |
| Enumerate (full) | O(n) | O(n) | O(n) | O(n) | O(n) | O(n) |

`*` Amortized. `—` Not a natural operation for the type. `†` O(1) when the insertion point node is already in hand; reaching that node may cost O(n).

The table makes explicit what experienced engineers often internalize: every collection represents a set of trade-offs baked into its internal structure. A `LinkedList<T>` provides constant-time insertion and removal at known positions but linear-time indexing. A `SortedDictionary<TKey, TValue>` maintains sorted order at a log-n cost per operation, which is more expensive than a hash-based dictionary but cheaper than sorting on every access. A `Queue<T>` is essentially a `List<T>` optimized to avoid the O(n) cost of front removal.

The table also reveals why `List<T>` is rarely the right choice for membership-heavy work: `Contains` is O(n) because it scans. The same operation on a `HashSet<T>` is amortized O(1). When profiling reveals repeated `Contains` calls on large lists, the fix is often not a faster algorithm but a different data structure.

## Queues And Stacks As Behavioral Collections

`Queue<T>` and `Stack<T>` are useful because they represent workflow semantics directly, not merely storage shape.

A queue is first in, first out:

```csharp
var jobs = new Queue<string>();
jobs.Enqueue("send-email");
jobs.Enqueue("generate-report");
Console.WriteLine(jobs.Dequeue()); // send-email
```

A stack is last in, first out:

```csharp
var undo = new Stack<string>();
undo.Push("typed A");
undo.Push("typed B");
Console.WriteLine(undo.Pop()); // typed B
```

These types are clearer than trying to simulate the same behavior with a list. They also align better with the underlying operations. Removing from the front of a plain list repeatedly is typically expensive because it shifts elements. Queue and stack abstractions exist partly to avoid those accidental algorithmic costs.

## Collection Interfaces And API Boundaries

Concrete collections matter, but collection interfaces matter just as much at API boundaries because they define what the caller is allowed to assume.

`IEnumerable<T>` means the data can be enumerated:

```csharp
public void PrintUsers(IEnumerable<User> users)
{
    foreach (var user in users)
    {
        Console.WriteLine(user.Name);
    }
}
```

`ICollection<T>` adds mutation-oriented collection semantics and count:

```csharp
public void ValidateUsers(ICollection<User> users)
{
    if (users.Count == 0)
    {
        throw new ValidationException("At least one user is required.");
    }
}
```

`IList<T>` adds indexed ordered access:

```csharp
public User GetFirst(IList<User> users)
{
    return users[0];
}
```

The design principle is to accept the weakest abstraction that still expresses what the method truly needs. That reduces coupling to unnecessary capabilities and makes the contract more honest.

## Concurrent And Immutable Collections

Once multiple threads may access the same collection, ordinary collection types are often no longer sufficient.

### `ConcurrentDictionary<TKey, TValue>`

`ConcurrentDictionary<TKey, TValue>` provides thread-safe dictionary operations:

```csharp
var cache = new ConcurrentDictionary<int, User>();

var user = cache.GetOrAdd(userId, id => LoadUser(id));

cache.AddOrUpdate(
    userId,
    id => new User(id),
    (id, existing) => existing with { LastSeenAt = DateTimeOffset.UtcNow });
```

This protects dictionary-level operations, but it does not make the stored objects immutable or safe for arbitrary concurrent mutation. Thread-safe containers and thread-safe payloads are related but distinct concerns.

A more realistic contrast looks like this:

```csharp
public sealed class ShoppingCart
{
    public List<string> Items { get; } = new();
}

var carts = new ConcurrentDictionary<int, ShoppingCart>();

var cart = carts.GetOrAdd(userId, _ => new ShoppingCart());
cart.Items.Add("book");
```

The dictionary access is thread-safe, but the `List<string>` inside `ShoppingCart` is not. If multiple operations can mutate the same cart concurrently, the container has protected only the lookup boundary, not the payload's internal invariants.

### `ConcurrentBag<T>` And Thread-Local Storage

`ConcurrentBag<T>` is optimized for producer-consumer scenarios where the same thread both adds and removes items. It achieves this through thread-local storage: each thread maintains its own private list of items, and stealing occurs only when a thread's local list is empty.

```csharp
var bag = new ConcurrentBag<int>();

Parallel.For(0, 4, i =>
{
    bag.Add(i);
});
```

The consequence is that `ConcurrentBag<T>` does not guarantee any particular ordering. Items added by one thread may appear in a different order — or not appear at all to another thread's enumeration — depending on which thread-local lists have been flushed or stolen. This makes `ConcurrentBag<T>` unsuitable when ordering is meaningful. It fits best in work-stealing patterns or when the bag is a temporary holding area for unordered work items.

```csharp
var bag = new ConcurrentBag<int>();

Parallel.For(0, 100, i =>
{
    bag.Add(i);
});

Console.WriteLine(bag.Count); // 100 — but enumeration order is nondeterministic
```

The count is reliable; the sequence is not. Code that iterates a `ConcurrentBag<T>` expecting insertion order will observe different results across runs.

### `BlockingCollection<T>` And Bounded Producer-Consumer

`BlockingCollection<T>` wraps any `IProducerConsumerCollection<T>` (such as `ConcurrentQueue<T>` or `ConcurrentBag<T>`) and adds bounding and blocking semantics.

```csharp
var orders = new BlockingCollection<Order>(boundedCapacity: 100);

var producer = Task.Run(() =>
{
    foreach (var order in incomingOrders)
    {
        orders.Add(order); // blocks if capacity is 100
    }
    orders.CompleteAdding();
});

var consumer = Task.Run(() =>
{
    foreach (var order in orders.GetConsumingEnumerable())
    {
        ProcessOrder(order);
    }
});

await Task.WhenAll(producer, consumer);
```

When the collection reaches its bounded capacity, `Add` blocks until the consumer removes an item. This provides backpressure: the producer cannot outrun the consumer indefinitely. `CompleteAdding` signals that no more items will arrive, which causes `GetConsumingEnumerable` to finish after draining the remaining items.

Without `BlockingCollection<T>`, a producer-consumer pipeline built on `ConcurrentQueue<T>` requires manual coordination — polling, signaling, or unbounded growth — to achieve the same behavior. The blocking wrapper encodes the coordination pattern directly in the collection semantics.

### Immutable Collections And Structural Sharing

Immutable collections solve a different problem:

```csharp
using System.Collections.Immutable;

var original = ImmutableArray.Create("Draft", "Submitted");
var updated = original.Add("Approved");
```

These types trade mutation convenience for easier reasoning, safer sharing, and more predictable concurrency behavior. They are especially useful when data should be passed across threads or retained as snapshots rather than edited in place.

The key mechanism behind `ImmutableList<T>` is structural sharing. Adding an element does not copy the entire list. Instead, it creates new nodes along the path to the insertion point while sharing the unchanged subtrees:

```text
original:           updated (logical view):
  root                root'
   |                   |
  [A]                [A']
   |                  |  \
  [B]                [B] [E]   <-- new node
   |                  |
  [C]                [C]       <-- shared (unchanged)

original: [A, B, C]
updated:  [A, B, C, E]
```

The internal representation is a balanced tree (an AVL tree in practice). An append operation creates new internal nodes along the right spine — typically O(log n) allocations — while the leftmost subtrees are reused from the original. This is why immutable collections are not simply "copy on write" with a full clone; they are designed so that most of the structure is shared between versions.

`ImmutableArray<T>` takes a different approach. It is a struct wrapping a single array reference, so "add" operations do require a full copy. It is optimized for scenarios where the collection is updated rarely and read frequently — similar in spirit to `FrozenSet<T>`, but without the precomputation step.

`ImmutableDictionary<TKey, TValue>` and `ImmutableHashSet<T>` use the same structural sharing principle over hash-array-mapped tries, keeping the cost of "modification" proportional to the tree depth rather than the collection size.

## Collection Choice As Algorithm Design

Collection choice often changes the effective algorithm even when the business requirement stays the same.

Given 10,000 orders and 2,000 selected IDs, returning the matching orders is a filtering problem whose cost depends entirely on how membership is tested.

```csharp
var selected = orders
    .Where(order => selectedIds.Contains(order.Id))
    .ToList();
```

If `selectedIds` is a list, membership checking may be repeated linear search. A more appropriate structure changes the cost profile:

```csharp
var selectedIdSet = selectedIds.ToHashSet();

var selected = orders
    .Where(order => selectedIdSet.Contains(order.Id))
    .ToList();
```

Nothing about the business rule changed. Only the representation changed. This is why collections belong in design discussions rather than being treated as incidental implementation detail.

A richer example makes that trade-off clearer in application code:

```csharp
public sealed record Order(int Id, int CustomerId, decimal Total);

var orders = Enumerable.Range(1, 10_000)
    .Select(id => new Order(id, id % 200, id * 1.5m))
    .ToList();

var selectedIds = Enumerable.Range(100, 2_000).ToList();

var slow = orders
    .Where(order => selectedIds.Contains(order.Id))
    .ToList();

var selectedIdSet = selectedIds.ToHashSet();

var fast = orders
    .Where(order => selectedIdSet.Contains(order.Id))
    .ToList();
```

The code is almost identical at the surface. The important difference is that one version repeatedly performs linear membership checks while the other expresses the lookup requirement directly in the data structure.
