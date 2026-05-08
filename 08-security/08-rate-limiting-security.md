# Rate Limiting, Abuse Resistance, And Availability Protection

## Core Idea

Rate limiting is often introduced as a performance or API-governance feature, but in security-sensitive systems it is also an abuse-resistance control. It slows brute-force attacks, reduces credential-stuffing throughput, limits automated scraping, and helps preserve availability under both malicious and accidental pressure.

## Security-Sensitive Endpoints

Some endpoints deserve stronger rate-limiting attention than others:

- login;
- password reset;
- signup;
- MFA or OTP verification;
- public search;
- file upload;
- payment attempts;
- webhook intake under abuse pressure.

The system should understand where retries are normal, where guesses are dangerous, and where request amplification is costly.

## Limit Keys And Identity Dimensions

Rate limiting always depends on what identity the limit is attached to. Common dimensions include:

- IP address;
- user identifier;
- API key;
- tenant;
- endpoint;
- combined dimensions such as email plus IP.

The right key depends on the abuse pattern. Login protection based only on IP is often too weak because NAT and shared networks blur identity. Protection based only on account identifier may ignore distributed attack sources. Combining dimensions is often stronger.

## Algorithms And Enforcement Shape

Fixed windows, sliding windows, token buckets, and leaky-bucket models all exist because different workloads have different burst and fairness requirements. The important design question is not which algorithm sounds most advanced. It is whether the enforcement model matches the risk and traffic pattern of the endpoint.

For example, login and password reset may care more about attack throttling than about fine-grained fairness, while public APIs may need tenant or client quotas that balance both.

## Response Semantics

A limit is part of the API contract once it is enforced. `429 Too Many Requests` and headers such as `Retry-After` help clients behave predictably under throttling.

This is especially important for well-behaved clients. Rate limiting is not only about blocking attackers. It is also about teaching legitimate callers how the system expects them to back off.

## Avoiding User Enumeration

Abuse resistance is closely tied to information disclosure. Endpoints such as login or password reset should avoid revealing whether an account exists more than necessary. Otherwise, rate limiting may still leave the system vulnerable to account discovery and targeted attacks.

This is why generic responses and throttling often belong together in authentication workflows.

## Distributed Systems And Shared Enforcement

In multi-instance deployments, in-memory limits may be insufficient for global protection. Shared stores such as Redis, gateway-level controls, or WAF-based enforcement may be needed for consistent cross-instance behavior.

This turns rate limiting into an architectural decision. The system must decide which controls live in the application, which live at the edge, and what happens when the shared limiter becomes unavailable.

## Fail-Open Versus Fail-Closed

When a shared limiter fails, the system faces a trade-off. Failing closed may protect a public attack surface but harm availability. Failing open may preserve service but weaken abuse resistance. The right answer depends on the endpoint's risk and the organization's tolerance for either class of failure.

This is one reason rate limiting belongs in security design. It is not only an algorithmic counter. It is a control with availability consequences.

## Design Consequences

Strong rate limiting begins with endpoint risk classification, chooses keys that match real abuse patterns, returns predictable throttling responses, and accounts for distributed deployment. It is most effective when combined with other controls such as generic login responses, lockout strategy, monitoring, and audit visibility.

Once designed that way, rate limiting becomes a meaningful security boundary rather than a checkbox middleware feature.

## ASP.NET Core Built-In Support

ASP.NET Core includes built-in rate limiting middleware through the `Microsoft.AspNetCore.RateLimiting` package and the `System.Threading.RateLimiting` namespace. The middleware was introduced in .NET 7 and is fully supported in .NET 10.

### Registration and Middleware Ordering

Rate limiting services are registered with `AddRateLimiter`, and the middleware is enabled with `UseRateLimiter`. The ordering of middleware matters: `UseRateLimiter` must be called after `UseRouting` when endpoint-specific policies are used, because the middleware needs route information to match named policies to endpoints. When only global limiters are configured, `UseRateLimiter` can appear before `UseRouting`.

```csharp
builder.Services.AddRateLimiter(options => { /* policy configuration */ });

var app = builder.Build();
app.UseRouting();
app.UseRateLimiter();    // After UseRouting when using named policies
app.UseAuthentication(); // Rate limiting typically precedes auth
app.UseAuthorization();
app.MapControllers();
```

### Rate Limiter Algorithms

The middleware provides four built-in algorithm types, each suited to different traffic patterns.

**Fixed window** limits requests within a fixed time window. When the window expires, the counter resets. This is the simplest model and works well for coarse rate ceilings.

