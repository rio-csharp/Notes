# Secrets And Configuration

## Core Idea

Configuration controls application behavior. Secrets are sensitive configuration values that must be protected.

Chinese notes:

- `configuration`: 配置.
- `secret`: 密钥.
- `rotation`: 密钥轮换.
- `Options pattern`: Options 模式, bind configuration to typed classes.
- `least privilege`: 最小权限原则.

The main rule:

> Configuration can be environment-specific. Secrets must be protected, scoped, rotated, and never exposed to users.

## Configuration vs Secret

Configuration examples:

- environment name;
- API base URL;
- feature flag;
- timeout;
- page size limit;
- logging level;
- retry count.

Secret examples:

- database password;
- API key;
- OAuth client secret;
- JWT signing key;
- storage account key;
- certificate private key;
- webhook signing secret.

Some values can be both configuration and secret. A connection string is configuration, but if it contains a password, it must be treated as a secret.

## .NET Configuration Providers

ASP.NET Core builds configuration from multiple providers.

Common default order:

```text
appsettings.json
appsettings.{Environment}.json
user secrets in Development
environment variables
command-line arguments
```

Later providers override earlier providers.

Example:

```json
{
  "Payment": {
    "BaseUrl": "https://sandbox-payments.example.com",
    "TimeoutSeconds": 10
  }
}
```

Environment variable override:

```text
Payment__BaseUrl=https://payments.example.com
Payment__TimeoutSeconds=5
```

Double underscore `__` maps to nested configuration keys because `:` is not portable across all shells.

## Reading Configuration Directly

Direct reading is acceptable for simple values:

```csharp
var maxPageSize = builder.Configuration.GetValue<int>("Pagination:MaxPageSize", 100);
var authority = builder.Configuration["Jwt:Authority"];
```

But direct reading everywhere becomes hard to validate and test.

For grouped settings, prefer typed options.

## Options Pattern

Options class:

```csharp
public sealed class PaymentOptions
{
    public const string SectionName = "Payment";

    public required string BaseUrl { get; init; }
    public int TimeoutSeconds { get; init; } = 10;
    public required string ApiKey { get; init; }
}
```

Register with validation:

```csharp
using System.ComponentModel.DataAnnotations;

builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(options => Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _),
        "Payment:BaseUrl must be an absolute URL.")
    .Validate(options => options.TimeoutSeconds is > 0 and <= 60,
        "Payment:TimeoutSeconds must be between 1 and 60.")
    .ValidateOnStart();
```

Add validation attributes:

```csharp
public sealed class PaymentOptions
{
    public const string SectionName = "Payment";

    [Required]
    [Url]
    public required string BaseUrl { get; init; }

    [Range(1, 60)]
    public int TimeoutSeconds { get; init; } = 10;

    [Required]
    public required string ApiKey { get; init; }
}
```

Use options:

```csharp
using Microsoft.Extensions.Options;

public sealed class PaymentClient
{
    private readonly HttpClient _httpClient;
    private readonly PaymentOptions _options;

    public PaymentClient(HttpClient httpClient, IOptions<PaymentOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task ChargeAsync(ChargeRequest request, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "/charges");
        message.Headers.Add("X-Api-Key", _options.ApiKey);
        message.Content = JsonContent.Create(request);

        using var response = await _httpClient.SendAsync(message, ct);
        response.EnsureSuccessStatusCode();
    }
}
```

## `IOptions`, `IOptionsSnapshot`, And `IOptionsMonitor`

| Type | Lifetime Behavior | Common Use |
| --- | --- | --- |
| `IOptions<T>` | singleton value created once | stable app settings |
| `IOptionsSnapshot<T>` | recomputed per request in scoped services | request-based apps that need refreshed config |
| `IOptionsMonitor<T>` | singleton-friendly, supports change notifications | background services or dynamic config |

Example with monitor:

```csharp
public sealed class PricingRules
{
    private readonly IOptionsMonitor<PricingOptions> _options;

    public PricingRules(IOptionsMonitor<PricingOptions> options)
    {
        _options = options;
    }

    public decimal ApplyDiscount(decimal amount)
    {
        var percentage = _options.CurrentValue.DiscountPercentage;
        return amount * (1 - percentage);
    }
}
```

Do not assume every provider reloads automatically. Environment variables usually do not change dynamically inside a running process.

## Local Development: User Secrets

User secrets are for local development only.

