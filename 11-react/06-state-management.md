# React State Management

## Core Idea

State management is about deciding where data should live and how it should change.

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

Context shares values through the component tree without passing props manually at every level. However, context is not a state management solution in itself — it is a dependency injection mechanism. When the context value changes, every consumer in the tree re-renders, even if a consumer only reads a part of the value that did not change. This makes context unsuitable for rapidly changing values consumed by many components. Mitigations include splitting contexts (one for frequently changing data, one for setters) and memoizing context values with `useMemo` so that consumers do not re-render on ancestor re-renders that did not produce a new context value.

Zustand achieves selective re-rendering through a different mechanism. Instead of propagating values through React context, Zustand stores state outside the React tree and uses a subscription model. When a component selects a slice of state (e.g., `useUiStore(state => state.isSidebarOpen)`), it subscribes to changes only for that specific path. When the store updates, only subscribed components re-render, not the entire subtree. This makes Zustand more efficient than context for values that change frequently or are consumed by many independent components.

Redux provides structured state updates through reducers, middleware, and DevTools integration. Redux Toolkit simplifies this with `createSlice` and Immer-based immutable updates. For large teams and complex state transitions, the structure of Redux provides predictable patterns that scale. For simpler global state, Zustand or context may suffice.

API data is server state. It needs caching, refetching, stale handling, retries, and invalidation. React Query handles these concerns better than any client-side store because it is purpose-built for the asynchronous, cache-oriented nature of server data.

State that should be shareable or restorable — such as filters, pagination, search, and selected tabs — belongs in the URL rather than in local or global state. URL state survives page refreshes, is shareable, and integrates naturally with server-side rendering.

## The `use()` Hook for Context

React 19's `use()` hook can read Context values as a more flexible alternative to `useContext`. Unlike hooks, `use()` supports conditional calls:

```tsx
import { use } from "react";

function Sidebar({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext);
    return <div className={theme}>...</div>;
  }
  return <div>...</div>;
}
```

The official documentation recommends `use()` over `useContext` because of this flexibility. Both hooks search upward through the provider tree and subscribe to changes.

## React Compiler and State Optimization

The React Compiler (stable in React 19) automates memoization, reducing the need for manual `useMemo`, `useCallback`, and `React.memo` in compiled code. This changes the optimization landscape for state management: derived values, callback references, and component memoization that previously required explicit hooks are now handled automatically. For new projects starting with the compiler, the primary optimization concern shifts from preventing unnecessary re-renders to choosing the right state location — local, URL, server, or global. The compiler handles the memoization mechanics; the developer handles state ownership and placement.
