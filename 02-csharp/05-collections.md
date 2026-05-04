# C# Collections

## Core Idea

Collections store groups of values. Choosing the right collection affects correctness and performance.

Chinese notes:

- `collection`: 集合.
- `hash table`: 哈希表.
- `enumeration`: 枚举遍历.

## Common Collections

Quick selection guide:

| Need | Good Choice | Why |
| --- | --- | --- |
| Fixed-size indexed data | `T[]` | simple and fast |
| Ordered dynamic list | `List<T>` | append and index access are efficient |
| Lookup by key | `Dictionary<TKey,TValue>` | average `O(1)` lookup |
| Unique values / membership check | `HashSet<T>` | average `O(1)` membership |
| FIFO processing | `Queue<T>` | enqueue/dequeue workflow |
| LIFO processing | `Stack<T>` | undo/backtracking workflow |
| Multi-threaded dictionary access | `ConcurrentDictionary<TKey,TValue>` | thread-safe dictionary operations |

### Array

Fixed size.

```csharp
var numbers = new int[3];
```

Fast indexed access.

Example:

```csharp
var scores = new[] { 90, 85, 100 };
Console.WriteLine(scores[0]); // 90
```

Use arrays when size is fixed or when APIs require arrays. For most business lists, `List<T>` is more convenient.

### List<T>

Dynamic array.

```csharp
var users = new List<User>();
users.Add(new User());
```

Good default for ordered lists.

Example:

```csharp
var orders = new List<Order>();
orders.Add(new Order(1));
orders.Add(new Order(2));

foreach (var order in orders)
{
    Console.WriteLine(order.Id);
}
```

### Dictionary<TKey, TValue>

Key-value lookup.

```csharp
var usersById = new Dictionary<int, User>();
```

Average lookup: `O(1)`.

Example:

```csharp
var usersById = users.ToDictionary(user => user.Id);

if (usersById.TryGetValue(42, out var user))
{
    Console.WriteLine(user.Name);
}
```

Use `TryGetValue` when the key may not exist. Indexer access throws if the key is missing.

### HashSet<T>

Unique values.

```csharp
var ids = new HashSet<int>();
```

Good for membership checks.

Example:

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

### Queue<T>

First-in-first-out.

```csharp
var queue = new Queue<Job>();
```

### Stack<T>

Last-in-first-out.

```csharp
var stack = new Stack<int>();
```

Practical examples:

```csharp
var jobs = new Queue<string>();
jobs.Enqueue("send-email");
jobs.Enqueue("generate-report");
Console.WriteLine(jobs.Dequeue()); // send-email
```

```csharp
var undo = new Stack<string>();
undo.Push("typed A");
undo.Push("typed B");
Console.WriteLine(undo.Pop()); // typed B
```

## IEnumerable vs ICollection vs IList

`IEnumerable<T>`:

- can be enumerated;
- minimal abstraction;
- may be lazy.

`ICollection<T>`:

- count;
- add/remove;
- collection operations.

`IList<T>`:

- index-based access;
- ordered list operations.

Use the least powerful interface needed.

Example API design:

```csharp
public void PrintUsers(IEnumerable<User> users)
{
    foreach (var user in users)
    {
        Console.WriteLine(user.Name);
    }
}
```

This method only needs enumeration, so `IEnumerable<User>` is enough.

If the method needs count:

```csharp
public void ValidateUsers(ICollection<User> users)
{
    if (users.Count == 0)
    {
        throw new ValidationException("At least one user is required.");
    }
}
```

If the method needs indexing:

```csharp
public User GetFirst(IList<User> users)
{
    return users[0];
}
```

## Concurrent Collections

Examples:

- `ConcurrentDictionary<TKey, TValue>`;
- `ConcurrentQueue<T>`;
- `ConcurrentBag<T>`.

Use when multiple threads access collection concurrently.

Important:

> Concurrent collections protect collection operations. They do not automatically make the objects inside the collection immutable or thread-safe.

## Under The Hood: List<T>

`List<T>` is a dynamic array（动态数组）.

Internally, it is conceptually built around:

- an internal array, commonly described as `_items`;
- a count, commonly described as `_size`;
- a version number, commonly described as `_version`, used to detect modification during enumeration.

Conceptual model:

```text
List<int>
  _items: [10, 20, 30, _, _, _]
  _size: 3
```

When you call:

```csharp
var numbers = new List<int>();
numbers.Add(10);
numbers.Add(20);
numbers.Add(30);
```

the list stores values in an array. Index access is fast because `numbers[1]` can directly calculate the position in the array.

### Capacity vs Count

`Count` is how many items are actually in the list.

`Capacity` is how many items the internal array can currently hold before it must grow.

```csharp
var list = new List<int>(capacity: 100);

Console.WriteLine(list.Count);    // 0
Console.WriteLine(list.Capacity); // at least 100
```

Why this matters:

- setting capacity can reduce reallocations when you know the approximate size;
- `Count` is business data size;
- `Capacity` is internal storage size.

### How List<T> Grows

When the internal array is full, `List<T>` allocates a larger array and copies existing elements.

Conceptual flow:

```text
Add item
  -> if _size < _items.Length
       store item directly
  -> else
       allocate bigger array
       copy old items
       store new item
```

This is why:

- single `Add` is usually `O(1)`;
- sometimes `Add` becomes `O(n)` because resizing copies all existing elements;
- over many adds, the average cost is still amortized `O(1)`（均摊 O(1)）.

### Insert and Remove Cost

Adding at the end is cheap most of the time.

Inserting in the middle is expensive:

```csharp
list.Insert(0, newItem);
```

The list must shift elements to the right.

Removing from the middle is also expensive:

```csharp
list.RemoveAt(0);
```

The list must shift elements to the left.

Time complexity:

| Operation | Average Cost | Why |
|---|---:|---|
| `list[index]` | `O(1)` | direct array access |
| `Add` at end | amortized `O(1)` | occasional resize |
| `Insert` at front/middle | `O(n)` | shifts elements |
| `RemoveAt` front/middle | `O(n)` | shifts elements |
| `Contains` | `O(n)` | linear search |

### Why Modifying During foreach Throws

`List<T>` enumerator records the list version when enumeration starts.

If the list changes during enumeration, `_version` changes. The enumerator detects that and throws.

Bad:

```csharp
foreach (var user in users)
{
    if (!user.IsActive)
    {
        users.Remove(user); // InvalidOperationException
    }
}
```

Better:

```csharp
users.RemoveAll(user => !user.IsActive);
```

Engineering perspective:

> `List<T>` is backed by an array. It gives fast index access and efficient append, but inserting or removing in the middle requires shifting elements. When capacity is exceeded, it allocates a larger array and copies existing items, so `Add` is amortized `O(1)`, not always strictly `O(1)`.

## Under The Hood: Dictionary<TKey, TValue>

`Dictionary<TKey, TValue>` is a hash table（哈希表）.

It is designed for fast lookup by key:

```csharp
var user = usersById[userId];
```

Conceptually, it uses:

- buckets（桶）: where lookup starts;
- entries（条目）: where keys, values, hash codes, and collision links are stored;
- an equality comparer: usually `EqualityComparer<TKey>.Default`;
- a free list: reusable slots after removals.

Conceptual model:

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

Implementation details can change between .NET versions, but this mental model is the important learning model.

### Lookup Flow

When you call:

```csharp
usersById.TryGetValue(id, out var user);
```

the dictionary roughly does:

```text
1. compute hash code from key
2. map hash code to a bucket
3. check entries linked from that bucket
4. compare hash code and key equality
5. return value if key matches
```

Pseudo-code:

```csharp
int hash = comparer.GetHashCode(key);
int bucketIndex = hash % buckets.Length;

for (int entryIndex = buckets[bucketIndex]; entryIndex >= 0; entryIndex = entries[entryIndex].Next)
{
    if (entries[entryIndex].HashCode == hash &&
        comparer.Equals(entries[entryIndex].Key, key))
    {
        return entries[entryIndex].Value;
    }
}
```

The real implementation is more optimized, but the idea is the same.

### Collision

A collision happens when different keys map to the same bucket.

Example:

```text
Key A -> bucket 5
Key B -> bucket 5
```

The dictionary must compare actual keys, not only hash codes.

This is why `Equals` and `GetHashCode` must agree:

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

Rule:

> If two objects are equal, they must return the same hash code.

The reverse is not required:

> Two objects can have the same hash code and still not be equal.

### Why Dictionary Is Usually O(1)

Dictionary lookup is average `O(1)` because a good hash function spreads keys across buckets.

Worst case can degrade toward `O(n)` if many keys collide.

In normal application code, with good hash codes and enough capacity, lookup is effectively constant time.

### Resize Cost

When the dictionary grows, it may allocate larger internal arrays and redistribute entries.

This is expensive compared with a normal lookup.

If you know the expected size, initialize capacity:

```csharp
var usersById = new Dictionary<int, User>(capacity: users.Count);
```

### Mutable Keys Are Dangerous

Do not mutate a key after inserting it into a dictionary.

Bad:

```csharp
var key = new UserKey { TenantId = "t1", UserId = "u1" };
var map = new Dictionary<UserKey, string>();

map[key] = "Alice";

key.UserId = "u2"; // dangerous if key participates in hash/equality
```

The dictionary placed the key based on the old hash code. After mutation, lookup may fail.

Better:

```csharp
public sealed record UserKey(string TenantId, string UserId);
```

### Dictionary vs List Lookup

If you repeatedly search by ID:

```csharp
users.FirstOrDefault(u => u.Id == id);
```

that is `O(n)` each time.

For repeated lookup, build a dictionary:

```csharp
var usersById = users.ToDictionary(u => u.Id);

if (usersById.TryGetValue(id, out var user))
{
    // O(1) average lookup
}
```

Engineering perspective:

> `Dictionary<TKey,TValue>` uses hashing. It computes a hash code for the key, maps it to a bucket, then checks entries in that bucket using equality. Average lookup is `O(1)` when hash distribution is good, but collisions, bad `GetHashCode`, mutable keys, or frequent resizing can hurt performance.

## Under The Hood: HashSet<T>

