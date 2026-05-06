# TypeScript Advanced Types

## Core Idea

TypeScript's advanced types let you model complex JavaScript behavior safely.

## Union Types

```ts
type Status = "idle" | "loading" | "success" | "error";
```

Use unions to limit allowed values.

```ts
function renderStatus(status: Status) {
  switch (status) {
    case "idle":
      return "Idle";
    case "loading":
      return "Loading";
    case "success":
      return "Success";
    case "error":
      return "Error";
  }
}
```

## Discriminated Union

Excellent for API and UI states.

```ts
type QueryState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

function UserPanel({ state }: { state: QueryState<User> }) {
  if (state.status === "loading") {
    return <div>Loading...</div>;
  }

  if (state.status === "error") {
    return <div>{state.error}</div>;
  }

  return <div>{state.data.name}</div>;
}
```

TypeScript knows `data` exists only in success state.

## Generics

```ts
type ApiResponse<T> = {
  data: T;
  traceId: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
```

Usage:

```ts
const user = await getJson<User>("/api/users/1");
```

## keyof

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const name = getProperty(user, "name");
```

This prevents invalid keys.

## Mapped Types

```ts
type ReadonlyEntity<T> = {
  readonly [K in keyof T]: T[K];
};
```

Built-in examples:

- `Partial<T>`
- `Required<T>`
- `Readonly<T>`
- `Pick<T, K>`
- `Omit<T, K>`
- `Record<K, T>`

Example: form errors:

```ts
type FormErrors<T> = {
  [K in keyof T]?: string;
};

type CreateOrderForm = {
  customerId: number;
  quantity: number;
};

const errors: FormErrors<CreateOrderForm> = {
  quantity: "Quantity must be greater than zero"
};
```

Example: API patch model:

```ts
type Patch<T> = {
  [K in keyof T]?: T[K];
};

type UpdateUserProfile = Patch<{
  displayName: string;
  avatarUrl: string | null;
}>;
```

## Conditional Types

```ts
type ApiResult<T> = T extends Error
  ? { ok: false; error: string }
  : { ok: true; data: T };
```

Useful for library-level type transformations.

## infer

```ts
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type UserResult = UnwrapPromise<Promise<User>>; // User
```

## Type-safe API Client

```ts
type Order = {
  id: number;
  total: number;
  status: "Draft" | "Paid" | "Cancelled";
};

type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

async function fetchOrders(params: {
  page: number;
  pageSize: number;
  status?: Order["status"];
}): Promise<PagedResult<Order>> {
  const search = new URLSearchParams();
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));

  if (params.status) {
    search.set("status", params.status);
  }

  const response = await fetch(`/api/orders?${search}`);

  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  return response.json();
}
```

## Generic Table Columns

```ts
type Column<T> = {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => string;
};

type OrderRow = {
  id: number;
  status: "Draft" | "Paid";
  total: number;
};

const columns: Array<Column<OrderRow>> = [
  { key: "id", header: "Order" },
  { key: "status", header: "Status" },
  {
    key: "total",
    header: "Total",
    render: value => `$${Number(value).toFixed(2)}`
  }
];
```

More precise column type:

```ts
type ColumnFor<T, K extends keyof T> = {
  key: K;
  header: string;
  render?: (value: T[K], row: T) => string;
};

const totalColumn: ColumnFor<OrderRow, "total"> = {
  key: "total",
  header: "Total",
  render: value => `$${value.toFixed(2)}`
};
```

## Exhaustiveness Checking

Use `never` to catch missing cases.

```ts
type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; orderId: number }
  | { status: "error"; message: string };

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

function getSubmitLabel(state: SubmitState): string {
  switch (state.status) {
    case "idle":
      return "Submit";
    case "submitting":
      return "Submitting...";
    case "success":
      return `Created order ${state.orderId}`;
    case "error":
      return state.message;
    default:
      return assertNever(state);
  }
}
```

If a new state is added later, TypeScript can force this function to handle it.

## `satisfies` Operator

`satisfies` checks a value against a type without widening the value more than necessary.

```ts
const routes = {
  orders: "/api/orders",
  users: "/api/users"
} satisfies Record<string, `/api/${string}`>;
```

Useful for configuration objects:

```ts
const statusLabels = {
  Draft: "Draft",
  Submitted: "Submitted",
  Paid: "Paid",
  Cancelled: "Cancelled"
} satisfies Record<Order["status"], string>;
```

If a status is missing, TypeScript reports it.

### interface vs type?

> Both can describe object shapes. `interface` can be extended and declaration-merged. `type` can represent unions, intersections, primitives, tuples, and conditional types. In application code, either can be fine; consistency matters.

### What is type narrowing?

> Type narrowing is TypeScript reducing a broader type to a more specific type based on runtime checks, such as `typeof`, `in`, equality checks, or discriminated unions.

### What is a generic?

> A generic is a type parameter that allows reusable type-safe functions or components without losing specific type information.

## Practice Task

Create:

- `ApiResponse<T>`;
- `PagedResult<T>`;
- typed `fetchJson<T>`;
- discriminated union for form submit state;
- generic table column type.