**Sliding window** divides the window into segments. Each segment interval, the oldest segment's requests are recycled, smoothing the boundary between windows. This avoids the traffic burst that can occur immediately after a fixed-window reset.

**Token bucket** adds a fixed number of tokens each replenishment period, up to a configurable maximum. This model accommodates bursts while still enforcing a long-term average rate. It is the most flexible algorithm and corresponds well to real-world usage patterns.

**Concurrency** limits the number of simultaneous requests rather than the total over time. Each active request consumes one permit; when it completes, the permit returns. This is useful for protecting resources with constrained parallel capacity, such as database connection pools.

```csharp
builder.Services.AddRateLimiter(options =>
{
    // Fixed window: 10 requests per minute
    options.AddFixedWindowLimiter("fixed", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });

    // Sliding window: 100 requests per 30s window with 3 segments
    options.AddSlidingWindowLimiter("sliding", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromSeconds(30);
        opt.SegmentsPerWindow = 3;
        opt.QueueLimit = 0;
    });

    // Token bucket: 100 tokens max, replenish 10 per second
    options.AddTokenBucketLimiter("token", opt =>
    {
        opt.TokenLimit = 100;
        opt.TokensPerPeriod = 10;
        opt.ReplenishmentPeriod = TimeSpan.FromSeconds(1);
        opt.AutoReplenishment = true;
        opt.QueueLimit = 0;
    });

    // Concurrency: max 20 concurrent requests
    options.AddConcurrencyLimiter("concurrent", opt =>
    {
        opt.PermitLimit = 20;
        opt.QueueLimit = 0;
    });
});
```

### Applying Policies to Endpoints

Named policies are applied through the `RequireRateLimiting` extension method on endpoint conventions:

```csharp
app.MapGet("/api/search", () => "Search results")
   .RequireRateLimiting("fixed");

app.MapControllers().RequireRateLimiting("sliding");
```

On controller actions, the `[EnableRateLimiting]` and `[DisableRateLimiting]` attributes provide finer control:

```csharp
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpGet]
    [EnableRateLimiting("sliding")]
    public IActionResult GetAll() => Ok();

    [HttpPost]
    [EnableRateLimiting("fixed")]
    public IActionResult Create() => Ok();

    [HttpDelete("{id}")]
    [DisableRateLimiting]
    public IActionResult Delete(int id) => Ok();
}
```

### Partition-Based Limiters

Beyond named policies, the middleware supports partition-based global limiters. A partition divides traffic into separate buckets with independent counters, keyed by properties such as client IP, user identity, or API key.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
        httpContext =>
        {
            var clientIp = httpContext.Connection.RemoteIpAddress?.ToString()
                           ?? "unknown";

            return RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: clientIp,
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 100,
                    Window = TimeSpan.FromMinutes(1)
                });
        });
});
```

Combining dimensions is often stronger than relying on a single key. The `CreateChained` method runs multiple limiters in sequence, and each must grant a permit:

```csharp
options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
    PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 1000,
                Window = TimeSpan.FromMinutes(1)
            })),
    PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString()
                         ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 50,
                Window = TimeSpan.FromMinutes(1)
            }))
);
```

### Rejection Behavior

When a request exceeds a rate limit, the middleware can be configured to return appropriate status codes and headers. The `OnRejected` callback provides a hook for custom response formatting and logging:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers["Retry-After"] = "60";

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter,
            out var retryAfter))
        {
            context.HttpContext.Response.Headers["Retry-After"] =
                ((int)retryAfter.TotalSeconds).ToString();
        }

        await context.HttpContext.Response.WriteAsync(
            "Rate limit exceeded. Please retry later.",
            cancellationToken);
    };
});
```

### Testing and Operational Considerations

Rate limiting policies must be validated under realistic load before deployment. Tools such as JMeter, Azure Load Testing, or custom scripts can simulate burst and sustained traffic patterns. Partition keys derived from user-supplied input (such as client IP) introduce a potential denial-of-service vector: an attacker who spoofs source IPs can create many partitions and exhaust server memory. Use partition keys with bounded cardinality where possible, and monitor partition count in production.

### Metrics

The rate limiting middleware exposes built-in metrics through `Microsoft.AspNetCore.RateLimiting` event counters and meters, including total rejected requests, current queue length, and per-partition permit utilization. These metrics can be integrated with monitoring systems to detect abuse patterns and validate that limit configurations match real traffic profiles.
