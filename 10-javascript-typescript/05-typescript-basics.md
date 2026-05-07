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

### TypeScript's Compilation Model

TypeScript operates as a compile-time type checker, not a runtime type system. The TypeScript compiler (`tsc`) performs three tasks:

1. **Type checking**: Analyzes the code for type errors based on annotations and inference.
2. **Transpilation**: Strips all TypeScript-specific syntax (type annotations, interfaces, type aliases, generics) and emits JavaScript.
3. **Declaration generation** (optional): Produces `.d.ts` files that describe the public API types for library consumers.

The type checking and transpilation steps are conceptually independent. A file can have type errors and still produce JavaScript output (unless `noEmitOnError` is enabled). This design allows incremental adoption: you can rename `.js` files to `.ts`, add types gradually, and still ship working code at each step.

Because types are erased during transpilation, TypeScript provides zero runtime overhead for type safety. This also means TypeScript cannot intercept or validate runtime data -- a theme explored in the runtime validation section of the tooling chapter.

### Structural Typing vs Nominal Typing

TypeScript uses structural typing (also called duck typing): two types are considered compatible if they have the same shape, regardless of their declared names:

```ts
interface Point {
  x: number;
  y: number;
}

interface Coordinate {
  x: number;
  y: number;
}

const pt: Point = { x: 10, y: 20 };
const coord: Coordinate = pt; // OK -- same shape
```

This differs from languages like C# or Java, where nominal typing would require an explicit implements relationship. Structural typing is flexible and aligns well with JavaScript's dynamic nature, but it can also allow unintended type matches. Excess property checking (when assigning an object literal directly) provides a guard against obvious mistakes:

```ts
const pt: Point = { x: 10, y: 20, z: 30 }; // Error: excess property
const data = { x: 10, y: 20, z: 30 };
const pt2: Point = data; // OK -- excess properties allowed via intermediate variable
```

### When to Use type vs interface

Both `type` and `interface` can describe object shapes. Key differences:

- `interface` supports declaration merging: multiple declarations with the same name in the same scope are automatically merged.
- `interface` can be extended with `extends`.
- `type` can represent unions (`A | B`), intersections (`A & B`), primitives, tuples, and conditional types.
- `type` supports computed properties via `keyof` and mapped types directly.

```ts
// Declaration merging adds properties
interface User { name: string; }
interface User { age: number; }
// User now has both name and age

// type cannot merge -- this is an error
type Admin = { role: string; };
type Admin = { permissions: string[]; }; // Duplicate identifier error
```

For public API surfaces and library code, `interface` is often preferred because consumers can extend it via declaration merging. For internal types, unions, and complex type transformations, `type` is more flexible. Consistency within a codebase matters more than the specific choice.

### Type Narrowing Mechanisms in Detail

TypeScript narrows types through several runtime-check patterns:

**`typeof` guards**: Work for `string`, `number`, `boolean`, `symbol`, `bigint`, `undefined`, `function`, and `object`. Note that `typeof null === "object"` is a historical JavaScript quack -- use a separate `null` check.

**`in` operator**: Checks if a property exists on an object. Works well with discriminated unions when one branch has a unique property:

```ts
type OrderDraft = { status: "draft"; modifiedAt: Date };
type OrderSubmitted = { status: "submitted"; submittedAt: Date; approvedBy: string };

function getAuditInfo(order: OrderDraft | OrderSubmitted) {
  if ("submittedAt" in order) {
    return order.approvedBy; // narrowed to OrderSubmitted
  }
  return "Not submitted";
}
```

**Equality narrowing**: Comparing values with `===` or `!==` narrows both sides. Useful for removing `null`/`undefined`:

```ts
function formatId(id: string | null): string {
  if (id === null) return "N/A";
  return id.toUpperCase(); // narrowed to string
}
```

**Discriminated unions** (shown in the Advanced Types chapter): Uses a literal property (the "discriminant") to narrow each branch. This is the most scalable narrowing pattern for complex state machines and API responses.
