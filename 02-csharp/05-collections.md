# C# Collections

## Core Idea

Collections are one of the places where language design meets algorithmic reality. Two code samples can look equally simple at the call site while having very different behavior in memory, lookup cost, mutation cost, and concurrency characteristics.

This chapter is not only about naming the standard collection types. It is about choosing them deliberately. The right collection can make invariants clearer and algorithms cheaper. The wrong one can quietly introduce linear scans, accidental duplicates, unstable mutation semantics, or thread-safety problems.

## Choosing A Collection By Access Pattern

The most useful way to think about collections is not by memorizing type names, but by asking what the code needs to do most often.

| Need | Good Choice | Reason |
| --- | --- | --- |
| Fixed-size indexed data | `T[]` | minimal overhead and direct indexing |
| Ordered resizable sequence | `List<T>` | efficient append and index access |
| Key-based lookup | `Dictionary<TKey, TValue>` | average constant-time lookup |
| Uniqueness or membership checks | `HashSet<T>` | average constant-time membership |
| FIFO workflow | `Queue<T>` | natural enqueue/dequeue semantics |
| LIFO workflow | `Stack<T>` | natural push/pop semantics |
| Concurrent key-value access | `ConcurrentDictionary<TKey, TValue>` | thread-safe dictionary operations |

This framing matters because collection choice is really a statement about dominant operations. The best collection for appending is not always the best collection for repeated membership checks. The best collection for preserving order may be the wrong one for enforcing uniqueness.

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

For most business application code, `List<T>` is the default ordered collection because it provides flexible sizing with efficient append and direct indexing. Arrays remain valuable when the collection is truly fixed or when interop and lower-level APIs make the shape meaningful.

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

These operations shift existing elements, so their cost grows with the size of the affected tail of the list. A `List<T>` is therefore a strong default for append-heavy ordered data, but not always the right structure for frequent front-insert or front-remove workflows.

## Enumeration And Structural Mutation

Many developers discover only after the fact that mutating a list while enumerating it is usually invalid.

```csharp
foreach (var user in users)
{
    if (!user.IsActive)
    {
        users.Remove(user);
    }
}
```

This throws because the list's enumerator expects the underlying structure to remain stable during enumeration. Safer alternatives include collecting items to remove separately or using purpose-built operations such as:

```csharp
users.RemoveAll(user => !user.IsActive);
```

The larger lesson is that iteration and mutation are not always independent concerns. Collection APIs often encode assumptions about when the structure may change.

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

The important design point is that a dictionary does not merely store pairs. It asserts that key-based lookup is a first-class operation in the model.

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

That is why immutable primitives, records, and dedicated value-object identifiers are often safer dictionary keys than mutable entities.

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

It is also ideal for deduplication and efficient membership checks:

```csharp
var seen = new HashSet<int>();

if (seen.Add(orderId))
{
    // first time seeing this order
}
```

When code repeatedly calls `List<T>.Contains` on large data, that is often a sign that the structure should really be a set. Choosing `HashSet<T>` communicates the invariant more clearly and usually improves performance at the same time.

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

`ConcurrentDictionary<TKey, TValue>` provides thread-safe dictionary operations:

```csharp
var cache = new ConcurrentDictionary<int, User>();

var user = cache.GetOrAdd(userId, id => LoadUser(id));

cache.AddOrUpdate(
    userId,
    id => new User(id),
    (id, existing) => existing with { LastSeenAt = DateTimeOffset.UtcNow });
```

This protects dictionary-level operations, but it does not magically make the stored objects immutable or safe for arbitrary concurrent mutation. Thread-safe containers and thread-safe payloads are related but distinct concerns.

Immutable collections solve a different problem:

```csharp
using System.Collections.Immutable;

var original = ImmutableArray.Create("Draft", "Submitted");
var updated = original.Add("Approved");
```

These types trade mutation convenience for easier reasoning, safer sharing, and more predictable concurrency behavior. They are especially useful when data should be passed across threads or retained as snapshots rather than edited in place.

## Collection Choice As Algorithm Design

Collection choice often changes the effective algorithm even when the business requirement stays the same.

Consider the task "given 10,000 orders and 2,000 selected IDs, return the matching orders."

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
