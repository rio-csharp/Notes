# Linked List In C#

## Core Idea

A linked list stores nodes where each node points to the next node.

Unlike an array, linked list nodes are not stored contiguously. Each node has a value and a reference to the next node.

Trade-offs:

| Operation | Linked List | Array/List |
|---|---:|---:|
| access by index | `O(n)` | `O(1)` |
| insert after known node | `O(1)` | `O(n)` if shifting needed |
| remove after known node | `O(1)` | `O(n)` if shifting needed |
| search by value | `O(n)` | `O(n)` |

In C#, `List<T>` is usually more practical for application code because it has better cache locality and simpler indexing. Linked lists are still excellent for learning pointer/reference manipulation.

## Node Definition

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
```

## Building A List

```csharp
public ListNode? BuildList(params int[] values)
{
    var dummy = new ListNode();
    var tail = dummy;

    foreach (var value in values)
    {
        tail.Next = new ListNode(value);
        tail = tail.Next;
    }

    return dummy.Next;
}
```

The dummy node avoids special handling for the first element.

## Reverse Linked List

```csharp
public ListNode? ReverseList(ListNode? head)
{
    ListNode? previous = null;
    var current = head;

    while (current is not null)
    {
        var next = current.Next;
        current.Next = previous;
        previous = current;
        current = next;
    }

    return previous;
}
```

Complexity:

- time: `O(n)`;
- space: `O(1)`.

Recursive version:

```csharp
public ListNode? ReverseListRecursive(ListNode? head)
{
    if (head?.Next is null)
    {
        return head;
    }

    var newHead = ReverseListRecursive(head.Next);
    head.Next.Next = head;
    head.Next = null;

    return newHead;
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

## Fast And Slow Pointers

Find middle:

```csharp
public ListNode? MiddleNode(ListNode? head)
{
    var slow = head;
    var fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;
        fast = fast.Next.Next;
    }

    return slow;
}
```

## Detect Cycle

```csharp
public bool HasCycle(ListNode? head)
{
    var slow = head;
    var fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;
        fast = fast.Next.Next;

        if (ReferenceEquals(slow, fast))
        {
            return true;
        }
    }

    return false;
}
```

## Find Cycle Start

Floyd's algorithm can also find where the cycle starts.

```csharp
public ListNode? DetectCycle(ListNode? head)
{
    var slow = head;
    var fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;
        fast = fast.Next.Next;

        if (ReferenceEquals(slow, fast))
        {
            var pointer = head;

            while (!ReferenceEquals(pointer, slow))
            {
                pointer = pointer!.Next;
                slow = slow!.Next;
            }

            return pointer;
        }
    }

    return null;
}
```

Why it works:

After slow and fast meet, moving one pointer from head and one from the meeting point at the same speed makes them meet at the cycle entry.

## Merge Two Sorted Lists

```csharp
public ListNode? MergeTwoLists(ListNode? list1, ListNode? list2)
{
    var dummy = new ListNode();
    var tail = dummy;

    while (list1 is not null && list2 is not null)
    {
        if (list1.Val <= list2.Val)
        {
            tail.Next = list1;
            list1 = list1.Next;
        }
        else
        {
            tail.Next = list2;
            list2 = list2.Next;
        }

        tail = tail.Next;
    }

    tail.Next = list1 ?? list2;
    return dummy.Next;
}
```

## Remove Nth Node From End

Use two pointers separated by `n` nodes.

```csharp
public ListNode? RemoveNthFromEnd(ListNode? head, int n)
{
    var dummy = new ListNode(0, head);
    var fast = dummy;
    var slow = dummy;

    for (int i = 0; i < n; i++)
    {
        fast = fast.Next!;
    }

    while (fast.Next is not null)
    {
        fast = fast.Next;
        slow = slow.Next!;
    }

    slow.Next = slow.Next?.Next;

    return dummy.Next;
}
```

The dummy node handles removing the head cleanly.

## Add Two Numbers

Each linked list stores digits in reverse order.

```csharp
public ListNode? AddTwoNumbers(ListNode? l1, ListNode? l2)
{
    var dummy = new ListNode();
    var tail = dummy;
    var carry = 0;

    while (l1 is not null || l2 is not null || carry > 0)
    {
        var sum = carry + (l1?.Val ?? 0) + (l2?.Val ?? 0);

        carry = sum / 10;
        tail.Next = new ListNode(sum % 10);
        tail = tail.Next;

        l1 = l1?.Next;
        l2 = l2?.Next;
    }

    return dummy.Next;
}
```

## Practice Problems

- Reverse Linked List
- Merge Two Sorted Lists
- Linked List Cycle
- Middle of Linked List
- Remove Nth Node From End
- Add Two Numbers
