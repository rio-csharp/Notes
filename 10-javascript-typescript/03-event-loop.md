# JavaScript Event Loop

## Core Idea

JavaScript runs on a single main thread in the browser, but it handles asynchronous work through the event loop.

## Key Parts

- Call stack;
- Web APIs;
- task queue;
- microtask queue;
- render step.

## Under The Hood: Browser Event Loop

The browser event loop coordinates JavaScript execution, async callbacks, rendering, and user input.

Conceptually:

```text
1. Run one macrotask
2. Drain all microtasks
3. Browser may render
4. Pick the next macrotask
5. Repeat
```

Important:

- synchronous JavaScript runs to completion;
- microtasks run after the current call stack is empty;
- all queued microtasks are drained before the browser moves to the next macrotask;
- rendering usually happens between tasks, not while a long JavaScript function is running.

This is why a long loop freezes the page:

```ts
while (true) {
  // blocks call stack forever
}
```

The browser cannot process clicks, paint updates, or run timers while this is running.

## Call Stack

The call stack tracks currently executing functions.

```ts
function a() {
  b();
}

function b() {
  c();
}

function c() {
  console.log("hello");
}

a();
```

Conceptually:

```text
push a
push b
push c
console.log
pop c
pop b
pop a
```

If the stack is busy, async callbacks cannot run yet.

## Example

```ts
console.log("A");

setTimeout(() => {
  console.log("B");
}, 0);

Promise.resolve().then(() => {
  console.log("C");
});

console.log("D");
```

Output:

```text
A
D
C
B
```

Why:

- synchronous code runs first;
- promise callbacks are microtasks;
- `setTimeout` callback is a macrotask.

## Microtasks

Examples:

- Promise `.then`;
- `queueMicrotask`;
- mutation observer.

Microtasks run before the next macrotask.

Microtask draining example:

```ts
console.log("start");

setTimeout(() => console.log("timeout"), 0);

Promise.resolve().then(() => {
  console.log("promise 1");
  queueMicrotask(() => console.log("microtask inside promise"));
});

Promise.resolve().then(() => console.log("promise 2"));

console.log("end");
```

Output:

```text
start
end
promise 1
promise 2
microtask inside promise
timeout
```

Why:

- synchronous code first;
- promise callbacks are microtasks;
- a microtask can queue another microtask;
- timer runs later as a macrotask.

## Macrotasks

Examples:

- `setTimeout`;
- `setInterval`;
- DOM events;
- network callbacks.

## Rendering

Long JavaScript tasks block rendering and user input.

This can hurt INP and user experience.

## Splitting Heavy Work

Bad:

```ts
function processAll(items: Item[]) {
  for (const item of items) {
    expensiveProcess(item);
  }
}
```

If `items` is large, the page can freeze.

Chunk work with tasks:

```ts
function processInChunks(items: Item[], chunkSize = 100) {
  let index = 0;

  function runChunk() {
    const end = Math.min(index + chunkSize, items.length);

    while (index < end) {
      expensiveProcess(items[index]);
      index++;
    }

    if (index < items.length) {
      setTimeout(runChunk, 0);
    }
  }

  runChunk();
}
```

This gives the browser chances to process input and render between chunks.

For CPU-heavy work that does not need DOM access, consider a Web Worker:

```ts
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module"
});

worker.postMessage({ type: "process-orders", orders });

worker.addEventListener("message", event => {
  console.log("Processed result", event.data);
});
```

Worker code:

```ts
self.addEventListener("message", event => {
  const result = processOrders(event.data.orders);
  self.postMessage(result);
});
```

Web Workers do not have direct DOM access, which is exactly why they can keep heavy computation off the main rendering thread.

## Rendering And requestAnimationFrame

`requestAnimationFrame` schedules work before the browser's next paint.

Use it for visual updates:

```ts
function animate() {
  updatePosition();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
```

High-level frame:

```text
handle task
drain microtasks
run requestAnimationFrame callbacks
layout / paint
next frame
```

The exact browser scheduling details can vary, but the practical review point is stable:

> Long JavaScript blocks rendering. Split heavy work, use Web Workers for CPU-heavy tasks, and avoid expensive work during React render.

## Async/Await And The Event Loop

`await` pauses the async function and schedules the continuation as a microtask when the awaited promise resolves.

Example:

```ts
async function run() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("C");
run();
console.log("D");
```

Output:

```text
C
A
D
B
```

Why:

- `run()` starts synchronously;
- `await` yields;
- `B` runs later in a microtask.

## Browser vs Node.js

Both browsers and Node.js have event loops, but their environments differ.

Browser:

- DOM events;
- rendering;
- Web APIs;
- `requestAnimationFrame`.

Node.js:

- timers;
- I/O callbacks;
- `setImmediate`;
- `process.nextTick`;
- no DOM rendering.

For frontend engineering practice, focus on browser event loop, rendering, microtasks, and macrotasks.

For full-stack engineering practice, it is useful to know that Node's event loop has additional phases, but do not mix Node-specific behavior into browser answers unless asked.

### Is JavaScript single-threaded?

> JavaScript execution on the browser main thread is single-threaded, but the browser provides Web APIs and the event loop to handle async work. Web Workers can run JavaScript on background threads.

### Microtask vs macrotask?

> Microtasks, such as Promise callbacks, run after the current call stack and before the next macrotask. Macrotasks include timers and events.

### Why do promises run before setTimeout?

> Promise callbacks are microtasks. After the current synchronous code finishes, the event loop drains microtasks before taking the next macrotask such as a `setTimeout` callback.

### Why can heavy JavaScript freeze the page?

> Long synchronous work blocks the main thread, preventing rendering and input handling.

## Practice Task

Predict output order for:

1. nested promises;
2. setTimeout;
3. async/await;
4. DOM event callback;
5. queueMicrotask.
