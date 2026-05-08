# Testing React

## Core Idea

React tests should verify user-visible behavior, not implementation details.

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

## Testing Forms With Actions (React 19)

React 19 form actions can be tested by observing the form's behavior after submission:

```tsx
test("submits form action and shows pending state", async () => {
  const user = userEvent.setup();
  const mockAction = vi.fn();

  render(
    <form action={mockAction}>
      <input name="customerId" defaultValue="123" />
      <button type="submit">Submit</button>
    </form>
  );

  await user.click(screen.getByRole("button", { name: /submit/i }));
  expect(mockAction).toHaveBeenCalled();
  expect(mockAction.mock.calls[0][0]).toBeInstanceOf(FormData);
});
```

For testing `useActionState` with pending states, wrap the component in a test-friendly render with router and query providers as needed. The `isPending` state is controlled by the Transition -- in tests, the action completes synchronously within `act()`, so the pending phase may not be observable. For more precise control, test the error and success states through the action's return value.

## Testing Suspense Boundaries

Components that use `Suspense` can be tested by wrapping them in a Suspense boundary with a fallback:

```tsx
test("shows fallback while lazy component loads", async () => {
  const LazyComponent = lazy(() =>
    Promise.resolve({ default: () => <div>Loaded</div> })
  );

  render(
    <Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </Suspense>
  );

  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByText(/loaded/i)).toBeInTheDocument();
});
```

For testing with `use()` and Suspense-enabled data fetching, wrap the component tree in a `Suspense` boundary and use `findBy*` queries that wait for resolution.

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

## Testing Custom Hooks

Custom hooks can be tested in isolation using `renderHook` from `@testing-library/react`.

```tsx
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

test("debounces value changes", async () => {
  vi.useFakeTimers();

  const { result, rerender } = renderHook(
    ({ value }) => useDebouncedValue(value, 300),
    { initialProps: { value: "a" } }
  );

  expect(result.current).toBe("a");

  rerender({ value: "ab" });
  expect(result.current).toBe("a"); // still the old value

  act(() => { vi.advanceTimersByTime(300); });
  expect(result.current).toBe("ab");

  vi.useRealTimers();
});
```

`renderHook` creates a test environment where the hook runs inside a component, supporting state updates, effects, and context providers. The `act` wrapper ensures all state updates and effects are flushed before assertions.

## Accessibility Testing

Accessibility issues can be caught with automated tools such as `jest-axe`:

```tsx
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

test("OrderTable has no accessibility violations", async () => {
  const { container } = render(
    <OrderTable orders={[{ id: 1001, status: "Paid" }]} />
  );

  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Automated accessibility testing catches common issues such as missing labels, insufficient color contrast, and incorrect ARIA attributes. It does not replace manual testing with assistive technologies, but it provides a fast feedback loop during development.

React Testing Library encourages testing components the way users interact with them: by text, role, label, and visible behavior rather than implementation details. This approach produces tests that survive refactoring and give more confidence that the application works correctly from the user's perspective.

Component tests verify UI pieces in isolation, often with mocked data and network responses. Integration tests verify interactions between components and data layers. E2E tests (via Playwright or Cypress) verify complete user flows in a real browser, including navigation, authentication, and network behavior. Each layer serves a different purpose: component tests are fast and focused, integration tests catch coordination bugs, and E2E tests validate the system as a whole.

MSW (Mock Service Worker) mocks network requests at the request layer, intercepting actual `fetch` or `XMLHttpRequest` calls in tests. This is closer to real application behavior than manually mocking every API function, because it tests the actual data-fetching code paths.
