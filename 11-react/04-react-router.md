# React Router

## Core Idea

React Router manages client-side routing in React applications.

## Basic Routes

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { path: "orders", element: <OrdersPage /> },
      { path: "orders/:id", element: <OrderDetailPage /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
```

Complete route tree:

```tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Navigate to="/orders" replace /> },
      { path: "login", element: <LoginPage /> },
      {
        path: "orders",
        element: <OrdersLayout />,
        children: [
          { index: true, element: <OrdersPage /> },
          { path: ":id", element: <OrderDetailPage /> }
        ]
      },
      {
        path: "admin",
        element: (
          <RequireAuth permission="admin.access">
            <AdminPage />
          </RequireAuth>
        )
      },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
```

## Route Params

```tsx
function OrderDetailPage() {
  const { id } = useParams();
  return <div>Order {id}</div>;
}
```

Validate route params:

```tsx
function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return <Navigate to="/orders" replace />;
  }

  return <OrderDetail orderId={orderId} />;
}
```

## Query Params

```tsx
const [searchParams, setSearchParams] = useSearchParams();

const page = Number(searchParams.get("page") ?? "1");
```

Good for:

- filters;
- pagination;
- search;
- shareable UI state.

Order filters in URL:

```tsx
function useOrderFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const sort = searchParams.get("sort") ?? "-createdAt";

  function updateFilters(next: {
    status?: string;
    page?: number;
    sort?: string;
  }) {
    const updated = new URLSearchParams(searchParams);

    if (next.status !== undefined) {
      next.status ? updated.set("status", next.status) : updated.delete("status");
      updated.set("page", "1");
    }

    if (next.page !== undefined) {
      updated.set("page", String(next.page));
    }

    if (next.sort !== undefined) {
      updated.set("sort", next.sort);
      updated.set("page", "1");
    }

    setSearchParams(updated);
  }

  return { status, page, sort, updateFilters };
}
```

This makes filters bookmarkable and shareable.

## Navigation

```tsx
const navigate = useNavigate();
navigate("/orders");
```

Declarative:

```tsx
<Link to="/orders">Orders</Link>
```

## Layout Routes

```tsx
function AppLayout() {
  return (
    <>
      <Sidebar />
      <main>
        <Outlet />
      </main>
    </>
  );
}
```

## Protected Route

```tsx
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

Frontend route protection is not a security boundary. Backend must enforce authorization.

Permission-aware guard:

```tsx
type RequireAuthProps = {
  children: React.ReactNode;
  permission?: string;
};

function RequireAuth({ children, permission }: RequireAuthProps) {
  const { user, permissions, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p>Checking session...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
```

Login redirect back:

```tsx
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/orders";

  async function handleLogin(credentials: LoginRequest) {
    await login(credentials);
    navigate(from, { replace: true });
  }

  return <LoginForm onSubmit={handleLogin} />;
}
```

## Data Router Loader Example

React Router data APIs can load route data before rendering.

```tsx
async function orderDetailLoader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);

  if (!Number.isInteger(id)) {
    throw new Response("Invalid order id", { status: 400 });
  }

  const response = await fetch(`/api/orders/${id}`);

  if (response.status === 404) {
    throw new Response("Order not found", { status: 404 });
  }

  if (!response.ok) {
    throw new Response("Failed to load order", { status: response.status });
  }

  return (await response.json()) as Order;
}
```

Route:

```tsx
{
  path: "orders/:id",
  loader: orderDetailLoader,
  element: <OrderDetailPage />,
  errorElement: <OrderRouteError />
}
```

Component:

```tsx
function OrderDetailPage() {
  const order = useLoaderData() as Order;
  return <OrderDetail order={order} />;
}
```

## Under The Hood: Client-Side Routing

React Router uses the browser's History API (`pushState`, `replaceState`, and the `popstate` event) to manage URL changes without triggering a full page reload. When a user clicks a `<Link>` or calls `navigate()`, React Router intercepts the navigation, updates the URL via the History API, and renders the matching route component instead of fetching a new page from the server. This is the key difference between client-side routing and traditional server-rendered navigation.

React Router also supports a hash-based router (`HashRouter`) that uses the URL hash fragment for navigation. Hash routing works in environments where the server cannot be configured to serve the same HTML for all routes, but it produces less clean URLs and is generally avoided when the server can be configured properly.

State that should be shareable, bookmarkable, or restorable — such as search filters, page number, sort field, and selected tab — belongs in the URL rather than in local component state. This makes navigation resilient to page refreshes and allows users to share or bookmark specific application states.

A protected route checks authentication or permission before rendering. It improves user experience by hiding inaccessible functionality but does not replace backend authorization, which must always enforce access control independently.

Nested routes allow shared layouts and route-specific content through the `Outlet` component. The parent route renders a layout shell, and the child route's element renders into the `Outlet` position. This avoids duplicating layout code across pages and keeps routing structure aligned with the visual hierarchy.
