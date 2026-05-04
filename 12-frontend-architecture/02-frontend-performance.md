# Frontend Performance

## Core Idea

Frontend performance is about how quickly users can see useful content, understand the page, and interact without delay.

Good performance work has three steps:

1. Measure what users experience.
2. Identify the largest bottleneck.
3. Change one thing and measure again.

Chinese notes:

- `bundle size`: 打包体积.
- `hydration`: 水合.
- `Core Web Vitals`: Google 的核心网页指标.
- `layout shift`: 布局偏移.
- `long task`: 长任务.
- `main thread`: 主线程.
- `render-blocking`: 阻塞渲染.

## Mental Model

When a user opens a frontend page, the browser usually does this:

```text
DNS lookup
  -> TCP/TLS connection
  -> HTTP request
  -> HTML download
  -> parse HTML
  -> discover CSS, JS, fonts, images
  -> build DOM and CSSOM
  -> render first pixels
  -> download and execute JavaScript
  -> fetch API data
  -> update UI
  -> handle user interaction
```

Performance can be slow at many layers:

- server response is slow;
- JavaScript bundle is too large;
- CSS or scripts block rendering;
- images are too large;
- API responses are too large;
- React renders too much;
- long tasks block user input;
- layout shifts make the page unstable;
- network requests are duplicated;
- fonts delay text rendering.

## Key Metrics

### LCP

Largest Contentful Paint measures when the largest visible content appears.

Common LCP elements:

- hero image;
- large heading;
- product image;
- dashboard chart;
- main content card.

Improve LCP with:

- faster server response;
- route-level code splitting;
- optimized images;
- critical CSS;
- fewer render-blocking scripts;
- CDN caching;
- avoiding client-only rendering for essential first content when SEO or first paint matters.

### CLS

Cumulative Layout Shift measures unexpected layout movement.

Improve CLS with:

- set image `width` and `height`;
- reserve space for ads, embeds, charts, and skeletons;
- avoid inserting content above existing content;
- use stable font loading;
- avoid late-loading banners that push content down.

Stable image example:

```html
<img
  src="/images/order-dashboard.webp"
  width="960"
  height="540"
  alt="Order dashboard"
/>
```

### INP

Interaction to Next Paint measures how responsive the page is after a user interaction.

Improve INP with:

- reduce long tasks;
- split heavy JavaScript;
- avoid expensive synchronous work in event handlers;
- virtualize large lists;
- move heavy computation to Web Workers;
- use `startTransition` for non-urgent updates;
- reduce unnecessary re-renders.

## Measuring In The Browser

Use browser DevTools before optimizing.

Useful panels:

- `Performance`: main-thread tasks, rendering, scripting, layout.
- `Network`: request waterfalls, cache behavior, payload sizes.
- `Lighthouse`: lab score and Core Web Vitals suggestions.
- `Coverage`: unused JavaScript and CSS.
- `Memory`: leaks and detached DOM nodes.
- `React DevTools Profiler`: render cost and component updates.

## Measuring In Code

For real user metrics, use the `web-vitals` package.

```ts
// app/reportWebVitals.ts
import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

function sendMetric(metric: Metric) {
  navigator.sendBeacon(
    "/analytics/web-vitals",
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id
    })
  );
}

export function reportWebVitals() {
  onCLS(sendMetric);
  onINP(sendMetric);
  onLCP(sendMetric);
}
```

```ts
// main.tsx
import { reportWebVitals } from "./app/reportWebVitals";

reportWebVitals();
```

You can also measure custom timings:

```ts
performance.mark("orders-render-start");

// render or process something

performance.mark("orders-render-end");
performance.measure(
  "orders-render",
  "orders-render-start",
  "orders-render-end"
);
```

Read measurements:

```ts
const entries = performance.getEntriesByName("orders-render");

for (const entry of entries) {
  console.log(entry.name, entry.duration);
}
```

## Bundle Size

Large bundles slow down download, parse, compile, and execution.

Check:

