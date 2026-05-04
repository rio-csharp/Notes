# OAuth 2.0 And OpenID Connect

## Core Idea

OAuth 2.0 is an authorization framework. It allows an application to access resources on behalf of a user or another application.

OpenID Connect (OIDC) is an identity layer built on top of OAuth 2.0. It adds authentication and user identity information.

Chinese notes:

- `OAuth 2.0`: 授权框架.
- `OpenID Connect`: 身份认证协议层.
- `authorization`: 授权.
- `authentication`: 认证.
- `identity provider`: 身份提供方.

## OAuth vs OIDC

OAuth 2.0 answers:

```text
Can this client access this resource?
```

OIDC answers:

```text
Who is this user?
```

OAuth gives access tokens.

OIDC adds ID tokens.

## Main Actors

- Resource Owner: usually the user.
- Client: the app requesting access.
- Authorization Server: issues tokens.
- Resource Server: API that validates tokens.

Example:

```text
User -> React App -> Auth0 / Azure AD / Keycloak -> ASP.NET Core API
```

## Token Types

### Access Token

Used to call APIs.

```http
Authorization: Bearer eyJ...
```

### ID Token

Used by the client to know who the user is.

Contains identity claims such as:

- `sub`;
- `email`;
- `name`;
- `preferred_username`.

Do not use ID token to call APIs.

### Refresh Token

Used to get new access tokens.

Must be protected carefully.

## Authorization Code Flow With PKCE

This is the recommended flow for browser-based applications and mobile apps.

Chinese note:

- `PKCE`: Proof Key for Code Exchange, 防止授权码被截获后滥用.

Flow:

```text
1. React app creates code verifier and code challenge.
2. User is redirected to identity provider.
3. User logs in.
4. Identity provider redirects back with authorization code.
5. React app exchanges code + verifier for tokens.
6. React app calls API using access token.
7. API validates token.
```

## Client Credentials Flow

Used for machine-to-machine communication.

Example:

```text
Background service -> Identity Provider -> Access Token -> Internal API
```

No user is involved.

## ASP.NET Core JWT Bearer Validation

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        options.Audience = "orders-api";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true
        };
    });

builder.Services.AddAuthorization();
```

For Azure AD / Entra ID, Auth0, Okta, or Keycloak, the API usually validates tokens using authority metadata and signing keys.

## Scopes vs Roles vs Permissions

Scopes:

```text
orders.read
orders.write
```

Roles:

```text
Admin
Manager
Support
```

Permissions:

```text
CanApproveOrder
CanRefundPayment
CanManageUsers
```

Practical distinction:

- scopes are often about client/API access;
- roles group users;
- permissions represent fine-grained actions.

## Authorization Policy Example

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("OrdersRead", policy =>
    {
        policy.RequireClaim("scope", "orders.read");
    });

    options.AddPolicy("CanRefundPayment", policy =>
    {
        policy.RequireClaim("permission", "payments.refund");
    });
});
```

Usage:

```csharp
[Authorize(Policy = "CanRefundPayment")]
[HttpPost("{paymentId:int}/refund")]
public async Task<IActionResult> Refund(int paymentId, CancellationToken ct)
{
    await _paymentService.RefundAsync(paymentId, ct);
    return Accepted();
}
```

## Token Validation Checklist

Validate:

- issuer;
- audience;
- lifetime;
- signature;
- algorithm;
- required claims;
- token type where applicable.

Avoid:

- accepting tokens from unknown issuers;
- disabling lifetime validation;
- trusting frontend claims without API validation;
- mixing ID token and access token.

## Under The Hood: OAuth/OIDC Threat Model

OAuth and OIDC are not just login diagrams. In engineering practice, the deeper question is usually:

```text
What can an attacker steal, replay, redirect, or misuse?
```

Chinese notes:

- `threat model`: 威胁模型.
- `token replay`: 令牌重放.
- `confused deputy`: 混淆代理问题, a trusted service is tricked into using its authority for the wrong caller.
- `open redirect`: 开放重定向漏洞.

The most important assets are:

