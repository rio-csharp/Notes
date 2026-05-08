# Tokens, JWTs, And Session Boundaries

## Core Idea

A token is not security by itself. It is a transport and representation mechanism for authentication or authorization state. JWTs are one common token format, but the real engineering questions lie elsewhere: what the token represents, who issued it, how long it lives, where it is stored, and what the server still has to verify before trusting it.

## JWT Structure And Meaning

A JWT, or JSON Web Token, is usually a signed token made of three parts:

```text
header.payload.signature
```

The header identifies metadata such as token type and signing algorithm. The payload contains claims. The signature allows a receiver to verify that the token was issued by a trusted authority and was not modified.

The most important practical correction is that a typical JWT is encoded, not encrypted. Anyone holding the token can read its payload. Sensitive secrets therefore do not belong inside the payload merely because the token is signed. When the payload itself contains sensitive data that must be hidden from intermediate parties, the JWT can be encrypted using a scheme such as AES-GCM rather than merely signed. This produces a JWE (JSON Web Encryption) token rather than a JWT, but it adds considerable complexity and is rarely needed when TLS is correctly enforced in transit. Most systems should protect sensitive data by keeping it out of the token rather than by encrypting the token.

## Claims And Their Meaning

JWT payloads commonly include claims such as:

- subject identity;
- issuer;
- audience;
- expiration;
- roles or permissions;
- tenant or organization context.

These claims are useful, but they only become trustworthy after the server validates the token correctly. Reading the payload is not the same thing as proving the token is valid for the current API and operation.

## Access Tokens And Refresh Tokens

A common token design separates short-lived access tokens from longer-lived refresh tokens.

The access token is presented on API calls and should usually be short-lived because it is a bearer credential. Anyone who possesses it can use it until it expires.

The refresh token exists to obtain a new access token without forcing the user to sign in again. Because it can mint future access, it is often more sensitive than the access token itself and should therefore be stored and protected more carefully.

This split is a fundamental security boundary in modern session design.

## Validation At The API Boundary

An API that accepts bearer tokens must validate more than the token's signature. It must usually validate:

- issuer;
- audience;
- lifetime;
- signing key;
- expected algorithm;
- required claims or policies.

In ASP.NET Core, this commonly appears through JWT bearer authentication configuration:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://auth.example.com";
        options.Audience = "api://orders-service";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://auth.example.com",
            ValidateAudience = true,
            ValidAudience = "api://orders-service",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            ValidateIssuerSigningKey = true
            // Signing keys are resolved automatically by the middleware
            // through OpenID Connect discovery when Authority is set.
            // Key rotation is handled transparently without a custom resolver.
        };
    });
```

The configuration is framework-specific, but the architectural lesson is broader: a token is only meaningful if the receiving API proves that it was issued by the right authority, for the right audience, within the right lifetime, and with claims appropriate to the requested action.

One JWT-specific attack deserves explicit mention: algorithm confusion. An attacker can modify the JWT header's `alg` field to `none` (or change an `RS256` token to `HS256` using the public key as the HMAC secret). If the validation library accepts the algorithm from the header without verifying it against an expected value, the token passes signature verification despite being forged. The defense is to explicitly pin the expected algorithm in validation configuration rather than deriving it from the token header. In ASP.NET Core, setting `options.TokenValidationParameters.ValidAlgorithms` or relying on the authority-provided signing keys prevents this class of attack.

The ASP.NET Core authentication chapter covers the broader authentication pipeline, scheme selection, and policy-based authorization in more detail.

## Statelessness And Revocation Limits

JWTs are often described as stateless, which is useful but incomplete. A self-contained access token reduces the need for a per-request session lookup. It does not remove the system's need to handle logout, revocation, permission changes, suspicious reuse, or forced sign-out after compromise.

That is why pure short-lived stateless access tokens are often paired with server-managed refresh tokens, token version checks, or other revocation mechanisms. Statelessness reduces some infrastructure coupling. It does not eliminate session management concerns.

Token fingerprinting is one revocation-enabling technique that preserves some statelessness. When the token is issued, the server generates a random value, stores its SHA-256 hash inside the token as a custom claim, and sets the same value as a hardened (HttpOnly, Secure, SameSite) cookie. On each request, the API verifies that the fingerprint in the token matches the fingerprint in the cookie. An attacker who steals only the token but not the cookie cannot replay it, and the server can invalidate sessions by clearing the cookie or updating the expected fingerprint. This approach trades some statelessness for significant replay protection without requiring a server-side token denylist for every request.

## Refresh Token Storage And Rotation

Refresh tokens should usually be stored server-side in a way that allows:

- expiration;
- revocation;
- rotation;
- reuse detection;
- auditability.

Storing only a hash of the refresh token is often preferable to storing the raw token, because the raw token itself is a credential. Rotation further improves safety by replacing the old refresh token with a new one each time it is used. If an already-rotated token appears again, the system can treat that as suspicious rather than as a harmless retry.

The key design point is that refresh tokens are not merely longer access tokens. They are session-continuation credentials and should be treated accordingly.

## Short Access Lifetimes

Short-lived access tokens reduce the damage window if a token is stolen. This does not solve theft, but it limits its duration. That is why short token lifetimes, rotation, and storage discipline work together.

The trade-off is that shorter lifetimes increase refresh frequency, which means the refresh-token workflow must be reliable and secure. Security and usability remain coupled here.

## Claims-Based Authorization

Tokens often carry claims used later by authorization policy:

- roles;
- permissions;
- scopes;
- tenant identity.

This is convenient because it allows the API to make many authorization decisions without reloading user state on every request. The cost is staleness. If role or permission data changes frequently, token-carried claims may lag behind the current source of truth until the token expires or is refreshed.

Token design and authorization design must be considered together rather than in isolation.

## Design Consequences

JWTs are most useful when treated as one part of a broader session design. Signed claims are helpful, but they do not replace careful validation (including algorithm pinning), short-lived access, durable refresh-token handling, or sound authorization boundaries. Once a team understands that, JWTs become a practical tool rather than an overtrusted abstraction.
