# HTML Basics

## Core Idea

HTML defines the structure and meaning of web content.

Chinese notes:

- `semantic HTML`: 语义化 HTML.
- `element`: 元素.
- `attribute`: 属性.

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

Important details:

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

## Review Questions

### What is semantic HTML?

> Semantic HTML uses elements according to their meaning, such as `button` for actions and `nav` for navigation. It improves accessibility, SEO, and maintainability.

### Button vs anchor?

> Anchor is for navigation to another resource. Button is for actions on the current page.

### Why set image width and height?

> It helps the browser reserve layout space and reduce layout shift.

## Common Mistakes

- Using `div` for everything.
- Clickable divs without keyboard support.
- Missing form labels.
- Bad heading hierarchy.
- Missing alt text.
- Tables built with divs for real tabular data.

## Practice Task

Create an order detail HTML page with:

1. semantic layout;
2. accessible buttons;
3. order items table;
4. form labels;
5. meaningful image alt text.