- large dependencies;
- duplicate packages;
- unused imports;
- heavy chart libraries;
- date libraries;
- icon imports;
- markdown editors;
- rich text editors;
- PDF or Excel libraries;
- localization bundles.

Good:

```tsx
import { Search } from "lucide-react";
```

Risky:

```tsx
import * as Icons from "some-big-icon-library";
```

Vite bundle analysis example:

```bash
npm install -D rollup-plugin-visualizer
```

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "dist/stats.html",
      template: "treemap",
      gzipSize: true,
      brotliSize: true
    })
  ]
});
```

Then run:

```bash
npm run build
```

Open `dist/stats.html` and look for large or duplicated modules.

## Code Splitting

Code splitting avoids loading every page on initial load.

```tsx
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

const AdminPage = lazy(() => import("./features/admin/AdminPage"));
const ReportsPage = lazy(() => import("./features/reports/ReportsPage"));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </Suspense>
  );
}
```

Use code splitting for:

- admin pages;
- rarely used routes;
- heavy editors;
- chart and reporting pages;
- settings pages with many optional dependencies.

Avoid splitting every tiny component. Too many small chunks can create request overhead and worse caching behavior.

## Lazy Loading A Heavy Component

Sometimes only part of a page is heavy.

```tsx
import { lazy, Suspense, useState } from "react";

const RevenueChart = lazy(() => import("./RevenueChart"));

export function ReportsPage() {
  const [showChart, setShowChart] = useState(false);

  return (
    <main>
      <h1>Reports</h1>

      <button type="button" onClick={() => setShowChart(true)}>
        Show revenue chart
      </button>

      {showChart ? (
        <Suspense fallback={<p>Loading chart...</p>}>
          <RevenueChart />
        </Suspense>
      ) : null}
    </main>
  );
}
```

This keeps chart code out of the initial bundle until the user needs it.

## Prefetching

Prefetching loads data or code before the user needs it.

React Query data prefetch:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchOrder } from "../api/ordersApi";

export function OrderLink({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();

  function prefetchOrder() {
    queryClient.prefetchQuery({
      queryKey: ["order", orderId],
      queryFn: () => fetchOrder(orderId),
      staleTime: 60_000
    });
  }

  return (
    <Link to={`/orders/${orderId}`} onMouseEnter={prefetchOrder}>
      View order
    </Link>
  );
}
```

Prefetching is useful when intent is likely, such as hovering a detail link or opening a menu. It can waste bandwidth if done too aggressively.

## Image Optimization

Images are often the largest resources on a page.

Use:

- correct dimensions;
- modern formats like WebP or AVIF;
- lazy loading for below-the-fold images;
- responsive images;
- CDN transformations;
- stable aspect ratios;
- meaningful `alt` text.

Responsive image example:

```html
<picture>
  <source
    type="image/avif"
    srcset="/images/dashboard-640.avif 640w, /images/dashboard-1280.avif 1280w"
  />
  <source
    type="image/webp"
    srcset="/images/dashboard-640.webp 640w, /images/dashboard-1280.webp 1280w"
  />
  <img
    src="/images/dashboard-1280.jpg"
    srcset="/images/dashboard-640.jpg 640w, /images/dashboard-1280.jpg 1280w"
    sizes="(max-width: 768px) 100vw, 768px"
    width="1280"
    height="720"
    loading="lazy"
    alt="Dashboard showing order metrics"
  />
</picture>
```

For the LCP image, avoid lazy loading:

```html
<img
  src="/images/main-product.webp"
  width="1200"
  height="800"
  fetchpriority="high"
  alt="Main product preview"
/>
```

## Font Optimization

Fonts can block or delay text rendering.

Good CSS:

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-var.woff2") format("woff2");
  font-display: swap;
}
```

Use:

- `font-display: swap`;
- fewer font families;
- fewer font weights;
- local hosting or a reliable CDN;
- preload only critical fonts.

Preload example:

```html
<link
  rel="preload"
  href="/fonts/inter-var.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

## React Rendering Optimization

React rendering is not automatically a problem. The problem is unnecessary or expensive rendering.

Common causes:

