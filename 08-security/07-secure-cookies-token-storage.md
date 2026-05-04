# Secure Cookies And Token Storage

## Core Idea

Token storage is a security trade-off between usability, XSS risk, CSRF risk, and architecture style.

Chinese notes:

- `HttpOnly`: JavaScript 不能读取.
- `Secure`: 只通过 HTTPS 发送.
- `SameSite`: 控制跨站 Cookie 发送.
- `token storage`: Token 存储.

## Storage Options

### Memory

Pros:

- not persisted;
- harder to steal after refresh.

Cons:

- lost on page refresh;
- needs refresh strategy.

### localStorage

Pros:

- easy to use;
- survives refresh.

Cons:

- readable by JavaScript;
- vulnerable to XSS token theft.

### sessionStorage

Pros:

- cleared when tab closes.

Cons:

- still readable by JavaScript;
- vulnerable to XSS.

### HttpOnly Cookie

Pros:

- JavaScript cannot read it;
- good for refresh token storage.

Cons:

- browser sends automatically;
- CSRF must be considered.

## Cookie Flags

```http
Set-Cookie: refreshToken=abc; HttpOnly; Secure; SameSite=Strict; Path=/api/auth
```

Flags:

- `HttpOnly`: prevents JavaScript access.
- `Secure`: HTTPS only.
- `SameSite`: controls cross-site sending.
- `Path`: limits where cookie is sent.

ASP.NET Core cookie example:

```csharp
Response.Cookies.Append("refreshToken", refreshToken, new CookieOptions
{
    HttpOnly = true,
    Secure = true,
    SameSite = SameSiteMode.Strict,
    Path = "/api/auth",
    Expires = DateTimeOffset.UtcNow.AddDays(14)
});
```

Deleting the cookie on logout:

```csharp
Response.Cookies.Delete("refreshToken", new CookieOptions
{
    Secure = true,
    SameSite = SameSiteMode.Strict,
    Path = "/api/auth"
});
```

## Access Token Strategy

Common SPA strategy:

- short-lived access token in memory;
- refresh token in HttpOnly Secure SameSite cookie;
- refresh endpoint issues new access token;
- backend protects refresh endpoint from CSRF where needed.

Refresh endpoint sketch:

```csharp
[HttpPost("refresh")]
public async Task<ActionResult<TokenResponse>> Refresh(CancellationToken ct)
{
    if (!Request.Cookies.TryGetValue("refreshToken", out var refreshToken))
    {
        return Unauthorized();
    }

    var result = await _authService.RotateRefreshTokenAsync(refreshToken, ct);

    Response.Cookies.Append("refreshToken", result.RefreshToken, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth",
        Expires = result.RefreshTokenExpiresAt
    });

    return Ok(new TokenResponse(result.AccessToken, result.AccessTokenExpiresAt));
}
```

Response:

```csharp
public sealed record TokenResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt);
```

The access token can be kept in memory by the SPA. The refresh token stays in an HttpOnly cookie.

## BFF Pattern

BFF means Backend For Frontend（前端专用后端）.

In a BFF architecture:

```text
Browser
  -> same-site cookie
  -> BFF server
  -> access token stored server-side
  -> downstream API
```

Benefits:

- browser does not store access tokens;
- tokens are less exposed to XSS;
- cookie security can be centralized;
- frontend calls same-origin BFF endpoints.

Trade-offs:

- more backend infrastructure;
- BFF must handle session and CSRF correctly;
- scaling requires session storage or stateless ticket design.

## CSRF Token Example

If cookie authentication is used for state-changing requests, consider CSRF protection.

```csharp
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
});
```

Endpoint that issues token:

```csharp
app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery antiforgery) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { csrfToken = tokens.RequestToken });
});
```

Validation on sensitive endpoint:

```csharp
app.MapPost("/api/orders", async (
    HttpContext context,
    IAntiforgery antiforgery,
    CreateOrderRequest request,
    IOrderService orders,
    CancellationToken ct) =>
{
    await antiforgery.ValidateRequestAsync(context);
    var order = await orders.CreateAsync(request, ct);
    return Results.Created($"/api/orders/{order.Id}", order);
});
```

## XSS vs CSRF Trade-off

localStorage:

- more XSS risk.

Cookie:

- more CSRF consideration.

Engineering perspective:

> There is no perfect storage. The decision depends on threat model. I usually avoid long-lived tokens in localStorage and prefer short-lived access tokens plus secure refresh flow.

## Token Handling Rules

Avoid:

```text
GET /callback?access_token=...
```

Problems:

- URLs can appear in browser history;
- URLs may be logged by servers and proxies;
- URLs can leak through referrer headers.

Prefer:

- authorization code flow with PKCE;
- tokens in response body over HTTPS;
- refresh token in HttpOnly Secure cookie when appropriate;
- short access token lifetime;
- refresh token rotation and reuse detection.

## Review Questions

### Why is localStorage risky?

> Any successful XSS can read localStorage and steal tokens.

### Why use HttpOnly cookie?

> HttpOnly prevents JavaScript from reading the cookie, reducing token theft from XSS.

### Does SameSite solve all CSRF?

> It helps significantly, but the exact protection depends on SameSite mode, browser behavior, and application flow. Sensitive apps may still use CSRF tokens.

## Common Mistakes

- Long-lived access token in localStorage.
- Cookie without Secure.
- Cookie without HttpOnly for refresh token.
- No CSRF consideration for cookie auth.
- Token in URL.
- Logging Authorization header.

## Practice Task

Design auth storage for:

1. SPA with API;
2. admin app;
3. mobile app;
4. refresh token rotation;
5. logout and token revocation.
