# Security Knowledge Checks

Use these questions to check whether the security concepts are usable in real designs.

## 1. Authentication vs authorization?

Answer:

> Authentication verifies who the user is. Authorization decides what the authenticated user can do. For example, a user may be logged in but still not allowed to approve payments.

## 2. What is JWT?

Answer:

> JWT is a signed token format containing claims. It is commonly used as a bearer access token. The payload is encoded, not encrypted, so sensitive secrets should not be stored inside it. APIs must validate issuer, audience, lifetime, and signature.

## 3. Access token vs refresh token?

Answer:

> Access tokens are short-lived and used to call APIs. Refresh tokens are longer-lived and used to obtain new access tokens. Refresh tokens should be stored securely, revocable, rotated, and ideally stored hashed on the server.

## 4. OAuth 2.0 vs OpenID Connect?

Answer:

> OAuth 2.0 is mainly for delegated authorization. OpenID Connect adds authentication and identity on top of OAuth. OAuth provides access tokens; OIDC also provides ID tokens.

## 5. What is XSS?

Answer:

> Cross-site scripting happens when attacker-controlled JavaScript runs in a victim's browser. It can steal tokens, perform actions, or modify page content. Defenses include output encoding, avoiding dangerous HTML rendering, CSP, input validation, and secure token storage.

## 6. What is CSRF?

Answer:

> Cross-site request forgery tricks a user's browser into sending an authenticated request to another site. It is mainly a risk when authentication uses cookies. Defenses include SameSite cookies, anti-forgery tokens, checking origin/referer, and avoiding unsafe GET actions.

## 7. How do you prevent SQL injection?

Answer:

> Use parameterized queries or ORM-generated parameters, avoid string-concatenated SQL, validate input, and apply least privilege to database accounts.

Bad:

```csharp
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
```

Good:

```csharp
var user = await _dbContext.Users
    .FirstOrDefaultAsync(u => u.Email == email, ct);
```

## 8. Where should tokens be stored in frontend apps?

Answer:

> It depends on the threat model. HttpOnly Secure SameSite cookies reduce JavaScript token theft but require CSRF protection. Browser storage is easier for SPAs but more exposed to XSS. I avoid storing long-lived refresh tokens in localStorage.

Example cookie:

```csharp
Response.Cookies.Append("refreshToken", refreshToken, new CookieOptions
{
    HttpOnly = true,
    Secure = true,
    SameSite = SameSiteMode.Strict,
    Path = "/api/auth"
});
```

## 9. How do you design permission checks?

Answer:

> I enforce permissions on the backend. For simple cases, role-based authorization is enough. For complex systems, I use permission-based or resource-based authorization. Frontend permission checks are only for UX.

Resource check example:

```csharp
var canAccess = await _dbContext.Orders.AnyAsync(order =>
    order.Id == orderId &&
    order.TenantId == currentTenantId &&
    order.Customer.UserId == currentUserId,
    ct);
```

## 10. What is SSRF?

Answer:

> Server-side request forgery happens when an attacker makes the server send requests to internal or unintended resources. Defenses include URL allowlists, blocking private IP ranges, disabling redirects where needed, and careful validation for webhook or import features.

## 11. How should passwords be stored?

Answer:

> Store password hashes, not plaintext and not reversible encrypted passwords. Use established password hashing algorithms such as Argon2, BCrypt, or PBKDF2. In ASP.NET Core, prefer Identity's password hasher or a well-reviewed library.

Example:

```csharp
user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
```

## 12. How do you protect login from brute force?

Answer:

> Use rate limiting, account lockout, generic error messages, MFA for sensitive users, audit logs, and alerting for suspicious patterns.

Example response:

```http
429 Too Many Requests
Retry-After: 60
```

## 13. How do you handle secrets?

Answer:

> Do not commit secrets to source control. Use a secret manager or environment-specific secure configuration. Rotate secrets, restrict access, and avoid logging secrets.

Bad:

```json
{
  "ConnectionStrings": {
    "Default": "Server=prod;Password=PlainTextPassword"
  }
}
```

Better:

```text
Use Azure Key Vault, AWS Secrets Manager, GCP Secret Manager, Kubernetes secrets with external secret integration, or another controlled secret source.
```

## 14. How do you secure file upload?

Answer:

> Validate size, extension, content type, and file signature where possible. Use random storage keys, avoid path traversal, scan risky files, authorize downloads, and clean up abandoned uploads.

Safe storage key:

```csharp
var safeName = Path.GetFileName(file.FileName);
var storageKey = $"uploads/{Guid.NewGuid():N}{Path.GetExtension(safeName)}";
```

## Common Misconceptions

- "JWT is encrypted by default."
- "If the button is hidden, the user cannot do it."
- "We store passwords with SHA256 only."
- "CORS protects the API from all attacks."
- "HTTPS means the app is secure."
- "We trust user ID from request body."