- state stored too high in the tree;
- context values changing too often;
- unstable object and function props;
- expensive calculations during render;
- huge lists rendered all at once;
- global stores causing broad updates.

### Move State Down

Risky:

```tsx
function App() {
  const [search, setSearch] = useState("");

  return (
    <>
      <SearchBox value={search} onChange={setSearch} />
      <HugeDashboard search={search} />
    </>
  );
}
```

If only one table needs `search`, keep it closer:

```tsx
function OrdersSection() {
  const [search, setSearch] = useState("");

  return (
    <>
      <SearchBox value={search} onChange={setSearch} />
      <OrdersTable search={search} />
    </>
  );
}

function App() {
  return <HugeDashboard />;
}
```

### Memoize Expensive Calculation

```tsx
import { useMemo } from "react";

type Order = {
  id: string;
  totalAmount: number;
  status: "paid" | "cancelled" | "submitted";
};

function OrderSummary({ orders }: { orders: Order[] }) {
  const summary = useMemo(() => {
    return orders.reduce(
      (result, order) => {
        result.count += 1;
        result.totalAmount += order.totalAmount;
        return result;
      },
      { count: 0, totalAmount: 0 }
    );
  }, [orders]);

  return (
    <p>
      {summary.count} orders, total {summary.totalAmount.toFixed(2)}
    </p>
  );
}
```

Do not add `useMemo` everywhere. It has overhead and makes code more complex. Use it when the calculation is expensive or when stable identity matters for child rendering.

### Stabilize Context Values

Risky:

```tsx
import type { ReactNode } from "react";

function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  return (
    <SessionContext.Provider value={{ user, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}
```

The object `{ user, setUser }` is recreated on every render.

Better:

```tsx
import type { ReactNode } from "react";

function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo(
    () => ({
      user,
      setUser
    }),
    [user]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
```

For very large apps, split contexts:

```tsx
const CurrentUserContext = createContext<User | null>(null);
const SetCurrentUserContext = createContext<((user: User | null) => void) | null>(
  null
);
```

This avoids forcing components that only need the setter to re-render when the user changes.

## Virtualization

Virtualization renders only the visible rows in a large list.

Use it for:

- thousands of rows;
- logs;
- audit history;
- large tables;
- chat history;
- search results.

Example with `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

type LogItem = {
  id: string;
  message: string;
  createdAt: string;
};

type LogListProps = {
  logs: LogItem[];
};

export function LogList({ logs }: LogListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8
  });

  return (
    <div ref={parentRef} style={{ height: 500, overflow: "auto" }}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative"
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const log = logs[virtualRow.index];

          return (
            <div
              key={log.id}
              style={{
                height: virtualRow.size,
                left: 0,
                position: "absolute",
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                width: "100%"
              }}
            >
              <time>{log.createdAt}</time> {log.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Virtualization improves rendering cost, but it adds complexity for:

- keyboard navigation;
- screen reader behavior;
- dynamic row heights;
- sticky headers;
- browser find-in-page;
- printing.

## Debounce And Throttle

Debounce waits until changes pause.

```tsx
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
```

Search example:

```tsx
function OrderSearchBox() {
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term, 300);

  const ordersQuery = useOrdersQuery({
    search: debouncedTerm,
    page: 1,
    pageSize: 20
  });

  return (
    <input
      value={term}
      onChange={(event) => setTerm(event.target.value)}
      placeholder="Search orders"
    />
  );
}
```

Use debounce for:

- search;
- auto-save;
- validation;
- typeahead queries.

Use throttle for:

- scroll;
- resize;
- drag movement;
- repeated pointer events.

## `startTransition` And `useDeferredValue`

Some updates are urgent, such as typing into an input. Other updates are non-urgent, such as filtering a large list.

```tsx
import { startTransition, useState } from "react";

type Product = {
  id: string;
  name: string;
};

function ProductSearch({ products }: { products: Product[] }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  function handleChange(value: string) {
    setInput(value);

    startTransition(() => {
      setQuery(value);
    });
  }

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <input value={input} onChange={(event) => handleChange(event.target.value)} />
      <ProductList products={filtered} />
    </>
  );
}
```

`startTransition` tells React that the filtered list update is less urgent than keeping the input responsive.

`useDeferredValue` can also defer expensive rendering:

```tsx
import { useDeferredValue, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
};

