# Sorting Algorithms

## Core Idea

Sorting arranges data in order and is often used as a preprocessing step in algorithmic problem solving.

## Built-in Sorting

```csharp
Array.Sort(nums);
```

```csharp
var sorted = users.OrderBy(u => u.Name).ToList();
```

Important .NET note:

- `Array.Sort` / `List<T>.Sort` are not guaranteed stable.
- LINQ `OrderBy` is stable.

Stable means equal keys keep their original relative order.

## Comparison Sort Complexity

Common comparison sorting lower bound:

```text
O(n log n)
```

## Merge Sort

Good for stable sorting and linked lists.

Concept:

```text
split
sort left
sort right
merge
```

Array merge sort:

```csharp
public int[] MergeSort(int[] nums)
{
    if (nums.Length <= 1)
    {
        return nums;
    }

    var mid = nums.Length / 2;
    var left = MergeSort(nums[..mid]);
    var right = MergeSort(nums[mid..]);

    return Merge(left, right);
}

private int[] Merge(int[] left, int[] right)
{
    var result = new int[left.Length + right.Length];
    var i = 0;
    var j = 0;
    var write = 0;

    while (i < left.Length && j < right.Length)
    {
        if (left[i] <= right[j])
        {
            result[write++] = left[i++];
        }
        else
        {
            result[write++] = right[j++];
        }
    }

    while (i < left.Length)
    {
        result[write++] = left[i++];
    }

    while (j < right.Length)
    {
        result[write++] = right[j++];
    }

    return result;
}
```

This version is easy to understand but allocates many arrays because of slicing. Production sorting implementations avoid unnecessary allocations.

## Quick Sort

Average:

```text
O(n log n)
```

Worst:

```text
O(n^2)
```

Pivot choice matters.

Simple quicksort:

```csharp
public void QuickSort(int[] nums)
{
    Sort(0, nums.Length - 1);

    void Sort(int left, int right)
    {
        if (left >= right)
        {
            return;
        }

        var pivotIndex = Partition(nums, left, right);
        Sort(left, pivotIndex - 1);
        Sort(pivotIndex + 1, right);
    }
}

private int Partition(int[] nums, int left, int right)
{
    var pivot = nums[right];
    var write = left;

    for (int read = left; read < right; read++)
    {
        if (nums[read] <= pivot)
        {
            (nums[write], nums[read]) = (nums[read], nums[write]);
            write++;
        }
    }

    (nums[write], nums[right]) = (nums[right], nums[write]);
    return write;
}
```

Worst case happens when pivot choices repeatedly create very unbalanced partitions.

## Sort Colors

Dutch National Flag pattern.

```csharp
public void SortColors(int[] nums)
{
    var left = 0;
    var current = 0;
    var right = nums.Length - 1;

    while (current <= right)
    {
        if (nums[current] == 0)
        {
            (nums[left], nums[current]) = (nums[current], nums[left]);
            left++;
            current++;
        }
        else if (nums[current] == 2)
        {
            (nums[current], nums[right]) = (nums[right], nums[current]);
            right--;
        }
        else
        {
            current++;
        }
    }
}
```

This sorts values `0`, `1`, and `2` in one pass.

## Counting Sort

Useful when value range is small.

```csharp
public int[] CountingSort(int[] nums, int maxValue)
{
    var counts = new int[maxValue + 1];

    foreach (var num in nums)
    {
        counts[num]++;
    }

    var result = new List<int>();

    for (int value = 0; value < counts.Length; value++)
    {
        for (int i = 0; i < counts[value]; i++)
        {
            result.Add(value);
        }
    }

    return result.ToArray();
}
```

Counting sort complexity:

```text
time: O(n + k)
space: O(k)
```

`k` is the value range. Counting sort is good only when the range is reasonably small.

## Sort Intervals

```csharp
public int[][] Merge(int[][] intervals)
{
    Array.Sort(intervals, (a, b) => a[0].CompareTo(b[0]));

    var result = new List<int[]>();

    foreach (var interval in intervals)
    {
        if (result.Count == 0 || result[^1][1] < interval[0])
        {
            result.Add(interval);
        }
        else
        {
            result[^1][1] = Math.Max(result[^1][1], interval[1]);
        }
    }

    return result.ToArray();
}
```

## Custom Comparer Example

Largest number:

```csharp
public string LargestNumber(int[] nums)
{
    var parts = nums.Select(x => x.ToString()).ToArray();

    Array.Sort(parts, (a, b) => string.CompareOrdinal(b + a, a + b));

    if (parts[0] == "0")
    {
        return "0";
    }

    return string.Concat(parts);
}
```

The comparison joins both orderings to determine which concatenation produces the larger result:

```text
"9" before "34" because "934" > "349"
```

Sorting serves as a preprocessing step for problems ranging from interval merging and duplicate detection to custom ordering and multi-key optimization.
