# Frontend Project Structure

## Core Idea

Frontend architecture is the set of decisions that makes a frontend application understandable, changeable, testable, and reliable as it grows.

It is not only folder names — it encompasses dependency rules, module boundaries, routing architecture, state placement, and how the codebase is organized.

## A Practical React Structure

A common structure for a medium or large React application is:

```text
src
  app
    App.tsx
    router.tsx
    providers.tsx
    queryClient.ts
  features
    orders
      api
        ordersApi.ts
      components
        OrderFilters.tsx
        OrderStatusBadge.tsx
        OrderTable.tsx
      hooks
        useOrderFilters.ts
        useOrdersQuery.ts
      pages
        OrderDetailsPage.tsx
        OrdersPage.tsx
      types.ts
      index.ts
    users
      api
      components
      hooks
      pages
      types.ts
      index.ts
  shared
    api
      apiClient.ts
      apiErrors.ts
    config
      env.ts
    ui
      Button.tsx
      Dialog.tsx
      Field.tsx
      Table.tsx
    hooks
      useDebouncedValue.ts
    utils
      date.ts
      format.ts
    types
      paging.ts
  styles
    globals.css
    tokens.css
  main.tsx
```

This structure has four important layers:

- `app`: application composition, routing, providers, and startup code.
- `features`: business modules such as orders, users, invoices, payments.
- `shared`: reusable infrastructure that is not owned by a single feature.
- `styles`: global styles, design tokens, and reset rules.

## Feature-Based Structure

A feature-based structure keeps related code close together.

Example:

```text
features/orders
  api/ordersApi.ts
  components/OrderTable.tsx
  pages/OrdersPage.tsx
  hooks/useOrdersQuery.ts
  types.ts
```

This is usually easier to maintain than this layout for large products:

```text
components
  OrderTable.tsx
hooks
  useOrdersQuery.ts
api
  ordersApi.ts
pages
  OrdersPage.tsx
types
  orderTypes.ts
```

The second structure looks clean at the beginning, but as the application grows, every change requires jumping across many global folders. Feature-based structure makes ownership clearer.

## Dependency Direction

A frontend project should have a clear dependency direction.

Recommended direction:

```text
app -> features -> shared
```

This means:

- `app` can import from `features` and `shared`;
- `features/orders` can import from `shared`;
- `features/orders` should avoid importing internal files from `features/users`;
- `shared` should not import from `features`.

Good:

```tsx
// features/orders/components/OrderTable.tsx
import { Button } from "@/shared/ui/Button";
import type { Order } from "../types";
```

Risky:

```tsx
// shared/ui/Table.tsx
import type { Order } from "@/features/orders/types";
```

`shared/ui/Table.tsx` becomes business-aware. A generic table should not know what an order is. Once shared code imports feature code, the dependency direction becomes unclear and changes become harder to reason about.

### Barrel Exports and Tree-Shaking

The `index.ts` files shown here are barrel exports -- they re-export select members from internal modules. While convenient, barrel files can negatively affect tree-shaking. When a bundler encounters `import { OrdersPage } from "@/features/orders"`, it may also include every other export from the barrel, even if unused, depending on the bundler configuration and whether side-effect flags are properly set.

For large features, consider importing directly from internal paths when the import is for a specific sub-module (such as a type or utility), and reserve the barrel for public API surfaces. ESM-aware bundlers (Vite, Webpack with `"sideEffects": false`) handle this better than older tools, but it is worth verifying with bundle analysis.

### React 19 Server Components and Architecture

React 19 Server Components (RSC) change data fetching architecture at the framework level. Server Components run on the server and access data directly (databases, file systems, internal APIs) without exposing fetching logic to the client. Client Components handle interactivity and state.

RSC affects the project structure in two ways:

1. **Module boundaries become server/client boundaries**: Code in Server Components is never sent to the client. Expensive libraries (markdown parsers, date formatters, validation schemas used only on the server) can be imported freely in Server Components without affecting bundle size.

2. **Data fetching moves closer to the component**: Instead of a separate `api/ordersApi.ts` layer, Server Components can read data directly with `async/await`. The API abstraction layer remains relevant for Client Components that need to fetch data interactively.

For projects using RSC, the `api/` directory inside features still serves Client Components. Server Components may place data access utilities in a separate `data/` directory or inline them directly in the component, depending on the framework conventions.

## Public Module APIs

Large features should expose a small public API.

Example:

```ts
// features/orders/index.ts
export { OrdersPage } from "./pages/OrdersPage";
export { OrderDetailsPage } from "./pages/OrderDetailsPage";
export type { Order, OrderStatus } from "./types";
```

Then other parts of the app import from the feature entry point:

```tsx
import { OrdersPage } from "@/features/orders";
```

Avoid importing deep internal files from another feature:

```tsx
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
```

