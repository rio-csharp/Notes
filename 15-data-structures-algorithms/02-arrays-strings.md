# Arrays And Strings In C#

## Core Idea

Arrays and strings are among the most common foundations for coding practice.

Chinese notes:

- `array`: 数组.
- `string`: 字符串.
- `hash map`: 哈希表.
- `two pointers`: 双指针.

## Common Patterns

- frequency counting;
- prefix sum;
- two pointers;
- sliding window;
- sorting;
- hash set lookup;
- in-place modification.

## Array Basics In C#

An array has fixed length.

```csharp
var nums = new int[] { 10, 20, 30 };

Console.WriteLine(nums[0]);      // 10
Console.WriteLine(nums.Length);  // 3
```

Access by index is `O(1)` because the runtime can compute the memory location from:

```text
base address + index * element size
```

But inserting in the middle of an array requires shifting elements.

```csharp
void InsertAt(int[] source, int index, int value)
{
    for (int i = source.Length - 1; i > index; i--)
    {
        source[i] = source[i - 1];
    }

    source[index] = value;
}
```

Time:

```text
O(n)
```

## `List<T>` Mental Model

`List<T>` is a dynamic array.

It has:

- `Count`: number of actual elements;
- `Capacity`: size of the internal array.

```csharp
var list = new List<int>(capacity: 4);
list.Add(1);
list.Add(2);

Console.WriteLine(list.Count);    // 2
Console.WriteLine(list.Capacity); // at least 4
```

Important operations:

| Operation | Average Time |
|---|---:|
| index access | `O(1)` |
| add at end | `O(1)` amortized |
| insert at beginning/middle | `O(n)` |
| remove from beginning/middle | `O(n)` |
| search by value | `O(n)` |

## String Basics In C#

Strings are immutable.

```csharp
var name = "Ada";
var updated = name + " Lovelace";
```

This creates a new string. The original string is not modified.

Repeated concatenation in a loop can create many allocations:

```csharp
string BuildCsvSlow(IReadOnlyList<string> values)
{
    var result = "";

    foreach (var value in values)
    {
        result += value + ",";
    }

    return result;
}
```

Prefer `StringBuilder` or `string.Join`:

```csharp
string BuildCsv(IReadOnlyList<string> values)
{
    return string.Join(",", values);
}
```

## Unicode Note

`char` in C# is a UTF-16 code unit, not always a full user-perceived character.

For simple coding exercises, `char` loops are usually fine. For production text processing with emojis, combined characters, or different cultures, use .NET globalization APIs carefully.

## Two Sum

Problem:

Find two numbers that add up to target.

```csharp
public int[] TwoSum(int[] nums, int target)
{
    var seen = new Dictionary<int, int>();

    for (int i = 0; i < nums.Length; i++)
    {
        var needed = target - nums[i];

        if (seen.TryGetValue(needed, out var index))
        {
            return new[] { index, i };
        }

        seen[nums[i]] = i;
    }

    return Array.Empty<int>();
}
```

Complexity:

- time: `O(n)`;
- space: `O(n)`.

## Valid Anagram

```csharp
public bool IsAnagram(string s, string t)
{
    if (s.Length != t.Length)
    {
        return false;
    }

    var counts = new int[26];

    foreach (var ch in s)
    {
        counts[ch - 'a']++;
    }

    foreach (var ch in t)
    {
        counts[ch - 'a']--;
        if (counts[ch - 'a'] < 0)
        {
            return false;
        }
    }

    return true;
}
```

Note:

This assumes lowercase English letters. For Unicode or arbitrary chars, use `Dictionary<char, int>`.

## Prefix Sum

Problem:

Find range sum quickly.

```csharp
public sealed class NumArray
{
    private readonly int[] _prefix;

    public NumArray(int[] nums)
    {
        _prefix = new int[nums.Length + 1];

        for (int i = 0; i < nums.Length; i++)
        {
            _prefix[i + 1] = _prefix[i] + nums[i];
        }
    }

    public int SumRange(int left, int right)
    {
        return _prefix[right + 1] - _prefix[left];
    }
}
```

