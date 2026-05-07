# React Rendering Model

## Core Idea

React rendering is the process of turning component state and props into UI.

## Render Does Not Always Mean DOM Update

When a component renders, React calls the component function again.

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  console.log("render");

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

Each click updates state and causes render.

React then compares the result with the previous result and updates the DOM only where needed.

## Render Phase And Commit Phase

Render phase:

- call components;
- calculate what UI should look like;
- can be interrupted in concurrent rendering;
- should be pure.

Commit phase:

- apply DOM changes;
- run layout effects;
- update refs.

Do not perform side effects during render.

Bad:

```tsx
function UserProfile({ userId }: { userId: string }) {
  localStorage.setItem("lastUser", userId); // side effect during render
  return <div>{userId}</div>;
}
```

Better:

```tsx
function UserProfile({ userId }: { userId: string }) {
  useEffect(() => {
    localStorage.setItem("lastUser", userId);
  }, [userId]);

  return <div>{userId}</div>;
}
```

## Under The Hood: Fiber Mental Model

React uses an internal architecture commonly called Fiber.

You do not need private implementation details for everyday React work, but the Fiber mental model helps explain modern rendering behavior.

Fiber lets React:

- represent component work as units;
- pause and resume rendering work in concurrent rendering;
- prioritize updates;
- separate render phase from commit phase;
- keep enough information to compare old and new UI trees.

Conceptual model:

```text
Component tree
  App
    OrdersPage
      SearchBox
      OrderTable

Fiber tree
  Fiber(App)
    Fiber(OrdersPage)
      Fiber(SearchBox)
      Fiber(OrderTable)
```

Each fiber represents work for a component or host element.

Fiber is React's internal unit-of-work architecture. It allows React to split rendering work, prioritize updates, and separate calculating the next UI from committing changes to the DOM.

React's rendering model sits on top of the browser's own rendering pipeline. See Chapter 09, Section 06 (Browser Rendering) for the critical rendering path, DOM/CSSOM construction, layout, paint, and compositing at the browser level.

## Trigger, Render, Commit

The rendering cycle:

```text
1. Trigger: state, props, context, or external store update happens.
2. Render: React calls components to calculate the next UI.
3. Reconcile: React compares new output with previous fiber tree.
4. Commit: React applies changes to the DOM and runs effects.
```

Render phase should be pure:

- no API calls;
- no subscriptions;
- no `localStorage` writes;
- no DOM mutations.

Commit phase is where DOM changes happen.

Effects run after commit:

- `useLayoutEffect` runs synchronously after DOM mutations before paint;
- `useEffect` runs after paint in most cases.

## Batching

React can batch multiple state updates into one render.

Example:

```tsx
function handleClick() {
  setFirstName("Ada");
  setLastName("Lovelace");
  setAge(36);
}
```

React can process these together instead of rendering three separate times.

Modern React supports automatic batching in more scenarios than older versions.

State updates are scheduled. React may batch them, so reading state immediately after calling `setState` may still show the value from the current render.

Example:

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    console.log(count); // old value from current render
  }
}
```

Use functional update when depending on previous state:

```tsx
setCount(c => c + 1);
```

## Priority And Concurrent Rendering

React can treat updates with different priority.

Examples:

- typing in an input should feel urgent;
- filtering a huge list can be lower priority;
- route transition may be interruptible.

React APIs such as `useTransition` help mark non-urgent updates:

```tsx
const [isPending, startTransition] = useTransition();

function handleSearch(value: string) {
  setInput(value);

  startTransition(() => {
    setSearchQuery(value);
  });
}
```

Concurrent rendering does not mean JavaScript runs on multiple threads. It means React can interrupt, pause, discard, and restart rendering work before commit. Committed UI remains consistent. Concurrent rendering allows React to keep the UI responsive by prioritizing urgent work and interrupting non-urgent rendering. It does not make component code run in parallel threads.

## State Updates Are Scheduled

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    setCount(count + 1);
  }

  return <button onClick={handleClick}>{count}</button>;
}
```

This increments by 1, not 2, because both updates read the same `count` from the current render.

Correct:

```tsx
function handleClick() {
  setCount(c => c + 1);
  setCount(c => c + 1);
}
```

Use functional updates when the next state depends on previous state.

## Stale Closure

Example:

```tsx
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1);
    }, 1000);

    return () => clearInterval(id);
  }, []);

  return <div>{count}</div>;
}
```

`count` inside the interval is always the value from the first render.

