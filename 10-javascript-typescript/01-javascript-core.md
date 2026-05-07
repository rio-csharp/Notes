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

Spread is shallow. Nested objects are still shared unless copied too.

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

### Variable Declaration Rules

`var` declares a function-scoped variable that is hoisted to the top of its enclosing function and initialized to `undefined`. This means the variable is accessible (as `undefined`) before its declaration line. `var` also ignores block scope -- a `var` inside an `if` block is accessible outside it:

```ts
if (true) {
  var x = 10;
}
console.log(x); // 10
```

`let` and `const` are block-scoped. They are hoisted to the top of their block but are not initialized -- accessing them before the declaration causes a `ReferenceError` due to the temporal dead zone (TDZ):

```ts
console.log(y); // ReferenceError
let y = 5;
```

`const` prevents reassignment of the binding, not mutation of the value. For primitive values, this makes the value constant. For objects and arrays, the reference is constant but the contents can change:

```ts
const arr = [1, 2, 3];
arr.push(4); // allowed
arr = [5, 6]; // TypeError: Assignment to constant variable
```

In modern code, prefer `const` by default for values that should not be reassigned, use `let` when reassignment is necessary, and avoid `var` entirely. This convention signals intent and prevents accidental reassignment.

### Pass by Value and Pass by Reference

JavaScript always passes values by value -- but for objects, the "value" is a reference to the object in memory. This distinction explains the copying behavior:

```ts
let a = 1;
let b = a;
b = 2;
console.log(a); // 1 -- independent copies

const objA = { count: 1 };
const objB = objA;
objB.count = 2;
console.log(objA.count); // 2 -- both point to same object

function appendItem(arr: number[], value: number) {
  arr.push(value);
}

const items = [1, 2];
appendItem(items, 3);
console.log(items); // [1, 2, 3] -- array mutated via reference
```

The practical implication is that passing an object to a function gives that function the ability to mutate the original object. To avoid unintended mutation, either create a copy before passing (using spread or structuredClone for deep copies) or use immutable update patterns.

### Strict vs Loose Equality

Strict equality (`===`) compares both value and type without coercion. It is the safe default for all comparisons:

```ts
"42" === 42; // false -- different types
null === undefined; // false
0 === false; // false
```

Loose equality (`==`) applies type coercion before comparing. The coercion rules are complex and non-intuitive:

```ts
"42" == 42; // true -- string coerced to number
0 == false; // true -- number and boolean coerced
"" == false; // true
null == undefined; // true -- special case
[] == false; // true -- empty array coerces to ""
```

Because the coercion rules are difficult to reason about, `==` is nearly always the wrong choice outside of comparing against `null` or `undefined` (where `value == null` checks both simultaneously). TypeScript's compiler with `strict: true` flags many loose-equality usages as errors, reinforcing the `===` convention.
