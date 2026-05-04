# JavaScript Promises And Async/Await

## Core Idea

Promises represent asynchronous operations. `async/await` provides readable syntax over promises.

Chinese notes:

- `Promise`: 承诺，异步结果.
- `resolve`: 成功完成.
- `reject`: 失败.

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

## Review Questions

### What is a Promise?

> A Promise represents a future asynchronous result that can be fulfilled or rejected.

### async/await vs then?

> They both work with promises. `async/await` makes asynchronous code look more like synchronous control flow and is often easier to read.

### Promise.all vs allSettled?

> `Promise.all` rejects when any promise rejects. `Promise.allSettled` waits for all promises and returns each result status.

## Common Mistakes

- Forgetting to handle rejected promises.
- Awaiting independent requests sequentially.
- No cancellation for obsolete requests.
- Not checking `response.ok` after fetch.
- Swallowing errors silently.

## Practice Task

Build:

1. typed fetch wrapper;
2. parallel loading with `Promise.all`;
3. partial loading with `Promise.allSettled`;
4. cancellation with `AbortController`;
5. error UI for failed request.
