# Prototype, this, And Closure

## Core Idea

Prototype, `this`, and closure are core JavaScript concepts that often appear in engineering practice.

## Prototype

JavaScript objects can inherit from other objects through prototype chains.

```ts
const user = { name: "Alice" };
console.log(user.toString); // found through prototype chain
```

Class syntax uses prototypes underneath.

```ts
class User {
  constructor(public name: string) {}

  greet() {
    return `Hello ${this.name}`;
  }
}
```

Under the hood, class syntax desugars to:

```ts
function User(name: string) {
  this.name = name;
}

User.prototype.greet = function () {
  return `Hello ${this.name}`;
};
```

Property lookup:

```ts
const user = new User("Alice");

console.log(user.greet());
console.log(Object.getPrototypeOf(user) === User.prototype); // true
```

When JavaScript reads `user.greet`, it checks:

```text
user object
  -> User.prototype
  -> Object.prototype
  -> null
```

## this

`this` depends on how a function is called.

```ts
const user = {
  name: "Alice",
  greet() {
    console.log(this.name);
  }
};

user.greet(); // Alice
```

Lost `this`:

```ts
const greet = user.greet;
greet(); // this may be undefined
```

Binding preserves the intended receiver:

```ts
const safeGreet = user.greet.bind(user);
safeGreet(); // Alice
```

Callback example:

```ts
button.addEventListener("click", user.greet); // loses intended this
button.addEventListener("click", () => user.greet()); // keeps intended object
```

## Arrow Function this

Arrow functions do not bind their own `this`.

```ts
class Counter {
  count = 0;

  increment = () => {
    this.count++;
  };
}
```

## call, apply, bind

```ts
function greet(this: { name: string }, greeting: string) {
  return `${greeting}, ${this.name}`;
}

greet.call({ name: "Alice" }, "Hello");
greet.apply({ name: "Bob" }, ["Hi"]);

const bound = greet.bind({ name: "Carol" });
bound("Hey");
```

## Closure

A closure is a function that remembers variables from its outer scope.

```ts
function createCounter() {
  let count = 0;

  return function increment() {
    count++;
    return count;
  };
}

const counter = createCounter();
counter(); // 1
counter(); // 2
```

Practical closure: create a private cache.

```ts
function createUserCache() {
  const cache = new Map<string, User>();

  return {
    get(id: string) {
      return cache.get(id);
    },
    set(user: User) {
      cache.set(user.id, user);
    },
    clear() {
      cache.clear();
    }
  };
}
```

`cache` is not globally accessible, but the returned methods can still use it.

Loop closure with `var`:

```ts
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}

// 3, 3, 3
```

With `let`:

```ts
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}

// 0, 1, 2
```

`let` creates a new binding for each loop iteration.

## Closure In React

Stale closure:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1);
  }, 1000);

  return () => clearInterval(id);
}, []);
```

Use the functional updater form instead:

```tsx
setCount(c => c + 1);
```

Another common stale closure:

```tsx
function SearchBox({ query }: { query: string }) {
  useEffect(() => {
    const id = setTimeout(() => {
      console.log("Searching", query);
    }, 300);

    return () => clearTimeout(id);
  }, [query]);
}
```

The dependency array matters because the effect closes over values from the render where it was created.

### Closure Mechanics in Detail

A closure is created when a function is defined inside another function and retains access to the outer function's variables. The inner function maintains a reference to the outer function's lexical environment through the `[[Environment]]` internal slot, which is set at function creation time and never changes.

This is not a snapshot -- the closure references the actual variable bindings, not their values at closure-creation time:

```ts
function createLogger(prefix: string) {
  let counter = 0;

  return function log(message: string) {
    counter++;
    console.log(`[${prefix}:${counter}] ${message}`);
  };
}

const orderLogger = createLogger("Orders");
const userLogger = createLogger("Users");

orderLogger("Order created"); // [Orders:1] Order created
orderLogger("Order paid");    // [Orders:2] Order paid
userLogger("User registered"); // [Users:1] User registered
```

Each call to `createLogger` creates a separate lexical environment with its own `counter` and `prefix`. The returned functions close over these distinct environments. The counter persists between calls because the closure keeps the environment alive -- the environment is not garbage-collected as long as the closure function is reachable.

The `var` loop closure problem shown earlier (with `setTimeout` logging `3, 3, 3`) occurs because `var` creates a single binding for the loop variable shared across all iterations. By the time the callbacks execute, the loop has finished and `i` equals 3. The `let` solution works because `let` creates a new binding per iteration, and each closure captures its own iteration's binding.

### `this` Binding Rules

The value of `this` inside a non-arrow function is determined by the function's call site, not where it is defined. Five rules cover all cases:

1. **Default binding**: In non-strict mode, a standalone function call sets `this` to the global object (`window` in browsers). In strict mode (enabled by TypeScript compilation), `this` is `undefined`.

2. **Implicit binding**: When a function is called as a method of an object (`obj.method()`), `this` refers to that object.

3. **Explicit binding**: `call`, `apply`, and `bind` set `this` explicitly regardless of how the function was defined.

4. **`new` binding**: When a function is called with `new`, `this` refers to the newly created instance.

5. **Arrow functions**: Arrow functions do not have their own `this`. When `this` is referenced inside an arrow function, it resolves lexically -- it uses the `this` value of the enclosing non-arrow function or global scope. Attempting to rebind `this` in an arrow function via `call`, `apply`, or `bind` has no effect.

The common "lost this" issue with React event handlers (shown earlier) is caused by the implicit-to-default binding transition: passing `user.greet` as a callback and calling it later loses the implicit binding. The arrow function wrapper `() => user.greet()` preserves the intended receiver because the arrow captures `this` (or in this case, `user`) from its lexical scope.

### Prototype Chain Walk

JavaScript's prototype chain is the mechanism behind inheritance, property sharing, and method lookup. Every object has an internal `[[Prototype]]` slot (accessible via `Object.getPrototypeOf()` or the deprecated `__proto__` accessor) that points to another object or `null`.

When you access `obj.property`:

1. JavaScript checks if `obj` has an own property named `property` (via `Object.hasOwn(obj, 'property')`).
2. If not, it follows the `[[Prototype]]` link to `Object.getPrototypeOf(obj)` and checks there.
3. This continues up the chain until the property is found or the chain ends at `null`.

```ts
const base = { version: 1 };
const derived = Object.create(base);
derived.name = "child";

console.log(derived.name);    // "child" -- own property
console.log(derived.version); // 1 -- from prototype
console.log(derived.toString); // function -- from Object.prototype
```

The `class` syntax in modern JavaScript is syntactic sugar over this prototype mechanism. When you define a class method, it is added to the class's `prototype` property. Instances created with `new` link to `ClassName.prototype` as their `[[Prototype]]`. This means methods are shared across all instances rather than copied to each instance -- a memory efficiency that predates class syntax by decades.
