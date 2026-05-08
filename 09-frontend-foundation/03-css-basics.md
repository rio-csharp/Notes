# CSS Basics

## Core Idea

CSS controls presentation: layout, spacing, colors, typography, and responsive behavior.

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

When multiple rules apply, the browser resolves conflicts through a five-level cascade. Each level is checked in order; the first level that distinguishes between competing declarations wins:

1. **Origin and importance**: User-agent styles, author styles, and `!important` declarations. `!important` reverses the normal priority order (author beats user-agent, but `!important` in user-agent overrides `!important` in author).
2. **Cascade layers**: Styles in `@layer` blocks. Unlayered styles beat layered styles within the same origin. Layers declared later in the stylesheet override earlier ones.
3. **Specificity**: The selector weight calculation described below.
4. **Scoping proximity**: Within `@scope` blocks, the rule set closest to the element in the DOM tree wins.
5. **Source order**: The last declaration in the stylesheet wins when all previous levels are equal.

Avoid fighting the cascade with overly specific selectors or redundant `!important` flags.

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

`z-index` controls the stacking order of overlapping elements, but it only applies within the same stacking context. A stacking context is an atomic painting unit: elements inside one context are painted as a group relative to elements outside it.

Stacking contexts are created by:

- The root element (`<html>`);
- `position: relative` or `absolute` with a `z-index` value other than `auto`;
- `position: fixed` or `sticky` (regardless of any `z-index` value);
- flex or grid items with a `z-index` value other than `auto`;
- `opacity` less than 1;
- `transform`, `scale`, `rotate`, `translate`, or `perspective` with a value other than `none`;
- `filter` or `backdrop-filter` with a value other than `none`;
- `clip-path`, `mask`, or `mask-image` with a value other than `none`;
- `mix-blend-mode` with a value other than `normal`;
- `isolation: isolate`;
- `contain: layout` or `contain: paint`;
- `container-type` with `size` or `inline-size`;
- `will-change` set to any property that would itself create a stacking context.

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

### The Box Model in Practice

Every element in CSS is rendered as a rectangular box composed of four concentric areas: content, padding, border, and margin.

```css
.card {
  width: 200px;
  padding: 16px;
  border: 2px solid #d1d5db;
  margin: 8px;
}
```

With the default `box-sizing: content-box`, the 200px width applies only to the content area. The element's total rendered width becomes `200 + 16*2 + 2*2 = 236px`, which is often surprising when fitting elements into a layout grid.

With `box-sizing: border-box`, the 200px width includes content, padding, and border. The content area shrinks to `200 - 16*2 - 2*2 = 164px`, but the total rendered width stays 200px -- making it predictable in layout calculations.

The universal reset `* { box-sizing: border-box; }` is common because it makes width declarations behave intuitively across all elements. Note that margin is never included in width calculations regardless of `box-sizing`.

### Stacking Contexts and Z-Index

The `z-index` property controls which elements appear on top when they overlap, but only within the same stacking context. A stacking context is an atomic unit: elements inside one context are painted as a group relative to elements outside it.

New stacking contexts are created by:

- The root element (`<html>`).
- A positioned element (`position` other than `static`) with a `z-index` value other than `auto`.
- Elements with `position: fixed` or `sticky` (regardless of `z-index`).
- Flex or grid items with a `z-index` value other than `auto`.
- Elements with `opacity` less than 1.
- Elements with `transform`, `scale`, `rotate`, `translate`, or `perspective` set to a value other than `none`.
- Elements with `filter`, `backdrop-filter`, `clip-path`, `mask`, or `mask-image` set to a value other than `none`.
- Elements with `mix-blend-mode` other than `normal`.
- Elements with `isolation: isolate`.
- Elements with `contain: layout` or `contain: paint`.
- Elements with `container-type: size` or `inline-size`.
- Elements with `will-change` set to any property that itself creates a stacking context.

When `z-index` seems to have no effect, inspect the element's ancestors for these properties. A positioned child with `z-index: 999` has no effect if a grandparent with `transform: translateZ(0)` creates a stacking context that isolates it. The "999" value only determines stacking within that grandparent's context, not globally.

### Specificity Calculation

Specificity is a weight calculated from selector components. The browser assigns a four-part value (often represented as a-b-c-d or a tuple):

1. Inline styles (weight: 1-0-0-0)
2. ID selectors (weight: 0-1-0-0)
3. Class, attribute, and pseudo-class selectors (weight: 0-0-1-0)
4. Element and pseudo-element selectors (weight: 0-0-0-1)

Example specificity calculations:

```css
/* Specificity: 0-0-1-0 */
.button { color: blue; }

/* Specificity: 0-0-2-0 */
.button.primary { color: red; }

/* Specificity: 0-0-1-1 */
button.primary { color: green; }

/* Specificity: 0-1-0-0 */
#main { color: purple; }
```

The universal selector `*`, combinators (`>`, `+`, `~`), and `:where()` do not contribute to specificity. The pseudo-classes `:is()`, `:not()`, and `:has()` also do not contribute themselves, but the highest-specificity selector inside their parentheses is counted. When two selectors have equal specificity, the one declared later in the stylesheet wins.

Avoid over-nesting selectors like `body div.main div.card button.primary` -- they are fragile (a markup change breaks the selector) and their high specificity makes future overrides difficult. Prefer a flat class-based approach.
