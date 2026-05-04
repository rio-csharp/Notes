# JWT Authentication

## Core Idea

JWT means JSON Web Token.

It is commonly used to represent authenticated user information between client and server.

Chinese notes:

- `access token`: 访问令牌.
- `refresh token`: 刷新令牌.
- `claim`: 声明.
- `signature`: 签名.

## JWT Structure

A JWT has three parts:

```text
header.payload.signature
```

Header:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

Payload:

```json
{
  "sub": "123",
  "email": "alice@example.com",
  "role": "Admin",
  "exp": 1710000000
}
```

Signature verifies the token was issued by a trusted authority and was not modified.

Important:

JWT payload is encoded, not encrypted. Do not put secrets in JWT payload.

## Access Token And Refresh Token

Common flow:

1. User logs in.
2. Server validates credentials.
3. Server issues short-lived access token.
4. Server issues longer-lived refresh token.
5. Client uses access token for API calls.
6. When access token expires, client uses refresh token to get a new access token.
7. Refresh token can be revoked.

## ASP.NET Core Configuration

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();
```

Pipeline:

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

## Token Creation Example

```csharp
public sealed class TokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreateAccessToken(User user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Role, user.Role)
        };

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!));

        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

## Refresh Token Storage

Store refresh tokens server-side.

Example table:

```sql
CREATE TABLE RefreshTokens
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    UserId INT NOT NULL,
    TokenHash NVARCHAR(256) NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL,
    RevokedAt DATETIMEOFFSET NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    CreatedByIp NVARCHAR(64) NULL
);
```

Store a hash of the refresh token, not the raw token.

Refresh token entity:

```csharp
public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }

    public bool IsActive =>
        RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
}
```

Generate refresh token:

```csharp
public static class SecureTokenGenerator
{
    public static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return WebEncoders.Base64UrlEncode(bytes);
    }

    public static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
```

Refresh token rotation:

```csharp
public async Task<TokenPair> RefreshAsync(string refreshToken, CancellationToken ct)
{
    var tokenHash = SecureTokenGenerator.HashToken(refreshToken);

    var storedToken = await _dbContext.RefreshTokens
        .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);

    if (storedToken is null || !storedToken.IsActive)
    {
        throw new UnauthorizedException("Invalid refresh token.");
    }

    var user = await _dbContext.Users
        .SingleAsync(x => x.Id == storedToken.UserId, ct);

    var newRefreshToken = SecureTokenGenerator.GenerateRefreshToken();
    var newRefreshHash = SecureTokenGenerator.HashToken(newRefreshToken);

    storedToken.RevokedAt = DateTimeOffset.UtcNow;
    storedToken.ReplacedByTokenHash = newRefreshHash;

    _dbContext.RefreshTokens.Add(new RefreshToken
    {
        Id = Guid.NewGuid(),
        UserId = user.Id,
        TokenHash = newRefreshHash,
        CreatedAt = DateTimeOffset.UtcNow,
        ExpiresAt = DateTimeOffset.UtcNow.AddDays(14)
    });

    await _dbContext.SaveChangesAsync(ct);

    return new TokenPair(
        AccessToken: CreateAccessToken(user),
        RefreshToken: newRefreshToken);
}
```

Token pair:

```csharp
public sealed record TokenPair(string AccessToken, string RefreshToken);
```

Logout/revoke:

```csharp
public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken ct)
{
    var tokenHash = SecureTokenGenerator.HashToken(refreshToken);

    var storedToken = await _dbContext.RefreshTokens
        .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);

    if (storedToken is null)
    {
        return;
    }

    storedToken.RevokedAt = DateTimeOffset.UtcNow;
    await _dbContext.SaveChangesAsync(ct);
}
```

Reuse detection:

> If an already revoked refresh token is used again, treat it as suspicious. Many systems revoke the whole token family and require the user to sign in again.

## Token Storage On Frontend

Options:

- memory only;
- `localStorage`;
- `sessionStorage`;
- HttpOnly Secure SameSite cookie.

Trade-offs:

- `localStorage` is vulnerable to XSS token theft.
- HttpOnly cookies reduce token theft risk but require CSRF protection.
- memory-only storage is safer against persistence theft but loses token on refresh.

Engineering perspective:

> Token storage is a security trade-off. If using cookies, I focus on HttpOnly, Secure, SameSite, CSRF protection, and CORS. If using localStorage, I must strongly control XSS risk, but I generally avoid storing long-lived tokens there.

## Authorization With Claims

```csharp
[Authorize(Roles = "Admin")]
[HttpDelete("{id:int}")]
public async Task<IActionResult> DeleteUser(int id)
{
    await _userService.DeleteAsync(id);
    return NoContent();
}
```

Policy:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanManageOrders", policy =>
    {
        policy.RequireClaim("permission", "orders.manage");
    });
});
```

Usage:

```csharp
[Authorize(Policy = "CanManageOrders")]
public class OrdersController : ControllerBase
{
}
```

## Review Questions

### Is JWT encrypted?

> Usually no. A standard JWT is Base64Url encoded and signed, not encrypted. Anyone with the token can read the payload. The signature prevents tampering.

### Why use short-lived access tokens?

> Because access tokens are bearer tokens. If stolen, whoever has the token can use it until expiration. Short lifetime reduces damage.

### How do you revoke JWT?

> Pure stateless JWT cannot be revoked easily before expiration. Options include short expiration, refresh token revocation, token version in database, blacklist, or introspection through an identity provider.

### Where should tokens be stored?

> It depends on the application threat model. HttpOnly Secure SameSite cookies reduce JavaScript access but need CSRF handling. Browser storage is easier for SPAs but more exposed to XSS.

## Common Mistakes

- Putting passwords or secrets in JWT claims.
- Long-lived access tokens.
- No refresh token rotation.
- Storing raw refresh tokens.
- Not validating issuer, audience, lifetime, and signing key.
- Confusing authentication with authorization.
- Trusting frontend-only permission checks.

## Practice Task

Implement:

1. login endpoint;
2. access token generation;
3. refresh token table;
4. refresh endpoint;
5. refresh token rotation;
6. logout that revokes refresh token;
7. role-based endpoint protection.
