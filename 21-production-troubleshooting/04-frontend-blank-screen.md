# Troubleshooting Frontend Blank Screen

## Core Idea

A blank screen usually means the browser could not load, execute, or render the JavaScript application.

Chinese notes:

- `blank screen`: 白屏.
- `chunk load error`: 分包加载错误.
- `source map`: 源码映射.
- `runtime error`: 运行时错误.
- `cache header`: 缓存头.

Frontend production issues need browser evidence. Backend logs may look clean even when every user sees a blank page.

## First Checks

Open browser DevTools and check:

```text
Console:
  JavaScript runtime errors
  chunk load errors
  CSP errors
  failed module imports

Network:
  index.html status
  JavaScript chunk status
  CSS status
  API status
  redirect loops
  cache headers

Application:
  localStorage/sessionStorage
  cookies
  service worker
```

Also check:

- release version;
- CDN deployment time;
- browser version;
- affected users;
- affected route;
- auth state;
- frontend error tracking.

## Common Causes

Common blank screen causes:

- JavaScript runtime error during startup;
- missing environment variable;
- chunk load error after deployment;
- CDN serving old `index.html`;
- old service worker serving old assets;
- incompatible browser syntax;
- failed root API call;
- auth redirect loop;
- Content Security Policy blocking scripts;
- wrong base path;
- missing static files;
- unhandled promise rejection;
- React error outside an error boundary.

## Startup Runtime Error

Example:

```tsx
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export async function loadCurrentUser() {
  const response = await fetch(`${apiBaseUrl}/api/me`);
  return response.json();
}
```

If `VITE_API_BASE_URL` is missing, the browser may request:

```text
undefined/api/me
```

Better config validation:

```ts
type AppConfig = {
  apiBaseUrl: string;
  authority: string;
};

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required frontend config: ${name}`);
  }

  return value;
}

export const appConfig: AppConfig = {
  apiBaseUrl: requiredEnv("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  authority: requiredEnv("VITE_AUTHORITY", import.meta.env.VITE_AUTHORITY),
};
```

This fails loudly with a useful message instead of producing strange URLs.

Important:

> Frontend environment variables are bundled into JavaScript at build time. They are not secrets.

## React Error Boundary

An error boundary prevents a component crash from turning the whole app into a blank page.

```tsx
import React from "react";

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main>
          <h1>Something went wrong.</h1>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
```

Use it near the app root:

```tsx
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
```

Error boundaries catch render errors, not every async error.

## Chunk Load Error

Scenario:

```text
1. User opens app and receives old index.html.
2. New deployment replaces hashed JS chunk files.
3. User navigates to a lazy-loaded route.
4. Browser requests old chunk filename.
5. Server/CDN returns 404.
6. App fails to load route.
```

Typical console error:

```text
Failed to fetch dynamically imported module
ChunkLoadError: Loading chunk failed
```

Prevention:

- do not long-cache `index.html`;
- long-cache hashed assets;
- keep old assets briefly after deployment;
- deploy static assets before switching `index.html`;
- add chunk error recovery.

## Cache Headers For SPA

Good pattern:

```text
index.html
  Cache-Control: no-cache

/assets/app.8f3a1c.js
  Cache-Control: public, max-age=31536000, immutable
```

Nginx example:

```nginx
location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
    try_files $uri /index.html;
    add_header Cache-Control "no-cache";
}
```

The HTML should be revalidated often because it points to the current asset filenames.

Hashed assets can be cached for a long time because their file name changes when content changes.

## Chunk Error Recovery

For dynamic imports, one practical mitigation is to reload once when a chunk fails.

```ts
const chunkReloadKey = "app:chunk-reload-attempted";

export function handleChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  const looksLikeChunkError =
    message.includes("ChunkLoadError") ||
    message.includes("dynamically imported module") ||
    message.includes("Loading chunk");

  if (!looksLikeChunkError) {
    throw error;
  }

  const alreadyReloaded = sessionStorage.getItem(chunkReloadKey) === "true";

  if (alreadyReloaded) {
    throw error;
  }

  sessionStorage.setItem(chunkReloadKey, "true");
  window.location.reload();
}
```

Usage with lazy route:

```tsx
const OrdersPage = lazy(() =>
  import("./OrdersPage").catch((error) => {
    handleChunkLoadError(error);
    throw error;
  })
);
```

Do not reload forever. A one-time reload avoids infinite refresh loops.

## Auth Redirect Loop

Symptoms:

- page keeps redirecting;
- network tab shows repeated `/login`, `/callback`, `/authorize`;
- cookies or tokens are not stored;
- URL changes rapidly;
- backend may show many auth requests.

Common causes:

- wrong redirect URI;
- cookie `SameSite` or `Secure` issue;
- frontend and API disagree on environment URLs;
- clock skew;
- token storage issue;
- user lacks required permission and app redirects incorrectly.

Debug checklist:

```text
Check redirect URI in identity provider.
Check browser cookies.
Check SameSite/Secure settings.
Check frontend authority/client ID.
Check API CORS and auth configuration.
Check whether 401 and 403 are handled differently.
```

Frontend should not redirect to login for every `403`. `403` often means authenticated but not allowed.

## Failed Root API Call

Some apps block rendering until `/api/me` or `/api/config` succeeds.

Risky:

```tsx
function App() {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
  });

  return <Dashboard user={user!} />;
}
```

If `user` is undefined during loading or error, this can crash.

Better:

```tsx
function App() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: 1,
  });

  if (query.isLoading) {
    return <FullPageSpinner />;
  }

  if (query.isError) {
    return <StartupError onRetry={() => query.refetch()} />;
  }

  return <Dashboard user={query.data} />;
}
```

Startup dependencies should have explicit loading and error states.

## CSP Blocking Scripts

Content Security Policy can block scripts, styles, images, or API calls.

Console example:

```text
Refused to load the script because it violates the following Content Security Policy directive...
```

Check:

- script source;
- style source;
- API `connect-src`;
- image domains;
- inline script restrictions;
- nonce/hash setup.

Example:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self' https://api.example.com;
  img-src 'self' data: https:;
  object-src 'none';
```

