# React Forms

## Core Idea

Forms collect user input and are central to business applications.

## Controlled Input

```tsx
function NameForm() {
  const [name, setName] = useState("");

  return (
    <input
      value={name}
      onChange={event => setName(event.target.value)}
    />
  );
}
```

## Uncontrolled Input

```tsx
function NameForm() {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    console.log(inputRef.current?.value);
  }

  return <input ref={inputRef} />;
}
```

## React Hook Form

```tsx
type CreateOrderForm = {
  customerId: number;
  notes?: string;
};

function CreateOrderPage() {
  const form = useForm<CreateOrderForm>();

  function onSubmit(values: CreateOrderForm) {
    console.log(values);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register("customerId", { valueAsNumber: true })} />
      <textarea {...form.register("notes")} />
      <button type="submit">Create</button>
    </form>
  );
}
```

## Zod Validation

```tsx
const schema = z.object({
  customerId: z.number().positive(),
  notes: z.string().max(500).optional()
});

type CreateOrderForm = z.infer<typeof schema>;
```

Complete React Hook Form + Zod example:

```tsx
const CreateOrderSchema = z.object({
  customerId: z.coerce.number().int().positive("Customer is required"),
  items: z.array(
    z.object({
      productId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1).max(100)
    })
  ).min(1, "At least one item is required"),
  notes: z.string().max(500).optional()
});

type CreateOrderForm = z.infer<typeof CreateOrderSchema>;
```

Form component:

```tsx
function CreateOrderPage() {
  const navigate = useNavigate();

  const form = useForm<CreateOrderForm>({
    resolver: zodResolver(CreateOrderSchema),
    defaultValues: {
      customerId: 0,
      items: [{ productId: 0, quantity: 1 }],
      notes: ""
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  async function onSubmit(values: CreateOrderForm) {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(values)
    });

    if (response.status === 400) {
      const problem = (await response.json()) as ValidationProblemDetails;
      applyServerErrors(problem, form.setError);
      return;
    }

    if (!response.ok) {
      form.setError("root", {
        message: "Could not create order. Please try again."
      });
      return;
    }

    const order = (await response.json()) as { id: number };
    navigate(`/orders/${order.id}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="customerId">Customer ID</label>
        <input
          id="customerId"
          type="number"
          {...form.register("customerId")}
          aria-invalid={Boolean(form.formState.errors.customerId)}
        />
        {form.formState.errors.customerId && (
          <p role="alert">{form.formState.errors.customerId.message}</p>
        )}
      </div>

      <fieldset>
        <legend>Items</legend>
        {fields.map((field, index) => (
          <div key={field.id}>
            <label htmlFor={`items.${index}.productId`}>Product ID</label>
            <input
              id={`items.${index}.productId`}
              type="number"
              {...form.register(`items.${index}.productId`)}
            />

            <label htmlFor={`items.${index}.quantity`}>Quantity</label>
            <input
              id={`items.${index}.quantity`}
              type="number"
              {...form.register(`items.${index}.quantity`)}
            />

            <button type="button" onClick={() => remove(index)}>
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append({ productId: 0, quantity: 1 })}
        >
          Add item
        </button>
      </fieldset>

      <div>
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" {...form.register("notes")} />
      </div>

      {form.formState.errors.root && (
        <p role="alert">{form.formState.errors.root.message}</p>
      )}

      <button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Creating..." : "Create order"}
      </button>
    </form>
  );
}
```

Required imports:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormSetError } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
```

## Form States

Handle:

- initial;
- dirty;
- submitting;
- success;
- validation error;
- server error.

## Server Errors

Backend validation may return:

```json
{
  "errors": {
    "email": ["Email already exists."]
  }
}
```

Map server errors to form fields.

Type and mapper:

```tsx
type ValidationProblemDetails = {
  title?: string;
  status?: number;
  errors?: Record<string, string[]>;
};

function applyServerErrors<T extends Record<string, unknown>>(
  problem: ValidationProblemDetails,
  setError: UseFormSetError<T>
) {
  for (const [field, messages] of Object.entries(problem.errors ?? {})) {
    setError(field as keyof T & string, {
      type: "server",
      message: messages[0] ?? "Invalid value"
    });
  }
}
```

If the backend returns field names in a different casing, map them explicitly:

```tsx
const serverToClientField: Record<string, keyof CreateOrderForm> = {
  CustomerId: "customerId",
  Notes: "notes"
};
```

## Controlled Form For Small Inputs

Controlled inputs are still useful for small interactive widgets:

```tsx
function OrderSearchBox({ onSearch }: { onSearch: (value: string) => void }) {
  const [query, setQuery] = useState("");

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSearch(query);
      }}
    >
      <label htmlFor="order-search">Search orders</label>
      <input
        id="order-search"
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
}
```

Use controlled state when immediate UI behavior depends on every keystroke — such as live search suggestions or inline validation. Use form libraries such as React Hook Form when forms grow beyond a few fields to avoid re-render overhead on every keystroke.

Controlled forms keep values in React state and re-render the component on every input change. Uncontrolled forms keep values in the DOM and access them through refs or form libraries, avoiding re-renders during input. Controlled forms are explicit and predictable but can cause unnecessary re-renders in large forms if not managed carefully. Uncontrolled approaches can perform better for large forms because React does not re-render on every keystroke, but they require a different mental model for validation and submission.

Client validation improves user experience by catching errors before a network round trip. Server validation is required for security and correctness — client validation is purely a convenience layer and must not be relied upon as a security measure.

React Hook Form reduces unnecessary re-renders by defaulting to uncontrolled inputs. It registers each input with a ref and only triggers re-renders at the form level when validation occurs or submission state changes. Combined with a schema library such as Zod, it provides declarative validation rules, field-level error messages, and integration with dynamic field arrays through `useFieldArray`.
