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

Key scheduling facts:

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

The output is A, D, C, B because synchronous code runs first, promise callbacks are microtasks, and `setTimeout` callback is a macrotask.

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

The output shows synchronous code first, then microtasks drain, and a microtask can queue another microtask that also drains before the macrotask timer runs.

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

The output is C, A, D, B because `run()` starts synchronously, `await` yields, and `B` runs later in a microtask.

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

For full-stack engineering practice, it is useful to know that Node's event loop has additional phases that do not apply in browser environments.

### Why Single-Threaded Execution Matters

JavaScript's single-threaded execution model means the call stack processes one function at a time, and each function runs to completion before the next can begin. This eliminates an entire class of concurrency bugs -- race conditions on shared state, deadlocks, and thread-safety concerns -- at the cost of requiring asynchronous programming for I/O and long computations.

The browser itself is multi-process and multi-threaded: the rendering engine, GPU process, network stack, and storage layer each run on separate threads or processes. But JavaScript execution on a single tab runs on one main thread (per realm). Web Workers provide true parallelism for CPU-heavy work, but they communicate with the main thread only through message passing with structured cloning -- no shared memory by default (SharedArrayBuffer being the opt-in exception).

### Microtask Scheduling Guarantees

Microtasks are not just "faster" than macrotasks -- they have a specific scheduling guarantee: all pending microtasks must be processed before the browser can proceed to the next macrotask or rendering step. This means:

```ts
setTimeout(() => console.log("timeout 1"), 0);

Promise.resolve().then(() => {
  console.log("promise 1");
  Promise.resolve().then(() => {
    console.log("promise 2");
    setTimeout(() => console.log("timeout 2"), 0);
  });
});
// Output: promise 1, promise 2, timeout 1, timeout 2
```

The second promise (`promise 2`) runs before the first `setTimeout` because all microtasks in the queue are drained before any macrotask. The `timeout 2` that was queued from within a microtask becomes available only after the microtask queue is empty, so it falls into the next macrotask cycle.

This microtask-first scheduling is why promise-based code (including `async/await` continuations) generally runs before timer callbacks and DOM event handlers, even when the timer delay is zero.

### Promise Execution in the Event Loop

When a promise resolves, its `.then()` callback (or `await` continuation) is not invoked immediately. Instead, it is scheduled as a microtask. The timing difference between synchronous and promise code is visible in this pattern:

```ts
let value = "initial";

Promise.resolve().then(() => {
  value = "from promise";
});

value = "synchronous";
console.log(value); // "synchronous" -- promise hasn't run yet

// After current script completes and microtasks drain:
// value is now "from promise"
```

This scheduling is the reason `await` yields to the event loop. When an `async` function reaches an `await` expression, the function suspends and control returns to the caller. The remainder of the function is scheduled as a microtask, running after the current synchronous batch completes.

### Detecting and Preventing Main Thread Blocking

A blocked main thread is detectable through user-perceptible delays: clicks do not respond, animations freeze, scrolling becomes janky, and the browser may display "page unresponsive" dialog. Programmatic detection is available through the Long Tasks API:

```ts
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.warn(`Long task detected: ${entry.duration}ms`, entry.attribution);
  }
});

observer.observe({ type: "longtask", buffered: true });
```

A "long task" is any JavaScript execution that occupies the main thread for 50ms or more. The 50ms threshold derives from the RAIL (Response, Animation, Idle, Load) model: the browser needs to respond to user input within 100ms, so any single task taking more than 50ms leaves insufficient budget for rendering and event handling.

Prevention strategies include:

- Chunking CPU-heavy work with `setTimeout` or `scheduler.postTask` (as shown in the chunking example above).
- Offloading computation to Web Workers.
- Using `requestIdleCallback` for non-urgent background work.
- Avoiding forced synchronous layouts by batching DOM reads and writes.