Prefix sums are useful when many range queries are asked on the same array.

For one query, a direct loop may be simpler. For many queries, preprocessing pays off.

## Product Of Array Except Self

Problem:

For each index, return the product of all other elements without using division.

```csharp
public int[] ProductExceptSelf(int[] nums)
{
    var result = new int[nums.Length];

    var prefix = 1;
    for (int i = 0; i < nums.Length; i++)
    {
        result[i] = prefix;
        prefix *= nums[i];
    }

    var suffix = 1;
    for (int i = nums.Length - 1; i >= 0; i--)
    {
        result[i] *= suffix;
        suffix *= nums[i];
    }

    return result;
}
```

Complexity:

- time: `O(n)`;
- extra space excluding output: `O(1)`.

Mental model:

```text
result[i] = product of everything left of i * product of everything right of i
```

## Maximum Subarray

Kadane's algorithm:

```csharp
public int MaxSubArray(int[] nums)
{
    var best = nums[0];
    var current = nums[0];

    for (int i = 1; i < nums.Length; i++)
    {
        current = Math.Max(nums[i], current + nums[i]);
        best = Math.Max(best, current);
    }

    return best;
}
```

Complexity:

- time: `O(n)`;
- space: `O(1)`.

## StringBuilder

Use `StringBuilder` for repeated string construction.

```csharp
public string ReverseWords(string[] words)
{
    var builder = new StringBuilder();

    for (int i = words.Length - 1; i >= 0; i--)
    {
        if (builder.Length > 0)
        {
            builder.Append(' ');
        }

        builder.Append(words[i]);
    }

    return builder.ToString();
}
```

## Group Anagrams With Frequency Key

Sorting each word works, but costs `O(k log k)` per word where `k` is word length.

If input is lowercase English letters, use a frequency key:

```csharp
public IList<IList<string>> GroupAnagramsByCount(string[] strs)
{
    var groups = new Dictionary<string, List<string>>();

    foreach (var str in strs)
    {
        var counts = new int[26];

        foreach (var ch in str)
        {
            counts[ch - 'a']++;
        }

        var key = string.Join('#', counts);

        if (!groups.TryGetValue(key, out var group))
        {
            group = new List<string>();
            groups[key] = group;
        }

        group.Add(str);
    }

    return groups.Values.Select(x => (IList<string>)x).ToList();
}
```

This is often faster when strings are long and the alphabet is fixed.

## In-place Removal

Problem:

Remove all occurrences of `value` and return the new length.

```csharp
public int RemoveElement(int[] nums, int value)
{
    var write = 0;

    for (int read = 0; read < nums.Length; read++)
    {
        if (nums[read] != value)
        {
            nums[write] = nums[read];
            write++;
        }
    }

    return write;
}
```

The first `write` elements are the kept values.

## `Span<T>` Note

`Span<T>` can represent a slice without allocating a new array.

```csharp
void Normalize(Span<int> nums)
{
    for (int i = 0; i < nums.Length; i++)
    {
        nums[i] = Math.Max(0, nums[i]);
    }
}
```

Usage:

```csharp
var nums = new[] { -1, 2, -3, 4 };
Normalize(nums.AsSpan(1, 2));
```

This modifies the slice over the original array.

## Knowledge Checks

### When do you use Dictionary?

Use `Dictionary` when you need fast lookup by key, such as checking complements, counting frequencies, or mapping values to indexes.

### Why are strings tricky?

Strings are immutable in C#. Repeated concatenation can create many allocations. Also Unicode handling can be more complex than simple `char` loops.

### Why is inserting into the middle of an array `O(n)`?

Elements after the insertion point must be shifted to make room.

## Common Mistakes

- Off-by-one errors.
- Ignoring empty input.
- Using nested loops when hash map solves it.
- Repeated string concatenation in loops.
- Assuming ASCII when input may be Unicode.
- Forgetting space complexity.

## Practice Problems

- Two Sum
- Valid Anagram
- Group Anagrams
- Maximum Subarray
- Product of Array Except Self
- Longest Consecutive Sequence
- Longest Substring Without Repeating Characters
