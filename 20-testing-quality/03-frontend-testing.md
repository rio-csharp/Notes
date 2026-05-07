# Frontend Testing

## Core Idea

Frontend tests verify user-visible behavior.

- `MSW`: Mock Service Worker, a tool for mocking HTTP requests.

Good frontend tests answer:

```text
What can the user see?
What can the user do?
What happens when data is loading?
What happens when the server fails?
What happens when input is invalid?
```

## Test Levels

Unit tests:

- pure functions;
- formatting utilities;
- reducers;
- validators;
- custom hooks with isolated logic.

Component tests:

- render UI;
- user interactions;
- forms;
- loading/error/empty states;
- permission-based rendering.

E2E tests:

- real browser;
- real routing;
- full user flows.

## Recommended Tools

Common stack:

```text
Vitest or Jest
React Testing Library
@testing-library/user-event
@testing-library/jest-dom
MSW
Playwright for E2E
```

Vitest example setup:

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./src/test/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Testing Like A User

Prefer queries that match accessible UI.

```tsx
render(<LoginForm />);

await user.type(screen.getByLabelText(/email/i), "user@example.com");
await user.type(screen.getByLabelText(/password/i), "Password123!");
await user.click(screen.getByRole("button", { name: /log in/i }));
```

Prefer:

- `getByRole`;
- `getByLabelText`;
- `getByText`;
- `getByPlaceholderText` only when appropriate.

Avoid:

- CSS class selectors;
- direct internal state access;
- testing implementation details.

## Component Example

Component:

```tsx
type Order = {
  id: number;
  customerName: string;
  status: "Draft" | "Submitted" | "Approved";
};

type OrderTableProps = {
  orders: Order[];
  onApprove: (orderId: number) => void;
};

export function OrderTable({ orders, onApprove }: OrderTableProps) {
  if (orders.length === 0) {
    return <p>No orders found.</p>;
  }

  return (
    <table>
      <caption>Orders</caption>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>{order.customerName}</td>
            <td>{order.status}</td>
            <td>
              <button
                type="button"
                disabled={order.status !== "Submitted"}
                onClick={() => onApprove(order.id)}
              >
                Approve
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Tests:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { OrderTable } from "./OrderTable";

test("shows empty state", () => {
  render(<OrderTable orders={[]} onApprove={vi.fn()} />);

  expect(screen.getByText(/no orders found/i)).toBeInTheDocument();
});

test("calls onApprove when approving a submitted order", async () => {
  const user = userEvent.setup();
  const onApprove = vi.fn();

  render(
    <OrderTable
      orders={[{ id: 1, customerName: "Acme", status: "Submitted" }]}
      onApprove={onApprove}
    />
  );

  await user.click(screen.getByRole("button", { name: /approve/i }));

  expect(onApprove).toHaveBeenCalledWith(1);
});

test("disables approve button for draft orders", () => {
  render(
    <OrderTable
      orders={[{ id: 1, customerName: "Acme", status: "Draft" }]}
      onApprove={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
});
```

## Testing Forms

Component:

```tsx
type LoginFormProps = {
  onSubmit: (values: { email: string; password: string }) => Promise<void>;
};

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }

    await onSubmit({ email, password });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {error && <div role="alert">{error}</div>}

      <button type="submit">Log in</button>
    </form>
  );
}
```

Test:

```tsx
test("shows validation error for invalid email", async () => {
  const user = userEvent.setup();

  render(<LoginForm onSubmit={vi.fn()} />);

  await user.type(screen.getByLabelText(/email/i), "invalid");
  await user.type(screen.getByLabelText(/password/i), "Password123!");
  await user.click(screen.getByRole("button", { name: /log in/i }));

  expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
});
```

## Mocking APIs With MSW

MSW intercepts HTTP requests at the network boundary.

Handlers:

```ts
// src/test/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/orders", () => {
    return HttpResponse.json({
      items: [{ id: 1, customerName: "Acme", status: "Submitted" }],
      total: 1,
    });
  }),
];
```

Server:

```ts
// src/test/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

Component test:

```tsx
test("loads and displays orders", async () => {
  render(<OrdersPage />);

  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  expect(await screen.findByText("Acme")).toBeInTheDocument();
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});
```

Override a handler for an error case:

```tsx
test("shows error state when loading orders fails", async () => {
  server.use(
    http.get("/api/orders", () => {
      return HttpResponse.json(
        { title: "Service unavailable" },
        { status: 503 }
      );
    })
  );

  render(<OrdersPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
});
```

## Testing Custom Hooks

For pure hooks, test behavior directly.

```tsx
import { renderHook, act } from "@testing-library/react";

function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  return {
    count,
    increment: () => setCount((value) => value + 1),
  };
}
```

```tsx
test("increments count", () => {
  const { result } = renderHook(() => useCounter(1));

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(2);
});
```

If the hook is mostly a wrapper around UI behavior, testing the component may be more useful than testing the hook directly.

## Async UI Testing

Use `findBy...` for elements that appear later:

```tsx
expect(await screen.findByText("Order created")).toBeInTheDocument();
```

Use `waitFor` for custom conditions:

```tsx
await waitFor(() => {
  expect(saveButton).not.toBeDisabled();
});
```

Avoid fixed timers unless the feature itself is time-based.

## Snapshot Tests

Snapshots are best for stable, intentionally reviewed output.

They are weak for:

- complex components;
- frequently changing markup;
- behavior;
- accessibility.

Prefer explicit assertions:

```tsx
expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
```

## What To Test

High-value frontend tests:

- form validation;
- successful submit;
- server validation errors;
- loading states;
- error states;
- empty states;
- permission-based UI;
- route guards;
- accessible labels and roles;
- disabled/enabled states;
- optimistic update rollback.
