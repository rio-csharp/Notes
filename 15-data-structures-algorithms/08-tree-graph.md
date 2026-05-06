# Trees And Graphs In C#

## Core Idea

Trees and graphs test traversal, recursion, state tracking, and problem modeling.

A tree is a connected graph without cycles. A binary tree node has at most two children. A graph can have cycles, disconnected components, directed edges, or weighted edges.

## Binary Tree Node

```csharp
public sealed class TreeNode
{
    public int Val { get; set; }
    public TreeNode? Left { get; set; }
    public TreeNode? Right { get; set; }

    public TreeNode(int val = 0, TreeNode? left = null, TreeNode? right = null)
    {
        Val = val;
        Left = left;
        Right = right;
    }
}
```

## DFS Recursive Traversal

```csharp
public IList<int> InorderTraversal(TreeNode? root)
{
    var result = new List<int>();

    void Dfs(TreeNode? node)
    {
        if (node is null)
        {
            return;
        }

        Dfs(node.Left);
        result.Add(node.Val);
        Dfs(node.Right);
    }

    Dfs(root);
    return result;
}
```

Traversal orders:

```text
Preorder:  node -> left -> right
Inorder:   left -> node -> right
Postorder: left -> right -> node
```

For a binary search tree, inorder traversal returns values in sorted order.

## Iterative DFS

```csharp
public IList<int> PreorderTraversal(TreeNode? root)
{
    var result = new List<int>();

    if (root is null)
    {
        return result;
    }

    var stack = new Stack<TreeNode>();
    stack.Push(root);

    while (stack.Count > 0)
    {
        var node = stack.Pop();
        result.Add(node.Val);

        if (node.Right is not null)
        {
            stack.Push(node.Right);
        }

        if (node.Left is not null)
        {
            stack.Push(node.Left);
        }
    }

    return result;
}
```

Push right first so left is processed first.

## BFS Level Order

```csharp
public IList<IList<int>> LevelOrder(TreeNode? root)
{
    var result = new List<IList<int>>();

    if (root is null)
    {
        return result;
    }

    var queue = new Queue<TreeNode>();
    queue.Enqueue(root);

    while (queue.Count > 0)
    {
        var size = queue.Count;
        var level = new List<int>();

        for (int i = 0; i < size; i++)
        {
            var node = queue.Dequeue();
            level.Add(node.Val);

            if (node.Left is not null)
            {
                queue.Enqueue(node.Left);
            }

            if (node.Right is not null)
            {
                queue.Enqueue(node.Right);
            }
        }

        result.Add(level);
    }

    return result;
}
```

## Max Depth

```csharp
public int MaxDepth(TreeNode? root)
{
    if (root is null)
    {
        return 0;
    }

    return 1 + Math.Max(MaxDepth(root.Left), MaxDepth(root.Right));
}
```

## Validate Binary Search Tree

Use min/max boundaries.

```csharp
public bool IsValidBst(TreeNode? root)
{
    return IsValid(root, long.MinValue, long.MaxValue);
}

private bool IsValid(TreeNode? node, long min, long max)
{
    if (node is null)
    {
        return true;
    }

    if (node.Val <= min || node.Val >= max)
    {
        return false;
    }

    return IsValid(node.Left, min, node.Val) &&
           IsValid(node.Right, node.Val, max);
}
```

Do not only compare a node with its immediate children. The full subtree must respect the boundary.

## Lowest Common Ancestor

```csharp
public TreeNode? LowestCommonAncestor(TreeNode? root, TreeNode p, TreeNode q)
{
    if (root is null || ReferenceEquals(root, p) || ReferenceEquals(root, q))
    {
        return root;
    }

    var left = LowestCommonAncestor(root.Left, p, q);
    var right = LowestCommonAncestor(root.Right, p, q);

    if (left is not null && right is not null)
    {
        return root;
    }

    return left ?? right;
}
```

## Graph Representation

Adjacency list:

```csharp
var graph = new Dictionary<int, List<int>>
{
    [1] = new() { 2, 3 },
    [2] = new() { 4 },
    [3] = new(),
    [4] = new()
};
```

Adjacency matrix:

```csharp
var matrix = new bool[5, 5];
matrix[1, 2] = true;
matrix[2, 1] = true;
```

Trade-off:

| Representation | Space | Check Edge | Iterate Neighbors |
|---|---:|---:|---:|
| adjacency list | `O(V + E)` | `O(degree)` | efficient |
| adjacency matrix | `O(V^2)` | `O(1)` | `O(V)` |

## Graph DFS

```csharp
public void DfsGraph(int start, Dictionary<int, List<int>> graph)
{
    var visited = new HashSet<int>();

    void Dfs(int node)
    {
        if (!visited.Add(node))
        {
            return;
        }

        foreach (var next in graph.GetValueOrDefault(node, new List<int>()))
        {
            Dfs(next);
        }
    }

    Dfs(start);
}
```

