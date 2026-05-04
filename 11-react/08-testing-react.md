# Testing React

## Core Idea

React tests should verify user-visible behavior, not implementation details.

Chinese notes:

- `component test`: 组件测试.
- `mock`: 模拟.
- `user event`: 用户事件.

## Tools

Common:

- Vitest or Jest;
- React Testing Library;
- Testing Library user-event;
- MSW for API mocking;
- Playwright for E2E.

## Basic Component Test

```tsx
test("renders empty state", () => {
  render(<OrderTable orders={[]} />);

  expect(screen.getByText(/no orders/i)).toBeInTheDocument();
});
```

Accessible component example:

```tsx
function OrderTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <p>No orders found.</p>;
  }

  return (
    <table>
      <caption>Orders</caption>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(order => (
          <tr key={order.id}>
            <th scope="row">{order.id}</th>
            <td>{order.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Test by role:

```tsx
test("renders order rows", () => {
  render(<OrderTable orders={[{ id: 1001, status: "Paid" }]} />);

  expect(screen.getByRole("table", { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "1001" })).toBeInTheDocument();
  expect(screen.getByText("Paid")).toBeInTheDocument();
});
```

## User Interaction

```tsx
test("calls onSearchChange", async () => {
  const user = userEvent.setup();
  const onSearchChange = vi.fn();

  render(<SearchBox value="" onChange={onSearchChange} />);

  await user.type(screen.getByRole("textbox", { name: /search/i }), "alice");

  expect(onSearchChange).toHaveBeenCalled();
});
```

## Testing Async UI

```tsx
test("shows loaded orders", async () => {
  render(<OrdersPage />);

  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  expect(await screen.findByText(/order 1001/i)).toBeInTheDocument();
});
```

Test error state:

```tsx
test("shows error state when orders fail to load", async () => {
  server.use(
    http.get("/api/orders", () => {
      return HttpResponse.json(
        { title: "Unexpected error" },
        { status: 500 }
      );
    })
  );

  render(<OrdersPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
});
```

## Mock Service Worker

MSW intercepts network requests in tests.

Concept:

```ts
http.get("/api/orders", () => {
  return HttpResponse.json({
    items: [{ id: 1001, status: "Paid" }],
    total: 1
  });
});
```

Test setup:

```ts
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer(
  http.get("/api/orders", () => {
    return HttpResponse.json({
      items: [{ id: 1001, status: "Paid", total: 100 }],
      total: 1
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Testing Forms

```tsx
test("shows validation message when customer is missing", async () => {
  const user = userEvent.setup();

  render(<CreateOrderPage />);

  await user.click(screen.getByRole("button", { name: /create order/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/customer/i);
});
```

Submit success:

```tsx
test("submits create order form", async () => {
  const user = userEvent.setup();

  render(<CreateOrderPage />);

  await user.type(screen.getByLabelText(/customer id/i), "123");
  await user.click(screen.getByRole("button", { name: /create order/i }));

  expect(await screen.findByText(/creating/i)).toBeInTheDocument();
});
```

## Testing Providers

Components often need router/query/auth providers.

```tsx
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
```

Disable retries in tests so failures are fast and predictable.

## What To Test

Test:

- loading state;
- error state;
- empty state;
- successful rendering;
- form validation;
- submit behavior;
- permission-based UI;
- route behavior.

## What Not To Over-test

Avoid testing:

- internal state names;
- exact implementation details;
- third-party library internals;
- snapshots for complex UIs without purpose.

## Review Questions

### What does React Testing Library encourage?

> It encourages testing components the way users interact with them: by text, role, label, and visible behavior rather than implementation details.

### Unit vs E2E frontend tests?

> Component tests verify UI pieces in isolation. E2E tests verify complete user flows in a real browser.

### Why use MSW?

> MSW mocks network requests at the request layer, making tests closer to real application behavior than mocking every API function manually.

## Common Mistakes

- Testing implementation details.
- No tests for error state.
- Overusing snapshots.
- Mocking too deeply.
- Tests that depend on CSS class names.
- No accessible labels, making tests harder.

## Practice Task

Test:

1. order table empty state;
2. order list loading state;
3. API error state;
4. create order form validation;
5. successful submit;
6. permission-hidden action button.
