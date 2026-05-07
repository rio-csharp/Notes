# Hash Table Patterns In C#

## Core Idea

Hash tables provide fast average-case lookup, insertion, and deletion.

## Dictionary

```csharp
var map = new Dictionary<string, int>();
map["alice"] = 1;
```

Use when mapping key to value.

## HashSet

```csharp
var seen = new HashSet<int>();
seen.Add(1);
```

Use when checking membership or uniqueness.

## Hash Table Internals

A hash table stores entries in an array of buckets, using a hash function to determine placement and an equality comparer to resolve ambiguity.

Mental model:

```text
key -> GetHashCode() -> bucket index -> compare keys in bucket -> value
```

### .NET Implementation Details

`Dictionary<TKey, TValue>` in .NET uses **separate chaining** for collision resolution. Internally, it maintains:

- an `int[]` called `_buckets` that maps hash codes to entry indices;
- an `Entry[]` array where each entry stores the hash code, key, value, and the index of the next entry in the same bucket.

When a collision occurs (two keys hash to the same bucket), new entries are linked together forming a chain. During lookup, the dictionary follows the chain, comparing keys with `Equals` until it finds a match or reaches the end.

For small bucket chains, a linear scan is fast. If a bucket accumulates many entries due to poor hash distribution, the chain length grows and performance degrades toward `O(n)`. .NET 7 introduced improvements to convert long chains into array-based storage for faster scanning.

### Resizing

When the load factor (entry count / bucket count) exceeds a threshold, the dictionary allocates a larger bucket array and rehashes all existing entries. This is an `O(n)` operation but happens infrequently, which is why `Add` is amortized `O(1)`.

Average operations are `O(1)` when hash codes are well distributed. Worst case degrades toward `O(n)` if many keys collide into the same bucket.

## Collision

A collision happens when different keys map to the same bucket.

```text
"abc" -> bucket 5
"xyz" -> bucket 5
```

The dictionary traverses the chain at that bucket, using `Equals` to identify the correct key.

That is why both `GetHashCode` and `Equals` must be implemented correctly. A good hash function spreads keys evenly; correct equality semantics ensure the right entry is found within a bucket chain.

## Custom Equality

Case-insensitive dictionary:

```csharp
var usersByEmail = new Dictionary<string, int>(
    StringComparer.OrdinalIgnoreCase);

usersByEmail["ADA@example.com"] = 1;

Console.WriteLine(usersByEmail.ContainsKey("ada@example.com")); // true
```

Custom key:

```csharp
public sealed record ProductKey(string Sku, string WarehouseCode);

var inventory = new Dictionary<ProductKey, int>();
inventory[new ProductKey("SKU-1", "NYC")] = 10;
```

Records provide value-based equality by default, which makes them useful as dictionary keys.

Avoid mutable key fields. If a key changes after insertion, lookup can fail.

## Frequency Count

```csharp
public Dictionary<char, int> CountChars(string s)
{
    var counts = new Dictionary<char, int>();

    foreach (var ch in s)
    {
        counts[ch] = counts.GetValueOrDefault(ch) + 1;
    }

    return counts;
}
```

Helper pattern:

```csharp
public static void Increment<TKey>(
    Dictionary<TKey, int> counts,
    TKey key)
    where TKey : notnull
{
    counts[key] = counts.GetValueOrDefault(key) + 1;
}
```

## Group Anagrams

```csharp
public IList<IList<string>> GroupAnagrams(string[] strs)
{
    var groups = new Dictionary<string, List<string>>();

    foreach (var str in strs)
    {
        var chars = str.ToCharArray();
        Array.Sort(chars);
        var key = new string(chars);

        if (!groups.TryGetValue(key, out var list))
        {
            list = new List<string>();
            groups[key] = list;
        }

        list.Add(str);
    }

    return groups.Values.Select(x => (IList<string>)x).ToList();
}
```

## Longest Consecutive Sequence

```csharp
public int LongestConsecutive(int[] nums)
{
    var set = nums.ToHashSet();
    var best = 0;

    foreach (var num in set)
    {
        if (set.Contains(num - 1))
        {
            continue;
        }

        var current = num;
        var length = 1;

        while (set.Contains(current + 1))
        {
            current++;
            length++;
        }

        best = Math.Max(best, length);
    }

    return best;
}
```

The key idea is to only start counting from sequence starts.

```text
num is a start if num - 1 is not in the set
```

This prevents recounting the same sequence many times.

## Subarray Sum Equals K

Prefix sum plus hash map.

```csharp
public int SubarraySum(int[] nums, int k)
{
    var countByPrefix = new Dictionary<int, int>
    {
        [0] = 1
    };

    var prefix = 0;
    var result = 0;

    foreach (var num in nums)
    {
        prefix += num;

        if (countByPrefix.TryGetValue(prefix - k, out var count))
        {
            result += count;
        }

        countByPrefix[prefix] = countByPrefix.GetValueOrDefault(prefix) + 1;
    }

    return result;
}
```

How it works:

```text
currentPrefix - previousPrefix = k
previousPrefix = currentPrefix - k
```

This works even with negative numbers, unlike many sliding-window sum patterns.

## LRU Cache

Hash table plus linked list.

```csharp
public sealed class LruCache
{
    private readonly int _capacity;
    private readonly Dictionary<int, LinkedListNode<(int Key, int Value)>> _map = new();
    private readonly LinkedList<(int Key, int Value)> _list = new();

    public LruCache(int capacity)
    {
        _capacity = capacity;
    }

    public int Get(int key)
    {
        if (!_map.TryGetValue(key, out var node))
        {
            return -1;
        }

        _list.Remove(node);
        _list.AddFirst(node);

        return node.Value.Value;
    }

    public void Put(int key, int value)
    {
        if (_map.TryGetValue(key, out var existing))
        {
            existing.Value = (key, value);
            _list.Remove(existing);
            _list.AddFirst(existing);
            return;
        }

        if (_map.Count == _capacity)
        {
            var leastUsed = _list.Last!;
            _map.Remove(leastUsed.Value.Key);
            _list.RemoveLast();
        }

        var node = new LinkedListNode<(int Key, int Value)>((key, value));
        _list.AddFirst(node);
        _map[key] = node;
    }
}
```

Operations are `O(1)` because:

- dictionary finds nodes quickly;
- linked list moves/removes known nodes quickly.

Hash tables underpin a broad class of efficient lookup problems including anagram grouping, duplicate detection, consecutive sequence analysis, and subarray sum counting.