This is not always wrong, but it weakens the feature boundary. If another feature needs `OrderStatusBadge`, ask whether it should become:

- a public export of the orders feature;
- a shared UI component;
- a duplicated feature-specific component with different responsibilities.

## Path Aliases

Path aliases reduce fragile relative imports.

Example `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Example `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
```

Then imports are stable:

```tsx
import { apiClient } from "@/shared/api/apiClient";
import { Button } from "@/shared/ui/Button";
```

## API Layer

UI components should not know low-level HTTP details.

Instead of this:

```tsx
function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch("/api/orders")
      .then((response) => response.json())
      .then(setOrders);
  }, []);

  return <OrderTable orders={orders} />;
}
```

Prefer a reusable API client:

```ts
// shared/api/apiErrors.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

```ts
// shared/api/apiClient.ts
import { ApiError } from "./apiErrors";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  });

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    throw new ApiError("API request failed", response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
```

Then each feature owns its API functions:

```ts
// features/orders/api/ordersApi.ts
import { apiRequest } from "@/shared/api/apiClient";
import type { PagedResult } from "@/shared/types/paging";
import type { Order, OrderSearchParams } from "../types";

export function fetchOrders(
  params: OrderSearchParams,
  signal?: AbortSignal
): Promise<PagedResult<Order>> {
  const searchParams = new URLSearchParams();

  if (params.status) {
    searchParams.set("status", params.status);
  }

  searchParams.set("page", String(params.page));
  searchParams.set("pageSize", String(params.pageSize));

  return apiRequest<PagedResult<Order>>(`/orders?${searchParams}`, {
    signal
  });
}

export function cancelOrder(orderId: string): Promise<void> {
  return apiRequest<void>(`/orders/${orderId}/cancel`, {
    method: "POST"
  });
}
```

The page does not care whether data comes from `fetch`, Axios, GraphQL, generated clients, or mocks.

## Types Near the Feature

Feature-owned domain types should live near the feature.

```ts
// features/orders/types.ts
export type OrderStatus = "draft" | "submitted" | "paid" | "cancelled";

export type Order = {
  id: string;
  number: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
};

export type OrderSearchParams = {
  status?: OrderStatus;
  page: number;
  pageSize: number;
};
```

Shared generic types can live under `shared/types`.

```ts
// shared/types/paging.ts
export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};
```

## Page Components

A page component coordinates the page.

It usually:

- reads route params;
- reads URL query params;
- connects data fetching;
- handles page-level loading, error, empty, and permission states;
- composes feature components.

Example:

```tsx
// features/orders/pages/OrdersPage.tsx
import { useSearchParams } from "react-router-dom";
import { OrderFilters } from "../components/OrderFilters";
import { OrderTable } from "../components/OrderTable";
import { useOrdersQuery } from "../hooks/useOrdersQuery";
import type { OrderStatus } from "../types";

const defaultPageSize = 20;

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") as OrderStatus | null;
  const page = Number(searchParams.get("page") ?? "1");

  const filters = {
    status: status ?? undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: defaultPageSize
  };

  const ordersQuery = useOrdersQuery(filters);

  function changeStatus(nextStatus: OrderStatus | "all") {
    const next = new URLSearchParams(searchParams);

    if (nextStatus === "all") {
      next.delete("status");
    } else {
      next.set("status", nextStatus);
    }

    next.set("page", "1");
    setSearchParams(next);
  }

  if (ordersQuery.isLoading) {
    return <p>Loading orders...</p>;
  }

  if (ordersQuery.isError) {
    return <p role="alert">Orders could not be loaded.</p>;
  }

  return (
    <main>
      <h1>Orders</h1>

      <OrderFilters
        status={filters.status ?? "all"}
        onStatusChange={changeStatus}
      />

      <OrderTable orders={ordersQuery.data.items} />
    </main>
  );
}
```

## Feature Hooks

Feature hooks keep page components readable.

```ts
// features/orders/hooks/useOrdersQuery.ts
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "../api/ordersApi";
import type { OrderSearchParams } from "../types";

export function ordersQueryKey(params: OrderSearchParams) {
  return ["orders", params] as const;
}

export function useOrdersQuery(params: OrderSearchParams) {
  return useQuery({
    queryKey: ordersQueryKey(params),
    queryFn: ({ signal }) => fetchOrders(params, signal),
    staleTime: 30_000
  });
}
```

This keeps data-fetching details out of the page while still keeping the logic inside the orders feature.

## Feature Components

Feature components use business language.

```tsx
// features/orders/components/OrderStatusBadge.tsx
import type { OrderStatus } from "../types";

type OrderStatusBadgeProps = {
  status: OrderStatus;
};

const labels: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  paid: "Paid",
  cancelled: "Cancelled"
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return <span data-status={status}>{labels[status]}</span>;
}
```

