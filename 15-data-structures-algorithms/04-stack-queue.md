# Stack And Queue In C#

## Core Idea

Stack and queue are linear data structures with different access rules.

## Stack

```csharp
var stack = new Stack<int>();
stack.Push(1);
stack.Push(2);
var top = stack.Pop(); // 2
```

Use for:

- parentheses;
- DFS;
- undo;
- monotonic stack;
- expression evaluation.

Stack operations:

| Operation | Time |
|---|---:|
| `Push` | `O(1)` |
| `Pop` | `O(1)` |
| `Peek` | `O(1)` |

Do not call `Pop` or `Peek` when `Count == 0`.

## Queue

```csharp
var queue = new Queue<int>();
queue.Enqueue(1);
queue.Enqueue(2);
var first = queue.Dequeue(); // 1
```

Use for:

- BFS;
- task processing;
- level-order traversal.

Queue operations:

| Operation | Time |
|---|---:|
| `Enqueue` | `O(1)` |
| `Dequeue` | `O(1)` |
| `Peek` | `O(1)` |

## Valid Parentheses

```csharp
public bool IsValid(string s)
{
    var stack = new Stack<char>();
    var pairs = new Dictionary<char, char>
    {
        [')'] = '(',
        [']'] = '[',
        ['}'] = '{'
    };

    foreach (var ch in s)
    {
        if (pairs.ContainsValue(ch))
        {
            stack.Push(ch);
        }
        else if (pairs.TryGetValue(ch, out var open))
        {
            if (stack.Count == 0 || stack.Pop() != open)
            {
                return false;
            }
        }
    }

    return stack.Count == 0;
}
```

Slightly more efficient version avoids `ContainsValue`, which scans values:

```csharp
public bool IsValidFast(string s)
{
    var stack = new Stack<char>();

    foreach (var ch in s)
    {
        if (ch is '(' or '[' or '{')
        {
            stack.Push(ch);
            continue;
        }

        if (stack.Count == 0)
        {
            return false;
        }

        var open = stack.Pop();

        if ((ch == ')' && open != '(') ||
            (ch == ']' && open != '[') ||
            (ch == '}' && open != '{'))
        {
            return false;
        }
    }

    return stack.Count == 0;
}
```

## Min Stack

Keep another stack with current minimum values.

```csharp
public sealed class MinStack
{
    private readonly Stack<int> _values = new();
    private readonly Stack<int> _minimums = new();

    public void Push(int value)
    {
        _values.Push(value);

        if (_minimums.Count == 0 || value <= _minimums.Peek())
        {
            _minimums.Push(value);
        }
    }

    public int Pop()
    {
        var value = _values.Pop();

        if (value == _minimums.Peek())
        {
            _minimums.Pop();
        }

        return value;
    }

    public int Top() => _values.Peek();

    public int GetMin() => _minimums.Peek();
}
```

All operations are `O(1)`.

## BFS With Queue

```csharp
public int MinDepth(TreeNode? root)
{
    if (root is null)
    {
        return 0;
    }

    var queue = new Queue<(TreeNode Node, int Depth)>();
    queue.Enqueue((root, 1));

    while (queue.Count > 0)
    {
        var (node, depth) = queue.Dequeue();

        if (node.Left is null && node.Right is null)
        {
            return depth;
        }

        if (node.Left is not null)
        {
            queue.Enqueue((node.Left, depth + 1));
        }

        if (node.Right is not null)
        {
            queue.Enqueue((node.Right, depth + 1));
        }
    }

    return 0;
}
```

## Monotonic Stack

Next greater element:

```csharp
public int[] NextGreaterElements(int[] nums)
{
    var result = Enumerable.Repeat(-1, nums.Length).ToArray();
    var stack = new Stack<int>();

    for (int i = 0; i < nums.Length; i++)
    {
        while (stack.Count > 0 && nums[i] > nums[stack.Peek()])
        {
            var index = stack.Pop();
            result[index] = nums[i];
        }

        stack.Push(i);
    }

    return result;
}
```

## Monotonic Queue

A monotonic queue helps solve sliding window maximum.

```csharp
public int[] MaxSlidingWindow(int[] nums, int k)
{
    var deque = new LinkedList<int>();
    var result = new int[nums.Length - k + 1];
    var write = 0;

    for (int right = 0; right < nums.Length; right++)
    {
        while (deque.Count > 0 && deque.First!.Value <= right - k)
        {
            deque.RemoveFirst();
        }

        while (deque.Count > 0 && nums[deque.Last!.Value] <= nums[right])
        {
            deque.RemoveLast();
        }

        deque.AddLast(right);

        if (right >= k - 1)
        {
            result[write] = nums[deque.First!.Value];
            write++;
        }
    }

    return result;
}
```

The deque stores indexes. Values are kept decreasing from front to back.

## Queue Using Two Stacks

```csharp
public sealed class MyQueue
{
    private readonly Stack<int> _input = new();
    private readonly Stack<int> _output = new();

    public void Push(int value)
    {
        _input.Push(value);
    }

    public int Pop()
    {
        MoveIfNeeded();
        return _output.Pop();
    }

    public int Peek()
    {
        MoveIfNeeded();
        return _output.Peek();
    }

    public bool Empty() => _input.Count == 0 && _output.Count == 0;

    private void MoveIfNeeded()
    {
        if (_output.Count > 0)
        {
            return;
        }

        while (_input.Count > 0)
        {
            _output.Push(_input.Pop());
        }
    }
}
```

Each element moves from `_input` to `_output` at most once, so operations are amortized `O(1)`.

Stack and queue patterns extend to a wide range of problems including bracket validation, monotonic stack applications, tree level-order traversal, and sliding window maximum computation.
