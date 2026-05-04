# CSS Basics

## Core Idea

CSS controls presentation: layout, spacing, colors, typography, and responsive behavior.

Chinese notes:

- `selector`: 选择器.
- `specificity`: 优先级.
- `cascade`: 层叠.
- `box model`: 盒模型.

## Selector

```css
.button {
  background: #2563eb;
}

#main {
  padding: 24px;
}

button[disabled] {
  opacity: 0.5;
}
```

State selectors:

```css
.button:hover {
  background: #1d4ed8;
}

.button:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 2px;
}

.field input:invalid {
  border-color: #dc2626;
}
```

## Cascade

When multiple rules apply, browser decides based on:

- importance;
- specificity;
- source order.

Avoid fighting CSS with too many overrides.

## Specificity

Roughly:

```text
inline style > id > class/attribute/pseudo-class > element
```

Avoid overly specific selectors:

```css
body div.main div.card button.primary {
}
```

## Box Model

Every element has:

- content;
- padding;
- border;
- margin.

Use:

```css
* {
  box-sizing: border-box;
}
```

This makes width calculations easier.

Common reset:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

img {
  max-width: 100%;
  height: auto;
}
```

## Display

Common values:

- `block`
- `inline`
- `inline-block`
- `flex`
- `grid`
- `none`

## Position

- `static`
- `relative`
- `absolute`
- `fixed`
- `sticky`

Absolute positioning is relative to the nearest positioned ancestor.

```css
.card {
  position: relative;
}

.badge {
  position: absolute;
  top: 8px;
  right: 8px;
}
```

## Z-index And Stacking Context

`z-index` works only in stacking contexts and positioned elements.

Stacking contexts can be created by:

- position + z-index;
- transform;
- opacity less than 1;
- filter;
- isolation.

## Complete Component Style Example

HTML:

```html
<article class="order-card">
  <span class="order-card__badge">Paid</span>
  <h2 class="order-card__title">Order 1001</h2>
  <p class="order-card__meta">Alice Chen · $100.00</p>
  <button class="button" type="button">View details</button>
</article>
```

CSS:

```css
.order-card {
  position: relative;
  max-width: 32rem;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.order-card__badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 0.875rem;
}

.order-card__title {
  margin: 0 4rem 0.25rem 0;
  font-size: 1.125rem;
}

.order-card__meta {
  margin: 0 0 1rem;
  color: #4b5563;
}

.button {
  min-height: 2.75rem;
  padding: 0.625rem 1rem;
  border: 0;
  border-radius: 0.375rem;
  background: #2563eb;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.button:hover {
  background: #1d4ed8;
}

.button:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 2px;
}
```

This example uses:

- `position: relative` on the card so the badge is positioned inside it;
- class selectors instead of deeply nested selectors;
- focus-visible styling for keyboard users;
- spacing and sizing that do not depend on fixed viewport width.

## Review Questions

### What is the CSS box model?

> The box model describes how content, padding, border, and margin make up the size and spacing of an element.

### Why is z-index not working?

> It may be in a different stacking context, the element may not be positioned, or another ancestor creates a stacking context.

### What is specificity?

> Specificity determines which CSS rule wins when multiple rules target the same element.

## Common Mistakes

- Overusing `!important`.
- No `box-sizing: border-box`.
- Position absolute without positioned parent.
- Z-index wars.
- Fixed pixel layouts that break on small screens.

## Practice Task

Build:

1. card layout;
2. badge positioned top-right;
3. button states;
4. responsive spacing;
5. modal overlay with correct stacking.