CSP is valuable, but a bad policy can break production.

## Service Worker Cache Issues

If the app uses a service worker, it may serve stale assets.

Check DevTools:

```text
Application
  -> Service Workers
  -> Cache Storage
```

Symptoms:

- only returning users are affected;
- hard refresh helps;
- incognito works;
- old assets appear after deployment.

Mitigation:

- update service worker strategy;
- show "new version available" prompt;
- clear bad service worker registration if needed;
- avoid caching `index.html` too aggressively.

## Source Maps And Error Tracking

Source maps map minified production stack traces back to original source.

Tools:

- Sentry;
- Application Insights JavaScript SDK;
- Datadog RUM;
- browser console with uploaded source maps.

Minimal error capture:

```ts
window.addEventListener("error", (event) => {
  console.error("Global error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", {
    reason: event.reason,
  });
});
```

In real production, send these to an error tracking service with release version and user/session context.

Be careful not to send secrets or personal data unnecessarily.

## Browser Compatibility

Symptoms:

- only older browsers fail;
- console shows syntax errors;
- modern browsers work;
- deployment changed build target or dependency.

Example error:

```text
Unexpected token '?'
```

This may indicate optional chaining or another syntax feature was not transpiled for the target browser.

Check:

- browserslist;
- Vite/build target;
- dependency transpilation;
- polyfills;
- actual user browser versions.

## SPA Base Path Problems

If the app is hosted under `/app/`, asset paths and router base must match.

Vite:

```ts
export default defineConfig({
  base: "/app/",
});
```

React Router:

```tsx
createBrowserRouter(routes, {
  basename: "/app",
});
```

Wrong base path can cause assets or routes to 404.

## Investigation Checklist

```text
1. Reproduce with affected browser/user/route if possible.
2. Check console errors.
3. Check network failures for index, JS, CSS, API, auth redirects.
4. Check deployment version and CDN cache.
5. Check chunk load errors and cache headers.
6. Check environment configuration.
7. Check service worker and local storage.
8. Check source maps/error tracking.
9. Mitigate with rollback, cache purge, config fix, or one-time reload.
10. Add prevention tests/alerts.
```

## Mitigation Options

Depending on cause:

- rollback frontend deployment;
- purge CDN cache;
- restore missing assets;
- fix environment variables and rebuild;
- disable bad feature flag;
- clear or update service worker;
- adjust CSP;
- keep old chunks longer;
- add startup error UI;
- add error boundary.

## Knowledge Checks

### Why can a frontend blank screen have no backend errors?

Because the failure may happen before API calls are made, such as JavaScript parse errors, missing chunks, CSP blocks, service worker cache issues, or runtime render crashes.

### What causes chunk load errors after deployment?

The browser may hold an old `index.html` that references old chunk filenames, while the server now only has new chunk files. When the user navigates to a lazy-loaded route, the old chunk request returns 404.

### Why should `index.html` and hashed assets have different cache headers?

`index.html` should be revalidated because it points to the current asset files. Hashed assets can be cached for a long time because their filenames change when content changes.

### Why are source maps useful?

They map minified stack traces back to original source code, making production frontend errors much easier to debug.

## Common Mistakes

- Checking only backend logs.
- No frontend error tracking.
- No source maps or release mapping.
- Bad cache headers.
- No chunk load recovery.
- Environment config different between build and runtime.
- No error boundary.
- Treating every auth error as "redirect to login".
- Caching `index.html` too aggressively.
- Ignoring service worker behavior.

## Practice Task

Given this report:

```text
Users see a blank page after the latest frontend deployment.
Hard refresh fixes it for some users.
Console shows "Failed to fetch dynamically imported module".
Network tab shows 404 for /assets/OrdersPage.oldhash.js.
```

Write:

```text
Most likely cause:
Evidence:
Immediate mitigation:
Cache header fix:
Deployment process improvement:
Code-level recovery:
```
