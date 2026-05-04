# Password Hashing

## Core Idea

Passwords must never be stored in plaintext.

Chinese notes:

- `hash`: 哈希.
- `salt`: 盐.
- `pepper`: 额外服务端密钥.
- `password hashing`: 密码哈希.

## Hashing vs Encryption

Encryption is reversible with a key.

Hashing is one-way.

Passwords should be hashed with a slow password hashing algorithm, not encrypted.

## Good Password Hashing Algorithms

Use:

- BCrypt;
- Argon2;
- PBKDF2.

Avoid:

- plain SHA256;
- MD5;
- unsalted hashes;
- custom algorithms.

## Salt

Salt is a random value unique per password.

Purpose:

- prevents same password from having same hash;
- protects against precomputed rainbow tables.

Modern password hashing libraries manage salt automatically.

## Pepper

Pepper is an additional secret stored separately from database.

Use carefully:

- stored in secret manager;
- rotation is harder;
- not a replacement for salt.

## ASP.NET Core Identity

ASP.NET Core Identity has built-in password hashing.

In most .NET apps, prefer using established libraries/frameworks instead of implementing your own password hashing.

Example with `PasswordHasher<TUser>`:

```csharp
public sealed class AppUser
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public int FailedLoginCount { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
}
```

Registration:

```csharp
builder.Services.AddScoped<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
```

Creating a password hash:

```csharp
public sealed class UserRegistrationService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher<AppUser> _passwordHasher;

    public UserRegistrationService(
        AppDbContext dbContext,
        IPasswordHasher<AppUser> passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var user = new AppUser
        {
            Email = request.Email.Trim().ToLowerInvariant()
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync(ct);
    }
}
```

Request:

```csharp
public sealed record RegisterRequest(string Email, string Password);
```

## Password Verification Flow

```text
1. User submits password.
2. Server loads password hash.
3. Password hasher verifies password.
4. If valid, authentication succeeds.
5. If hash algorithm/cost is outdated, rehash.
```

Login verification:

```csharp
public async Task<LoginResult> LoginAsync(LoginRequest request, CancellationToken ct)
{
    var normalizedEmail = request.Email.Trim().ToLowerInvariant();

    var user = await _dbContext.Users
        .SingleOrDefaultAsync(x => x.Email == normalizedEmail, ct);

    if (user is null)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(200), ct);
        return LoginResult.Invalid();
    }

    if (user.LockedUntil > DateTimeOffset.UtcNow)
    {
        return LoginResult.Locked();
    }

    var result = _passwordHasher.VerifyHashedPassword(
        user,
        user.PasswordHash,
        request.Password);

    if (result == PasswordVerificationResult.Failed)
    {
        user.FailedLoginCount++;

        if (user.FailedLoginCount >= 5)
        {
            user.LockedUntil = DateTimeOffset.UtcNow.AddMinutes(15);
        }

        await _dbContext.SaveChangesAsync(ct);
        return LoginResult.Invalid();
    }

    user.FailedLoginCount = 0;
    user.LockedUntil = null;

    if (result == PasswordVerificationResult.SuccessRehashNeeded)
    {
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
    }

    await _dbContext.SaveChangesAsync(ct);

    return LoginResult.Success(user.Id);
}
```

Result model:

```csharp
public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResult(bool Succeeded, bool Locked, int? UserId)
{
    public static LoginResult Success(int userId) => new(true, false, userId);
    public static LoginResult Invalid() => new(false, false, null);
    public static LoginResult Locked() => new(false, true, null);
}
```

Important:

> Return a generic login failure message to the client. Detailed reasons belong in security logs, not user-visible responses.

## Password Reset Flow

A safe reset flow does not send passwords by email. It sends a short-lived, single-use token.

```csharp
public sealed class PasswordResetToken
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}
```

Create token:

```csharp
public async Task RequestPasswordResetAsync(string email, CancellationToken ct)
{
    var normalizedEmail = email.Trim().ToLowerInvariant();
    var user = await _dbContext.Users.SingleOrDefaultAsync(x => x.Email == normalizedEmail, ct);

    if (user is null)
    {
        return;
    }

    var tokenBytes = RandomNumberGenerator.GetBytes(32);
    var token = WebEncoders.Base64UrlEncode(tokenBytes);
    var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    _dbContext.PasswordResetTokens.Add(new PasswordResetToken
    {
        UserId = user.Id,
        TokenHash = tokenHash,
        ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30)
    });

    await _dbContext.SaveChangesAsync(ct);
    await _emailSender.SendPasswordResetAsync(user.Email, token, ct);
}
```

Store only the token hash. Treat the raw token like a password.

## Account Protection

Add:

- rate limiting;
- account lockout;
- MFA for sensitive roles;
- login audit logs;
- suspicious login alerts.

Security log example:

```csharp
_logger.LogWarning(
    "Failed login attempt for email hash {EmailHash} from IP {IpAddress}",
    HashForLogging(request.Email),
    httpContext.Connection.RemoteIpAddress?.ToString());
```

Do not log raw passwords, reset tokens, refresh tokens, or full authorization headers.

## Review Questions

### Why not use SHA256 for passwords?

> SHA256 is too fast. Attackers can brute-force many guesses quickly. Password hashing algorithms like BCrypt, Argon2, or PBKDF2 are intentionally slow and salted.

### What is salt?

> Salt is a unique random value used when hashing a password, so identical passwords have different hashes and precomputed attacks are harder.

### Should passwords be encrypted?

> Usually no. Passwords should be hashed, not encrypted, because the server should not need to recover the original password.

## Common Mistakes

- Plaintext passwords.
- Fast hash only.
- Same salt for all users.
- Custom crypto.
- No login rate limiting.
- Logging passwords accidentally.

## Practice Task

Design login security with:

1. password hashing;
2. per-user salt;
3. rate limit;
4. account lockout;
5. MFA for admin;
6. audit logs.
