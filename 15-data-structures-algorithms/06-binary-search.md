# Binary Search In C#

## Core Idea

Binary search finds a target or boundary in a sorted search space.

Binary search is not only for arrays. It works whenever the answer space is monotonic.

## Standard Binary Search

```csharp
public int Search(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length - 1;

    while (left <= right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] == target)
        {
            return mid;
        }

        if (nums[mid] < target)
        {
            left = mid + 1;
        }
        else
        {
            right = mid - 1;
        }
    }

    return -1;
}
```

Why `left + (right - left) / 2`?

It avoids potential integer overflow in other languages and is a good habit.

## Two Interval Styles

Binary search bugs usually come from unclear interval rules.

### Closed interval `[left, right]`

```csharp
public int SearchClosed(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length - 1;

    while (left <= right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] == target)
        {
            return mid;
        }

        if (nums[mid] < target)
        {
            left = mid + 1;
        }
        else
        {
            right = mid - 1;
        }
    }

    return -1;
}
```

Meaning:

```text
Search area includes both left and right.
```

### Half-open interval `[left, right)`

```csharp
public int LowerBoundTemplate(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length;

    while (left < right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] >= target)
        {
            right = mid;
        }
        else
        {
            left = mid + 1;
        }
    }

    return left;
}
```

Meaning:

```text
Search area includes left but excludes right.
```

Pick one style and stay consistent.

## Lower Bound

Find first index where `nums[index] >= target`.

```csharp
public int LowerBound(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length;

    while (left < right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] >= target)
        {
            right = mid;
        }
        else
        {
            left = mid + 1;
        }
    }

    return left;
}
```

## Upper Bound

Find first index where `nums[index] > target`.

```csharp
public int UpperBound(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length;

    while (left < right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] > target)
        {
            right = mid;
        }
        else
        {
            left = mid + 1;
        }
    }

    return left;
}
```

## First And Last Position

```csharp
public int[] SearchRange(int[] nums, int target)
{
    var first = LowerBound(nums, target);

    if (first == nums.Length || nums[first] != target)
    {
        return new[] { -1, -1 };
    }

    var last = UpperBound(nums, target) - 1;
    return new[] { first, last };
}
```

This is cleaner than writing two separate custom searches.

## Search Insert Position

```csharp
public int SearchInsert(int[] nums, int target)
{
    return LowerBound(nums, target);
}
```

## Binary Search On Answer

Find minimum speed that can finish work within `h` hours.

```csharp
public int MinEatingSpeed(int[] piles, int h)
{
    var left = 1;
    var right = piles.Max();

    while (left < right)
    {
        var mid = left + (right - left) / 2;

        if (CanFinish(piles, h, mid))
        {
            right = mid;
        }
        else
        {
            left = mid + 1;
        }
    }

    return left;
}

private bool CanFinish(int[] piles, int h, int speed)
{
    long hours = 0;

    foreach (var pile in piles)
    {
        hours += (pile + speed - 1) / speed;
    }

    return hours <= h;
}
```

Key idea:

If speed `x` works, any speed greater than `x` also works. This monotonic property allows binary search.

## Search In Rotated Sorted Array

```csharp
public int SearchRotated(int[] nums, int target)
{
    var left = 0;
    var right = nums.Length - 1;

    while (left <= right)
    {
        var mid = left + (right - left) / 2;

        if (nums[mid] == target)
        {
            return mid;
        }

        if (nums[left] <= nums[mid])
        {
            if (nums[left] <= target && target < nums[mid])
            {
                right = mid - 1;
            }
            else
            {
                left = mid + 1;
            }
        }
        else
        {
            if (nums[mid] < target && target <= nums[right])
            {
                left = mid + 1;
            }
            else
            {
                right = mid - 1;
            }
        }
    }

    return -1;
}
```

At each step, one half must be sorted. Use that sorted half to decide whether target can be inside it.

## Capacity To Ship Packages

Another binary-search-on-answer example:

```csharp
public int ShipWithinDays(int[] weights, int days)
{
    var left = weights.Max();
    var right = weights.Sum();

    while (left < right)
    {
        var mid = left + (right - left) / 2;

        if (CanShip(weights, days, mid))
        {
            right = mid;
        }
        else
        {
            left = mid + 1;
        }
    }

    return left;
}

private bool CanShip(int[] weights, int days, int capacity)
{
    var usedDays = 1;
    var current = 0;

    foreach (var weight in weights)
    {
        if (current + weight > capacity)
        {
            usedDays++;
            current = 0;
        }

        current += weight;
    }

    return usedDays <= days;
}
```

Monotonic property:

```text
If capacity works, any larger capacity also works.
```

Binary search extends well beyond sorted array lookup to include boundary search, rotated arrays, and optimization over monotonic answer spaces such as shipping capacity and scheduling.