```tsx
// features/orders/components/OrderTable.tsx
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { Order } from "../types";

type OrderTableProps = {
  orders: Order[];
};

export function OrderTable({ orders }: OrderTableProps) {
  if (orders.length === 0) {
    return <p>No orders found.</p>;
  }

  return (
    <table>
      <caption>Order list</caption>
      <thead>
        <tr>
          <th scope="col">Order number</th>
          <th scope="col">Customer</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>{order.number}</td>
            <td>{order.customerName}</td>
            <td>
              <OrderStatusBadge status={order.status} />
            </td>
            <td>{order.totalAmount.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## Shared UI Components

Shared UI components should be reusable without knowing business concepts.

Example button:

```tsx
// shared/ui/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  isLoading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`button button-${variant}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
}
```

Example field wrapper:

```tsx
// shared/ui/Field.tsx
import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
};

export function Field({ id, label, error, children }: FieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

The shared component owns accessibility and consistency. The feature component owns business behavior.

## Design System Basics

A design system is a shared language for UI.

It usually includes:

- color tokens;
- typography;
- spacing;
- reusable components;
- accessibility rules;
- interaction states;
- documentation and examples.

Example CSS tokens:

```css
/* styles/tokens.css */
:root {
  --color-text: #172033;
  --color-muted: #667085;
  --color-border: #d0d5dd;
  --color-surface: #ffffff;
  --color-primary: #155eef;
  --color-danger: #d92d20;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;

  --radius-sm: 4px;
  --radius-md: 8px;
}
```

Example component styles:

```css
.button {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-4);
  font: inherit;
  cursor: pointer;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.button-primary {
  background: var(--color-primary);
  color: white;
}

.button-secondary {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.button-danger {
  background: var(--color-danger);
  color: white;
}
```

The purpose is not only visual polish. The purpose is consistency and maintainability.

Good design-system practice:

- components support disabled, loading, error, empty, and selected states;
- form controls have labels and accessible errors;
- color is not the only way to communicate state;
- variants are limited and intentional;
- one-off styles are reviewed before becoming permanent.

## State Placement

Keep state as local as possible, but no more local than necessary.

Use:

- local state for temporary UI state;
- URL state for filters and pagination when shareable;
- React Query for server state;
- global store for cross-page client state;
- form state libraries for complex forms;
- backend persistence for state that must survive devices and sessions.

Example local state:

```tsx
function DeleteOrderButton({ orderId }: { orderId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Delete
      </button>
      {isOpen ? (
        <ConfirmDialog
          title="Delete order"
          onCancel={() => setIsOpen(false)}
          onConfirm={() => deleteOrder(orderId)}
        />
      ) : null}
    </>
  );
}
```

Example URL state:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const status = searchParams.get("status") ?? "all";
```

Example global client state:

```ts
// shared/session/sessionStore.ts
import { create } from "zustand";

type SessionState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}));
```

Do not put server data into a global client store by default. Server state needs caching, refetching, invalidation, retries, and request cancellation. React Query or a similar server-state library usually handles that better.

## Routing Architecture

Routes are part of architecture because they define page ownership and loading boundaries.

```tsx
// app/router.tsx
import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./AppLayout";

const OrdersPage = lazy(() =>
  import("@/features/orders").then((module) => ({
    default: module.OrdersPage
  }))
);

const OrderDetailsPage = lazy(() =>
  import("@/features/orders").then((module) => ({
    default: module.OrderDetailsPage
  }))
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        path: "orders",
        element: <OrdersPage />
      },
      {
        path: "orders/:orderId",
        element: <OrderDetailsPage />
      }
    ]
  }
]);
```

Good route-level design:

- large pages are lazy-loaded;
- route params are validated;
- permission checks happen at route or page boundary;
- error boundaries are available for page failures;
- routes map naturally to business features.

## Application Providers

Provider setup should be centralized.

```tsx
// app/providers.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "./queryClient";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

```ts
// app/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});
```

Do not scatter provider setup across unrelated files. It becomes hard to test and hard to reason about startup behavior.

## Environment Configuration

Environment variables should be validated at startup.

```ts
// shared/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_ENABLE_ANALYTICS: z.enum(["true", "false"]).default("false")
});

export const env = envSchema.parse(import.meta.env);

export const appConfig = {
  apiBaseUrl: env.VITE_API_BASE_URL,
  enableAnalytics: env.VITE_ENABLE_ANALYTICS === "true"
};
```

Validating environment variables at startup means missing variables fail fast, invalid URLs are caught before runtime API errors, feature flags become explicit, and deployment environments are easier to compare.

## Error Boundaries

React error boundaries prevent one rendering error from blanking the entire application.

```tsx
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryState = {
  hasError: boolean;
};

type ErrorBoundaryProps = {
  children: ReactNode;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React render error", { error, info });
  }

  render() {
    if (this.state.hasError) {
      return <p role="alert">Something went wrong.</p>;
    }

    return this.props.children;
  }
}
```

