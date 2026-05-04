# Hash Table Patterns In C#

## Core Idea

Hash tables provide fast average-case lookup, insertion, and deletion.

Chinese notes:

- `hash table`: 哈希表.
- `Dictionary`: 字典.
- `HashSet`: 哈希集合.

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

## How A Hash Table Works

A hash table usually has:

- an array of buckets;
- a hash function;
- an equality comparison;
- collision handling;
- resizing when it becomes too full.

Mental model:

```text
key -> GetHashCode() -> bucket index -> compare keys in bucket -> value
```

Average operations are `O(1)` when hash codes are well distributed.

Worst case can degrade toward `O(n)` if many keys collide.

## Collision

A collision happens when different keys map to the same bucket.

```text
"abc" -> bucket 5
"xyz" -> bucket 5
```

The dictionary then uses equality checks to find the correct key inside that bucket.

That is why both `GetHashCode` and `Equals` matter.

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

Why it works:

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

## Knowledge Checks

### Dictionary average complexity?

Average lookup/insert/delete is `O(1)`, but worst case can degrade due to collisions.

### Dictionary vs HashSet?

`Dictionary` maps keys to values. `HashSet` stores unique values and checks membership.

### Why do hash table keys need stable equality?

The dictionary uses hash code and equality to find the bucket and key. If a key's hash-related fields mutate after insertion, lookup may search the wrong bucket.

## Common Mistakes

- Forgetting duplicate keys.
- Modifying dictionary while enumerating.
- Using list for repeated membership checks.
- Ignoring custom equality for complex keys.

## Practice Problems

- Two Sum
- Valid Anagram
- Group Anagrams
- Longest Consecutive Sequence
- Contains Duplicate
- Subarray Sum Equals K