function ProductSearch({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      products.filter((product) =>
        product.name.toLowerCase().includes(deferredQuery.toLowerCase())
      ),
    [products, deferredQuery]
  );

  return (
    <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <ProductList products={filtered} />
    </>
  );
}
```

## Network Optimization

Frontend performance often depends on API design.

Use:

- pagination;
- field selection;
- response compression;
- HTTP caching;
- CDN caching for static assets;
- request deduplication;
- request cancellation;
- prefetching;
- avoiding request waterfalls.

### Avoid Request Waterfalls

Risky:

```tsx
const userQuery = useQuery({
  queryKey: ["user", userId],
  queryFn: () => fetchUser(userId)
});

const ordersQuery = useQuery({
  queryKey: ["orders", userQuery.data?.id],
  queryFn: () => fetchOrdersByUser(userQuery.data!.id),
  enabled: Boolean(userQuery.data)
});
```

This may be necessary if the second request depends on the first result. But if both can be loaded independently, run them in parallel:

```tsx
const userQuery = useQuery({
  queryKey: ["user", userId],
  queryFn: () => fetchUser(userId)
});

const ordersQuery = useQuery({
  queryKey: ["orders", userId],
  queryFn: () => fetchOrdersByUser(userId)
});
```

### Cancel Stale Requests

```ts
export async function fetchOrders(search: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ search });

  const response = await fetch(`/api/orders?${params}`, {
    signal
  });

  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  return response.json() as Promise<Order[]>;
}
```

```ts
const ordersQuery = useQuery({
  queryKey: ["orders", search],
  queryFn: ({ signal }) => fetchOrders(search, signal)
});
```

Cancellation prevents older slow responses from wasting work after the query is no longer relevant.

## HTTP Caching For Static Assets

Built assets should usually be fingerprinted:

```text
assets/app.8c17f3.js
assets/app.3fd91a.css
```

Then the server can cache them aggressively:

```http
Cache-Control: public, max-age=31536000, immutable
```

HTML should usually not be cached as aggressively because it points to the latest asset names:

```http
Cache-Control: no-cache
```

This allows users to load the newest HTML while still reusing long-lived static assets.

## Web Workers

Heavy CPU work blocks the main thread if it runs directly in React event handlers or render logic.

Move heavy work to a Web Worker.

Worker:

```ts
// workers/calculateReport.worker.ts
type ReportRow = {
  amount: number;
};

type ReportSummaryResult = {
  total: number;
  count: number;
};

self.onmessage = (event: MessageEvent<{ rows: ReportRow[] }>) => {
  const result = calculateReportSummary(event.data.rows);
  self.postMessage(result);
};

function calculateReportSummary(rows: ReportRow[]): ReportSummaryResult {
  return rows.reduce(
    (summary, row) => {
      summary.total += row.amount;
      summary.count += 1;
      return summary;
    },
    { total: 0, count: 0 }
  );
}
```

React usage:

```tsx
import { useEffect, useMemo, useState } from "react";

type ReportRow = {
  amount: number;
};

type ReportSummaryResult = {
  total: number;
  count: number;
};

export function ReportSummary({ rows }: { rows: ReportRow[] }) {
  const [summary, setSummary] = useState<ReportSummaryResult | null>(null);

  const worker = useMemo(
    () => new Worker(new URL("../workers/calculateReport.worker.ts", import.meta.url)),
    []
  );

  useEffect(() => {
    worker.postMessage({ rows });
    worker.onmessage = (event: MessageEvent<ReportSummaryResult>) => {
      setSummary(event.data);
    };

    return () => {
      worker.onmessage = null;
    };
  }, [rows, worker]);

  if (!summary) {
    return <p>Calculating...</p>;
  }

  return <p>Total: {summary.total.toFixed(2)}</p>;
}
```

Terminate workers when they are no longer needed:

```tsx
useEffect(() => {
  return () => worker.terminate();
}, [worker]);
```

## CSS And Layout Performance

Layout is expensive when JavaScript repeatedly reads and writes layout values.

Risky layout thrashing:

```ts
for (const element of elements) {
  const height = element.getBoundingClientRect().height;
  element.style.height = `${height + 10}px`;
}
```

Better: read first, then write:

```ts
const heights = elements.map((element) => element.getBoundingClientRect().height);

