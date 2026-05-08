# TanStack Query / React Query

## Core Idea

TanStack Query, often still called React Query, manages server state in React applications.

Server state is different from client state.

Server state:

- lives on the server;
- is fetched asynchronously;
- can become stale;
- may be shared across screens;
- needs caching, refetching, retries, and synchronization.

Client state:

- modal open/close;
- selected tab;
- local form input;
- sidebar collapsed.

## Server State vs. Client State

Redux can store server data, but it was designed as a general-purpose client state container. Server state has different requirements that Redux does not automatically address:

- caching and cache invalidation;
- stale-data detection and background refetch;
- request deduplication when the same data is requested by multiple components;
- automatic retries after transient failures;
- pagination and cursor-based infinite loading;
- mutation-driven cache updates.

React Query is purpose-built for these server-state concerns. Using Redux to manually replicate this behavior often results in substantial boilerplate and subtle bugs around cache consistency.

## Basic Setup

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

## Basic Query

```tsx
type Order = {
  id: number;
  total: number;
  status: string;
};

async function fetchOrders(): Promise<Order[]> {
  const response = await fetch("/api/orders");

  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  return response.json();
}

function OrdersPage() {
  const ordersQuery = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders
  });

  if (ordersQuery.isLoading) {
    return <div>Loading...</div>;
  }

  if (ordersQuery.isError) {
    return <div>Failed to load orders.</div>;
  }

  if (ordersQuery.data.length === 0) {
    return <div>No orders found.</div>;
  }

  return <OrderTable orders={ordersQuery.data} />;
}
```

## isLoading vs isFetching

React Query exposes two distinct loading flags. `isLoading` is true only when the query has no data yet and is currently fetching for the first time. `isFetching` is true whenever a fetch is in progress, including background refetches after data is already available:

```tsx
function OrdersPage() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders
  });

  // isLoading: true only on first load, no data yet
  if (query.isLoading) {
    return <div>Loading...</div>;
  }

  // isFetching: true during ANY fetch, including background refetches
  // Useful for showing subtle "refreshing" indicator without blocking the UI
  return (
    <>
      {query.isFetching && <div className="toast">Refreshing...</div>}
      <OrderTable orders={query.data} />
    </>
  );
}
```

Using `isLoading` for the initial loading state and `isFetching` for background activity gives a smooth UX: new data appears without a full-screen spinner, while a subtle indicator shows that fresh data is being loaded.

## placeholderData

`placeholderData` shows data while the query is loading, without treating it as cached. The most common use is keeping the previous page's data visible during pagination:

```tsx
function OrdersPage() {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["orders", page],
    queryFn: () => fetchOrders({ page }),
    placeholderData: keepPreviousData
  });

  return (
    <>
      {query.data && <OrderTable orders={query.data.items} />}
      <Pagination page={page} onChange={setPage} />
    </>
  );
}
```

With `keepPreviousData`, the table does not flash a loading spinner when the page changes -- the previous data remains visible until the new page loads. In TanStack Query v5, `keepPreviousData` is deprecated in favor of a function form:

```tsx
placeholderData: (previousData) => previousData
```

## Query Keys

```tsx
useQuery({
  queryKey: ["orders", { page, status, search }],
  queryFn: () => fetchOrders({ page, status, search })
});
```

Rules:

- include all parameters that affect the result;
- use stable, serializable values;
- avoid vague keys like `["data"]`.

Query key factory:

```tsx
export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (filters: OrderListFilters) => [...orderKeys.lists(), filters] as const,
  detail: (id: number) => [...orderKeys.all, "detail", id] as const
};
```

Usage:

```tsx
useQuery({
  queryKey: orderKeys.list({ page, status, search }),
  queryFn: ({ signal }) => fetchOrders({ page, status, search, signal })
});
```

This avoids query key typos and keeps invalidation more precise.

## Query Cancellation

TanStack Query passes an `AbortSignal` to the query function.

```tsx
type OrderListFilters = {
  page: number;
  status?: string;
  search?: string;
};

async function fetchOrders(
  filters: OrderListFilters & { signal?: AbortSignal }
): Promise<PagedResult<Order>> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.search) {
    params.set("search", filters.search);
  }

  const response = await fetch(`/api/orders?${params}`, {
    signal: filters.signal
  });

  if (!response.ok) {
    throw new ApiError("Failed to fetch orders", response.status);
  }

  return (await response.json()) as PagedResult<Order>;
}
```

If filters change quickly, obsolete requests can be cancelled instead of racing with newer requests.

## staleTime vs gcTime

`staleTime` controls how long data is considered fresh after fetching. While data is fresh, React Query does not trigger automatic refetches on remount, window refocus, or polling intervals.

`gcTime` (formerly `cacheTime`) controls how long inactive cache data is kept in memory after the last observer unsubscribes. After the gcTime elapses, the cache entry is garbage collected.

Example:

```tsx
useQuery({
  queryKey: ["categories"],
  queryFn: fetchCategories,
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000
});
```

## Mutations

```tsx
function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}
```

Usage:

```tsx
function CreateOrderButton() {
  const createOrderMutation = useCreateOrder();

  return (
    <button
      disabled={createOrderMutation.isPending}
      onClick={() => createOrderMutation.mutate({ customerId: 1 })}
    >
      Create
    </button>
  );
}
```

