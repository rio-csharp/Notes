# Two Pointers And Sliding Window

## Core Idea

Two pointers and sliding window are patterns for processing arrays and strings efficiently.

Chinese notes:

- `two pointers`: 双指针.
- `sliding window`: 滑动窗口.
- `window`: 窗口.

The key is maintaining an invariant（不变量）.

Examples:

```text
Two pointers: values between left and right are the current search space.
Sliding window: substring [left, right] satisfies or nearly satisfies a constraint.
```

## Two Pointers: Sorted Two Sum

```csharp
public int[] TwoSumSorted(int[] numbers, int target)
{
    var left = 0;
    var right = numbers.Length - 1;

    while (left < right)
    {
        var sum = numbers[left] + numbers[right];

        if (sum == target)
        {
            return new[] { left, right };
        }

        if (sum < target)
        {
            left++;
        }
        else
        {
            right--;
        }
    }

    return Array.Empty<int>();
}
```

Works because array is sorted.

## Two Pointers: Reverse String

```csharp
public void ReverseString(char[] s)
{
    var left = 0;
    var right = s.Length - 1;

    while (left < right)
    {
        (s[left], s[right]) = (s[right], s[left]);
        left++;
        right--;
    }
}
```

## Valid Palindrome

```csharp
public bool IsPalindrome(string s)
{
    var left = 0;
    var right = s.Length - 1;

    while (left < right)
    {
        while (left < right && !char.IsLetterOrDigit(s[left]))
        {
            left++;
        }

        while (left < right && !char.IsLetterOrDigit(s[right]))
        {
            right--;
        }

        if (char.ToLowerInvariant(s[left]) != char.ToLowerInvariant(s[right]))
        {
            return false;
        }

        left++;
        right--;
    }

    return true;
}
```

Two pointers are natural when comparing both ends.

## Three Sum

Sort first, then fix one number and use two pointers.

```csharp
public IList<IList<int>> ThreeSum(int[] nums)
{
    Array.Sort(nums);
    var result = new List<IList<int>>();

    for (int i = 0; i < nums.Length - 2; i++)
    {
        if (i > 0 && nums[i] == nums[i - 1])
        {
            continue;
        }

        var left = i + 1;
        var right = nums.Length - 1;

        while (left < right)
        {
            var sum = nums[i] + nums[left] + nums[right];

            if (sum == 0)
            {
                result.Add(new[] { nums[i], nums[left], nums[right] });
                left++;
                right--;

                while (left < right && nums[left] == nums[left - 1])
                {
                    left++;
                }

                while (left < right && nums[right] == nums[right + 1])
                {
                    right--;
                }
            }
            else if (sum < 0)
            {
                left++;
            }
            else
            {
                right--;
            }
        }
    }

    return result;
}
```

Complexity:

- sorting: `O(n log n)`;
- two-pointer scan for each fixed index: `O(n^2)` total;
- extra space excluding output: `O(1)` or `O(log n)` depending on sort implementation.

## Sliding Window: Longest Substring Without Repeating Characters

```csharp
public int LengthOfLongestSubstring(string s)
{
    var lastSeen = new Dictionary<char, int>();
    var left = 0;
    var best = 0;

    for (int right = 0; right < s.Length; right++)
    {
        var ch = s[right];

        if (lastSeen.TryGetValue(ch, out var index) && index >= left)
        {
            left = index + 1;
        }

        lastSeen[ch] = right;
        best = Math.Max(best, right - left + 1);
    }

    return best;
}
```

Complexity:

- time: `O(n)`;
- space: `O(k)`, where k is character set size.

## Sliding Window: Minimum Size Subarray Sum

```csharp
public int MinSubArrayLen(int target, int[] nums)
{
    var left = 0;
    var sum = 0;
    var best = int.MaxValue;

    for (int right = 0; right < nums.Length; right++)
    {
        sum += nums[right];

        while (sum >= target)
        {
            best = Math.Min(best, right - left + 1);
            sum -= nums[left];
            left++;
        }
    }

    return best == int.MaxValue ? 0 : best;
}
```

Works when numbers are positive. If negative numbers exist, this pattern may fail.

Why positive numbers matter:

```text
When right expands, sum only increases.
When left shrinks, sum only decreases.
```

That monotonic behavior makes the window safe to shrink.

## Fixed-size Window

Maximum average subarray of size `k`:

```csharp
public double FindMaxAverage(int[] nums, int k)
{
    var sum = 0;

    for (int i = 0; i < k; i++)
    {
        sum += nums[i];
    }

    var best = sum;

    for (int right = k; right < nums.Length; right++)
    {
        sum += nums[right];
        sum -= nums[right - k];
        best = Math.Max(best, sum);
    }

    return (double)best / k;
}
```

## Permutation In String

Problem:

Check whether `s2` contains any permutation of `s1`.

```csharp
public bool CheckInclusion(string s1, string s2)
{
    if (s1.Length > s2.Length)
    {
        return false;
    }

    var need = new int[26];
    var window = new int[26];

    foreach (var ch in s1)
    {
        need[ch - 'a']++;
    }

    for (int right = 0; right < s2.Length; right++)
    {
        window[s2[right] - 'a']++;

        if (right >= s1.Length)
        {
            window[s2[right - s1.Length] - 'a']--;
        }

        if (need.SequenceEqual(window))
        {
            return true;
        }
    }

    return false;
}
```

This is fixed-size window because every permutation has length `s1.Length`.

## At Most K Distinct

This pattern is useful for many "longest substring with constraint" problems.

```csharp
public int LengthOfLongestSubstringKDistinct(string s, int k)
{
    var counts = new Dictionary<char, int>();
    var left = 0;
    var best = 0;

    for (int right = 0; right < s.Length; right++)
    {
        counts[s[right]] = counts.GetValueOrDefault(s[right]) + 1;

        while (counts.Count > k)
        {
            var leftChar = s[left];
            counts[leftChar]--;

            if (counts[leftChar] == 0)
            {
                counts.Remove(leftChar);
            }

            left++;
        }

        best = Math.Max(best, right - left + 1);
    }

    return best;
}
```

## Knowledge Checks

### When do you use sliding window?

Use sliding window when the problem asks for a contiguous subarray or substring and the window can be expanded and shrunk while maintaining useful state.

### What is the difference between fixed and variable sliding window?

Fixed window has constant size like `k`. Variable window changes size based on constraints, such as no duplicates or sum at least target.

### Why can negative numbers break a sliding-window sum solution?

Because expanding the window no longer always increases the sum, and shrinking no longer always decreases it. The monotonic assumption disappears.

## Common Mistakes

- Using sliding window when negative numbers break monotonicity.
- Forgetting to shrink window.
- Off-by-one in window length.
- Not updating state when left pointer moves.
- Infinite loop in while condition.

## Practice Problems

- Valid Palindrome
- Two Sum II
- Container With Most Water
- Longest Substring Without Repeating Characters
- Minimum Size Subarray Sum
- Permutation in String
- Sliding Window Maximum
