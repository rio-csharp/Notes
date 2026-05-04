# Browser Rendering

## Core Idea

Browser rendering is the process of turning HTML, CSS, and JavaScript into pixels on the screen.

Chinese notes:

- `DOM`: Document Object Model, 文档对象模型.
- `CSSOM`: CSS Object Model, CSS 对象模型.
- `layout`: 布局计算.
- `paint`: 绘制.
- `composite`: 合成.

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

Important:

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

Rule:

> Batch DOM reads, then batch DOM writes.

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

Why:

- layout properties can trigger layout and paint;
- transform/opacity can often use existing layers.

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

## Review Questions

### What happens when the browser loads a page?

> The browser parses HTML into DOM, parses CSS into CSSOM, combines them into a render tree, calculates layout, paints pixels, and composites layers. JavaScript can modify DOM and CSSOM, causing re-rendering work.

### What is reflow?

> Reflow, or layout recalculation, happens when the browser needs to recalculate element sizes and positions. It can be expensive if many elements are affected.

### How do you improve frontend performance?

> Reduce JavaScript bundle size, optimize images and fonts, avoid unnecessary layout work, lazy-load non-critical resources, use caching, and measure Core Web Vitals.

### Why use `defer` on scripts?

> `defer` lets the browser continue parsing HTML while downloading JavaScript. The script runs after parsing and preserves order, which is usually better for application scripts than blocking parsing.

### Why can layout shift happen?

> Layout shift happens when visible content moves after initial rendering, often because images lack dimensions, dynamic content is inserted above existing content, or fonts load late.

## Common Mistakes

- Loading huge JavaScript before first render.
- Animating layout properties unnecessarily.
- Not setting image dimensions.
- Ignoring layout shift.
- Measuring performance only on powerful development machines.