- authorization code;
- access token;
- ID token;
- refresh token;
- redirect URI;
- client secret, if the client is confidential;
- signing keys used by the identity provider.

Common attacker goals:

- steal an authorization code and exchange it for tokens;
- steal an access token and call APIs directly;
- trick the app into accepting a token issued for another app;
- trick the API into accepting an ID token as an access token;
- replay an old token;
- abuse refresh tokens to keep access after the user is gone;
- redirect the user back to an attacker-controlled URL;
- inject a weak or fake signing algorithm.

Engineering perspective:

> I do not treat OAuth as only a login flow. I validate every trust boundary: redirect URI, state, PKCE, issuer, audience, signature, algorithm, lifetime, token type, and required claims. The frontend is not a security boundary; the API must validate tokens independently.

## Authorization Code Interception And PKCE

Without PKCE, an attacker who steals the authorization code may be able to exchange it for tokens.

PKCE adds two values:

```text
code_verifier  -> random secret kept by the client
code_challenge -> hash of verifier sent in the authorize request
```

Flow:

```text
1. Client creates code_verifier.
2. Client sends code_challenge to authorization server.
3. Authorization server stores code_challenge with the authorization code.
4. Client receives authorization code.
5. Client exchanges code + code_verifier for tokens.
6. Authorization server hashes verifier and compares it to stored challenge.
```

If an attacker only steals the authorization code, they still do not know the original verifier.

Practical implementation detail:

```text
Use S256 challenge method, not plain.
```

Common misconception:

> PKCE does not make token storage safe. It protects the authorization code exchange. After tokens are issued, token storage and backend validation still matter.

## `state`, `nonce`, And Redirect URI Validation

`state` protects the authorization response from CSRF-style attacks.

Example:

```text
1. App generates random state and stores it temporarily.
2. App sends state in the authorize request.
3. Identity provider redirects back with code + state.
4. App verifies returned state matches the stored value.
```

`nonce` is mainly used by OIDC to bind an ID token to an authentication request.

Redirect URI must be strict:

```text
Good:
https://app.example.com/auth/callback

Risky:
https://app.example.com/*
https://*.example.com/callback
```

Open redirect example:

```text
https://app.example.com/login?returnUrl=https://evil.example.com
```

Safer pattern:

```csharp
private static bool IsSafeLocalReturnUrl(string? returnUrl)
{
    return !string.IsNullOrWhiteSpace(returnUrl)
        && Uri.IsWellFormedUriString(returnUrl, UriKind.Relative)
        && returnUrl.StartsWith("/", StringComparison.Ordinal)
        && !returnUrl.StartsWith("//", StringComparison.Ordinal);
}
```

## Access Token vs ID Token Misuse

An ID token proves that the user authenticated to the client.

An access token authorizes access to an API.

Do not do this:

```text
React app sends ID token to Orders API.
Orders API accepts it because signature is valid.
```

Why this is dangerous:

- the ID token audience is usually the client app, not the API;
- it may not contain API scopes;
- it may have claims intended for UI identity, not API authorization;
- accepting it can bypass resource-server authorization boundaries.

Correct API validation:

```text
iss  = trusted identity provider
aud  = this API
scope/permission = required action
exp  = not expired
alg  = expected strong algorithm
sig  = verified with trusted signing key
```

Engineering perspective:

> A valid signature is not enough. The API must check whether the token was issued by the expected issuer, intended for this API, still valid, and authorized for the requested operation.

## Refresh Token Rotation And Reuse Detection

Refresh tokens are high-value because they can mint new access tokens.

Recommended pattern:

```text
1. Client uses refresh token A.
2. Server returns new access token and refresh token B.
3. Server invalidates refresh token A.
4. If token A is used again, treat it as possible theft.
```

Chinese note:

- `refresh token rotation`: 刷新令牌轮换.
- `reuse detection`: 重用检测.

Server-side table example:

```sql
CREATE TABLE RefreshTokens
(
    Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash VARBINARY(64) NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL,
    RevokedAt DATETIMEOFFSET NULL,
    ReplacedByTokenId UNIQUEIDENTIFIER NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    CreatedByIp NVARCHAR(64) NULL
);
```

Important details:

- store a hash of the refresh token, not the raw token;
- set absolute expiration;
- revoke token family on reuse if your risk model requires it;
- bind refresh tokens to client/device where appropriate;
- log suspicious reuse events.

Example validation logic:

```csharp
public async Task<TokenResult> RefreshAsync(string refreshToken, CancellationToken ct)
{
    var tokenHash = HashToken(refreshToken);
    var stored = await _db.RefreshTokens
        .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);

    if (stored is null || stored.ExpiresAt <= _clock.UtcNow)
    {
        return TokenResult.Invalid();
    }

    if (stored.RevokedAt is not null)
    {
        await RevokeTokenFamilyAsync(stored, "Refresh token reuse detected", ct);
        return TokenResult.Invalid();
    }

    stored.RevokedAt = _clock.UtcNow;

    var replacement = CreateRefreshToken(stored.UserId);
    stored.ReplacedByTokenId = replacement.Id;
    _db.RefreshTokens.Add(replacement);

    await _db.SaveChangesAsync(ct);
    return TokenResult.Success(CreateAccessToken(stored.UserId), replacement.RawToken);
}
```

## JWKS, Signing Keys, And Key Rotation

JWTs are commonly signed by the identity provider. The API verifies the signature using public keys from JWKS.

Chinese note:

- `JWKS`: JSON Web Key Set, 公钥集合.
- `key rotation`: 密钥轮换.

Mental model:

```text
JWT header contains kid
API downloads issuer metadata
API finds matching public key by kid
API verifies signature
```

