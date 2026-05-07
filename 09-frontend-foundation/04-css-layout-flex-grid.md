# CSS Layout: Flexbox And Grid

## Core Idea

Flexbox and Grid are the main modern CSS layout systems.

## Flexbox

Flexbox is best for one-dimensional layout: row or column.

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
```

Common properties:

- `display: flex`
- `flex-direction`
- `justify-content`
- `align-items`
- `gap`
- `flex-wrap`
- `flex`

Toolbar example:

```html
<div class="toolbar">
  <div class="toolbar__left">
    <h1>Orders</h1>
  </div>
  <div class="toolbar__right">
    <button type="button">Export</button>
    <button type="button">Create order</button>
  </div>
</div>
```

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.toolbar__right {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
```

## Flex Item Growth

```css
.main {
  flex: 1;
}
```

Means the item can grow to fill available space.

## Common Flex Issue: Shrinking

Text may overflow or shrink unexpectedly.

```css
.content {
  min-width: 0;
}
```

`min-width: 0` is often needed inside flex layouts to allow text truncation.

## Grid

Grid is best for two-dimensional layout: rows and columns.

```css
.dashboard {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
}
```

App shell:

```html
<div class="app-shell">
  <aside class="sidebar">Navigation</aside>
  <main class="content">Main content</main>
</div>
```

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
}

.sidebar {
  border-right: 1px solid #e5e7eb;
  padding: 1rem;
}

.content {
  min-width: 0;
  padding: 1rem;
}
```

`minmax(0, 1fr)` and `min-width: 0` prevent overflowing content from forcing the main column wider than the viewport.

Note: on mobile browsers with dynamic toolbars, `100vh` can be taller than the visible viewport. Consider `100dvh` (dynamic viewport height) for app-shell layouts to avoid content being hidden behind browser chrome. The `dvh`, `svh`, and `lvh` units are Baseline Widely Available as of 2025.

Responsive cards:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
```

## auto-fit vs auto-fill

`auto-fit` collapses empty tracks.

`auto-fill` keeps empty tracks.

For responsive cards, `auto-fit` is often what you want.

## Responsive Layout

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

Complete responsive card grid:

```html
<section class="cards" aria-label="Order summary">
  <article class="card">
    <h2>Pending orders</h2>
    <p>18</p>
  </article>
  <article class="card">
    <h2>Paid orders</h2>
    <p>124</p>
  </article>
  <article class="card">
    <h2>Refund requests</h2>
    <p>3</p>
  </article>
</section>
```

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.card {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}
```

This grid can collapse to one column without overflowing.

## Common Layout Patterns

Holy grail layout:

```css
.page {
  min-height: 100vh;
  display: grid;
  grid-template:
    "header header" auto
    "sidebar main" 1fr
    "footer footer" auto
    / 16rem minmax(0, 1fr);
}

.header { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main { grid-area: main; min-width: 0; }
.footer { grid-area: footer; }

@media (max-width: 48rem) {
  .page {
    grid-template:
      "header" auto
      "main" 1fr
      "footer" auto
      / 1fr;
  }

  .sidebar {
    display: none;
  }
}
```

Two-column form:

```css
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-grid__full {
  grid-column: 1 / -1;
}

@media (max-width: 40rem) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
```

### Choosing Between Flexbox and Grid

Flexbox and Grid are complementary layout systems, not competing alternatives. The primary distinction is dimensionality:

**Flexbox** operates in one dimension at a time -- either a row or a column. It distributes space along the main axis and aligns items along the cross axis. Flexbox excels when the number of items is unknown or dynamic, such as toolbars, navigation bars, button groups, and centered content blocks. Items in a flex container can wrap to new rows, but each new row is an independent flex container -- items in one row do not align with items in another row.

**Grid** operates in two dimensions simultaneously -- rows and columns. Grid excels when you need to align items across both axes, such as page shells, card grids, form layouts, and dashboard panels. Items in a Grid container share column and row tracks, so elements in one row align with elements in adjacent rows.

In practice, they are often used together: Grid defines the page shell (sidebar, header, main, footer), while Flexbox manages the internal layout of individual page components (toolbar buttons, form controls, card content).

### Centering Strategies

Flexbox provides the most straightforward centering for a single child element within its parent:

```css
.parent {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

Grid provides equivalent centering with a single property:

```css
.parent {
  display: grid;
  place-items: center;
}
```

For centering in one axis only, `margin: auto` on the child element (with a defined width or height on the parent) remains a reliable fallback that works across all block-level contexts.

### The fr Unit and minmax()

The `fr` unit in Grid represents a fraction of the available space in the grid container after fixed-size tracks (those with explicit length values like `px`, `rem`, or `%`) have been allocated. Two columns defined as `1fr 2fr` mean the second column receives twice the space of the first.

`minmax()` defines a track size range. `grid-template-columns: minmax(200px, 1fr)` creates a column that is at least 200px wide but can grow to fill available space. This is useful for responsive layouts without media queries:

```css
grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
```

The `min(100%, 16rem)` guard prevents the minimum from exceeding the viewport width on very narrow screens, which would otherwise cause horizontal overflow.