```powershell
dotnet user-secrets init --project src/Api/Api.csproj
dotnet user-secrets set "Payment:ApiKey" "dev-api-key" --project src/Api/Api.csproj
dotnet user-secrets set "ConnectionStrings:Default" "Server=localhost;Database=App;Trusted_Connection=True;TrustServerCertificate=True" --project src/Api/Api.csproj
```

List secrets:

```powershell
dotnet user-secrets list --project src/Api/Api.csproj
```

User secrets are stored outside the project folder, so they are not committed with source code.

They are not encrypted by default. They are a developer convenience, not a production secret store.

## Environment Variables

Environment variables are common in containers and cloud hosting.

PowerShell:

```powershell
$env:Payment__BaseUrl = "https://payments.example.com"
$env:Payment__ApiKey = "local-test-key"
dotnet run --project src/Api/Api.csproj
```

Docker:

```yaml
services:
  api:
    image: orders-api:local
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      Payment__BaseUrl: https://payments.example.com
      Payment__ApiKey: ${PAYMENT_API_KEY}
```

Avoid printing all environment variables in logs. They often contain secrets.

## Production Secret Stores

Common production options:

- Azure Key Vault;
- AWS Secrets Manager;
- Google Secret Manager;
- HashiCorp Vault;
- Kubernetes Secrets with external secret integration;
- cloud-managed identity instead of static credentials.

Good secret storage should support:

- access control;
- audit logs;
- rotation;
- versioning;
- deletion protection;
- environment isolation.

## Azure Key Vault With Managed Identity

Packages:

```powershell
dotnet add package Azure.Extensions.AspNetCore.Configuration.Secrets
dotnet add package Azure.Identity
```

Program setup:

```csharp
using Azure.Identity;

var builder = WebApplication.CreateBuilder(args);

var keyVaultUri = builder.Configuration["KeyVault:Uri"];

if (!string.IsNullOrWhiteSpace(keyVaultUri))
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUri),
        new DefaultAzureCredential());
}

builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

In Azure:

```text
1. Enable Managed Identity on the app.
2. Grant the identity permission to read only required Key Vault secrets.
3. Set KeyVault:Uri as normal app configuration.
4. Keep actual secrets in Key Vault.
```

## Kubernetes Secrets

Kubernetes Secret example:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: orders-api-secrets
type: Opaque
stringData:
  ConnectionStrings__Default: "Server=tcp:sql;Database=orders;User Id=app;Password=change-me;"
  Payment__ApiKey: "secret-value"
```

Use it as environment variables:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  template:
    spec:
      containers:
        - name: orders-api
          image: myregistry/orders-api:1.0.0
          envFrom:
            - secretRef:
                name: orders-api-secrets
```

Important:

> Kubernetes Secrets are base64-encoded by default, not magically safe. Security depends on RBAC, encryption at rest, cluster access control, and operational discipline.

Many production clusters use external secret operators to sync from Key Vault or another secret store.

## Secret Rotation

Secret rotation means replacing a secret safely.

Simple but risky rotation:

```text
1. Replace secret.
2. Restart app.
3. Hope all dependencies accept the new value.
```

Safer dual-key rotation:

```text
1. System accepts old key and new key.
2. Deploy app/config that can use new key.
3. Switch traffic or config to new key.
4. Verify.
5. Remove old key.
```

Example for webhook signing:

```csharp
public sealed class WebhookSignatureValidator
{
    private readonly WebhookOptions _options;

    public WebhookSignatureValidator(IOptions<WebhookOptions> options)
    {
        _options = options.Value;
    }

    public bool IsValid(string payload, string signature)
    {
        return Matches(payload, signature, _options.CurrentSigningSecret)
            || Matches(payload, signature, _options.PreviousSigningSecret);
    }

