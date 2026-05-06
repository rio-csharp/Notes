# JavaScript Core

## Core Idea

JavaScript is the language runtime of the browser and the foundation of React and TypeScript.

## Primitive Types

```ts
string
number
boolean
bigint
symbol
undefined
null
```

Everything else is object-like.

Primitive values are copied by value:

```ts
let a = 1;
let b = a;

b = 2;

console.log(a); // 1
```

Objects are copied by reference:

```ts
const first = { count: 1 };
const second = first;

second.count = 2;

console.log(first.count); // 2
```

## var, let, const

`var`:

- function-scoped;
- hoisted;
- avoid in modern code.

`let`:

- block-scoped;
- can be reassigned.

`const`:

- block-scoped;
- cannot be reassigned.

```ts
const user = { name: "Alice" };
user.name = "Bob"; // allowed
```

`const` prevents reassignment, not object mutation.

## Hoisting

```ts
console.log(value); // undefined
var value = 1;
```

With `let` and `const`, accessing before declaration causes error due to temporal dead zone.

## Equality

Prefer strict equality:

```ts
if (value === 1) {
}
```

Avoid loose equality unless you intentionally need coercion.

Examples:

```ts
console.log(0 == false); // true
console.log(0 === false); // false
console.log("" == false); // true
console.log("" === false); // false
```

Object equality checks references:

```ts
console.log({ id: 1 } === { id: 1 }); // false

const user = { id: 1 };
console.log(user === user); // true
```

## Objects And Arrays

```ts
const user = {
  id: 1,
  name: "Alice"
};

const users = [user];
```

Objects and arrays are reference values.

```ts
const a = { count: 1 };
const b = a;
b.count = 2;

console.log(a.count); // 2
```

## Destructuring

```ts
const { id, name } = user;
const [first, second] = items;
```

## Spread

```ts
const updated = {
  ...user,
  name: "Bob"
};
```

Useful for immutable updates in React.

Array update:

```ts
const orders = [
  { id: 1, status: "Draft" },
  { id: 2, status: "Paid" }
];

const updatedOrders = orders.map(order =>
  order.id === 1 ? { ...order, status: "Submitted" } : order
);
```

Important:

> Spread is shallow. Nested objects are still shared unless copied too.

```ts
const state = {
  user: {
    profile: {
      name: "Alice"
    }
  }
};

const next = { ...state };
next.user.profile.name = "Bob";

console.log(state.user.profile.name); // Bob
```

Deep update requires copying each level you change:

```ts
const safeNext = {
  ...state,
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      name: "Cara"
    }
  }
};
```

## Optional Chaining And Nullish Coalescing

Optional chaining:

```ts
const city = user.address?.city;
```

Nullish coalescing:

```ts
const pageSize = request.pageSize ?? 20;
```

`??` only falls back for `null` or `undefined`.

```ts
console.log(0 || 20); // 20
console.log(0 ?? 20); // 0
```

Use `??` when `0`, `false`, or `""` are valid values.

## Modules

```ts
export function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}
```

```ts
import { formatCurrency } from "./formatCurrency";
```

Default export:

```ts
export default function formatDate(value: Date) {
  return value.toISOString();
}
```

```ts
import formatDate from "./formatDate";
```

Named exports are often easier to refactor because import names stay explicit.

### let vs const vs var?

> `var` is function-scoped and hoisted. `let` and `const` are block-scoped. `const` prevents reassignment but does not make objects deeply immutable.

### Primitive vs object?

> Primitive values are copied by value. Objects are reference values, so assigning an object variable copies the reference.

### Why use strict equality?

> Strict equality avoids implicit type coercion and makes comparisons more predictable.
