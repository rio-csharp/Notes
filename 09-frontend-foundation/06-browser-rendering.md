# Browser Rendering

## Core Idea

Browser rendering is the process of turning HTML, CSS, and JavaScript into pixels on the screen.

## Rendering Pipeline

```text
HTML -> DOM
CSS -> CSSOM
DOM + CSSOM -> Render Tree
Render Tree -> Layout
Layout -> Paint
Paint -> Composite
```

## Under The Hood: Critical Rendering Path

The browser does not wait for all page resources in the same way.

High-level flow:

```text
Receive HTML bytes
  -> parse HTML incrementally
  -> build DOM
  -> discover CSS, JS, images, fonts
  -> build CSSOM
  -> combine DOM + CSSOM into render tree
  -> layout
  -> paint
  -> composite
```

Key behaviors to understand:

- HTML parsing can be incremental;
- CSS can block rendering because styles are needed to build the render tree;
- synchronous scripts can block HTML parsing;
- images usually do not block DOM construction but can affect layout if dimensions are missing;
- fonts can affect text rendering and layout.

## Parser, Preload Scanner, Render Blocking

Modern browsers often use a preload scanner to discover resources early while HTML is being parsed.

Example:

```html
<link rel="stylesheet" href="/app.css">
<script src="/app.js"></script>
<img src="/hero.jpg" width="1200" height="600">
```

Performance implications:

- CSS is render-blocking by default;
- normal scripts block parsing;
- `defer` scripts run after parsing and preserve order;
- `async` scripts run when downloaded and can execute out of order;
- image dimensions reduce layout shift.

Better:

```html
<script src="/app.js" defer></script>
```

Use:

- `defer` for most application scripts;
- `async` for independent third-party scripts;
- `preload` carefully for critical resources;
- explicit image dimensions to avoid CLS.

## Layout Thrashing

Layout thrashing happens when JavaScript repeatedly forces layout calculations.

Bad:

```ts
for (const item of items) {
  item.style.width = `${container.offsetWidth}px`;
}
```

Reading `offsetWidth` can force layout. Mixing reads and writes repeatedly can be expensive.

Better:

```ts
const width = container.offsetWidth;

for (const item of items) {
  item.style.width = `${width}px`;
}
```

The core principle is to batch DOM reads, then batch DOM writes.

## Compositor-Friendly Animations

Some animations can run mostly on the compositor thread.

Usually cheaper:

```css
transform: translateX(100px);
opacity: 0.5;
```

Often more expensive:

```css
width: 300px;
height: 300px;
top: 20px;
left: 20px;
```

This is because layout properties can trigger layout and paint, while transform and opacity can often use existing layers.

Do not overuse `will-change`; it can increase memory usage if applied everywhere.

## DOM And CSSOM

HTML:

```html
<main>
  <h1>Hello</h1>
  <button>Save</button>
</main>
```

becomes DOM nodes.

CSS:

```css
button {
  color: white;
  background: #2563eb;
}
```

becomes CSSOM rules.

The browser combines them to know what should appear and how it should look.

## Layout

Layout calculates size and position.

Layout can be expensive when many elements are affected.

Operations that may trigger layout:

- reading `offsetWidth`;
- changing element dimensions;
- changing fonts;
- inserting large DOM trees.

## Paint And Composite

Paint fills pixels for text, colors, borders, shadows, and images.

Composite combines layers.

CSS properties like `transform` and `opacity` are often cheaper to animate than `top`, `left`, `width`, or `height`.

Good animation:

```css
.panel {
  transform: translateX(0);
  transition: transform 200ms ease;
}
```

Riskier animation:

```css
.panel {
  left: 0;
  transition: left 200ms ease;
}
```

## Critical Rendering Path

Render-blocking resources delay first paint.

Examples:

- large CSS files;
- synchronous scripts in `<head>`;
- slow fonts;
- large unoptimized images.

Improve with:

- code splitting;
- CSS optimization;
- image compression;
- lazy loading;
- preloading critical assets;
- deferring non-critical JavaScript.

## Measuring Rendering Performance

Use browser DevTools Performance panel to inspect:

- long tasks;
- layout events;
- paint events;
- scripting time;
- forced reflow warnings;
- layout shift regions.

Programmatic measurement:

```js
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(entry.name, entry.startTime, entry.duration);
  }
});

observer.observe({ type: "measure", buffered: true });

performance.mark("orders-render-start");
renderOrders();
performance.mark("orders-render-end");
performance.measure("orders-render", "orders-render-start", "orders-render-end");
```

Largest Contentful Paint example:

```js
const lcpObserver = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lastEntry = entries[entries.length - 1];
  console.log("LCP", lastEntry.startTime);
});

lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
```

Use these measurements as clues. Real user monitoring is better than relying only on local development machines.

## Reducing Layout Shift

Bad:

```html
<img src="/hero.jpg" alt="Warehouse shelves" />
```

The browser does not know how much space to reserve.

Better:

```html
<img
  src="/hero.jpg"
  alt="Warehouse shelves"
  width="1200"
  height="600"
/>
```

Reserve space for dynamic content:

```css
.order-summary-skeleton {
  min-height: 12rem;
}
```

Avoid inserting banners above existing content without reserving space.

## JavaScript Loading

Blocking script:

```html
<script src="/app.js"></script>
```

