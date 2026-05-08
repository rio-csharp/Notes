# Forms And Accessibility

## Core Idea

Forms are one of the most important parts of business applications. Accessibility ensures people can use the application with keyboard, screen readers, and assistive technologies.

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

ARIA can help when native HTML is not enough. Prefer native HTML elements whenever possible. Use ARIA only when the semantics cannot be expressed with HTML alone.

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

This form demonstrates several accessibility practices: every input has a label, related radio buttons are grouped by `fieldset`, help text is connected with `aria-describedby`, native controls provide keyboard behavior, and the submit action uses a `<button>` element. The `novalidate` attribute on the form disables the browser's built-in validation UI, which would conflict with the custom accessible validation pattern using `aria-invalid` and `aria-describedby` shown earlier.

### How Labels Connect to Inputs

When a `<label>` element is associated with an input via the `for` attribute (matching the input's `id`), or when the input is nested inside the `<label>`, the browser creates an accessibility relationship between them. Screen readers announce the label text when the input receives focus. The label also acts as an expanded click target: clicking the label focuses or activates the associated input, which is especially useful for small controls such as checkboxes and radio buttons.

The `for`/`id` association is more robust than nesting because it works even when the label and input are not adjacent in the DOM. However, nesting is simpler and eliminates the risk of mismatched `id` values.

Placeholders are not substitutes for labels. A placeholder disappears when the user starts typing, leaving the user without a visible field reference. Placeholders also often fail contrast requirements and are not reliably exposed to assistive technologies.

### ARIA: When Native HTML Is Not Enough

The ARIA (Accessible Rich Internet Applications) specification provides attributes to describe roles, states, and properties when native HTML semantics are insufficient. Three principles govern ARIA usage:

1. **Do not use ARIA if a native element exists.** A `<button>` already provides `role="button"`, keyboard activation, and focus management. Replacing it with `<div role="button" tabindex="0">` duplicates native behavior with more fragility and less reliability.

2. **Do not override native semantics.** Adding `role="heading"` to a `<button>` tells assistive technologies it is a heading, not a button -- even though it still looks and behaves like a button visually.

3. **Incorrect ARIA is worse than no ARIA.** An erroneous `role`, missing required ARIA states, or inconsistent relationships (e.g., `aria-describedby` pointing to a non-existent ID) can confuse assistive technologies more than leaving the element unlabeled.

The `aria-describedby` attribute, shown in the validation examples above, connects an input to descriptive text without changing the visual presentation. `aria-invalid` communicates validation state to screen readers even when custom styling is applied. These attributes complement semantic HTML by adding relationships that HTML alone cannot express.

### Accessible Modal Implementation Details

An accessible modal dialog requires managing several interaction points that are often overlooked:

**Focus trapping:** While the modal is open, Tab and Shift+Tab must cycle through focusable elements inside the modal only. If focus leaves the modal, a screen reader user cannot navigate back without reloading the page. This is typically implemented by intercepting the `keydown` event on the modal container and redirecting Tab to the first or last focusable element.

**Focus restoration:** When the modal closes, focus must return to the element that triggered it -- usually a button. Without this, the user's point of regard jumps unpredictably, and screen reader users lose their context.

**Closing behavior:** The modal should close on Escape keypress, on clicking a close button (with a visible label or `aria-label`), and optionally on clicking the backdrop overlay. Closing must not leave focus in an undefined state.

**Accessible name:** The modal must have a title. With `aria-labelledby`, the title element's text becomes the modal's accessible name. With `aria-label`, the label text is used instead. Both approaches ensure screen readers announce the modal purpose when it opens.

The example earlier in this section demonstrates these patterns. A production implementation should also handle dynamic content injection, prevent background scroll while the modal is open, and test with actual screen reader software.
