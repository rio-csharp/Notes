# React Basics

## Core Idea

React is a UI library for building component-based user interfaces.

- `JSX`: JavaScript XML-like syntax.

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

Props are inputs from parent component.

```tsx
<UserCard name="Alice" email="alice@example.com" />
```

Props should be treated as read-only.

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

State changes trigger re-render.

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

This example shows:

- components split by responsibility;
- props for child inputs;
- local state for loading/error/data;
- stable keys for list rows;
- accessible table markup;
- cleanup guard to avoid setting state after unmount.

### What is a component?

> A component is a reusable UI unit that receives props and returns React elements describing what should appear on screen.

### Props vs state?

> Props are passed from parent to child. State is owned by the component and changes over time.

### Why should keys be stable?

> Stable keys help React preserve item identity and state correctly during list changes.

## Practice Task

Build:

1. `OrderCard`;
2. `OrderTable`;
3. loading state;
4. error state;
5. empty state;
6. reusable `Card` component.
