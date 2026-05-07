# Complexity Analysis

## Core Idea

Complexity analysis estimates how runtime or memory grows as input size grows.

## Big O

Common complexities:

```text
O(1)        constant
O(log n)    logarithmic
O(n)        linear
O(n log n)  common efficient sorting
O(n^2)      quadratic
O(2^n)      exponential
```

Big O describes growth, not exact runtime.

If algorithm A is `O(n)` and algorithm B is `O(n log n)`, A usually scales better for very large `n`. But for small inputs, constants, allocations, CPU cache behavior, and database/network cost can matter more than Big O.

## Big O, Big Omega, And Big Theta

Most practical discussions use Big O, but these terms are useful:

```text
Big O       upper bound
Big Omega   lower bound
Big Theta   tight bound
```

Example:

```csharp
bool Contains(int[] nums, int target)
{
    foreach (var num in nums)
    {
        if (num == target)
        {
            return true;
        }
    }

    return false;
}
```

Best case:

```text
O(1) when target is the first item
```

Worst case:

```text
O(n) when target is absent or last
```

Average case is also usually discussed as `O(n)` if target position is unknown.

## Examples

### O(1)

```csharp
int GetFirst(int[] nums)
{
    return nums[0];
}
```

### O(n)

```csharp
bool Contains(int[] nums, int target)
{
    foreach (var num in nums)
    {
        if (num == target)
        {
            return true;
        }
    }

    return false;
}
```

### O(n^2)

```csharp
bool HasDuplicateSlow(int[] nums)
{
    for (int i = 0; i < nums.Length; i++)
    {
        for (int j = i + 1; j < nums.Length; j++)
        {
            if (nums[i] == nums[j])
            {
                return true;
            }
        }
    }

    return false;
}
```

### O(n)

```csharp
bool HasDuplicateFast(int[] nums)
{
    var seen = new HashSet<int>();

    foreach (var num in nums)
    {
        if (!seen.Add(num))
        {
            return true;
        }
    }

    return false;
}
```

- faster time;
- more memory.

## Nested Loops

Nested loops are not always automatically `O(n^2)`. The input sizes matter.

```csharp
void PrintPairs(int[] users, int[] roles)
{
    foreach (var user in users)
    {
        foreach (var role in roles)
        {
            Console.WriteLine($"{user}:{role}");
        }
    }
}
```

If `users.Length = n` and `roles.Length = m`, time is:

```text
O(n * m)
```

If both arrays are roughly the same size, people often simplify to:

```text
O(n^2)
```

## Sequential Work

```csharp
void Process(int[] nums)
{
    foreach (var num in nums)
    {
        Console.WriteLine(num);
    }

    foreach (var num in nums)
    {
        Console.WriteLine(num * 2);
    }
}
```

This is:

```text
O(n + n) = O(2n) = O(n)
```

Big O drops constant factors.

## Recursion Complexity

Recursive functions need both:

- number of calls;
- work per call.

Example:

```csharp
int Factorial(int n)
{
    if (n <= 1)
    {
        return 1;
    }

    return n * Factorial(n - 1);
}
```

Time:

```text
O(n)
```

Space:

```text
O(n) call stack
```

Recursive Fibonacci without memoization:

```csharp
int FibSlow(int n)
{
    if (n <= 1)
    {
        return n;
    }

    return FibSlow(n - 1) + FibSlow(n - 2);
}
```

Time is exponential because the same subproblems are recomputed many times:

```text
O(2^n)
```

## Amortized Complexity

`List<T>.Add` is usually `O(1)` amortized.

Why? `List<T>` internally uses an array. When capacity is full, it allocates a larger array and copies existing elements.

```csharp
var numbers = new List<int>();

for (int i = 0; i < 1_000; i++)
{
    numbers.Add(i);
}
```

Most `Add` calls are cheap. Occasional resize calls are expensive, but spread across many additions, the average is still treated as `O(1)` amortized.

If the final size is known, set capacity:

```csharp
var numbers = new List<int>(capacity: 1_000);
```

## Dictionary Complexity

`Dictionary<TKey, TValue>` operations are usually:

```text
Average lookup/insert/delete: O(1)
Worst case: O(n)
```

Worst case can happen with severe hash collisions, but modern .NET dictionaries are engineered to make common cases fast.

The actual performance depends on several factors:

- hash code quality;
- equality comparer;
- number of collisions;
- resizing;
- key immutability.

Mutable key danger:

```csharp
public sealed class UserKey
{
    public string Email { get; set; } = "";

    public override int GetHashCode() => Email.GetHashCode();
    public override bool Equals(object? obj) =>
        obj is UserKey other && other.Email == Email;
}
```

If `Email` changes after the key is inserted, lookup may fail because the hash bucket no longer matches.

## Explanation Pattern

Use:

```text
The algorithm visits each item once, so time complexity is O(n).
It stores up to n items in a HashSet, so space complexity is O(n).
```

More complete version:

```text
Let n be the number of input items.
The loop visits each item once, so time is O(n).
The HashSet may store up to n items, so extra space is O(n).
HashSet operations are average O(1), assuming a good hash distribution.
```

## Complexity In Real Applications

Big O is most useful inside CPU/memory-bound code.

In real full-stack systems, also consider:

- database query complexity;
- indexes;
- network round trips;
- serialization cost;
- allocations and GC pressure;
- lock contention;
- cache hit ratio;
- browser rendering cost.

Example:

```text
An O(n) API loop that performs one database query per item may be much worse than an O(n log n) in-memory algorithm.
```

That is the classic N+1 query problem.

These patterns appear throughout the algorithms discussed in subsequent chapters, including two-sum, parentheses matching, interval merging, binary search, substring search, subarray analysis, and tree traversal.
