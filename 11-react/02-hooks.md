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

Internally, React stores hook state on the component's fiber node using a linked list. Each hook call during rendering appends a node to this list containing the hook's type, its current value, and a pointer to the next hook. The order of hook calls determines each hook's position in this linked list.

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

Hooks must be called in the same order on every render because React stores hook state by call order on the component fiber. Conditions should go inside the hook, not around the hook call.

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

A common oversight is omitting cleanup:

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
}, []);
```

Without a cleanup function, the interval continues running after the component unmounts, which can lead to memory leaks and state updates on unmounted components.

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

## useActionState

`useActionState` is a React 19 hook designed for form actions. It accepts an action function and an initial state, and returns the current state, a dispatch function, and a pending flag:

```tsx
import { useActionState } from "react";

type FormState = { success: boolean; message: string } | null;

async function submitOrder(prevState: FormState, formData: FormData): Promise<FormState> {
  const customerId = formData.get("customerId");
  const response = await fetch("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customerId })
  });

  if (!response.ok) {
    return { success: false, message: "Order creation failed." };
  }

  return { success: true, message: "Order created." };
}

function CreateOrderForm() {
  const [state, formAction, isPending] = useActionState(submitOrder, null);

  return (
    <form action={formAction}>
      <input name="customerId" type="number" />
      <button type="submit" disabled={isPending}>
        {isPending ? "Submitting..." : "Create Order"}
      </button>
      {state && <p role="alert">{state.message}</p>}
    </form>
  );
}
```

The action function receives the previous state as its first argument and the submitted `FormData` as the second. Dispatch calls are queued and run sequentially: each call waits for the previous one to finish and receives its result as `previousState`. If the action throws, React cancels all queued actions and displays the nearest Error Boundary.

When the dispatch is passed to `<form action={...}>`, React automatically wraps the submission in a Transition. If called imperatively, the dispatch must be wrapped in `startTransition()` to correctly track `isPending`.

## useFormStatus

`useFormStatus` reads the pending status of the enclosing `<form>`. It must be called inside a component rendered within a `<form>` element:

```tsx
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function OrderForm() {
  return (
    <form action={submitOrder}>
      <input name="customerId" />
      <SubmitButton />
    </form>
  );
}
```

`useFormStatus` is useful for building reusable submit buttons or form status indicators without manually threading `isPending` through the component tree.

## useOptimistic

`useOptimistic` displays a result before the server confirms it. It accepts the current state and an update function, and returns an optimistic snapshot and a dispatch function:

```tsx
import { useOptimistic, useRef } from "react";

type Message = { id: number; text: string; sending?: boolean };

function MessageList({ messages }: { messages: Message[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: string) => [
      ...state,
      { id: Date.now(), text: newMessage, sending: true }
    ]
  );

  async function formAction(formData: FormData) {
    addOptimisticMessage(formData.get("message") as string);
    formRef.current?.reset();
    await sendMessage(formData);
  }

  return (
    <form action={formAction} ref={formRef}>
      <input name="message" />
      <button type="submit">Send</button>
      <ul>
        {optimisticMessages.map(msg => (
          <li key={msg.id}>
            {msg.text} {msg.sending ? "(sending...)" : ""}
          </li>
        ))}
      </ul>
    </form>
  );
}
```

The optimistic state updates immediately, providing instant UI feedback. When the server confirms, React reconciles the optimistic state with the real state. If the action errors, the optimistic update automatically rolls back.

## The `use()` Hook

The `use()` hook consumes a Promise or Context value. Unlike other hooks, it can be called conditionally and inside loops:

```tsx
import { use } from "react";

function OrderDetails({ orderPromise }: { orderPromise: Promise<Order> }) {
  const order = use(orderPromise);
  return <OrderSummary order={order} />;
}
```

When a Promise is passed, `use()` suspends the component -- the nearest `<Suspense>` boundary shows a fallback until the Promise resolves. This integrates Server Components and Client Components, allowing the server to stream data and the client to consume it without managing loading states manually.

`use()` with Context replaces `useContext` and is preferred because it supports conditional calls:

```tsx
function Sidebar({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext);
    return <div className={theme}>...</div>;
  }
  return <div>...</div>;
}
```

## useEffectEvent

`useEffectEvent` extracts non-reactive logic from an effect without adding it to the dependency array. The returned function reads the latest props and state but does not need to be listed as a dependency:

```tsx
import { useEffect, useEffectEvent } from "react";

function Connection({ roomId }: { roomId: string }) {
  const onMessage = useEffectEvent((msg: string) => {
    // reads latest state without being a dependency
    logMessage(msg);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.onMessage(onMessage);
    return () => connection.disconnect();
  }, [roomId]); // onMessage is NOT a dependency

  return <div />;
}
```

Without `useEffectEvent`, `onMessage` would need to be either a dependency (causing reconnection on every render) or suppressed from the linter. `useEffectEvent` solves this by making the function non-reactive -- it always reads the latest values but does not trigger the effect when they change.

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

React tracks hook state by the order of calls within a component, stored as a linked list on the component's fiber node. Conditional or nested hook calls can change this order between renders and break state association. This is why hooks must always be called at the top level of a component or custom hook, never inside conditions or loops.

A stale closure occurs when a function captures variables from a particular render cycle and later uses outdated values. This is commonly encountered inside `useEffect` callbacks or event handlers that close over state or props. Solutions include using functional updates (`setCount(c => c + 1)`) when the new value depends only on the previous value, adding the captured value to the dependency array, or storing the value in a ref to avoid capture issues.

Effect timing follows a consistent lifecycle: React renders the component, commits DOM changes, the browser paints, then it runs `useEffect` callbacks. On dependency changes, the previous effect's cleanup runs before the new effect. `useLayoutEffect` runs synchronously after DOM mutations but before the browser paints, which makes it suitable for reading layout geometry or applying visible DOM changes that should not cause a flicker. Overusing `useLayoutEffect` can block the paint and hurt perceived performance, so it should be reserved for cases where synchronous measurement is genuinely required.