JWT header example:

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2026-04"
}
```

Common mistakes:

- accepting `alg: none`;
- accepting unexpected algorithms;
- not refreshing JWKS when `kid` changes;
- trusting keys from a token-provided URL;
- validating signature but skipping issuer/audience;
- using symmetric secrets across too many services.

ASP.NET Core usually handles metadata and JWKS refresh when `Authority` is configured correctly, but you still need correct issuer, audience, and policy validation.

## SPA Token Storage vs BFF Pattern

Browser token storage is a trade-off（权衡）.

`localStorage`:

- easy to use;
- survives refresh;
- vulnerable if XSS occurs because JavaScript can read it.

In-memory storage:

- less persistent;
- harder for injected JavaScript to steal after reload;
- user may need silent renew or re-login.

HttpOnly secure cookie:

- JavaScript cannot read it;
- automatically sent by browser;
- requires CSRF protection if used for session/auth;
- works well with BFF pattern.

BFF (Backend for Frontend) pattern:

```text
React app -> same-site BFF cookie session -> BFF/API calls identity provider and downstream APIs
```

Benefits:

- tokens stay on the server side;
- browser mainly holds an HttpOnly session cookie;
- easier to centralize auth, CSRF protection, and token refresh.

Costs:

- extra backend component;
- more session management;
- can reduce pure static hosting simplicity.

Engineering perspective:

> For high-risk apps, I prefer keeping refresh tokens out of browser JavaScript. A BFF with HttpOnly, Secure, SameSite cookies is often safer. If using SPA-held tokens, I minimize lifetime, avoid localStorage for long-lived tokens, and invest heavily in XSS prevention.

## Scopes, Roles, Permissions, And Resource Authorization

Scopes answer:

```text
What API access did this client receive?
```

Roles answer:

```text
What group does this user belong to?
```

Permissions answer:

```text
What action can this user perform?
```

Resource authorization answers:

```text
Can this user perform this action on this exact resource?
```

Example:

```text
User has scope: orders.write
User has role: SupportAgent
User has permission: orders.refund
But can they refund order #123 owned by tenant A?
```

Resource-based check:

```csharp
public async Task<bool> CanRefundAsync(ClaimsPrincipal user, Order order, CancellationToken ct)
{
    var tenantId = user.FindFirst("tenant_id")?.Value;

    if (tenantId is null || tenantId != order.TenantId.ToString())
    {
        return false;
    }

    if (!user.HasClaim("permission", "orders.refund"))
    {
        return false;
    }

    return order.Status == OrderStatus.Paid;
}
```

Key point:

> Role checks alone are often too coarse. Good authorization design separates coarse API access, user grouping, fine-grained permissions, and resource ownership.

## Common OAuth/OIDC Attacks And Defenses

| Problem | Example | Defense |
| --- | --- | --- |
| Authorization code interception | attacker steals callback code | PKCE with S256 |
| CSRF in auth flow | attacker injects their login response | validate `state` |
| Replay | stolen token reused | short access token lifetime, TLS, sender-constrained token where available |
| Open redirect | attacker controls `returnUrl` | strict allowlist/local URL validation |
| Wrong audience | token for API A used at API B | validate `aud` |
| Wrong issuer | token from untrusted IdP accepted | validate `iss` |
| Algorithm confusion | weak/unexpected signing algorithm | restrict allowed algorithms |
| Token substitution | ID token used as access token | validate token type/audience/scopes |
| Refresh token theft | stolen refresh token used repeatedly | rotation and reuse detection |
| Confused deputy | service calls downstream with broader authority than caller has | propagate user context or enforce delegated permissions |

## Practical Review Debugging Scenarios

### Users can log in, but API returns 401

Check:

- frontend is sending access token, not ID token;
- API `Authority` matches issuer;
- API `Audience` matches token `aud`;
- token is not expired;
- server clock is not far off;
- CORS is not hiding the real error;
- API can reach identity provider metadata/JWKS endpoint.

### API returns 403 after successful authentication

Check:

- required scope/policy;
- claim type mapping;
- tenant/resource ownership;
- role vs permission naming mismatch;
- token missing claims because client requested wrong scopes.

### It worked yesterday, now all tokens fail

Check:

- identity provider key rotation;
- stale JWKS cache;
- changed issuer URL;
- changed audience/client ID;
- expired signing certificate;
- deployment changed environment configuration.

## Review Questions

### OAuth vs OIDC?

> OAuth 2.0 is for delegated authorization. OIDC adds authentication and identity information on top of OAuth. OAuth gives access tokens for APIs, while OIDC also provides ID tokens for the client to know the user identity.

### What is Authorization Code Flow with PKCE?

> It is a secure OAuth/OIDC flow for public clients. PKCE adds a code verifier and challenge so that an intercepted authorization code cannot be exchanged without the original verifier.

### Access token vs ID token?

> Access token is for calling APIs. ID token is for the client application to identify the authenticated user. APIs should validate access tokens, not ID tokens.

### Where should authorization be enforced?

> Always enforce authorization on the backend/API. Frontend checks are useful for user experience, but they are not security boundaries.

### Why is validating JWT signature not enough?

> Signature validation only proves the token was signed by a key. The API must also validate issuer, audience, lifetime, algorithm, token type, and required authorization claims. Otherwise, it may accept a token issued for another client or another API.

### How do you protect refresh tokens?

> I keep refresh tokens short enough for the risk model, store only hashed tokens server-side when managing them myself, rotate them on every use, detect reuse, revoke suspicious token families, and avoid exposing long-lived refresh tokens to browser JavaScript when possible.

### How do you choose token storage for React?

> It depends on the risk level. localStorage is convenient but vulnerable to XSS token theft. In-memory storage reduces persistence but complicates refresh. A BFF with HttpOnly, Secure, SameSite cookies keeps tokens server-side and is often safer for sensitive systems, but adds backend complexity and CSRF considerations.

## Common Mistakes

- Using implicit flow for modern SPA authentication.
- Sending ID token to API as if it were an access token.
- Storing long-lived tokens in localStorage.
- Not validating issuer and audience.
- Putting too many permissions into huge tokens.
- Assuming role checks are enough for resource-level authorization.
- Trusting a token only because its signature is valid.
- Accepting tokens with the wrong audience.
- Forgetting PKCE or `state`.
- Not planning refresh token rotation and reuse detection.
- Allowing unvalidated `returnUrl` or wildcard redirect URIs.

## Practice Task

Implement a small API with:

1. JWT bearer authentication;
2. scope-based policy: `orders.read`;
3. permission-based policy: `orders.approve`;
4. React route guard;
5. backend authorization check;
6. explanation of token storage trade-offs.
