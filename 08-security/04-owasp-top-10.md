# OWASP Top 10

## Core Idea

OWASP Top 10 is a widely recognized list of critical web application security risks.

Chinese notes:

- `OWASP`: Open Worldwide Application Security Project.
- `broken access control`: 访问控制失效.
- `injection`: 注入攻击.
- `security misconfiguration`: 安全配置错误.

## Why It Matters

Full-stack engineers should understand common web risks and how to prevent them in both backend and frontend code.

Security is not only a security team responsibility. Developers make daily decisions that affect security.

This file follows the OWASP Top 10:2021 categories:

```text
A01 Broken Access Control
A02 Cryptographic Failures
A03 Injection
A04 Insecure Design
A05 Security Misconfiguration
A06 Vulnerable and Outdated Components
A07 Identification and Authentication Failures
A08 Software and Data Integrity Failures
A09 Security Logging and Monitoring Failures
A10 Server-Side Request Forgery
```

## 1. Broken Access Control

Problem:

Users can access data or actions they should not.

Example:

```http
GET /api/orders/123
```

User changes ID:

```http
GET /api/orders/124
```

If backend only checks authentication but not ownership/tenant/permission, this is broken access control.

Prevention:

- backend authorization;
- resource-level checks;
- tenant isolation;
- deny by default;
- audit sensitive actions.

ASP.NET Core resource check:

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct)
{
    var userId = User.FindFirst("sub")?.Value;
    var tenantId = User.FindFirst("tenant_id")?.Value;

    var order = await _dbContext.Orders
        .AsNoTracking()
        .Where(o => o.Id == id &&
            o.TenantId.ToString() == tenantId &&
            o.Customer.UserId == userId)
        .Select(o => new OrderDto(o.Id, o.Status.ToString(), o.Total))
        .SingleOrDefaultAsync(ct);

    return order is null ? NotFound() : Ok(order);
}
```

Do not query by `Id` first and then forget ownership or tenant checks.

## 2. Cryptographic Failures

Problem:

Sensitive data is not protected correctly.

Examples:

- plaintext passwords;
- weak hashing;
- no TLS;
- secrets in source code;
- sensitive data in logs.

Prevention:

- HTTPS;
- strong password hashing;
- key management;
- secret rotation;
- encryption at rest where needed.

Bad:

```csharp
var passwordHash = SHA256.HashData(Encoding.UTF8.GetBytes(password));
```

Better:

```csharp
var hash = _passwordHasher.HashPassword(user, password);
```

Use established password hashing libraries and store secrets in a secret manager, not source code.

## 3. Injection

Examples:

- SQL injection;
- command injection;
- LDAP injection;
- NoSQL injection.

Prevention:

- parameterized queries;
- input validation;
- avoid shell command construction;
- least privilege.

Bad SQL:

```csharp
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
```

Good EF Core query:

```csharp
var user = await _dbContext.Users
    .SingleOrDefaultAsync(u => u.Email == email, ct);
```

## 4. Insecure Design

Problem:

The system is designed without considering abuse cases.

Examples:

- no rate limit on login;
- no idempotency for payment;
- no approval workflow for sensitive action.

Prevention:

- threat modeling;
- abuse case review;
- secure design patterns.

Design checklist:

```text
Can this action be retried safely?
Can a user access another tenant's data?
What happens if a payment callback arrives twice?
Is there a rate limit for this workflow?
What audit trail exists for sensitive changes?
```

## 5. Security Misconfiguration

Examples:

- default credentials;
- verbose errors in production;
- public cloud storage;
- overly permissive CORS;
- missing security headers.

Safer CORS example:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("https://app.example.com")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
```

Avoid:

```csharp
policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
```

Especially do not combine arbitrary origins with credentials.

## 6. Vulnerable Components

Problem:

Using dependencies with known vulnerabilities.

Prevention:

- dependency scanning;
- package updates;
- remove unused packages;
- review transitive dependencies.

.NET commands:

```bash
dotnet list package --vulnerable
dotnet list package --outdated
```

## 7. Identification And Authentication Failures

Examples:

- weak password policy;
- no MFA for admin;
- long-lived tokens;
- poor session management.

Protections:

- secure password hashing;
- login rate limiting;
- account lockout;
- refresh token rotation;
- MFA for privileged users;
- generic login errors.

## 8. Software And Data Integrity Failures

Examples:

- untrusted CI/CD artifacts;
- no package integrity checks;
- insecure deserialization;
- unverified updates.

Practical controls:

- protected branches;
- required reviews;
- signed build artifacts where appropriate;
- dependency lock files;
- restricted deployment credentials;
- avoid deserializing untrusted polymorphic data.

## 9. Logging And Monitoring Failures

Problem:

Security events are not logged or monitored.

Examples:

- no login failure monitoring;
- no alert on privilege changes;
- no audit trail for admin actions.

Security log example:

```csharp
_logger.LogWarning(
    "Permission changed. Actor={ActorUserId} Target={TargetUserId} Permission={Permission}",
    actorUserId,
    targetUserId,
    permission);
```

Do not log secrets, raw tokens, or passwords.

## 10. SSRF

Server-Side Request Forgery tricks a server into making requests to unintended internal/external resources.

Prevention:

- URL allowlist;
- block private IP ranges;
- disable unnecessary redirects;
- network egress controls.

Risky:

```csharp
var response = await _httpClient.GetAsync(request.Url, ct);
```

Safer pattern:

```csharp
var allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "api.github.com",
    "hooks.stripe.com"
};

var uri = new Uri(request.Url);

if (!allowedHosts.Contains(uri.Host))
{
    throw new ValidationException("URL host is not allowed.");
}

var response = await _httpClient.GetAsync(uri, ct);
```

Allowlisting is usually safer than trying to block every dangerous destination.

## Review Questions

### Which OWASP risk do you see most often in business apps?

> Broken access control is very common. Many apps check whether a user is logged in but forget to check whether the user can access that specific tenant, order, or resource.

### How do you prevent broken access control?

> Enforce authorization on the backend, use resource-level checks, validate tenant ownership, deny by default, and add tests for unauthorized and forbidden scenarios.

## Common Mistakes

- Relying on frontend permission checks.
- Overly broad CORS.
- Logging tokens or passwords.
- No rate limit on login.
- Public file storage by accident.
- Missing dependency scanning.

## Practice Task

Review an order management API and identify one risk from each category:

1. access control;
2. injection;
3. misconfiguration;
4. authentication failure;
5. logging/monitoring failure.