### mutate vs mutateAsync

`useMutation` exposes both `mutate()` and `mutateAsync()`. `mutate()` is fire-and-forget -- it returns `void` and is safe to use directly in event handlers. `mutateAsync()` returns a Promise that resolves on success or throws on error, useful when the mutation result is needed for further composition:

```tsx
// mutate: fire-and-forget, safe in event handlers
<button onClick={() => deleteMutation.mutate(orderId)}>Delete</button>

// mutateAsync: await the result for chaining
async function handleDelete(orderId: string) {
  try {
    await deleteMutation.mutateAsync(orderId);
    showNotification("Order deleted");
  } catch (error) {
    showNotification("Failed to delete order");
  }
}
```

### Mutation Scopes

By default, TanStack Query v5 runs all mutations in parallel. Mutation scopes serialize execution when order matters:

```tsx
useMutation({
  mutationFn: updateOrder,
  scope: { id: "orders" },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  }
});
```

With `scope: { id: "orders" }`, subsequent mutations wait for the current one to complete. While queued, the mutation enters `isPaused: true` and resumes automatically when its turn arrives.

## Optimistic Update

Optimistic update updates UI before server confirms.

```tsx
const mutation = useMutation({
  mutationFn: updateOrderStatus,
  onMutate: async ({ orderId, status }) => {
    await queryClient.cancelQueries({ queryKey: ["orders"] });

    const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

    queryClient.setQueryData<Order[]>(["orders"], old =>
      old?.map(order =>
        order.id === orderId ? { ...order, status } : order
      ) ?? []
    );

    return { previousOrders };
  },
  onError: (_error, _variables, context) => {
    queryClient.setQueryData(["orders"], context?.previousOrders);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  }
});
```

Use optimistic updates when:

- operation usually succeeds;
- rollback is easy;
- fast UI feedback matters.

Avoid when:

- operation has complex validation;
- rollback is difficult;
- money/security/critical state is involved.

## Pagination

```tsx
function OrdersPage() {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["orders", page],
    queryFn: () => fetchOrders({ page }),
    placeholderData: previousData => previousData
  });

  return (
    <>
      {query.isFetching && <div>Refreshing...</div>}
      {query.data && <OrderTable orders={query.data.items} />}
      <Pagination page={page} onChange={setPage} />
    </>
  );
}
```

## Infinite Query

```tsx
const query = useInfiniteQuery({
  queryKey: ["orders", "infinite"],
  queryFn: ({ pageParam }) => fetchOrdersByCursor(pageParam),
  initialPageParam: null as string | null,
  getNextPageParam: lastPage => lastPage.nextCursor
});
```

Use for:

- infinite scroll;
- feed;
- chat history;
- cursor pagination.

## Error Handling

Create a typed API error:

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public traceId?: string
  ) {
    super(message);
  }
}
```

Use it in query UI:

```tsx
if (query.error instanceof ApiError && query.error.status === 401) {
  return <LoginExpired />;
}
```

## Cache Mechanics

React Query stores query results in an in-memory cache indexed by serialized query keys. Each cache entry tracks the data, the time it was fetched, the `staleTime` duration, and the `gcTime` (formerly `cacheTime`) duration. A query is "fresh" until its `staleTime` elapses; fresh queries do not refetch automatically when remounted. After data becomes stale, React Query may refetch in the background when a component remounts, the window regains focus, or a refetch interval ticks. Once a query has no active observers (no component is using it), its data remains in the cache for the `gcTime` duration before being garbage collected. This prevents unnecessary network requests when the user navigates away and back within the gcTime window.

Query keys are the primary cache identifier. The key array is serialized to a stable hash; two queries with the same key share one cache entry. This is why all parameters that affect the result must be part of the key — omitting a filter from the key means two queries with different filters would incorrectly share cached data.

React Query is specialized for server state. Redux is a general client state container. Many production applications use React Query for API data and a smaller client-side store for UI-only state such as modals, sidebar visibility, and form drafts.

Cache invalidation is the process of marking cached data as stale or removing it after a mutation so that components refetch the latest data from the server. The standard pattern is to call `queryClient.invalidateQueries({ queryKey: [...] })` after a successful mutation, which marks matching cache entries as stale and triggers a refetch if any component is currently observing them.

## Suspense Mode

TanStack Query v5 supports Suspense integration, eliminating manual loading state checks:

```tsx
function OrdersPage() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    suspense: true
  });

  return <OrderTable orders={query.data.items} />;
}
```

With `suspense: true`, the component suspends while loading -- the nearest `<Suspense>` boundary handles the loading state. Error boundaries handle error states. This reduces boilerplate and works well with React 19's streaming SSR and concurrent features.

The `useSuspenseQuery` hook provides an explicit alternative:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";

function OrdersPage() {
  const query = useSuspenseQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders
  });

  // query.data is always defined -- no loading or error branches needed
  return <OrderTable orders={query.data.items} />;
}
```

`useSuspenseQuery` guarantees that `data` is available when the component renders, removing the need for null checks. It also allows `placeholderData` to be used alongside Suspense for transitions between different query results.
