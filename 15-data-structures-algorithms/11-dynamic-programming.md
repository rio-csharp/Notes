# Dynamic Programming

## Core Idea

Dynamic programming solves problems by reusing results of overlapping subproblems.

Chinese notes:

- `dynamic programming`: 动态规划.
- `state`: 状态.
- `transition`: 状态转移.
- `memoization`: 记忆化.

## When To Use DP

Look for:

- optimal value;
- count ways;
- overlapping subproblems;
- choices at each step;
- recurrence relationship.

DP is usually about answering three questions:

```text
1. What does dp[i] or dp[i][j] mean?
2. How do I transition from smaller states to larger states?
3. What are the base cases?
```

## Fibonacci With Memoization

```csharp
public int Fib(int n)
{
    var memo = new Dictionary<int, int>();

    int Dp(int x)
    {
        if (x <= 1)
        {
            return x;
        }

        if (memo.TryGetValue(x, out var value))
        {
            return value;
        }

        value = Dp(x - 1) + Dp(x - 2);
        memo[x] = value;
        return value;
    }

    return Dp(n);
}
```

## Bottom-up Fibonacci

```csharp
public int FibBottomUp(int n)
{
    if (n <= 1)
    {
        return n;
    }

    var prev2 = 0;
    var prev1 = 1;

    for (int i = 2; i <= n; i++)
    {
        var current = prev1 + prev2;
        prev2 = prev1;
        prev1 = current;
    }

    return prev1;
}
```

## Climbing Stairs

```csharp
public int ClimbStairs(int n)
{
    if (n <= 2)
    {
        return n;
    }

    var a = 1;
    var b = 2;

    for (int i = 3; i <= n; i++)
    {
        var c = a + b;
        a = b;
        b = c;
    }

    return b;
}
```

State:

```text
dp[i] = number of ways to reach step i
```

Transition:

```text
dp[i] = dp[i - 1] + dp[i - 2]
```

Space-optimized code keeps only the previous two states.

## House Robber

```csharp
public int Rob(int[] nums)
{
    var prev2 = 0;
    var prev1 = 0;

    foreach (var money in nums)
    {
        var current = Math.Max(prev1, prev2 + money);
        prev2 = prev1;
        prev1 = current;
    }

    return prev1;
}
```

State:

```text
dp[i] = maximum money from houses up to index i
```

Transition:

```text
dp[i] = max(skip current, rob current)
dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
```

## Coin Change

Minimum number of coins to make amount.

```csharp
public int CoinChange(int[] coins, int amount)
{
    var dp = Enumerable.Repeat(amount + 1, amount + 1).ToArray();
    dp[0] = 0;

    for (int currentAmount = 1; currentAmount <= amount; currentAmount++)
    {
        foreach (var coin in coins)
        {
            if (currentAmount >= coin)
            {
                dp[currentAmount] = Math.Min(
                    dp[currentAmount],
                    dp[currentAmount - coin] + 1);
            }
        }
    }

    return dp[amount] > amount ? -1 : dp[amount];
}
```

State:

```text
dp[x] = minimum coins needed for amount x
```

Transition:

```text
dp[x] = min(dp[x - coin] + 1)
```

## Longest Increasing Subsequence

Classic `O(n^2)` DP:

```csharp
public int LengthOfLIS(int[] nums)
{
    var dp = Enumerable.Repeat(1, nums.Length).ToArray();
    var best = 1;

    for (int i = 0; i < nums.Length; i++)
    {
        for (int j = 0; j < i; j++)
        {
            if (nums[j] < nums[i])
            {
                dp[i] = Math.Max(dp[i], dp[j] + 1);
            }
        }

        best = Math.Max(best, dp[i]);
    }

    return best;
}
```

State:

```text
dp[i] = length of the longest increasing subsequence ending at i
```

There is also an `O(n log n)` binary search solution, but the DP version is easier to understand first.

## Longest Common Subsequence

```csharp
public int LongestCommonSubsequence(string text1, string text2)
{
    var dp = new int[text1.Length + 1, text2.Length + 1];

    for (int i = 1; i <= text1.Length; i++)
    {
        for (int j = 1; j <= text2.Length; j++)
        {
            if (text1[i - 1] == text2[j - 1])
            {
                dp[i, j] = dp[i - 1, j - 1] + 1;
            }
            else
            {
                dp[i, j] = Math.Max(dp[i - 1, j], dp[i, j - 1]);
            }
        }
    }

    return dp[text1.Length, text2.Length];
}
```

State:

```text
dp[i][j] = LCS length using first i chars of text1 and first j chars of text2
```

## 0/1 Knapsack Pattern

State:

```text
dp[i][w] = best value using first i items with capacity w
```

Transition:

```text
skip item or take item
```

Code:

```csharp
public int Knapsack(int[] weights, int[] values, int capacity)
{
    var dp = new int[weights.Length + 1, capacity + 1];

    for (int i = 1; i <= weights.Length; i++)
    {
        var weight = weights[i - 1];
        var value = values[i - 1];

        for (int currentCapacity = 0; currentCapacity <= capacity; currentCapacity++)
        {
            dp[i, currentCapacity] = dp[i - 1, currentCapacity];

            if (currentCapacity >= weight)
            {
                dp[i, currentCapacity] = Math.Max(
                    dp[i, currentCapacity],
                    dp[i - 1, currentCapacity - weight] + value);
            }
        }
    }

    return dp[weights.Length, capacity];
}
```

Space-optimized version:

```csharp
public int KnapsackOptimized(int[] weights, int[] values, int capacity)
{
    var dp = new int[capacity + 1];

    for (int i = 0; i < weights.Length; i++)
    {
        for (int currentCapacity = capacity; currentCapacity >= weights[i]; currentCapacity--)
        {
            dp[currentCapacity] = Math.Max(
                dp[currentCapacity],
                dp[currentCapacity - weights[i]] + values[i]);
        }
    }

    return dp[capacity];
}
```

The inner loop goes backward so each item is used at most once.

## Memoization vs Tabulation

Memoization:

```text
top-down recursion + cache
```

Tabulation:

```text
bottom-up iteration
```

Memoization is often easier to write when recursion matches the problem. Tabulation is often easier to optimize for space.

## Knowledge Checks

### How do you approach DP?

Define the state, identify the transition, set base cases, decide iteration order, and optimize space if possible.

### Memoization vs tabulation?

Memoization is top-down recursion with cache. Tabulation is bottom-up iteration.

### Why is DP hard?

The difficult part is defining the state and transition correctly.

### Why does 0/1 knapsack optimized DP loop backward?

Backward iteration prevents the same item from being used multiple times in one iteration.

## Common Mistakes

- No clear state definition.
- Wrong base case.
- Off-by-one in arrays.
- Using DP where greedy works.
- Not explaining recurrence.

## Practice Problems

- Climbing Stairs
- House Robber
- Coin Change
- Longest Increasing Subsequence
- Longest Common Subsequence
- 0/1 Knapsack
