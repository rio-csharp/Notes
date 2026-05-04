# CSS Layout: Flexbox And Grid

## Core Idea

Flexbox and Grid are the main modern CSS layout systems.

Chinese notes:

- `Flexbox`: 一维布局.
- `Grid`: 二维布局.
- `responsive layout`: 响应式布局.

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

## Review Questions

### Flexbox vs Grid?

> Flexbox is best for one-dimensional layouts. Grid is best for two-dimensional layouts with rows and columns.

### How do you center an element?

```css
.parent {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### What does `minmax(240px, 1fr)` do?

> It creates a grid column that is at least 240px and can grow to share available space.

## Common Mistakes

- Using flex for complex two-dimensional layout.
- Forgetting `gap`.
- Not handling small screens.
- Missing `min-width: 0` in flex children.
- Hardcoding too many widths.

## Practice Task

Build:

1. app shell with sidebar and content;
2. responsive card grid;
3. toolbar with left/right groups;
4. table header layout;
5. mobile stacked layout.
