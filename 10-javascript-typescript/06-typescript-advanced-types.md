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

### Advanced Pattern: Branded Types

TypeScript's structural typing can be too permissive when two types with the same shape represent different conceptual domains. Branded (or nominal) types add a phantom property that distinguishes them:

```ts
type Brand<T, B> = T & { __brand: B };

type OrderId = Brand<number, "OrderId">;
type UserId = Brand<number, "UserId">;

function getOrder(id: OrderId): Order {
  // ...
}

const userId = 42 as UserId;
const orderId = 42 as OrderId;

getOrder(orderId); // OK
getOrder(userId);   // Type error -- UserId is not assignable to OrderId
```

Branded types are a compile-time-only construct. The `__brand` property is never actually assigned at runtime -- it exists only in the type system. This pattern is useful for preventing accidental mixing of different identifier types in large codebases.

### Exhaustiveness Checking with never

The `never` type represents a value that should never occur. When combined with a `switch` statement over a discriminated union, `never` provides compile-time exhaustiveness checking:

```ts
type ApiState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

function renderState<T>(state: ApiState<T>): string {
  switch (state.status) {
    case "loading": return "Loading...";
    case "success": return `Data: ${state.data}`;
    case "error":   return `Error: ${state.message}`;
    default: return assertNever(state);
  }
}
```

If a new status value is added to `ApiState` (e.g., `"idle"`), TypeScript reports a type error at the `assertNever` call because the function now receives a value of type `ApiState<unknown>` instead of `never`. This forces the developer to handle the new case explicitly -- a compile-time guarantee that all branches are covered.

### Generic Constraints and Conditional Types

Generics become most powerful when combined with constraints (using `extends`) and conditional types. A constraint limits which types can be used as the type argument:

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const order: Order = { id: 1, total: 100, status: "Paid" };
getProperty(order, "id");     // OK -- returns number
getProperty(order, "status"); // OK -- returns "Draft" | "Paid" | "Cancelled"
getProperty(order, "xyz");    // Error -- "xyz" is not keyof Order
```

Conditional types use `extends` to select between two types based on a condition:

```ts
type IsString<T> = T extends string ? "yes" : "no";

type A = IsString<"hello">; // "yes"
type B = IsString<number>;  // "no"

// Filter types from a union
type ExtractString<T> = T extends string ? T : never;
type StringsOnly = ExtractString<string | number | boolean | null>; // string
```

The `infer` keyword (shown in the `UnwrapPromise` example) allows conditional types to capture and expose a type from within another type. This is how the built-in `ReturnType<T>` and `Parameters<T>` utility types work internally:

```ts
type MyReturnType<T> = T extends (...args: unknown[]) => infer R ? R : never;

type Fn = (x: number) => string;
type Result = MyReturnType<Fn>; // string
```

Conditional types with `infer` are typically used in library code and advanced utility types rather than day-to-day application code, but understanding them clarifies how TypeScript's type system can perform type-level computation.