elements.forEach((element, index) => {
  element.style.height = `${heights[index] + 10}px`;
});
```

Prefer compositor-friendly animations:

```css
.panel {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.panel-enter {
  opacity: 0;
  transform: translateY(8px);
}
```

Prefer animating:

- `transform`;
- `opacity`.

Be careful animating:

- `width`;
- `height`;
- `top`;
- `left`;
- `margin`;
- `padding`.

## Memory Leaks

Common frontend memory leak sources:

- event listeners not removed;
- intervals not cleared;
- WebSocket connections not closed;
- workers not terminated;
- large objects retained in closures;
- abandoned subscriptions.

Example cleanup:

```tsx
useEffect(() => {
  function handleResize() {
    console.log(window.innerWidth);
  }

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
  };
}, []);
```

Interval cleanup:

```tsx
useEffect(() => {
  const id = window.setInterval(refreshOrders, 30_000);

  return () => {
    window.clearInterval(id);
  };
}, []);
```

## Performance Budget

A performance budget makes performance visible before production.

Example budget:

```text
Initial JavaScript gzip: <= 180 KB
Initial CSS gzip: <= 40 KB
LCP on mid-range mobile: <= 2.5 seconds
CLS: <= 0.1
INP: <= 200 ms
Main-thread long tasks during load: <= 2
```

Example CI idea:

```bash
npm run build
npm run analyze
npm run lighthouse:ci
```

Budgets should be realistic for the product. A complex authenticated dashboard has different constraints than a public landing page.

## Practical Optimization Flow

Use this order:

1. Measure Core Web Vitals and user-reported slowness.
2. Check network waterfall.
3. Check bundle size and unused code.
4. Check LCP resource and render-blocking resources.
5. Profile React rendering.
6. Look for long tasks.
7. Optimize API payloads and caching.
8. Re-measure on a slower device or throttled network.

## Common Mistakes

- Optimizing without measurement.
- Testing only on localhost.
- Testing only on a powerful laptop.
- Loading admin and reporting code on the first page.
- Sending huge API payloads to the browser.
- Rendering thousands of rows without virtualization.
- Using `useMemo` and `memo` everywhere without profiling.
- Forgetting image dimensions.
- Lazy-loading the LCP image.
- Creating request waterfalls accidentally.
- Keeping old feature flags and dead code in the bundle.
- Ignoring accessibility while virtualizing lists.

## Practice Task

Take a React app and perform a small performance pass:

```text
1. Run Lighthouse.
2. Record LCP, CLS, and INP.
3. Inspect the Network tab.
4. Build and inspect bundle size.
5. Lazy-load one large route.
6. Optimize one large image.
7. Virtualize one long list.
8. Reduce one unnecessary re-render found by React Profiler.
9. Document before and after metrics.
```

## Knowledge Checks

### Why should performance work start with measurement?

Because the slowest visible problem is often not the one developers guess. Measurement shows whether the bottleneck is network, JavaScript execution, rendering, images, API design, or server response time.

### What is the difference between LCP, CLS, and INP?

LCP measures when important content appears. CLS measures visual stability. INP measures interaction responsiveness.

### When should you use virtualization?

Use virtualization when rendering a large list or table creates too much DOM and rendering work. It is especially useful for logs, tables, search results, and audit history.

### Why can global state hurt performance?

If global state updates notify too many components, large parts of the app may re-render for a small change. State should be scoped to the smallest reasonable boundary.

### Why can lazy loading hurt performance?

Lazy loading can hurt when it delays content the user needs immediately, such as the LCP image or essential first-page UI. It is best for non-critical routes, heavy optional components, and rarely used features.
