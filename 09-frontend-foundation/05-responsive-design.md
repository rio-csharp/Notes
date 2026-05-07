# Responsive Design

## Core Idea

Responsive design makes UI work across different screen sizes, input types, and device capabilities.

## Viewport Meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Without this, mobile layout may behave incorrectly.

## Fluid Layout

Prefer flexible sizes:

```css
.container {
  width: min(100% - 32px, 1200px);
  margin-inline: auto;
}
```

## Media Query

```css
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
}

@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
```

## Responsive Tables

Options:

- horizontal scroll;
- column hiding;
- card layout on mobile;
- server-side data prioritization.

Example:

```css
.table-wrapper {
  overflow-x: auto;
}
```

HTML:

```html
<div class="table-wrapper" tabindex="0" aria-label="Orders table">
  <table>
    <thead>
      <tr>
        <th scope="col">Order</th>
        <th scope="col">Customer</th>
        <th scope="col">Status</th>
        <th scope="col">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">1001</th>
        <td>Alice Chen</td>
        <td>Paid</td>
        <td>$100.00</td>
      </tr>
    </tbody>
  </table>
</div>
```

CSS:

```css
.table-wrapper {
  overflow-x: auto;
  max-width: 100%;
}

.table-wrapper table {
  min-width: 42rem;
  border-collapse: collapse;
}
```

## Touch Targets

Interactive controls should be large enough for touch.

Common guideline:

```text
At least around 44px by 44px.
```

## Images

```css
img {
  max-width: 100%;
  height: auto;
}
```

Responsive image:

```html
<img
  src="/images/product-800.jpg"
  srcset="/images/product-400.jpg 400w, /images/product-800.jpg 800w, /images/product-1200.jpg 1200w"
  sizes="(max-width: 600px) 100vw, 50vw"
  alt="Black wireless keyboard"
  width="800"
  height="600"
/>
```

`width` and `height` help reduce layout shift. `srcset` and `sizes` let the browser choose an appropriate image.

## Complete Responsive Page Example

```html
<main class="orders-page">
  <header class="orders-header">
    <h1>Orders</h1>
    <button type="button">Create order</button>
  </header>

  <form class="filters" aria-label="Order filters">
    <label>
      Status
      <select name="status">
        <option value="">All</option>
        <option value="paid">Paid</option>
        <option value="pending">Pending</option>
      </select>
    </label>

    <label>
      Search
      <input name="q" type="search" />
    </label>

    <button type="submit">Apply</button>
  </form>

  <section class="table-wrapper" aria-label="Order results" tabindex="0">
    <table>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Customer</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">1001</th>
          <td>Alice Chen</td>
          <td>Paid</td>
          <td>$100.00</td>
        </tr>
      </tbody>
    </table>
  </section>
</main>
```

```css
.orders-page {
  width: min(100% - 2rem, 72rem);
  margin-inline: auto;
  padding-block: 1rem;
}

.orders-header,
.filters {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.filters label {
  display: grid;
  gap: 0.25rem;
}

.filters input,
.filters select,
.filters button,
.orders-header button {
  min-height: 2.75rem;
}

@media (max-width: 40rem) {
  .orders-header,
  .filters {
    align-items: stretch;
    flex-direction: column;
  }

  .filters button,
  .orders-header button {
    width: 100%;
  }
}
```

This page keeps controls usable on mobile, prevents table overflow from breaking layout, and avoids fixed-width containers.

### Fluid Typography and Spacing

Responsive design is not limited to layout grids. Typography and spacing should also adapt to viewport size. The `clamp()` function provides a way to define size ranges that scale smoothly:

```css
body {
  font-size: clamp(1rem, 0.75rem + 0.5vw, 1.25rem);
}

.container {
  padding: clamp(1rem, 0.5rem + 2vw, 2rem);
}
```

The first argument is the minimum value, the second is the preferred value (using viewport units), and the third is the maximum value. This eliminates hard breakpoints for simple size adjustments.

### Container Queries

Container queries allow components to respond to their parent container's size rather than the viewport size. This is useful for reusable components that appear in different layout contexts:

```css
.card-container {
  container-type: inline-size;
  container-name: card-grid;
}

@container card-grid (max-width: 30rem) {
  .card {
    grid-template-columns: 1fr;
  }
}

@container card-grid (min-width: 30rem) {
  .card {
    grid-template-columns: 200px 1fr;
  }
}
```

Container queries are supported in all modern browsers as of 2024. They complement media queries: use container queries for component-level adaptations and media queries for page-level layout changes.

### Tables on Mobile Strategies

Data tables present a specific challenge on narrow screens because tables are inherently two-dimensional. Four practical strategies exist:

1. **Horizontal scroll** (shown in the example above): The table maintains its structure inside a scrollable wrapper. This preserves full data visibility and is the simplest approach for data-heavy applications.

2. **Hidden columns**: Use media queries to hide less important columns on small screens. Add a toggle to reveal hidden columns if needed.

3. **Card transformation**: Convert each table row into a stacked card layout on narrow screens. This works well for short lists but can be impractical for tables with many columns.

4. **Server-side adaptation**: Return different data structures for mobile views, reducing the data shown per row and paginating more aggressively.

For administrative applications with many columns, horizontal scroll is often the most practical choice because it preserves data density without restructuring.

### Mobile-First CSS Strategy

Mobile-first stylesheets start with the narrow-screen layout as the default and add complexity for larger screens using `min-width` media queries:

```css
/* Base: single-column layout for narrow screens */
.layout {
  display: grid;
  grid-template-columns: 1fr;
}

/* Add sidebar at wider viewports */
@media (min-width: 48rem) {
  .layout {
    grid-template-columns: 16rem minmax(0, 1fr);
  }
}

/* Add third column at even wider viewports */
@media (min-width: 72rem) {
  .layout {
    grid-template-columns: 16rem 1fr 20rem;
  }
}
```

This approach forces focus on essential content first and typically results in less CSS than desktop-first (which uses `max-width` to remove features at smaller sizes). The selector weight is uniform across breakpoints -- each media query simply overrides the base declaration -- avoiding specificity conflicts.
