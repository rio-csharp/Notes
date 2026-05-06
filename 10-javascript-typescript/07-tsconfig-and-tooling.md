# TypeScript Config And Tooling

## Core Idea

`tsconfig.json` controls how TypeScript checks and compiles your project.

## Basic tsconfig

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

## strict

`strict: true` enables stricter type checking.

Important checks:

- `strictNullChecks`;
- `noImplicitAny`;
- `strictFunctionTypes`;
- `strictPropertyInitialization`.

Use strict mode for serious applications.

Common strictness options:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

Why useful:

- `noUncheckedIndexedAccess` makes array/object lookup return possibly `undefined`;
- `exactOptionalPropertyTypes` makes optional properties behave more precisely;
- `noImplicitOverride` catches accidental method overrides in class-based code.

Example:

```ts
const items = ["a", "b"];
const first = items[0]; // string | undefined with noUncheckedIndexedAccess
```

## Path Alias

```ts
import { Button } from "@/shared/components/Button";
```

This avoids fragile relative imports:

```ts
import { Button } from "../../../shared/components/Button";
```

## Declaration Files

Declaration files end with:

```text
.d.ts
```

They describe types for JavaScript libraries or global values.

Example:

```ts
declare global {
  interface Window {
    appConfig: {
      apiBaseUrl: string;
    };
  }
}
```

## Runtime Validation

TypeScript does not validate runtime API data.

Use runtime schema libraries when needed:

- Zod;
- Yup;
- Valibot.

Example:

```ts
const UserSchema = z.object({
  id: z.number(),
  email: z.string().email()
});
```

Complete example:

```ts
import { z } from "zod";

const OrderSchema = z.object({
  id: z.number(),
  status: z.enum(["Draft", "Submitted", "Paid", "Cancelled"]),
  total: z.number(),
  createdAt: z.string()
});

type Order = z.infer<typeof OrderSchema>;

export async function fetchOrder(id: number): Promise<Order> {
  const response = await fetch(`/api/orders/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to load order: ${response.status}`);
  }

  const json: unknown = await response.json();
  return OrderSchema.parse(json);
}
```

Use runtime validation at boundaries:

- API responses;
- local storage data;
- URL/query parameters;
- messages from other windows/workers;
- third-party library callbacks.

## Tooling

Common tools:

- Vite;
- ESLint;
- Prettier;
- Vitest;
- React Testing Library;
- Playwright.

Example package scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest"
  }
}
```

ESLint flat config sketch:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true
      }
    }
  }
);
```

Vite alias must match TypeScript alias:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
```

If `tsconfig` and bundler aliases differ, the editor may compile while the app fails at runtime.

## Build vs Typecheck

`tsc --noEmit` checks types without producing JavaScript.

```bash
npm run typecheck
```

Use it in CI so type errors do not reach production builds.

### What does strict mode do?

> Strict mode enables stronger type checks and helps catch null, implicit any, and unsafe typing issues earlier.

### Does TypeScript guarantee API data shape at runtime?

> No. TypeScript types are compile-time only. Runtime data from APIs should be validated if it is untrusted or critical.

### Why use path aliases?

> They make imports cleaner and reduce brittle deep relative paths.

## Practice Task

Configure:

1. strict TypeScript;
2. path alias;
3. ESLint;
4. Prettier;
5. Zod validation for one API response.
