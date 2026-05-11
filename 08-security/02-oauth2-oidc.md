# OAuth 2.0, OpenID Connect, And Delegated Trust

## Core Idea

OAuth 2.0 and OpenID Connect are often introduced through login diagrams, but their real importance lies in trust delegation. OAuth answers whether a client may obtain delegated access to a resource. OpenID Connect adds an identity layer so that the client can know who authenticated. Confusing those two purposes leads to fragile security designs, especially when tokens are reused outside their intended boundaries.

## OAuth Versus OpenID Connect

OAuth 2.0 is fundamentally about authorization delegation:

```text
Can this client access this resource?
```

OpenID Connect adds authentication and identity:

```text
Who is this user that authenticated through the provider?
```

In practice, this distinction matters because an access token and an ID token are not interchangeable. The access token is intended for resource servers. The ID token is intended for the client application to understand user identity.

## The Main Actors

The standard actors are:

- resource owner;
- client;
- authorization server;
- resource server.

Even in simple diagrams, the most important trust boundary is that the client and the API are not the same actor. The API must validate what it receives independently, not simply trust that the frontend completed a login flow successfully.

## Token Types And Their Boundaries

Three token types commonly appear:

- access tokens for calling APIs;
- ID tokens for client-side identity information;
- refresh tokens for obtaining new access tokens.

The API should usually validate and accept access tokens, not ID tokens. Accepting an ID token as API authorization is a common and dangerous boundary mistake because the token may have been issued for the client application rather than for the API.

## Authorization Code Flow With PKCE

For browser-based and mobile public clients, Authorization Code Flow with PKCE is widely regarded as the safer default. PKCE protects the authorization code exchange by tying the eventual token request to a verifier created by the client earlier in the flow.

The important lesson is not the acronym alone. It is that modern OAuth design assumes authorization codes can be intercepted and therefore protects the exchange path explicitly. PKCE does not solve token storage or API validation, but it meaningfully strengthens the code redemption boundary.

## Client Credentials Flow

Client Credentials Flow serves a different problem: machine-to-machine authorization without an end user.

This matters because systems often mix human and service flows conceptually. A background worker calling an internal API on its own behalf is not the same thing as a user-delegated browser session. The authorization model should reflect that difference.

## Redirect URI, `state`, And `nonce`

Several controls protect the browser-facing parts of the flow.

Strict redirect URI validation prevents tokens or codes from being sent to attacker-controlled destinations. `state` helps protect against request forgery in the authorization response by binding the callback to the original request; without it, an attacker could inject an authorization response before the legitimate one arrives. `nonce` helps bind an OpenID Connect ID token to the original authentication request, preventing replay across separate login attempts.

These details are easy to dismiss as protocol ceremony. In reality, they are core defenses around one of the most attacker-visible boundaries in the system.

One additional operational detail matters for OpenID Connect deployments. When a client uses OpenID Connect discovery (via the `Authority` property in ASP.NET Core), it fetches the provider's metadata document from `{Authority}/.well-known/openid-configuration`. This document contains signing keys, endpoint URLs, and supported claims. Providers rotate signing keys on a regular schedule; the default middleware handles key rotation transparently by re-fetching the discovery document when key resolution fails. Custom key resolution strategies that bypass discovery may miss rotation events and silently accept tokens signed with stale or compromised keys.

## Trust Boundaries At The API

When the API receives a bearer token, it should validate:

- trusted issuer;
- expected audience;
- signature and approved algorithm;
- lifetime;
- relevant scope, role, or permission claims.

A valid signature alone is not enough. A token may be validly signed and still be intended for another audience, issued by the wrong authority, expired, or missing the claims required for the requested operation.

Cryptographic validity is not the same thing as authorization validity.

In ASP.NET Core, this validation surface is configured when registering authentication. The following example configures the API to accept access tokens from an OAuth 2.0 authority, validates the expected audience and issuer, and maps the `scope` claim into the principal for policy-based authorization:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://idp.example.com";
        options.Audience = "api://orders";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://idp.example.com",
            ValidateAudience = true,
            ValidAudience = "api://orders",
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            NameClaimType = "sub",
            RoleClaimType = "role"
        };

        // Extract scopes from the token and expose them as claims
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var scopeClaims = context.Principal?
                    .FindAll("scope")
                    .SelectMany(s => s.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                    .Select(s => new Claim("scope", s))
                    .ToList();

                if (scopeClaims?.Count > 0)
                {
                    var identity = context.Principal?.Identity as ClaimsIdentity;
                    identity?.AddClaims(scopeClaims);
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Orders.Write", policy =>
        policy.RequireClaim("scope", "orders.write"));
    options.AddPolicy("Orders.Read", policy =>
        policy.RequireClaim("scope", "orders.read"));
});
```

This configuration ensures the API rejects tokens not intended for its audience, tokens signed by an unknown authority, expired tokens, and tokens lacking the required scope claims for the requested operation.

## Scopes, Roles, And Permissions

These concepts overlap but are not identical.

Scopes often describe what a client is allowed to request from an API. Roles group users. Permissions describe finer-grained actions. Resource-based authorization then asks whether the caller may perform that action on this exact resource.

Mature systems usually need more than one of these layers. A token that says the client has `orders.write` scope may still not mean the user may refund order 123 for tenant A.

## Refresh Tokens And Reuse Detection

Refresh tokens deserve special treatment because they extend access over time. Rotation and reuse detection are therefore common hardening techniques. If a refresh token is used once and then appears again after it was already rotated away, the system may need to treat that as potential theft rather than as a normal retry.

Refresh-token rotation and reuse detection are common hardening techniques that extend the design beyond protocol correctness into session-risk management.

## Browser Storage And BFF Patterns

How a browser application stores or avoids storing tokens is a major security choice. Local storage is convenient but exposed to XSS. In-memory storage reduces persistence but complicates refresh behavior. Backend-for-frontend patterns move tokens server-side and leave the browser holding only a same-site session cookie.

There is no universally perfect answer, but RFC 9700 (Best Current Practice for OAuth 2.0 Security, January 2025) strongly recommends the BFF pattern for production SPAs handling sensitive data. By moving all token handling server-side, BFF eliminates the most critical attack vectors around token theft and session hijacking from browser JavaScript. The correct choice depends on threat model, deployment model, and operational complexity tolerance, but for applications handling personal or sensitive data, BFF should be the default starting point.

A related consideration is SameSite cookie behavior in OAuth flows. The authorization server's redirect back to the client application after login is a cross-site navigation: the identity provider POSTs or redirects the user back to the client's callback endpoint. If the client's session cookie uses `SameSite=Strict`, the browser may not send it during this redirect, breaking the login flow. For OIDC callback endpoints, `SameSite=Lax` (the modern browser default) or `SameSite=None` with `Secure` may be necessary. This is not a relaxation to apply broadly -- only the specific callback route needs it, and the trade-off should be understood rather than defaulted blindly.

## Design Consequences

OAuth and OIDC should be understood as delegated trust systems, not merely as login features. Their safety depends on respecting token type boundaries, validating the API trust boundary independently, protecting browser-facing flow state, and treating refresh-token handling as part of session security rather than as a background implementation detail.

Once those principles are clear, the protocol details become easier to place correctly within the larger authentication and authorization design.
