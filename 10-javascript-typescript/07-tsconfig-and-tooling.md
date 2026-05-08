# TypeScript Config And Tooling

## Core Idea

`tsconfig.json` controls how TypeScript checks and compiles your project.

## Basic tsconfig

```json
{
  "compilerOptions": {
    "target": "ES2022",
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

### Strict Mode Configuration in Depth

Enabling `strict: true` in `tsconfig.json` activates a family of nine individual strictness flags. Understanding each flag helps when migrating an existing project to strict mode incrementally:

| Flag | Effect |
|------|--------|
| `strictNullChecks` | Makes `null` and `undefined` distinct types. Without it, `null` is assignable to any type, which is the source of most null-reference errors. |
| `noImplicitAny` | Reports an error when TypeScript cannot infer a type and falls back to `any`. This forces explicit annotations on function parameters and prevents accidental escape hatches. |
| `strictFunctionTypes` | Enables stricter checking of function parameter bivariance. Without it, a function accepting `Animal[]` could be passed where `Dog[]` is expected, which is unsound. |
| `strictPropertyInitialization` | Ensures all class properties are initialized in the constructor or via a default value. Prevents accessing uninitialized properties. |
| `strictBindCallApply` | Checks that arguments to `bind`, `call`, and `apply` match the function's parameter types. |
| `noImplicitThis` | Raises an error when `this` is implicitly typed as `any`. |
| `alwaysStrict` | Emits ECMAScript strict mode directives (`"use strict"`) in output files. |
| `useUnknownInCatchVariables` | Types catch clause variables as `unknown` instead of `any`, forcing explicit type handling. |
| `strictBuiltinIteratorReturn` | Ensures iterator return types from built-in iterables are properly typed. |

Beyond `strict`, additional flags provide further safety:

- `noUncheckedIndexedAccess`: Makes array element access and indexed property access return `T \| undefined` instead of `T`.
- `exactOptionalPropertyTypes`: Prevents assigning `undefined` to an optional property unless `undefined` is explicitly in the property's type.
- `noImplicitOverride`: Requires the `override` keyword when overriding a base class method. Catches accidental overrides when a base class adds a method with the same name.

### The Compile-Time Only Guarantee

TypeScript types exist only during compilation and are entirely erased before the code runs. This means no type checking occurs at runtime:

```ts
interface User {
  id: number;
  email: string;
}

async function loadUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json() as User;
}
```

The `as User` assertion tells TypeScript to trust the return type, but if the API returns `{ id: "abc", email: null }` (with wrong types), TypeScript will not catch it. The application receives an object that violates the `User` contract, potentially causing runtime errors when code expects `id` to be a number.

Runtime validation at trust boundaries -- API responses, local storage reads, URL/query parameter parsing, cross-origin messages -- is therefore necessary when the data source is untrusted or the contract is not enforced by a shared type system. Zod and other schema libraries provide type inference from runtime validators, ensuring a single source of truth:

```ts
const UserSchema = z.object({
  id: z.number(),
  email: z.string().email()
});

type User = z.infer<typeof UserSchema>; // inferred from schema

const parsed = UserSchema.parse(json); // throws if shape is wrong
```

### Path Alias Configuration and Pitfalls

Path aliases require synchronized configuration in two places:

1. `tsconfig.json` for the TypeScript compiler and editor integration:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

2. The bundler (Vite, webpack, or Next.js) for actual module resolution during builds:
```ts
// vite.config.ts
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
```

The most common failure mode is an alias mismatch: TypeScript resolves imports correctly in the editor, but the bundler cannot find the modules at build time. This produces "module not found" errors that only surface in CI. Using a shared alias configuration (e.g., reading from `tsconfig.json` paths into the bundler config) prevents this class of bug.

See Chapter 12, Section 01 (Frontend Project Structure) for a complete discussion of dependency direction, feature-based structure, and how path aliases integrate with a modular frontend architecture.
