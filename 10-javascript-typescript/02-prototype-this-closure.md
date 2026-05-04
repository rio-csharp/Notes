# Prototype, this, And Closure

## Core Idea

Prototype, `this`, and closure are core JavaScript concepts that often appear in engineering practice.

Chinese notes:

- `prototype`: 原型.
- `closure`: 闭包.
- `this`: 当前调用上下文.

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

Equivalent mental model:

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

Fix with `bind`:

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

Fix:

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

## Review Questions

### What is closure?

> A closure is when a function retains access to variables from its lexical scope even after the outer function has returned.

### How does `this` work?

> `this` is determined by call site for normal functions. Arrow functions capture `this` from the surrounding lexical scope.

### What is prototype chain?

> When accessing a property, JavaScript checks the object first, then follows its prototype chain until it finds the property or reaches null.

## Common Mistakes

- Assuming `this` means where function is defined.
- Losing `this` when passing methods as callbacks.
- Stale closures in React effects.
- Modifying prototypes in application code unnecessarily.
