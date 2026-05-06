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

### What is responsive design?

> Responsive design adapts layout and content to different screen sizes and device capabilities using flexible grids, media queries, responsive images, and adaptive interaction patterns.

### How do you handle tables on mobile?

> Depending on the use case, I use horizontal scroll, hide less important columns, or transform rows into cards. For data-heavy admin apps, horizontal scroll is often acceptable.

### Mobile-first vs desktop-first?

> Mobile-first starts with small-screen styles and adds complexity for larger screens. It often leads to simpler responsive CSS.

## Practice Task

Make an admin order page responsive:

1. sidebar collapses;
2. filters stack;
3. table scrolls horizontally;
4. buttons remain usable;
5. text does not overflow.