One fix:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(c => c + 1);
  }, 1000);

  return () => clearInterval(id);
}, []);
```

## Keys And Reconciliation

React uses `key` to identify list items.

Bad:

```tsx
{users.map((user, index) => (
  <UserRow key={index} user={user} />
))}
```

Better:

```tsx
{users.map(user => (
  <UserRow key={user.id} user={user} />
))}
```

Using index as key can cause bugs when items are inserted, removed, or reordered.

## Reconciliation Details: Type And Key

React uses component type and key to decide whether to preserve or recreate DOM nodes and component state. During reconciliation, React compares the new element tree against the previous fiber tree using a two-level heuristic:

1. **Type comparison**: If the element type at the same position changes (e.g., `<div>` becomes `<span>`, or `<UserForm>` becomes `<AdminForm>`), React tears down the entire subtree and builds it from scratch, even if the children are identical. Type change means React assumes the old subtree is completely unrelated.

2. **Key comparison**: Within a list, React uses the `key` prop to match children across renders. Keys allow React to identify which items moved, were added, or were removed, rather than relying on position alone.

Same type and same key:

```tsx
<UserForm key="edit" mode="edit" />
<UserForm key="edit" mode="edit" />
```

React can preserve component state.

Different key:

```tsx
<UserForm key={userId} mode="edit" />
```

When `userId` changes, React treats it as a different component instance and resets state.

Useful pattern:

```tsx
<OrderForm key={orderId} orderId={orderId} />
```

This can intentionally reset form state when switching records.

Bad key choice:

```tsx
{items.map((item, index) => (
  <Row key={index} item={item} />
))}
```

If list order changes, React may preserve state on the wrong row.

## Derived State and Its Pitfalls

Bad:

```tsx
function UserName({ user }: { user: User }) {
  const [name, setName] = useState(user.name);

  return <input value={name} onChange={e => setName(e.target.value)} />;
}
```

If `user` changes, `name` does not automatically update.

Better options:

- make it controlled by parent;
- use `key` to reset intentionally;
- derive directly during render if no editing is needed;
- use effect carefully only when synchronization is truly needed.

Avoid copying props into state unless a separate editable draft is needed. Derived values should usually be computed during render or memoized if expensive.

## React.memo

```tsx
const UserRow = memo(function UserRow({ user }: { user: User }) {
  return <div>{user.name}</div>;
});
```

`React.memo` skips re-render when props are shallowly equal.

But this fails if parent creates new object every render:

```tsx
<UserRow user={{ id: user.id, name: user.name }} />
```

Better:

```tsx
const rowUser = useMemo(
  () => ({ id: user.id, name: user.name }),
  [user.id, user.name]
);
```

Use memoization only when it solves a measured or obvious problem. Do not wrap everything blindly.

## useMemo vs useCallback

`useMemo` memoizes a value.

```tsx
const filteredUsers = useMemo(() => {
  return users.filter(u => u.name.includes(search));
}, [users, search]);
```

`useCallback` memoizes a function reference.

```tsx
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);
```

`useMemo` is for expensive derived values. `useCallback` is for stable function references, often when passing callbacks to memoized children or hooks that depend on function identity.

## Server State vs Client State

Server state:

- data from API;
- can be stale;
- needs caching and refetching;
- often managed by React Query.

Client state:

- modal open/close;
- selected tab;
- unsaved form input;
- local UI state.

Do not put all server data into Redux by default.

## Practical Data Fetching Example

```tsx
function OrdersPage() {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["orders", page],
    queryFn: () => fetchOrders({ page }),
    staleTime: 30_000
  });

  if (query.isLoading) return <div>Loading...</div>;
  if (query.isError) return <div>Failed to load orders.</div>;

  return (
    <>
      <OrderTable orders={query.data.items} />
      <Pagination
        page={page}
        total={query.data.total}
        onChange={setPage}
      />
    </>
  );
}
```

A component re-renders when its state changes, its parent renders and passes new props, context it consumes changes, or an external store subscription updates. Reconciliation is React's process of comparing the previous UI tree with the new UI tree through type and key heuristics, then committing only the necessary changes to the real DOM. Fiber, React's internal unit-of-work architecture, enables this by splitting rendering work into incremental units, supporting prioritization and concurrent rendering, and cleanly separating the render phase (calculating the next UI) from the commit phase (applying DOM mutations and running effects). Keys help React preserve identity of list items across renders; stable keys prevent incorrect state reuse when items are reordered, inserted, or removed.

React 19 introduces Server Components as an alternative rendering model. Server Components run exclusively on the server and do not contribute to the client-side JavaScript bundle. They can use `async/await` directly for data access and stream their output to the client via Suspense boundaries. The `use()` hook allows Client Components to consume a promise passed from a Server Component, integrating the two rendering models within a single tree. The client-side rendering model described in this chapter (render, reconcile, commit) applies to Client Components and Server Component output once it reaches the browser.

Performance optimization in React follows a principle of measuring before acting: identify unnecessary state changes, keep state close to where it is used, split large components, use stable keys, memoize expensive calculations with `useMemo`, apply `React.memo` selectively after measurement, virtualize large lists, and avoid recreating heavy objects and function references unnecessarily during render. See Chapter 12, Section 02 (Frontend Performance) for a deeper treatment of INP, bundle optimization, code splitting, and Web Workers.
