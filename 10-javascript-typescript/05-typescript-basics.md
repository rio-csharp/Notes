# TypeScript Basics

## Core Idea

TypeScript adds static types to JavaScript.

TypeScript helps catch errors before runtime and improves editor support.

## Type Annotation

```ts
let name: string = "Alice";
let age: number = 30;
let isActive: boolean = true;
```

## Type Inference

```ts
const status = "Paid";
```

TypeScript infers type.

Do not annotate everything if inference is clear.

## Object Type

```ts
type User = {
  id: number;
  email: string;
  displayName?: string;
};
```

`?` means optional.

Optional is not the same as `null`:

```ts
type UserProfile = {
  displayName?: string;
  avatarUrl: string | null;
};
```

Meaning:

```text
displayName may be missing.
avatarUrl is always present, but may be null.
```

## Interface

```ts
interface Order {
  id: number;
  total: number;
}
```

Extending interfaces:

```ts
interface Auditable {
  createdAt: string;
  updatedAt: string;
}

interface Order extends Auditable {
  id: number;
  total: number;
}
```

## Union Type

```ts
type OrderStatus = "Draft" | "Submitted" | "Approved" | "Cancelled";
```

Use union types for constrained API values:

```ts
function canCancel(status: OrderStatus): boolean {
  return status === "Draft" || status === "Submitted";
}
```

## Function Type

```ts
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}
```

## Generic

```ts
type ApiResponse<T> = {
  data: T;
  traceId: string;
};
```

Paged result:

```ts
type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type OrderListResponse = PagedResult<Order>;
```

## Type Narrowing

```ts
function printId(id: string | number) {
  if (typeof id === "string") {
    console.log(id.toUpperCase());
  } else {
    console.log(id.toFixed(0));
  }
}
```

Narrowing with `in`:

```ts
type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: string };
type ApiResult<T> = ApiSuccess<T> | ApiFailure;

function renderResult(result: ApiResult<Order>) {
  if (result.ok) {
    return result.data.total;
  }

  return result.error;
}
```

## Type Assertions

Type assertion tells TypeScript to trust you:

```ts
const user = value as User;
```

Use it carefully. It does not validate runtime data.

Safer:

```ts
function isUser(value: unknown): value is User {
  return typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "email" in value;
}

if (isUser(value)) {
  console.log(value.email);
}
```

## Complete API Types Example

```ts
type Order = {
  id: number;
  status: "Draft" | "Submitted" | "Paid" | "Cancelled";
  total: number;
  createdAt: string;
};

type CreateOrderRequest = {
  customerId: number;
  items: Array<{
    productId: number;
    quantity: number;
  }>;
};

type CreateOrderResponse = {
  id: number;
  status: Order["status"];
};

async function createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Create order failed: ${response.status}`);
  }

  return (await response.json()) as CreateOrderResponse;
}
```

The type describes what the code expects. Runtime validation is still needed when the data is untrusted or critical.

### Why use TypeScript?

> TypeScript catches many errors at compile time, improves refactoring, documents API shapes, and gives better editor support for large JavaScript applications.

### type vs interface?

> Both can describe object shapes. `interface` supports declaration merging and extension. `type` is more flexible for unions, intersections, tuples, and conditional types.

### What is type narrowing?

> Type narrowing is when TypeScript reduces a broad type to a more specific type based on runtime checks.

## Practice Task

Create types for:

1. user;
2. order;
3. paged result;
4. API error;
5. form state union;
6. generic API response.