Use boundaries around:

- route outlets;
- complex dashboards;
- plugin areas;
- third-party widgets;
- lazy-loaded feature areas.

Error boundaries do not catch every error. They catch rendering, lifecycle, and constructor errors below them. Event handler errors and async errors still need normal error handling.

## Feature Flags

Feature flags allow incomplete or risky behavior to be controlled without a new deployment.

```ts
// shared/config/featureFlags.ts
export type FeatureFlag = "newOrderDetails" | "bulkOrderExport";

const flags: Record<FeatureFlag, boolean> = {
  newOrderDetails: import.meta.env.VITE_NEW_ORDER_DETAILS === "true",
  bulkOrderExport: import.meta.env.VITE_BULK_ORDER_EXPORT === "true"
};

export function isFeatureEnabled(flag: FeatureFlag) {
  return flags[flag];
}
```

```tsx
import { isFeatureEnabled } from "@/shared/config/featureFlags";
import { LegacyOrderDetails } from "./LegacyOrderDetails";
import { NewOrderDetails } from "./NewOrderDetails";

export function OrderDetailsPage() {
  return isFeatureEnabled("newOrderDetails") ? (
    <NewOrderDetails />
  ) : (
    <LegacyOrderDetails />
  );
}
```

Feature flags should have owners and removal dates. Old flags make the codebase harder to understand.

## Testing Architecture

Testing is also affected by project structure.

Feature-level tests can use the public feature API:

```tsx
// features/orders/pages/OrdersPage.test.tsx
import { screen } from "@testing-library/react";
import { OrdersPage } from "@/features/orders";
import { renderWithProviders } from "@/test/renderWithProviders";

test("shows orders returned by the API", async () => {
  renderWithProviders(<OrdersPage />, {
    route: "/orders"
  });

  expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
});
```

Reusable UI components should be tested independently:

```tsx
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

test("disables the button while loading", () => {
  render(<Button isLoading>Save</Button>);

  expect(screen.getByRole("button")).toBeDisabled();
  expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
});
```

Good structure makes tests simpler because dependencies are clear.

## Micro-Frontends

Micro-frontends split a frontend into independently delivered parts.

Use cases:

- many teams own different product areas;
- independent deployment is required;
- a legacy frontend must be migrated gradually;
- a platform hosts separately built applications.

Costs:

- routing complexity;
- shared dependency and version conflicts;
- duplicated bundles;
- inconsistent UI;
- harder local development;
- authentication and session coordination;
- cross-app communication complexity;
- observability across multiple frontend applications.

Start with a modular frontend unless team boundaries and deployment boundaries clearly justify micro-frontends. A folder structure problem should usually be solved with modular architecture before adding runtime integration complexity.

### Module Federation

Module Federation (from Webpack 5, also available in other bundlers via plugins) is an alternative to micro-frontends that allows separately built applications to share components and dependencies at runtime. Unlike micro-frontends that compose at the page or route level, Module Federation can share individual components, state, or even library code (such as React itself) across independently deployed applications.

Module Federation works well when multiple applications share a common design system or set of reusable modules but are built and deployed separately. It avoids duplicating shared dependencies in each application's bundle. However, it introduces coordination overhead for shared versioning, and misconfigured shared dependencies can cause runtime errors.

### Monorepo Tooling

For medium-to-large frontend projects, a monorepo (Nx, Turborepo, or pnpm workspaces) provides shared tooling configuration, dependency management, and task orchestration across multiple applications and libraries. Monorepo tooling enables:

- shared ESLint, TypeScript, and Vite configurations across applications;
- dependency graph visibility and build caching;
- parallel and incremental task execution;
- unified versioning for shared libraries;
- code generation for consistent module creation.

Monorepos are orthogonal to micro-frontends: a monorepo can host multiple micro-frontend applications or a single modular application. The choice depends on team boundaries and deployment requirements.

## Common Architecture Smells

- `shared` becomes a dumping ground.
- Every component imports from every other feature.
- API calls are copied into many components.
- UI components know business-specific domain types.
- Business components know low-level HTTP details.
- Everything is placed in global state.
- Route params are used without validation.
- Loading, empty, error, permission-denied, and offline states are missing.
- Components are reusable in name but feature-specific in behavior.
- Design-system variants grow without rules.
- Feature flags are never removed.

## Architecture Health

A healthy frontend architecture makes it possible for a new developer to find the code for one feature quickly, change one feature without touching unrelated features, and rely on shared components that are truly generic. Server state is handled separately from client state. Route params and environment variables are validated. Large routes are lazy-loaded. Errors are contained by boundaries. Components expose accessible states. Tests are written at the same boundaries as the architecture. Obsolete feature flags can be found and removed.
