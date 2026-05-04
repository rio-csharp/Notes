# React State Management

## Core Idea

State management is about deciding where data should live and how it should change.

Chinese notes:

- `local state`: 局部状态.
- `global state`: 全局状态.
- `server state`: 服务端状态.
- `URL state`: URL 状态.

## Types Of State

### Local UI State

Examples:

- modal open;
- input value;
- selected row;
- dropdown state.

Use:

```tsx
useState
```

### Server State

Examples:

- orders from API;
- user profile;
- product list.

Use:

```tsx
TanStack Query
```

### URL State

Examples:

- page number;
- filters;
- search keyword;
- selected tab.

Use:

```tsx
useSearchParams
```

### Global Client State

Examples:

- theme;
- current user;
- app-wide preferences;
- complex workflow state.

Use:

- Context;
- Redux Toolkit;
- Zustand;
- Jotai.

## Context

Good for low-frequency shared values.

```tsx
const ThemeContext = createContext<Theme>("light");
```

Be careful:

Context value changes re-render all consumers.

Complete current user context:

```tsx
type CurrentUser = {
  id: number;
  email: string;
  permissions: string[];
};

type AuthContextValue = {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
```

Provider:

```tsx
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      setUser,
      hasPermission(permission) {
        return user?.permissions.includes(permission) ?? false;
      }
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

Hook:

```tsx
function useAuth() {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
```

The `useMemo` avoids recreating the context value unless `user` changes.

## Redux Toolkit

Good for:

- complex state transitions;
- strict patterns;
- large teams;
- debugging with devtools.

Slice example:

```tsx
type CartState = {
  items: Array<{ productId: number; quantity: number }>;
};

const initialState: CartState = {
  items: []
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    itemAdded(state, action: PayloadAction<{ productId: number }>) {
      const existing = state.items.find(
        item => item.productId === action.payload.productId
      );

      if (existing) {
        existing.quantity++;
      } else {
        state.items.push({ productId: action.payload.productId, quantity: 1 });
      }
    },
    cleared(state) {
      state.items = [];
    }
  }
});
```

Redux Toolkit uses Immer, so this apparent mutation creates immutable updates safely.

## Zustand

Good for:

- lightweight global state;
- simpler API;
- less boilerplate.

Example:

```tsx
type UiStore = {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
};

const useUiStore = create<UiStore>(set => ({
  isSidebarOpen: false,
  toggleSidebar: () =>
    set(state => ({ isSidebarOpen: !state.isSidebarOpen }))
}));
```

Usage:

```tsx
function SidebarToggle() {
  const isOpen = useUiStore(state => state.isSidebarOpen);
  const toggle = useUiStore(state => state.toggleSidebar);

  return (
    <button type="button" onClick={toggle}>
      {isOpen ? "Close" : "Open"} sidebar
    </button>
  );
}
```

## React Query

Good for:

- API data;
- cache;
- refetch;
- mutation;
- pagination;
- retries.

## Decision Guide

```text
Can it stay inside one component?
  -> useState

Should it be shareable/bookmarkable?
  -> URL state

Does it come from server?
  -> React Query

Is it app-wide client state?
  -> Context / Zustand / Redux
```

## URL State Example

Filters should often live in URL state:

```tsx
function useOrderListState() {
  const [params, setParams] = useSearchParams();

  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1");

  function setStatus(status: string) {
    const next = new URLSearchParams(params);

    status ? next.set("status", status) : next.delete("status");
    next.set("page", "1");

    setParams(next);
  }

  return { status, page, setStatus };
}
```

## Server State Example

```tsx
function OrdersPage() {
  const { status, page, setStatus } = useOrderListState();

  const query = useQuery({
    queryKey: ["orders", { status, page }],
    queryFn: () => fetchOrders({ status, page })
  });

  if (query.isLoading) {
    return <p>Loading...</p>;
  }

  if (query.isError) {
    return <p role="alert">Could not load orders.</p>;
  }

  return (
    <>
      <OrderFilters status={status} onStatusChange={setStatus} />
      <OrderTable orders={query.data.items} />
    </>
  );
}
```

This separates:

- URL state for filters;
- server state in React Query;
- local UI state inside small components;
- global user/permission state in context or a store.

## Review Questions

### Context vs Redux?

> Context shares values through component tree but is not a full state management solution. Redux provides structured state updates, middleware, devtools, and predictable patterns for complex global state.

### Why not put all API data in Redux?

> API data is server state. It needs caching, refetching, stale handling, retries, and invalidation. React Query handles these concerns better.

### What state belongs in URL?

> State that should be shareable or restorable, such as filters, pagination, search, and selected tabs.

## Common Mistakes

- Global state for everything.
- Server state in Redux without cache strategy.
- Context provider value recreated every render.
- Filters not stored in URL.
- Duplicated state in multiple places.

## Practice Task

Build order list using:

1. local state for modal;
2. URL state for filters;
3. React Query for orders;
4. global state for current user;
5. permission-based action visibility.