## Graph BFS Shortest Path In Unweighted Graph

```csharp
public int ShortestPath(
    int start,
    int target,
    Dictionary<int, List<int>> graph)
{
    var visited = new HashSet<int> { start };
    var queue = new Queue<(int Node, int Distance)>();
    queue.Enqueue((start, 0));

    while (queue.Count > 0)
    {
        var (node, distance) = queue.Dequeue();

        if (node == target)
        {
            return distance;
        }

        foreach (var next in graph.GetValueOrDefault(node, new List<int>()))
        {
            if (visited.Add(next))
            {
                queue.Enqueue((next, distance + 1));
            }
        }
    }

    return -1;
}
```

## Number Of Islands

Grid problems are graph problems.

```csharp
public int NumIslands(char[][] grid)
{
    var rows = grid.Length;
    var cols = grid[0].Length;
    var count = 0;

    for (int r = 0; r < rows; r++)
    {
        for (int c = 0; c < cols; c++)
        {
            if (grid[r][c] == '1')
            {
                count++;
                Dfs(r, c);
            }
        }
    }

    return count;

    void Dfs(int r, int c)
    {
        if (r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] != '1')
        {
            return;
        }

        grid[r][c] = '0';

        Dfs(r + 1, c);
        Dfs(r - 1, c);
        Dfs(r, c + 1);
        Dfs(r, c - 1);
    }
}
```

Marking visited prevents revisiting the same land cell.

## Clone Graph

Use a dictionary from old node to new node.

```csharp
public sealed class GraphNode
{
    public int Val { get; set; }
    public List<GraphNode> Neighbors { get; } = new();

    public GraphNode(int val)
    {
        Val = val;
    }
}

public GraphNode? CloneGraph(GraphNode? node)
{
    if (node is null)
    {
        return null;
    }

    var clones = new Dictionary<GraphNode, GraphNode>();

    GraphNode Dfs(GraphNode current)
    {
        if (clones.TryGetValue(current, out var existing))
        {
            return existing;
        }

        var clone = new GraphNode(current.Val);
        clones[current] = clone;

        foreach (var neighbor in current.Neighbors)
        {
            clone.Neighbors.Add(Dfs(neighbor));
        }

        return clone;
    }

    return Dfs(node);
}
```

## Topological Sort

Used for dependency ordering.

```csharp
public int[] FindOrder(int numCourses, int[][] prerequisites)
{
    var graph = new List<int>[numCourses];
    var indegree = new int[numCourses];

    for (int i = 0; i < numCourses; i++)
    {
        graph[i] = new List<int>();
    }

    foreach (var pair in prerequisites)
    {
        var course = pair[0];
        var prerequisite = pair[1];
        graph[prerequisite].Add(course);
        indegree[course]++;
    }

    var queue = new Queue<int>();

    for (int i = 0; i < numCourses; i++)
    {
        if (indegree[i] == 0)
        {
            queue.Enqueue(i);
        }
    }

    var order = new List<int>();

    while (queue.Count > 0)
    {
        var node = queue.Dequeue();
        order.Add(node);

        foreach (var next in graph[node])
        {
            indegree[next]--;
            if (indegree[next] == 0)
            {
                queue.Enqueue(next);
            }
        }
    }

    return order.Count == numCourses ? order.ToArray() : Array.Empty<int>();
}
```

If the result has fewer than `numCourses` items, the graph has a cycle.

## Union Find

Union Find is useful for connectivity problems.

```csharp
public sealed class UnionFind
{
    private readonly int[] _parent;
    private readonly int[] _rank;

    public UnionFind(int size)
    {
        _parent = new int[size];
        _rank = new int[size];

        for (int i = 0; i < size; i++)
        {
            _parent[i] = i;
        }
    }

    public int Find(int x)
    {
        if (_parent[x] != x)
        {
            _parent[x] = Find(_parent[x]);
        }

        return _parent[x];
    }

    public bool Union(int a, int b)
    {
        var rootA = Find(a);
        var rootB = Find(b);

        if (rootA == rootB)
        {
            return false;
        }

        if (_rank[rootA] < _rank[rootB])
        {
            _parent[rootA] = rootB;
        }
        else if (_rank[rootA] > _rank[rootB])
        {
            _parent[rootB] = rootA;
        }
        else
        {
            _parent[rootB] = rootA;
            _rank[rootA]++;
        }

        return true;
    }
}
```

Path compression and union by rank make operations almost constant in practice.

## Practice Problems

- Binary Tree Inorder Traversal
- Maximum Depth of Binary Tree
- Binary Tree Level Order Traversal
- Number of Islands
- Clone Graph
- Course Schedule
- Rotting Oranges
- Word Ladder
