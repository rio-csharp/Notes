# Rate Limiting For Security

## Core Idea

Rate limiting protects systems from abuse, brute force attacks, scraping, and accidental overload.

Chinese notes:

- `rate limiting`: 限流.
- `brute force`: 暴力破解.
- `abuse`: 滥用.

## Security Use Cases

- login attempts;
- password reset;
- signup;
- OTP verification;
- public APIs;
- expensive search;
- file upload;
- payment attempts.

## Key Dimensions

Limit by:

- IP address;
- user ID;
- API key;
- tenant ID;
- endpoint;
- combination of dimensions.

Example:

```text
5 login attempts per email per minute
100 API calls per API key per minute
10 password reset requests per user per hour
```

## Algorithms

- fixed window;
- sliding window;
- token bucket;
- leaky bucket.

Built-in ASP.NET Core fixed window example:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 5;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

var app = builder.Build();

app.UseRateLimiter();
```

Endpoint usage:

```csharp
app.MapPost("/api/auth/login", LoginAsync)
    .RequireRateLimiting("login");
```

This is useful, but security-sensitive login limits often need custom keys such as email + IP, not only endpoint-wide limits.

## Redis Example

```csharp
public async Task<bool> AllowLoginAttemptAsync(string email)
{
    var key = $"login:{email}:{DateTimeOffset.UtcNow:yyyyMMddHHmm}";
    var count = await _redis.StringIncrementAsync(key);

    if (count == 1)
    {
        await _redis.KeyExpireAsync(key, TimeSpan.FromMinutes(1));
    }

    return count <= 5;
}
```

Improved key design:

```csharp
public async Task<bool> AllowLoginAttemptAsync(
    string email,
    string ipAddress,
    CancellationToken ct)
{
    var normalizedEmail = email.Trim().ToLowerInvariant();
    var emailHash = Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(normalizedEmail)));

    var minute = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmm");
    var emailKey = $"rl:login:email:{emailHash}:{minute}";
    var ipKey = $"rl:login:ip:{ipAddress}:{minute}";

    var batch = _redis.CreateBatch();
    var emailCountTask = batch.StringIncrementAsync(emailKey);
    var ipCountTask = batch.StringIncrementAsync(ipKey);
    _ = batch.KeyExpireAsync(emailKey, TimeSpan.FromMinutes(2));
    _ = batch.KeyExpireAsync(ipKey, TimeSpan.FromMinutes(2));
    batch.Execute();

    var emailCount = await emailCountTask;
    var ipCount = await ipCountTask;

    return emailCount <= 5 && ipCount <= 30;
}
```

Notes:

- hash email before using it in infrastructure keys;
- combine account identifier and IP;
- choose windows and thresholds based on risk and real traffic;
- monitor rejected requests.

## Login Endpoint Example

```csharp
[HttpPost("login")]
public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
{
    var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    if (!await _rateLimiter.AllowLoginAttemptAsync(request.Email, ipAddress, ct))
    {
        Response.Headers["Retry-After"] = "60";
        return StatusCode(StatusCodes.Status429TooManyRequests, new
        {
            title = "Too many attempts. Please try again later."
        });
    }

    var result = await _authService.LoginAsync(request, ct);

    if (!result.Succeeded)
    {
        return Unauthorized(new
        {
            title = "Invalid email or password."
        });
    }

    return Ok(result.TokenResponse);
}
```

Notice the login error is generic. It does not reveal whether the email exists.

## Response

```http
429 Too Many Requests
Retry-After: 60
```

## Avoid User Enumeration

For login/password reset:

Bad:

```text
Email does not exist.
```

Better:

```text
If the account exists, instructions will be sent.
```

Password reset endpoint:

```csharp
[HttpPost("forgot-password")]
public async Task<IActionResult> ForgotPassword(
    ForgotPasswordRequest request,
    CancellationToken ct)
{
    await _passwordResetService.RequestResetAsync(request.Email, ct);

    return Ok(new
    {
        message = "If the account exists, password reset instructions will be sent."
    });
}
```

## Distributed Rate Limiting Concerns

In multiple API instances, in-memory rate limiting is not enough for global limits.

Options:

- Redis-backed counters;
- API gateway rate limiting;
- cloud WAF/bot protection;
- identity-provider lockout;
- tenant/API-key quota service.

Fail-open vs fail-closed:

```text
Redis down during public login attack:
  fail closed or use stricter local fallback

Redis down for low-risk internal dashboard:
  fail open with alert may preserve availability
```

The right behavior depends on the endpoint's risk.

## Review Questions

### Why rate limit login?

> To slow brute force and credential stuffing attacks and reduce load from abuse.

### What key should rate limiting use?

> It depends. For login, combine email/user identifier and IP. For APIs, use API key/user/tenant. Avoid relying only on IP because NAT and proxies can affect many users.

### Fail open or fail closed if Redis is down?

> It depends on risk. For public abuse protection, fail closed may be safer. For critical internal workflows, fail open with alert may preserve availability.

## Common Mistakes

- IP-only limits.
- No rate limit on password reset.
- Different error messages that reveal accounts.
- No monitoring on rate-limit triggers.
- No bypass strategy for trusted internal systems.

## Practice Task

Design rate limits for:

1. login;
2. password reset;
3. file upload;
4. public search API;
5. tenant-level API usage.
