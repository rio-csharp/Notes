# React Hooks

## Core Idea

Hooks let function components use state, effects, refs, context, reducers, and reusable behavior.

## Rules Of Hooks

1. Call hooks only at the top level.
2. Call hooks only from React functions or custom hooks.

Bad:

```tsx
if (isAdmin) {
  const [value, setValue] = useState("");
}
```

Good:

```tsx
const [value, setValue] = useState("");
```

React relies on call order.

## Under The Hood: Why Hook Order Matters

React associates hook state with a component's fiber and the order of hook calls.

Conceptual model:

```text
Fiber for Counter
  hook 1 -> useState count
  hook 2 -> useEffect document title
  hook 3 -> useRef input
```

On the next render, React expects the same order:

```text
hook 1 -> useState count
hook 2 -> useEffect document title
hook 3 -> useRef input
```

Bad:

```tsx
function Counter({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState(0);

  if (enabled) {
    useEffect(() => {
      document.title = String(count);
    }, [count]);
  }

  const inputRef = useRef<HTMLInputElement>(null);
}
```

If `enabled` changes, hook order changes:

```text
Render 1: useState -> useEffect -> useRef
Render 2: useState -> useRef
```

React can no longer match hook state correctly.

Correct:

```tsx
function Counter({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled) return;
    document.title = String(count);
  }, [enabled, count]);
}
```

Practical explanation:

> Hooks must be called in the same order on every render because React stores hook state by call order on the component fiber. Conditions should go inside the hook, not around the hook call.

## useState

```tsx
const [count, setCount] = useState(0);
```

Functional update:

```tsx
setCount(c => c + 1);
```

Use when new state depends on previous state.

## useEffect

Use for synchronization with external systems:

- API calls;
- subscriptions;
- timers;
- browser APIs;
- logging;
- localStorage.

```tsx
useEffect(() => {
  document.title = `Order ${orderId}`;
}, [orderId]);
```

Cleanup:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    console.log("tick");
  }, 1000);

  return () => clearInterval(id);
}, []);
```

## useEffect Dependencies

If a value is used inside the effect and comes from component scope, it usually belongs in the dependency array.

Dependency comparison uses `Object.is`-style equality for dependency values.

This means new object/function references can retrigger effects:

```tsx
useEffect(() => {
  connect(options);
}, [options]);
```

If `options` is created inline every render, the effect runs every render.

Better:

```tsx
const options = useMemo(() => ({
  roomId,
  retry: true
}), [roomId]);

useEffect(() => {
  connect(options);
}, [options]);
```

Or build options inside the effect:

```tsx
useEffect(() => {
  const options = { roomId, retry: true };
  connect(options);
}, [roomId]);
```

## Effect Timing And Cleanup

Effect lifecycle:

```text
render
commit DOM changes
paint
run useEffect
before next effect for changed dependencies: run cleanup
on unmount: run cleanup
```

Example:

```tsx
useEffect(() => {
  const connection = createConnection(roomId);
  connection.connect();

  return () => {
    connection.disconnect();
  };
}, [roomId]);
```

When `roomId` changes:

```text
cleanup old connection
create new connection
```

Common mistake:

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
}, []);
```

No cleanup means the interval can keep running after unmount.

Bad:

```tsx
useEffect(() => {
  fetchUser(userId);
}, []);
```

Good:

```tsx
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```

## Avoid Unnecessary Effects

Bad:

```tsx
const [fullName, setFullName] = useState("");

useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);
```

Better:

```tsx
const fullName = `${firstName} ${lastName}`;
```

Use derived values instead of effect-driven state when possible.

## useMemo

```tsx
const expensiveValue = useMemo(() => {
  return calculateExpensiveValue(items);
}, [items]);
```

Use for expensive calculations or stable object references.

## useCallback

```tsx
const handleSave = useCallback(() => {
  saveOrder(orderId);
}, [orderId]);
```

Use when function identity matters.

## useRef

Refs persist across renders without causing re-render.

```tsx
const inputRef = useRef<HTMLInputElement>(null);

function focusInput() {
  inputRef.current?.focus();
}

return <input ref={inputRef} />;
```

Use cases:

- DOM access;
- timers;
- previous values;
- mutable values that should not trigger render.

## useReducer

Good for complex state transitions.

```tsx
type State = {
  count: number;
};

type Action =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "increment":
      return { count: state.count + 1 };
    case "decrement":
      return { count: state.count - 1 };
    case "reset":
      return { count: 0 };
  }
}
```

## Custom Hook

```tsx
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
```

Usage:

```tsx
const debouncedSearch = useDebouncedValue(search, 300);
```

### Why do hooks have rules?

> React tracks hook state by call order. Conditional or nested hook calls can change the order between renders and break state association.

### What is stale closure?

> A stale closure happens when a function captures old render values and later uses outdated state or props. Functional updates, refs, or correct dependencies can fix it.

### useEffect vs useLayoutEffect?

> `useEffect` runs after paint. `useLayoutEffect` runs synchronously after DOM mutations but before paint, useful for layout measurement. Overusing `useLayoutEffect` can hurt performance.

## Practice Task

Build:

- `useDebouncedValue`;
- `usePrevious`;
- `useLocalStorage`;
- `useApiQuery` wrapper;
- a form with reducer-managed state.
