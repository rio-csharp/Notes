# HTML Basics

## Core Idea

HTML defines the structure and meaning of web content.

Good HTML improves accessibility, SEO, browser behavior, testing, and maintainability.

## Basic Document

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Order Management</title>
  </head>
  <body>
    <main>
      <h1>Orders</h1>
    </main>
  </body>
</html>
```

## Semantic Elements

Use semantic elements when possible:

- `header`
- `nav`
- `main`
- `section`
- `article`
- `aside`
- `footer`
- `button`
- `form`
- `label`
- `table`

Bad:

```html
<div onclick="save()">Save</div>
```

Better:

```html
<button type="button">Save</button>
```

## Complete Semantic Page Example

This example shows an order detail page using semantic HTML.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Order 1001 - Order Management</title>
  </head>
  <body>
    <header>
      <a href="/" aria-label="Order Management home">Order Management</a>

      <nav aria-label="Primary navigation">
        <ul>
          <li><a href="/orders">Orders</a></li>
          <li><a href="/customers">Customers</a></li>
          <li><a href="/reports">Reports</a></li>
        </ul>
      </nav>
    </header>

    <main>
      <article>
        <header>
          <p>Order</p>
          <h1>Order 1001</h1>
          <p>Status: <strong>Paid</strong></p>
        </header>

        <section aria-labelledby="customer-heading">
          <h2 id="customer-heading">Customer</h2>
          <address>
            Alice Chen<br />
            <a href="mailto:alice@example.com">alice@example.com</a>
          </address>
        </section>

        <section aria-labelledby="items-heading">
          <h2 id="items-heading">Items</h2>
          <table>
            <caption>
              Items included in order 1001
            </caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Quantity</th>
                <th scope="col">Unit price</th>
                <th scope="col">Line total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Keyboard</th>
                <td>2</td>
                <td>$50.00</td>
                <td>$100.00</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer>
          <a href="/orders">Back to orders</a>
          <button type="button">Refund order</button>
        </footer>
      </article>
    </main>

    <footer>
      <small>&copy; 2026 Order Management</small>
    </footer>
  </body>
</html>
```

In this page structure:

- `header`, `nav`, `main`, `article`, `section`, and `footer` describe page structure;
- `aria-label` names navigation regions when needed;
- `address` is used for contact information;
- table `caption` explains table purpose;
- row and column headers help assistive technologies understand the table;
- links navigate; buttons perform actions.

## Headings

Use headings to create document structure.

```html
<h1>Order Management</h1>
<h2>Pending Orders</h2>
<h3>Order Details</h3>
```

Avoid skipping levels for visual style. Use CSS for appearance.

## Images

```html
<img src="/product.jpg" alt="Black wireless keyboard" width="640" height="480" />
```

Good `alt` text describes the image meaning.

Decorative image:

```html
<img src="/divider.png" alt="" />
```

## Links vs Buttons

Use link for navigation:

```html
<a href="/orders/123">View order</a>
```

Use button for actions:

```html
<button type="submit">Save</button>
```

## Tables

Use tables for tabular data.

```html
<table>
  <thead>
    <tr>
      <th scope="col">Order ID</th>
      <th scope="col">Status</th>
      <th scope="col">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1001</td>
      <td>Paid</td>
      <td>$99.00</td>
    </tr>
  </tbody>
</table>
```

More accessible table:

```html
<table>
  <caption>
    Monthly sales summary
  </caption>
  <thead>
    <tr>
      <th scope="col">Month</th>
      <th scope="col">Order count</th>
      <th scope="col">Total sales</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">January</th>
      <td>128</td>
      <td>$42,500.00</td>
    </tr>
  </tbody>
</table>
```

Use `caption` when the table needs a clear title. Use `scope` so screen readers can connect cells to headers.

### The Browser's Handling of Semantic Elements

When the browser parses semantic HTML, it builds an accessibility tree in parallel with the DOM. This accessibility tree is what screen readers and other assistive technologies use to navigate the page. A `<button>` element, for instance, automatically communicates its role (`button`), its accessible name (derived from its text content), its state (enabled or disabled), and its keyboard interaction pattern (activated with Enter or Space). A `<div>` styled to look like a button communicates none of this without ARIA attributes.

The same principle applies to navigation landmarks. A `<nav>` element creates a navigation landmark in the accessibility tree, allowing screen reader users to jump directly to navigation regions. An unordered list (`<ul>`) inside the nav tells assistive technologies how many navigation items exist and their relative positions.

Search engines similarly benefit: a `<nav>` wrapping navigation links tells Google which links belong to site navigation rather than content, affecting how crawl budget is allocated. Heading hierarchy (`<h1>` through `<h6>`) creates a document outline that search engines use to understand content structure.

### Anchor vs Button: Keyboard Behavior Differences

An anchor element (`<a href="...">`) is designed for navigation to another resource. A `<button>` element is designed for actions on the current page. Their keyboard behavior reflects this distinction:

- An anchor with an `href` can be opened with Enter, but not with Space in most browsers.
- A `<button>` activates with both Enter and Space.
- Screen readers announce `<a>` as "link" and `<button>` as "button," giving users different expectations.
- A link without an `href` (e.g., `<a>` with only an `onclick`) is not keyboard-focusable and is not recognized as a link by assistive technologies.
- A `<button type="submit">` inside a form triggers form submission on Enter keypress anywhere in the form. A `<button type="button">` does not.

Choosing the wrong element therefore breaks keyboard behavior, confuses screen readers, and can cause unexpected form submissions. Using the correct element provides all the correct behaviors for free.

### Image Dimensions and Cumulative Layout Shift

Setting explicit `width` and `height` attributes on images allows the browser to calculate the image's aspect ratio before the image resource loads. This reserves the correct amount of vertical space during layout, preventing the page content from jumping downward when the image eventually arrives -- a phenomenon known as Cumulative Layout Shift (CLS).

Without dimensions:

```html
<img src="/hero.jpg" alt="Warehouse shelves" />
```

The browser does not know the image's intrinsic size until it finishes downloading and decoding the image file. Until then, the image occupies zero height. When it loads, all content below it shifts downward, causing CLS.

With dimensions:

```html
<img
  src="/hero.jpg"
  alt="Warehouse shelves"
  width="1200"
  height="600"
/>
```

The browser derives an aspect ratio from the width and height attributes (1200:600 = 2:1) and allocates space accordingly. Even if CSS overrides the rendered width, the aspect ratio from the HTML attributes continues to apply via the `aspect-ratio` CSS property that the browser sets implicitly from these attributes.

This technique is not limited to images. Embedded videos, iframes, and advertising slots benefit from the same approach: providing explicit dimensions lets the browser reserve space and avoid layout shifts during page load.
