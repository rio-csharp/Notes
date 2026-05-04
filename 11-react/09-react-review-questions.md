# React Knowledge Checks

Use these questions to check whether the React concepts are usable in real components.

## 1. What causes a React component to re-render?

Answer:

> A component re-renders when its state changes, when its parent re-renders and passes new props, when consumed context changes, or when an external store subscription updates. Rendering means React calls the component function again; it does not always mean the real DOM changes.

## 2. What is reconciliation?

Answer:

> Reconciliation is React's process of comparing the previous render output with the new render output and deciding what changes need to be committed to the DOM. Keys help React preserve identity in lists.

## 3. Why are keys important?

Answer:

> Keys identify list items across renders. Stable keys help React preserve component state correctly when items are inserted, removed, or reordered. Using array index as key can cause bugs in dynamic lists.

## 4. What is stale closure?

Answer:

> A stale closure happens when a function captures values from an old render and later uses outdated state or props. It often appears in intervals, event handlers, or effects with missing dependencies.

Example bug:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1);
  }, 1000);

  return () => clearInterval(id);
}, []);
```

Fix:

```tsx
setCount(c => c + 1);
```

## 5. useMemo vs useCallback?

Answer:

> `useMemo` memoizes a computed value. `useCallback` memoizes a function reference. I use them when there is an expensive calculation or when stable reference matters, such as passing callbacks to memoized child components. I avoid adding them everywhere without measurement.

Example:

```tsx
const visibleOrders = useMemo(() => {
  return orders.filter(order => order.status === status);
}, [orders, status]);

const handleSelect = useCallback((orderId: number) => {
  setSelectedOrderId(orderId);
}, []);
```

## 6. useEffect vs derived state?

Answer:

> If a value can be calculated from props or state during render, I prefer deriving it directly instead of storing it in state with `useEffect`. Effects are for synchronizing with external systems such as APIs, subscriptions, timers, DOM, and localStorage.

Bad:

```tsx
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);
```

Good:

```tsx
const fullName = `${firstName} ${lastName}`;
```

## 7. Context vs Redux vs Zustand vs React Query?

Answer:

> Context is good for low-frequency shared values like theme or current user. Redux or Zustand can manage complex client state. React Query is specialized for server state: caching, refetching, retries, pagination, and mutations. I do not put all API data into global client state by default.

Decision example:

```text
modal open -> local state
order filters -> URL state
orders from API -> React Query
current user -> Context or small global store
complex workflow draft -> Zustand or Redux
```

## 8. How do you optimize React performance?

Answer:

> I measure first using React Profiler, browser DevTools, Lighthouse, and bundle analysis. Then I reduce unnecessary state changes, move state closer to where it is used, split components, memoize carefully, virtualize large lists, code split heavy routes, optimize images, and use React Query caching for server data.

## 9. Controlled vs uncontrolled components?

Answer:

> Controlled components store form value in React state. Uncontrolled components let the DOM manage state and access values through refs. Controlled forms are easier for dynamic validation and conditional UI, while uncontrolled forms can reduce re-renders and work well with libraries like React Hook Form.

## 10. How do you handle API data in React?

Answer:

> I usually use a typed API layer and React Query. Components should handle loading, error, empty, and success states. Query keys must include all parameters that affect the result. Mutations should invalidate or update relevant caches.

Example:

```tsx
const ordersQuery = useQuery({
  queryKey: ["orders", { status, page }],
  queryFn: () => fetchOrders({ status, page })
});
```

## 11. What should go in `useEffect`?

Answer:

> Effects are for synchronizing React with external systems: network requests, subscriptions, timers, browser APIs, and imperative libraries. Values that can be calculated during render usually should not be stored with `useEffect`.

Example:

```tsx
useEffect(() => {
  const id = window.setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => window.clearInterval(id);
}, []);
```

## 12. How do you test React components?

Answer:

> Test user-visible behavior with React Testing Library. Query by role, label, text, and accessible names. Use MSW for API responses. Avoid testing internal state or implementation details.

Example:

```tsx
expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
```

## Common Misconceptions

- "Virtual DOM directly makes everything fast."
- Missing `useEffect` dependencies without explanation.
- Using index keys for dynamic lists.
- Putting all state in Redux.
- No error or empty state.
- Overusing memoization.
- Fetching data in many components without a strategy.