Better for most app scripts:

```html
<script src="/app.js" defer></script>
```

Use `async` only for independent scripts:

```html
<script src="https://analytics.example.com/script.js" async></script>
```

Difference:

- `defer` waits until HTML parsing is complete and preserves script order;
- `async` runs as soon as downloaded and does not preserve order;
- normal scripts can block parsing.

## DOM Update Pattern

Bad:

```js
for (const order of orders) {
  const row = document.createElement("tr");
  row.innerHTML = `<td>${order.id}</td><td>${order.total}</td>`;
  tableBody.appendChild(row);
}
```

This repeatedly mutates the DOM.

Better:

```js
const fragment = document.createDocumentFragment();

for (const order of orders) {
  const row = document.createElement("tr");
  const idCell = document.createElement("td");
  const totalCell = document.createElement("td");

  idCell.textContent = order.id;
  totalCell.textContent = order.total;

  row.append(idCell, totalCell);
  fragment.appendChild(row);
}

tableBody.replaceChildren(fragment);
```

This batches DOM updates and avoids injecting HTML strings.

### How Reflow Propagates Through the Tree

Reflow (also called layout or relayout) is the process of recalculating element positions and sizes. It begins at the document root and propagates downward through the render tree. The cost of a reflow depends on the size of the affected subtree, not the entire document -- if you change a width on a leaf element, the browser reflows that element and its descendants, not the whole page. However, some operations trigger a global reflow of the entire document:

- Changing font size on the root or body element.
- Resizing the browser window.
- Inserting or removing a stylesheet.
- Reading certain properties like `offsetWidth`, `offsetHeight`, `clientTop`, `scrollTop`, `getComputedStyle()`, and others. These properties force the browser to flush any pending layout changes and compute an up-to-date value before returning -- a forced synchronous layout.

The layout thrashing pattern shown earlier occurs when JavaScript reads a forced-layout property (triggering a layout), then writes a style change (scheduling another layout), then reads again (flushing again). Each read-write cycle in a loop multiplies the layout cost. Batching reads before writes, or using `requestAnimationFrame` to separate read and write phases, eliminates this multiplier.

Modern browsers can mitigate some forced layout costs through style caching and incremental layout, but the fundamental cost model remains: every forced layout read processes the full affected subtree synchronously.

### Performance Measurement at the Rendering Level

Beyond Core Web Vitals, browser DevTools provide granular insight into rendering performance:

- **Performance panel recording**: Shows each frame's compositing, painting, layout, and scripting phases as a waterfall. Long frames (exceeding 16ms for 60fps) appear as red bars.
- **Layout shift regions**: DevTools highlights shifting elements in blue or red during interaction, showing exactly which elements contribute to CLS.
- **Forced reflow warnings**: The Performance panel flags JavaScript operations that trigger forced synchronous layouts, showing the call stack at the time of the read.
- **Layer boundaries**: Paint flashing highlights areas that are repainted each frame, helping identify unnecessary repaints.

The `PerformanceObserver` API shown earlier provides programmatic access to these metrics for production monitoring, though real-user measurement via the Chrome UX Report or RUM services like Datadog RUM and New Relic is more representative than any local DevTools session.

### JavaScript Loading Strategies in Detail

Three loading modes exist for external scripts, each with different behavior:

| Mode | Parsing behavior | Execution timing | Order |
|------|------------------|------------------|-------|
| Normal (no attribute) | Blocks HTML parsing | As soon as downloaded | Preserved |
| `defer` | Does not block | After HTML parsing completes | Preserved |
| `async` | Does not block | As soon as downloaded | Not preserved |

**Normal scripts** block the HTML parser entirely. The browser stops building DOM nodes while the script downloads and executes. This is why inline `<script>` tags in `<head>` delay first paint.

**`defer`** downloads the script while HTML parsing continues. Execution waits until parsing is complete. Because order is preserved, deferred scripts can depend on each other. Use `defer` for application scripts that need the full DOM.

**`async`** downloads without blocking and executes immediately upon download. If multiple async scripts are present, they run in download-completion order, which is unpredictable. Use `async` for independent third-party scripts -- analytics, ads, A/B testing frameworks -- where load order does not matter.

### Cumulative Layout Shift in Detail

Layout shift occurs when a visible element changes position between two rendered frames. The browser calculates a CLS score based on two factors:

1. **Impact fraction**: The portion of the viewport occupied by the moving element in both its old and new positions (combined).
2. **Distance fraction**: How far the element moved relative to the viewport.

A shift that moves a large element halfway across the viewport scores higher than a small element shifting slightly. The cumulative score sums individual shift scores across the page lifetime.

Common CLS causes and mitigations:

| Cause | Mitigation |
|-------|-----------|
| Images without dimensions | Always set `width` and `height` |
| Ads or embeds without reserved space | Use `min-height` on container |
| Dynamic injected content (banners, toasts) | Reserve space or insert at viewport edge |
| Web fonts causing text reflow | Use `font-display: swap` or `font-display: optional` with matching fallback metrics |
| Late-loading images with no aspect ratio | Use `aspect-ratio` CSS property as fallback |

The skeleton loading pattern (shown earlier as `.order-summary-skeleton { min-height: 12rem; }`) reserves space for content that has not loaded yet, preventing shifts when the real content arrives.
