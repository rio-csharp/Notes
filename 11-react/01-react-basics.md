# React Basics

## Core Idea

React is a declarative UI library organized around components. Instead of telling the browser how to update the DOM step by step (imperative), the developer declares what the UI should look like for a given state, and React reconciles the difference automatically.

A component is a function that accepts inputs called props and returns a description of what should appear on screen. When state changes, React re-executes the component to obtain a new description, compares it with the previous one, and applies only the necessary changes to the real DOM. This abstraction frees the developer from manually managing DOM operations, event listener lifecycles, and teardown logic.

### JSX

JSX is a JavaScript syntax extension that looks like HTML. Each JSX node compiles to a call to `jsx()` (or `createElement()` in older React versions) that returns a plain JavaScript object called a React element. These elements are lightweight descriptions of DOM structure — type, props, and children — not actual DOM nodes. React reads the element tree produced by components and uses it during reconciliation to determine what DOM mutations are necessary.

Because JSX is syntactic sugar over JavaScript, it can embed any JavaScript expression inside `{}` braces. Attributes in JSX use camelCase naming for DOM properties (e.g., `className` instead of `class`, `htmlFor` instead of `for`).

## Component

```tsx
type UserCardProps = {
  name: string;
  email: string;
};

function UserCard({ name, email }: UserCardProps) {
  return (
    <article>
      <h2>{name}</h2>
      <p>{email}</p>
    </article>
  );
}
```

Components should be named with capital letters:

```tsx
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span>{status}</span>;
}
```

Lowercase JSX names are treated as built-in DOM elements:

```tsx
<section />
<button />
```

## Props

Props are inputs passed from a parent component. They flow downward in a unidirectional data model: a parent passes props to a child, but a child cannot modify props from its parent. This one-way data flow makes component behavior predictable because data has a single, traceable origin.

```tsx
<UserCard name="Alice" email="alice@example.com" />
```

Props should be treated as read-only. Mutating a prop directly inside a child component would bypass React's change detection and create inconsistencies between the parent's view of state and the child's. If a child needs to communicate back to a parent, the parent passes a callback function as a prop, and the child invokes it with the relevant data.

## State

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

State changes trigger a re-render of the component. When `setCount` is called with a new value, React schedules a re-render for the component, calls the component function again to produce the new element tree, compares it against the previous tree through reconciliation, and applies only the necessary DOM updates.

React detects state changes by reference identity. Calling `setState` with a new value tells React that the state has diverged. Mutating an existing state object and passing it to `setState` with the same reference will not trigger a re-render because React relies on reference comparison to detect changes.

Use functional updates when the next state depends on the previous state:

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(current => current + 1);
  }

  return <button onClick={increment}>Count: {count}</button>;
}
```

Do not mutate state directly:

```tsx
orders.push(newOrder);
setOrders(orders); // bad
```

Create a new array:

```tsx
setOrders(current => [...current, newOrder]);
```

## Conditional Rendering

```tsx
if (isLoading) {
  return <Spinner />;
}

if (error) {
  return <ErrorState />;
}

return <OrderTable orders={orders} />;
```

## List Rendering

```tsx
{orders.map(order => (
  <OrderRow key={order.id} order={order} />
))}
```

Use stable keys.

## Composition

React favors composition.

```tsx
function Card({ children }: { children: React.ReactNode }) {
  return <section className="card">{children}</section>;
}
```

## Complete Orders Component Example

Types:

```tsx
type OrderStatus = "Draft" | "Submitted" | "Paid" | "Cancelled";

type Order = {
  id: number;
  customerName: string;
  status: OrderStatus;
  total: number;
};
```

Reusable status badge:

```tsx
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const label = {
    Draft: "Draft",
    Submitted: "Submitted",
    Paid: "Paid",
    Cancelled: "Cancelled"
  }[status];

  return <span className={`status status--${status.toLowerCase()}`}>{label}</span>;
}
```

Table row:

```tsx
function OrderRow({ order }: { order: Order }) {
  return (
    <tr>
      <th scope="row">{order.id}</th>
      <td>{order.customerName}</td>
      <td>
        <OrderStatusBadge status={order.status} />
      </td>
      <td>${order.total.toFixed(2)}</td>
    </tr>
  );
}
```

Table:

```tsx
function OrderTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <p>No orders found.</p>;
  }

  return (
    <table>
      <caption>Recent orders</caption>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Customer</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(order => (
          <OrderRow key={order.id} order={order} />
        ))}
      </tbody>
    </table>
  );
}
```

Page component with loading, error, and empty states:

```tsx
function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/orders");

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const data = (await response.json()) as Order[];

        if (!cancelled) {
          setOrders(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <p>Loading orders...</p>;
  }

  if (error) {
    return <p role="alert">Could not load orders: {error}</p>;
  }

  return <OrderTable orders={orders} />;
}
```

The example demonstrates several patterns that recur throughout React development: components divided by responsibility, props for passing data from parent to child, local state for managing loading and error states, stable keys for list rendering, accessible table markup, and a cleanup guard in the effect to prevent setting state after unmount.

Components are the fundamental building blocks of a React application. They receive props as input and return React elements describing what should appear on screen. Props flow unidirectionally from parent to child and must be treated as read-only, while state is owned locally by each component and drives re-rendering when it changes. For lists, providing stable keys lets React preserve component identity across re-renders, which avoids unnecessary DOM operations and maintains correct component state.
