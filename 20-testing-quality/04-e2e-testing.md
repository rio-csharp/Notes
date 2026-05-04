# E2E Testing

## Core Idea

End-to-end tests verify complete user workflows in a real or realistic browser environment.

Chinese notes:

- `E2E`: end-to-end, 端到端.
- `flaky test`: 不稳定测试.
- `test data`: 测试数据.
- `selector`: 选择器.
- `trace`: 测试执行轨迹.

E2E tests are expensive, so they should protect the most important workflows.

## What E2E Tests Are Good For

Use E2E tests for:

- login;
- checkout;
- create/approve workflow;
- file upload;
- report export;
- permission-denied flow;
- critical navigation;
- frontend/backend contract confidence;
- browser-specific behavior.

Do not use E2E tests for every small business rule. Smaller tests are cheaper and easier to debug.

## Playwright Setup

Install:

```powershell
npm init playwright@latest
```

Example config:

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
```

## Basic Playwright Test

```ts
import { expect, test } from "@playwright/test";

test("user can create an order", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await page.getByRole("button", { name: "Create order" }).click();
  await page.getByLabel("Customer").fill("Acme");
  await page.getByLabel("SKU").fill("SKU-1");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Order created")).toBeVisible();
});
```

Notice that this test uses visible labels and roles. That makes the test closer to real user behavior.

## Use Page Objects Carefully

Page objects can reduce duplication, but they can also hide too much.

Good page object:

```ts
import { expect, Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Log in" }).click();
  }

  async expectLoggedIn() {
    await expect(this.page.getByRole("navigation")).toBeVisible();
  }
}
```

Test:

```ts
test("admin can log in", async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login("admin@example.com", "Password123!");
  await loginPage.expectLoggedIn();
});
```

Keep assertions visible in tests when they explain the workflow.

## Test Data Strategy

E2E tests need controlled data.

Options:

- seed database before test run;
- create data through API;
- use an isolated test tenant;
- reset database snapshot;
- cleanup after test;
- generate unique values per test.

Example unique email:

```ts
function uniqueEmail(prefix = "user") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}
```

Creating data through API:

```ts
test.beforeEach(async ({ request }) => {
  await request.post("/api/test-data/customers", {
    data: {
      id: "customer-e2e-1",
      name: "E2E Customer",
    },
  });
});
```

Test-only endpoints must not be enabled in production.

ASP.NET Core guard:

```csharp
if (app.Environment.IsEnvironment("E2E"))
{
    app.MapPost("/api/test-data/customers", async (
        AppDbContext db,
        CreateTestCustomerRequest request,
        CancellationToken ct) =>
    {
        db.Customers.Add(new Customer
        {
            Id = request.Id,
            Name = request.Name
        });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    });
}
```

## Authentication Strategy

Full UI login is valuable for one or two tests.

For most E2E tests, reuse authenticated state.

Setup test:

```ts
// e2e/auth.setup.ts
import { test as setup, expect } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.context().storageState({ path: "playwright/.auth/admin.json" });
});
```

Use stored state:

```ts
// playwright.config.ts
{
  name: "authenticated",
  use: {
    storageState: "playwright/.auth/admin.json",
  },
  dependencies: ["setup"],
}
```

This keeps E2E tests faster and less repetitive.

## Avoid Fixed Sleeps

Bad:

```ts
await page.waitForTimeout(3000);
await expect(page.getByText("Order created")).toBeVisible();
```

Better:

```ts
await expect(page.getByText("Order created")).toBeVisible();
```

Playwright auto-waits for many actions and assertions.

Use explicit waits for meaningful conditions:

```ts
await page.waitForResponse((response) =>
  response.url().includes("/api/orders") && response.status() === 201
);
```

## Stable Selectors

Prefer user-facing selectors:

```ts
await page.getByRole("button", { name: "Save" }).click();
await page.getByLabel("Customer").fill("Acme");
```

Use `data-testid` when there is no stable accessible name:

```tsx
<div data-testid="order-status-badge">{status}</div>
```

```ts
await expect(page.getByTestId("order-status-badge")).toHaveText("Approved");
```

Do not select by generated CSS classes.

## Testing File Upload

```ts
test("user can upload invoice PDF", async ({ page }) => {
  await page.goto("/invoices/new");

  await page.getByLabel("Invoice file").setInputFiles("e2e/fixtures/invoice.pdf");
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page.getByText("Upload complete")).toBeVisible();
});
```

Keep fixture files small and safe.

## Testing Download

```ts
test("user can download report", async ({ page }) => {
  await page.goto("/reports");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain(".csv");
});
```

## Handling External Services

Avoid depending on real third-party systems in normal E2E tests.

Options:

- use sandbox APIs;
- stub provider callbacks;
- use local fake services;
- simulate webhooks through test-only endpoints;
- verify that your app sends the expected request in integration tests.

Payment callback simulation example:

```ts
await request.post("/api/test-data/payment-callbacks", {
  data: {
    orderId: "order-e2e-1",
    status: "Succeeded",
  },
});
```

## Debugging Failed E2E Tests

Useful commands:

```powershell
npx playwright test --headed
npx playwright test --debug
npx playwright show-report
npx playwright show-trace trace.zip
```

Look at:

- screenshot;
- video;
- trace;
- network requests;
- console errors;
- server logs;
- test data state.

## Flakiness Causes

Common causes:

- fixed sleeps;
- shared mutable data;
- test order dependency;
- animations or transitions;
- unstable selectors;
- external services;
- parallel tests using same account/data;
- cleanup race conditions;
- slow CI environment.

Better practices:

- unique test data;
- isolated tenants;
- auto-waiting assertions;
- stable accessible selectors;
- trace on retry;
- small number of high-value flows.

## Knowledge Checks

### What belongs in E2E tests?

Critical user journeys that need confidence across browser, frontend, backend, API contracts, authentication, and persistence.

### Why not test everything with E2E?

E2E tests are slower, more expensive, and more fragile than lower-level tests. Most business rules are better tested with unit or integration tests.

### Why are fixed sleeps harmful?

They make tests slower and still do not guarantee readiness. Waiting for a real UI condition or network response is more reliable.

### Why is test data strategy important?

Without isolated data, tests can become order-dependent, flaky, or unsafe. Controlled data makes failures easier to understand.

## Common Mistakes

- Too many E2E tests.
- Fixed sleep waits.
- Shared mutable test data.
- No cleanup or reset plan.
- Testing third-party systems directly.
- Flaky selectors.
- Running all tests through UI login.
- Test-only endpoints accidentally enabled in production.
- No screenshots, traces, or videos for failed CI tests.

## Practice Task

Create E2E tests for:

1. login.
2. create order.
3. approve order.
4. permission denied page.
5. file upload.
6. report download.
7. payment callback simulation.

For each test, write:

```text
How is test data created?
How is authentication handled?
What user-visible result proves success?
What could make the test flaky?
```
