# Forms And Accessibility

## Core Idea

Forms are one of the most important parts of business applications. Accessibility ensures people can use the application with keyboard, screen readers, and assistive technologies.

Chinese notes:

- `accessibility`: 可访问性.
- `screen reader`: 屏幕阅读器.
- `label`: 标签.
- `focus`: 焦点.

## Label

Bad:

```html
<input type="email" placeholder="Email" />
```

Better:

```html
<label for="email">Email</label>
<input id="email" name="email" type="email" />
```

Placeholders are not labels.

## Validation Message

```html
<label for="email">Email</label>
<input
  id="email"
  name="email"
  type="email"
  aria-invalid="true"
  aria-describedby="email-error"
/>
<p id="email-error">Email is required.</p>
```

`aria-describedby` connects input to help/error text.

Complete field example:

```html
<div class="field">
  <label for="quantity">Quantity</label>
  <input
    id="quantity"
    name="quantity"
    type="number"
    min="1"
    max="100"
    value="1"
    aria-describedby="quantity-help"
  />
  <p id="quantity-help">Enter a value between 1 and 100.</p>
</div>
```

Invalid state:

```html
<div class="field">
  <label for="quantity">Quantity</label>
  <input
    id="quantity"
    name="quantity"
    type="number"
    min="1"
    max="100"
    value="0"
    aria-invalid="true"
    aria-describedby="quantity-error"
  />
  <p id="quantity-error" role="alert">Quantity must be at least 1.</p>
</div>
```

## Fieldset And Legend

Use for grouped controls.

```html
<fieldset>
  <legend>Notification channels</legend>

  <label>
    <input type="checkbox" name="channels" value="email" />
    Email
  </label>

  <label>
    <input type="checkbox" name="channels" value="sms" />
    SMS
  </label>
</fieldset>
```

## Keyboard Navigation

Users should be able to:

- tab through interactive controls;
- see visible focus;
- activate buttons with keyboard;
- close modals with Escape;
- avoid keyboard traps.

Do not remove focus outline without replacing it.

## ARIA

ARIA can help when native HTML is not enough.

But first rule:

> Use native HTML elements whenever possible.

Bad:

```html
<div role="button" tabindex="0">Save</div>
```

Better:

```html
<button type="button">Save</button>
```

## Modal Accessibility

A modal should:

- move focus into modal when opened;
- trap focus inside modal;
- close with Escape;
- restore focus when closed;
- have accessible title.

Accessible dialog markup:

```html
<button type="button" id="open-confirmation">Submit order</button>

<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="confirmation-title"
  aria-describedby="confirmation-description"
  hidden
>
  <h2 id="confirmation-title">Submit order?</h2>
  <p id="confirmation-description">
    This will send the order for payment processing.
  </p>

  <button type="button">Cancel</button>
  <button type="button">Confirm</button>
</div>
```

Minimal focus handling:

```js
const openButton = document.querySelector("#open-confirmation");
const dialog = document.querySelector("[role='dialog']");
const cancelButton = dialog.querySelector("button");

openButton.addEventListener("click", () => {
  dialog.hidden = false;
  cancelButton.focus();
});

dialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    dialog.hidden = true;
    openButton.focus();
  }
});
```

Production modals should also trap focus inside the dialog while open.

## Complete Form Example

```html
<form action="/orders" method="post" novalidate>
  <h1>Create order</h1>

  <div class="field">
    <label for="customer-email">Customer email</label>
    <input
      id="customer-email"
      name="customerEmail"
      type="email"
      autocomplete="email"
      required
      aria-describedby="customer-email-help"
    />
    <p id="customer-email-help">We will send the receipt to this address.</p>
  </div>

  <fieldset>
    <legend>Shipping speed</legend>

    <label>
      <input type="radio" name="shippingSpeed" value="standard" checked />
      Standard
    </label>

    <label>
      <input type="radio" name="shippingSpeed" value="express" />
      Express
    </label>
  </fieldset>

  <div class="field">
    <label for="notes">Order notes</label>
    <textarea id="notes" name="notes" rows="4"></textarea>
  </div>

  <button type="submit">Create order</button>
</form>
```

Why this works well:

- every input has a label;
- related radio buttons are grouped by `fieldset`;
- help text is connected with `aria-describedby`;
- native controls provide keyboard behavior;
- submit uses a real button.

## Review Questions

### Why is label important?

> Labels help users understand inputs and allow screen readers to announce the field correctly. They also improve click target behavior.

### What is ARIA?

> ARIA provides attributes to describe roles, states, and relationships for assistive technologies. It should complement semantic HTML, not replace it.

### How do you make a modal accessible?

> Manage focus, provide title/description, trap focus while open, close with Escape, and restore focus after closing.

## Common Mistakes

- Placeholder used as label.
- No visible focus state.
- Divs used as buttons.
- Icon buttons without accessible names.
- Error messages not connected to inputs.
- Modal focus not managed.

## Practice Task

Build a create-order form with:

1. labels;
2. validation errors;
3. keyboard navigation;
4. accessible submit button;
5. accessible modal confirmation.
