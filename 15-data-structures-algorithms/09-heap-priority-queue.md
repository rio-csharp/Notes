# Heap And PriorityQueue In C#

## Core Idea

A heap is a data structure that efficiently gets the minimum or maximum priority item.

In .NET, use:

```csharp
PriorityQueue<TElement, TPriority>
```

## Basic Usage

```csharp
var pq = new PriorityQueue<string, int>();

pq.Enqueue("low", 5);
pq.Enqueue("high", 1);

var item = pq.Dequeue(); // "high"
```

.NET PriorityQueue is min-priority by default.

## Binary Heap Mental Model

A binary heap is usually stored in an array.

For index `i`:

```text
left child:  2 * i + 1
right child: 2 * i + 2
parent:      (i - 1) / 2
```

Min-heap property:

```text
parent priority <= child priority
```

Operations:

| Operation | Time |
|---|---:|
| peek min | `O(1)` |
| insert | `O(log n)` |
| remove min | `O(log n)` |
| build heap | `O(n)` |

## Top K Frequent Elements

```csharp
public int[] TopKFrequent(int[] nums, int k)
{
    var counts = new Dictionary<int, int>();

    foreach (var num in nums)
    {
        counts[num] = counts.GetValueOrDefault(num) + 1;
    }

    var pq = new PriorityQueue<int, int>();

    foreach (var (num, count) in counts)
    {
        pq.Enqueue(num, count);

        if (pq.Count > k)
        {
            pq.Dequeue();
        }
    }

    var result = new int[k];

    for (int i = k - 1; i >= 0; i--)
    {
        result[i] = pq.Dequeue();
    }

    return result;
}
```

## Kth Largest

```csharp
public int FindKthLargest(int[] nums, int k)
{
    var pq = new PriorityQueue<int, int>();

    foreach (var num in nums)
    {
        pq.Enqueue(num, num);

        if (pq.Count > k)
        {
            pq.Dequeue();
        }
    }

    return pq.Peek();
}
```

## Max Heap Trick

Use negative priority:

```csharp
pq.Enqueue(value, -value);
```

For custom ordering, use a comparer:

```csharp
var pq = new PriorityQueue<string, int>(
    Comparer<int>.Create((a, b) => b.CompareTo(a)));
```

This makes larger priorities come out first.

## Merge K Sorted Lists

```csharp
public sealed class ListNode
{
    public int Val { get; set; }
    public ListNode? Next { get; set; }

    public ListNode(int val = 0, ListNode? next = null)
    {
        Val = val;
        Next = next;
    }
}

public ListNode? MergeKLists(ListNode?[] lists)
{
    var pq = new PriorityQueue<ListNode, int>();

    foreach (var list in lists)
    {
        if (list is not null)
        {
            pq.Enqueue(list, list.Val);
        }
    }

    var dummy = new ListNode();
    var tail = dummy;

    while (pq.Count > 0)
    {
        var node = pq.Dequeue();
        tail.Next = node;
        tail = tail.Next;

        if (node.Next is not null)
        {
            pq.Enqueue(node.Next, node.Next.Val);
        }
    }

    return dummy.Next;
}
```

If there are `k` lists and `n` total nodes:

```text
time: O(n log k)
space: O(k)
```

## Median From Data Stream

Use two heaps:

- max heap for lower half;
- min heap for upper half.

```csharp
public sealed class MedianFinder
{
    private readonly PriorityQueue<int, int> _lower = new(); // max heap by negative priority
    private readonly PriorityQueue<int, int> _upper = new(); // min heap

    public void AddNum(int num)
    {
        _lower.Enqueue(num, -num);

        var moved = _lower.Dequeue();
        _upper.Enqueue(moved, moved);

        if (_upper.Count > _lower.Count)
        {
            var back = _upper.Dequeue();
            _lower.Enqueue(back, -back);
        }
    }

    public double FindMedian()
    {
        if (_lower.Count > _upper.Count)
        {
            return _lower.Peek();
        }

        return (_lower.Peek() + _upper.Peek()) / 2.0;
    }
}
```

Invariant:

```text
lower.Count >= upper.Count
all values in lower <= all values in upper
```

## Practice Problems

- Kth Largest Element
- Top K Frequent Elements
- Merge K Sorted Lists
- Find Median From Data Stream
- Task Scheduler