`HashSet<T>` is like a dictionary without values.

It stores unique values and uses hashing to check membership.

Conceptually:

```csharp
var seen = new HashSet<int>();

if (seen.Add(orderId))
{
    // first time seeing this order
}
```

`Add` returns:

- `true` if the value was not already present;
- `false` if it already existed.

Good use cases:

- deduplication;
- membership checks;
- set operations like union, intersection, except.

Avoid:

- using `List<T>.Contains` repeatedly for large data;
- using mutable objects as hash set values unless equality is stable.

## Under The Hood: Queue<T> and Stack<T>

`Queue<T>` is FIFO: first in, first out.

It is commonly implemented with a circular array（循环数组） concept:

```text
head -> item to dequeue next
tail -> position to enqueue next
```

This avoids shifting all elements on every dequeue.

`Stack<T>` is LIFO: last in, first out.

It can use an array and a top index:

```text
Push -> store at top, increment top
Pop  -> decrement top, return item
```

Key point:

> Queue and stack operations are usually `O(1)`. If you used a plain list and removed from the front repeatedly, it would be `O(n)` because elements shift.

## Under The Hood: ConcurrentDictionary<TKey, TValue>

`Dictionary<TKey,TValue>` is not safe for concurrent writes.

Use `ConcurrentDictionary<TKey,TValue>` when multiple threads may read and write.

Common methods:

```csharp
var cache = new ConcurrentDictionary<int, User>();

var user = cache.GetOrAdd(userId, id => LoadUser(id));

cache.AddOrUpdate(
    userId,
    id => new User(id),
    (id, existing) => existing with { LastSeenAt = DateTimeOffset.UtcNow });
```

Important nuance:

- operations are thread-safe at the dictionary level;
- the objects stored inside may still be mutable and not thread-safe;
- factory delegates may be invoked more than once under races, so avoid side effects inside factories when possible.

## Immutable Collections

Immutable collections do not change after creation.

Useful for:

- thread safety;
- functional style;
- predictable state.

Example:

```csharp
using System.Collections.Immutable;

var original = ImmutableArray.Create("Draft", "Submitted");
var updated = original.Add("Approved");

Console.WriteLine(original.Length); // 2
Console.WriteLine(updated.Length);  // 3
```

This is useful when you want safe sharing without locks.

## Collection Choice In Real APIs

Example problem:

```text
Given 10,000 orders and 2,000 selected order IDs, return selected orders.
```

Slow shape:

```csharp
var selected = orders
    .Where(order => selectedIds.Contains(order.Id))
    .ToList();
```

If `selectedIds` is a `List<int>`, each `Contains` can scan the list.

Better:

```csharp
var selectedIdSet = selectedIds.ToHashSet();

var selected = orders
    .Where(order => selectedIdSet.Contains(order.Id))
    .ToList();
```

Key point:

> Collection choice can change an algorithm from repeated linear search to average constant-time lookup.

## Review Questions

### List vs array?

> Array has fixed size and direct indexed access. `List<T>` is a dynamic array that can grow and is easier for most application code.

### Dictionary vs HashSet?

> `Dictionary` maps keys to values. `HashSet` stores unique values and is used for membership checks.

### IEnumerable vs IQueryable?

> `IEnumerable` represents in-memory enumeration or deferred sequence logic. `IQueryable` represents a query expression that can be translated by a provider such as EF Core into SQL.

### Why should keys in a dictionary be immutable?

> Dictionary lookup depends on hash code and equality. If a key changes after insertion, the dictionary may look in the wrong bucket and fail to find the entry.

### How do you choose between `List<T>` and `HashSet<T>`?

> Use `List<T>` when order and index access matter. Use `HashSet<T>` when uniqueness or repeated membership checks matter.

## Common Mistakes

### Mistake: Using `List.Contains` for repeated lookups instead of `HashSet`.

Why it is wrong:

> `List.Contains` is usually O(n). Repeating it inside loops can turn a simple operation into O(n*m). `HashSet` lookup is usually O(1).

Better answer:

> Convert lookup data to `HashSet<T>` when you repeatedly test membership.

### Mistake: Modifying collection while enumerating.

Why it is wrong:

> Most collection enumerators are invalidated when the collection changes, which can throw exceptions or produce incorrect iteration behavior.

Better answer:

> Collect changes separately, iterate over a copy, or use safe collection APIs.

### Mistake: Exposing mutable lists publicly.

Why it is wrong:

> Callers can add/remove items without validation, breaking invariants.

Better answer:

> Expose `IReadOnlyList<T>` or read-only views and provide methods that enforce rules.

### Mistake: Using non-thread-safe collections across threads.

Why it is wrong:

> `List<T>` and `Dictionary<TKey,TValue>` are not safe for concurrent writes. Race conditions can corrupt state or throw exceptions.

Better answer:

> Use locks, immutable snapshots, channels, or concurrent collections depending on the access pattern.

### Mistake: Calling `ToList()` too early.

Why it is wrong:

> It materializes the sequence immediately. In EF Core, this can move filtering/projection from SQL to memory and load too much data.

Better answer:

> Compose queries first, then materialize at the boundary.
