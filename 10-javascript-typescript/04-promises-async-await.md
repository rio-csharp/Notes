# JavaScript Promises And Async/Await

## Core Idea

Promises represent asynchronous operations. `async/await` provides readable syntax over promises.

## Promise Example

```ts
function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
```

## async/await

```ts
async function loadUser(id: string) {
  const response = await fetch(`/api/users/${id}`);

  if (!response.ok) {
    throw new Error("Failed to load user");
  }

  return response.json();
}
```

`async` functions always return a Promise.

Even returning a plain value becomes a resolved Promise:

```ts
async function getNumber() {
  return 42;
}

const value = await getNumber(); // 42
```

Sequential vs parallel:

```ts
const user = await fetchUser(userId);
const orders = await fetchOrders(userId);
```

This waits for `fetchUser` before starting `fetchOrders`.

If they are independent:

```ts
const [user, orders] = await Promise.all([
  fetchUser(userId),
  fetchOrders(userId)
]);
```

## Error Handling

```ts
try {
  const user = await loadUser("1");
} catch (error) {
  console.error(error);
}
```

Typed error helper:

```ts
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}
```

Use `unknown` for caught errors in TypeScript instead of assuming the value is an `Error`.

## Promise.all

Runs independent async operations concurrently.

```ts
const [user, orders] = await Promise.all([
  fetchUser(userId),
  fetchOrders(userId)
]);
```

If one fails, `Promise.all` rejects.

## Promise.allSettled

Waits for all, regardless of success/failure.

```ts
const results = await Promise.allSettled([
  fetchUser(userId),
  fetchRecommendations(userId)
]);
```

## AbortController

Cancel fetch:

```ts
const controller = new AbortController();

const request = fetch("/api/orders", {
  signal: controller.signal
});

controller.abort();
```

Complete fetch wrapper:

```ts
export async function getJson<T>(
  url: string,
  options: { signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
```

Usage:

```ts
type Order = {
  id: number;
  status: string;
  total: number;
};

const controller = new AbortController();

try {
  const order = await getJson<Order>("/api/orders/1001", {
    signal: controller.signal
  });
  console.log(order.status);
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.log("Request was cancelled");
  } else {
    console.error(getErrorMessage(error));
  }
}
```

Timeout helper:

```ts
export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promiseFactory(controller.signal);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
```

Usage:

```ts
const order = await withTimeout(
  signal => getJson<Order>("/api/orders/1001", { signal }),
  5000
);
```

## Promise.race

`Promise.race` settles when the first promise settles.

```ts
const result = await Promise.race([
  fetch("/api/orders"),
  delay(5000).then(() => {
    throw new Error("Timeout");
  })
]);
```

For fetch cancellation, prefer `AbortController` so the request is actually cancelled.

### Promise States and Settling Behavior

A Promise can exist in one of three states:

1. **Pending**: Initial state, neither fulfilled nor rejected.
2. **Fulfilled**: The promise resolved successfully with a value.
3. **Rejected**: The promise failed with a reason (typically an Error).

Once a promise settles (fulfills or rejects), its state is immutable. Calling `resolve()` or `reject()` a second time has no effect. This makes promises safe for caching and one-shot operations:

```ts
const cachedFetch = new Map<string, Promise<Order>>();

function getOrder(id: number): Promise<Order> {
  const key = String(id);
  if (!cachedFetch.has(key)) {
    cachedFetch.set(key, fetchOrder(id));
  }
  return cachedFetch.get(key)!;
}
```

The first caller triggers the fetch; subsequent callers receive the same promise (and therefore the same result or error) without re-executing the operation.

### Promise Chaining Patterns

Promise chains provide sequential composition without nesting. Each `.then()` returns a new promise, allowing the chain to continue:

```ts
fetchOrder(id)
  .then(order => validateOrder(order))
  .then(validated => submitOrder(validated))
  .then(result => notifyUser(result))
  .catch(error => handleError(error))
  .finally(() => hideSpinner());
```

Error propagation flows through the chain: if any step throws or returns a rejected promise, subsequent `.then()` handlers are skipped until a `.catch()` is reached. This mirrors the `try/catch` behavior of synchronous code.

When chaining with `.then()`, the callback can return:
- A plain value (wrapped in a resolved promise).
- A promise (the next `.then()` waits for its settlement).
- A thrown value (converted to a rejected promise).

For parallel operations with shared error handling, `Promise.all` rejects at the first failure. If you need individual error handling for each parallel operation, attach independent `.catch()` handlers before `Promise.all`:

```ts
const results = await Promise.all([
  fetchUser(id).catch(err => ({ error: err })),
  fetchOrders(id).catch(err => ({ error: err }))
]);
```

### async/await vs Promise Chains

`async/await` and `.then()` chains are semantically equivalent -- both operate on promises. The choice is primarily about readability and control flow:

**Use `async/await` when:**
- The logic is sequential with natural dependencies between steps.
- You need `try/catch` error handling that mirrors synchronous code.
- The code involves conditionals or loops over async results.

**Use `.then()` when:**
- Building a functional pipeline of transformations.
- Working in a context where `async` is not available (older callbacks, some event handlers).
- Handling each step with independent error recovery.

The `withTimeout` and `getJson` examples earlier in this chapter demonstrate `async/await` with error handling. The pattern of composing async utilities with promises (like `Promise.all`, `Promise.race`, and `Promise.allSettled`) works identically with both syntaxes because both consume and return promises.

### Promise Combinators Compared

| Method | Behavior | Use case |
|--------|----------|----------|
| `Promise.all` | Rejects on first rejection; returns array of results | Parallel requests where any failure means overall failure |
| `Promise.allSettled` | Waits for all; returns `{status, value/reason}` objects | Parallel requests with individual error handling |
| `Promise.race` | Settles on first settlement (resolve or reject) | Timeout patterns (though AbortController is preferred for fetch) |
| `Promise.any` | Settles on first fulfillment; rejects only if all reject | Redundant requests (race multiple sources) |

`Promise.allSettled` is particularly useful for batch operations where partial failure is acceptable, such as sending notifications to multiple users where some deliveries may fail independently.