    private static bool Matches(string payload, string signature, string? secret)
    {
        if (string.IsNullOrWhiteSpace(secret))
        {
            return false;
        }

        var expected = ComputeHmac(payload, secret);
        return CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(expected),
            Convert.FromHexString(signature));
    }
}
```

The previous key allows old senders or in-flight messages to keep working during rotation.

## Feature Flags

Feature flags are configuration values that control behavior without deploying new code.

Example:

```json
{
  "FeatureFlags": {
    "UseNewCheckout": false
  }
}
```

Usage:

```csharp
app.MapPost("/checkout", async (
    CheckoutRequest request,
    IConfiguration configuration,
    ICheckoutService oldCheckout,
    INewCheckoutService newCheckout,
    CancellationToken ct) =>
{
    var useNewCheckout = configuration.GetValue<bool>("FeatureFlags:UseNewCheckout");

    if (useNewCheckout)
    {
        return Results.Ok(await newCheckout.SubmitAsync(request, ct));
    }

    return Results.Ok(await oldCheckout.SubmitAsync(request, ct));
});
```

Feature flags are useful for:

- gradual rollout;
- emergency disable switch;
- A/B testing;
- separating deployment from release.

Clean up old flags. Long-lived flags make code hard to reason about.

## Frontend Configuration And Secrets

React apps run in the user's browser.

That means:

> Anything shipped to React is visible to users.

This is not a secret:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_AUTHORITY=https://login.example.com
VITE_CLIENT_ID=public-spa-client-id
```

This must not be in frontend code:

```text
PAYMENT_PROVIDER_SECRET=...
JWT_SIGNING_KEY=...
DATABASE_PASSWORD=...
OAUTH_CLIENT_SECRET=...
```

If the frontend needs to do something privileged, call the backend. The backend performs authorization and uses the secret server-side.

## Masking Sensitive Logs

Bad:

```csharp
logger.LogInformation("Payment key is {ApiKey}", options.ApiKey);
```

Better:

```csharp
logger.LogInformation("Payment provider configured for {BaseUrl}", options.BaseUrl);
```

Masking helper:

```csharp
public static string MaskSecret(string? value)
{
    if (string.IsNullOrEmpty(value))
    {
        return "<empty>";
    }

    if (value.Length <= 4)
    {
        return "****";
    }

    return $"{value[..2]}****{value[^2..]}";
}
```

Use masking only when a value truly needs to be identified in logs. Most secrets should not be logged at all, even masked.

## Configuration Validation At Startup

Failing fast is better than starting a broken app.

```csharp
builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection("Jwt"))
    .Validate(options => !string.IsNullOrWhiteSpace(options.Authority),
        "Jwt:Authority is required.")
    .Validate(options => !string.IsNullOrWhiteSpace(options.Audience),
        "Jwt:Audience is required.")
    .ValidateOnStart();
```

Without startup validation, the app may start successfully and fail only when a user hits a specific feature.

## Configuration Checklist

```text
Are secrets outside source control?
Are local secrets separate from production secrets?
Are production secrets in a managed store?
Does each service have only the permissions it needs?
Are options validated at startup?
Are secrets excluded from logs and error responses?
Can secrets be rotated?
Are frontend values non-secret?
Are environment-specific values documented?
```

## Knowledge Checks

### Why should secrets not be committed to Git?

Git history is durable and widely copied. Even if a secret is removed later, it may still exist in old commits, forks, build logs, caches, or developer machines.

### Why use typed options instead of reading configuration strings everywhere?

Typed options centralize binding, validation, defaults, and documentation. They make configuration easier to test and reduce runtime surprises.

### What is the difference between configuration and secrets?

Configuration controls behavior. Secrets are sensitive values that require restricted access, audit, rotation, and careful logging rules.

### Why are frontend environment variables not secret?

React builds static JavaScript that runs in the user's browser. Any value included in that JavaScript can be inspected by users.

### Why is secret rotation easier with dual keys?

Dual keys allow old and new credentials to work during a transition. This avoids downtime when multiple services, deployments, or external providers do not switch at exactly the same time.

## Common Mistakes

- Secrets in `appsettings.json`.
- Secrets in frontend code.
- Printing environment variables in CI logs.
- Same secret reused across development, staging, and production.
- No startup validation.
- Giving every app access to every secret.
- No rotation plan.
- Assuming Kubernetes Secrets are fully secure by default.
- Storing passwords when Managed Identity would work.
- Keeping old feature flags forever.

## Practice Task

Create configuration for a .NET API with:

1. `PaymentOptions`.
2. `JwtOptions`.
3. Local user secrets.
4. Environment variable overrides.
5. Startup validation.
6. Azure Key Vault loading.
7. A feature flag.
8. A rule that frontend config contains no secrets.

Then explain:

```text
Which values are secrets?
Where does each value come from in development?
Where does each value come from in production?
Which values can be safely exposed to React?
How would you rotate the payment API key?
What should happen if Jwt:Authority is missing?
```
