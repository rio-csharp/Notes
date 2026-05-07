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

## Query Keys

Query keys identify cached data.

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

## How The Cache Works

React Query stores query results in an in-memory cache indexed by serialized query keys. Each cache entry tracks the data, the time it was fetched, the `staleTime` duration, and the `gcTime` (formerly `cacheTime`) duration. A query is "fresh" until its `staleTime` elapses; fresh queries do not refetch automatically when remounted. After data becomes stale, React Query may refetch in the background when a component remounts, the window regains focus, or a refetch interval ticks. Once a query has no active observers (no component is using it), its data remains in the cache for the `gcTime` duration before being garbage collected. This prevents unnecessary network requests when the user navigates away and back within the gcTime window.

Query keys are the primary cache identifier. The key array is serialized to a stable hash; two queries with the same key share one cache entry. This is why all parameters that affect the result must be part of the key — omitting a filter from the key means two queries with different filters would incorrectly share cached data.

React Query is specialized for server state. Redux is a general client state container. Many production applications use React Query for API data and a smaller client-side store for UI-only state such as modals, sidebar visibility, and form drafts.

Cache invalidation is the process of marking cached data as stale or removing it after a mutation so that components refetch the latest data from the server. The standard pattern is to call `queryClient.invalidateQueries({ queryKey: [...] })` after a successful mutation, which marks matching cache entries as stale and triggers a refetch if any component is currently observing them.
