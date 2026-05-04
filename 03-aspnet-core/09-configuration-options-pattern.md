# Configuration And Options Pattern

## Core Idea

ASP.NET Core configuration combines settings from multiple sources and exposes them through `IConfiguration`. The Options pattern binds configuration sections to strongly typed classes and injects them through `IOptions<T>`, `IOptionsSnapshot<T>`, or `IOptionsMonitor<T>`.

Chinese notes:

- `configuration`: 配置.
- `options pattern`: 选项模式.
- `environment variables`: 环境变量.
- `user secrets`: 用户机密.
- `binding`: 绑定.
- `validation`: 校验.
- `reload`: 重新加载.

Key takeaway:

> I use configuration providers to load settings, typed options to avoid magic strings, validation to fail fast, and secret stores for sensitive values.

## Configuration Sources

Common sources:

- `appsettings.json`;
- `appsettings.{Environment}.json`, such as `appsettings.Development.json`;
- user secrets in local development;
- environment variables;
- command-line arguments;
- Azure Key Vault or another secret manager;
- custom configuration providers.

Later sources can override earlier sources.

Typical priority:

```text
appsettings.json
  overridden by appsettings.Development.json
  overridden by user secrets
  overridden by environment variables
  overridden by command-line arguments
```

Example:

```json
{
  "Payment": {
    "BaseUrl": "https://sandbox.payment.example",
    "TimeoutSeconds": 10,
    "ApiKey": "do-not-store-real-secret-here"
  }
}
```

Environment variable override:

```text
Payment__BaseUrl=https://api.payment.example
Payment__TimeoutSeconds=3
```

Why double underscore?

> Environment variables usually cannot use `:` reliably across platforms. ASP.NET Core maps `__` to nested configuration keys.

## Reading Configuration Directly

You can read values directly:

```csharp
var baseUrl = builder.Configuration["Payment:BaseUrl"];
var timeoutSeconds = builder.Configuration.GetValue<int>("Payment:TimeoutSeconds");
```

This is acceptable for simple startup configuration.

But injecting `IConfiguration` everywhere is usually not ideal:

- repeated string keys;
- no compile-time structure;
- weak discoverability;
- no centralized validation;
- harder unit testing.

Better for application services:

> Bind configuration to typed options.

## Strongly Typed Options

Options class:

```csharp
using System.ComponentModel.DataAnnotations;

public sealed class PaymentOptions
{
    public const string SectionName = "Payment";

    [Required]
    [Url]
    public string BaseUrl { get; init; } = "";

    [Range(1, 60)]
    public int TimeoutSeconds { get; init; } = 10;

    [Required]
    public string ApiKey { get; init; } = "";
}
```

Registration:

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(options => Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _),
        "Payment BaseUrl must be an absolute URI.")
    .ValidateOnStart();
```

Usage:

```csharp
public sealed class PaymentClient
{
    private readonly PaymentOptions _options;

    public PaymentClient(IOptions<PaymentOptions> options)
    {
        _options = options.Value;
    }

    public async Task CreatePaymentAsync(decimal amount, CancellationToken cancellationToken)
    {
        using var httpClient = new HttpClient
        {
            BaseAddress = new Uri(_options.BaseUrl),
            Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds)
        };

        // Example only. In production prefer IHttpClientFactory.
        await Task.CompletedTask;
    }
}
```

Note:

> Options are not just a convenience. They make configuration explicit, validated, testable, and easier to reason about.

## IOptions vs IOptionsSnapshot vs IOptionsMonitor

### IOptions<T>

`IOptions<T>` is simple and stable.

- registered as singleton;
- value is created once;
- good for stable configuration;
- safe to inject into singleton services.

Example:

```csharp
public sealed class StablePaymentClient
{
    private readonly PaymentOptions _options;

    public StablePaymentClient(IOptions<PaymentOptions> options)
    {
        _options = options.Value;
    }
}
```

### IOptionsSnapshot<T>

`IOptionsSnapshot<T>` is scoped.

- recomputed once per scope;
- in web apps, usually once per request;
- useful when configuration may reload between requests;
- not suitable for singleton services.

Example:

```csharp
public sealed class CheckoutService
{
    private readonly PaymentOptions _options;

    public CheckoutService(IOptionsSnapshot<PaymentOptions> options)
    {
        _options = options.Value;
    }
}
```

Why not in singleton?

> A singleton lives longer than a request scope. Injecting a scoped service into a singleton breaks lifetime rules.

### IOptionsMonitor<T>

`IOptionsMonitor<T>` supports change notifications and works with singleton services.

```csharp
public sealed class PaymentSettingsWatcher : IDisposable
{
    private readonly IDisposable? _subscription;
    private PaymentOptions _current;

    public PaymentSettingsWatcher(
        IOptionsMonitor<PaymentOptions> monitor,
        ILogger<PaymentSettingsWatcher> logger)
    {
        _current = monitor.CurrentValue;

        _subscription = monitor.OnChange(options =>
        {
            _current = options;
            logger.LogInformation("Payment options changed. TimeoutSeconds={TimeoutSeconds}",
                options.TimeoutSeconds);
        });
    }

    public void Dispose()
    {
        _subscription?.Dispose();
    }
}
```

Important:

> `IOptionsMonitor<T>` can observe configuration reloads only if the provider supports reload. Not every configuration source reloads automatically.

## Named Options

Named options allow multiple configurations for the same options type.

Example:

```json
{
  "Payments": {
    "Stripe": {
      "BaseUrl": "https://api.stripe.example",
      "TimeoutSeconds": 5,
      "ApiKey": "secret"
    },
    "PayPal": {
      "BaseUrl": "https://api.paypal.example",
      "TimeoutSeconds": 8,
      "ApiKey": "secret"
    }
  }
}
```

Registration:

```csharp
builder.Services.Configure<PaymentOptions>(
    "Stripe",
    builder.Configuration.GetSection("Payments:Stripe"));

builder.Services.Configure<PaymentOptions>(
    "PayPal",
    builder.Configuration.GetSection("Payments:PayPal"));
```

Usage:

```csharp
public sealed class PaymentRouter
{
    private readonly IOptionsMonitor<PaymentOptions> _optionsMonitor;

    public PaymentRouter(IOptionsMonitor<PaymentOptions> optionsMonitor)
    {
        _optionsMonitor = optionsMonitor;
    }

    public PaymentOptions GetProviderOptions(string provider)
    {
        return _optionsMonitor.Get(provider);
    }
}
```

Use named options when:

- multiple providers share the same shape;
- multiple tenants need different settings;
- multiple external clients use similar configuration.

## Options Validation

Failing fast is important.

Bad:

```text
The API starts successfully, but payment fails only when the first customer checks out.
```

Good:

```text
The API fails during startup because Payment:ApiKey is missing.
```

Validation options:

- data annotations;
- custom `.Validate(...)`;
- custom `IValidateOptions<T>`.

Custom validator:

```csharp
public sealed class PaymentOptionsValidator : IValidateOptions<PaymentOptions>
{
    public ValidateOptionsResult Validate(string? name, PaymentOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            return ValidateOptionsResult.Fail("Payment ApiKey is required.");
        }

        if (!Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _))
        {
            return ValidateOptionsResult.Fail("Payment BaseUrl must be absolute.");
        }

        return ValidateOptionsResult.Success;
    }
}
```

Registration:

```csharp
builder.Services.AddSingleton<IValidateOptions<PaymentOptions>, PaymentOptionsValidator>();

builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateOnStart();
```

## Secrets

Never commit real secrets.

Do not store these in source control:

- database passwords;
- API keys;
- JWT signing keys;
- connection strings with credentials;
- private certificates;
- third-party access tokens.

Local development:

```bash
dotnet user-secrets init
dotnet user-secrets set "Payment:ApiKey" "dev-secret"
```

Production:

- environment variables;
- Azure Key Vault;
- AWS Secrets Manager;
- HashiCorp Vault;
- Kubernetes secrets;
- managed identity where possible.

Strong Practical explanation:

> In production I prefer managed identity plus a secret store. The application should not require long-lived credentials checked into config files.

## Environment-Specific Configuration

Environment name:

```csharp
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSwaggerGen();
}
```

Common environment names:

- `Development`;
- `Staging`;
- `Production`.

Important:

> Do not use `Development` behavior in production. Developer exception pages and overly permissive CORS policies can leak information.

Example:

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler();
    app.UseHsts();
}
```

## Typed HttpClient With Options

Options often work with `IHttpClientFactory`.

Registration:

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddHttpClient<PaymentClient>((serviceProvider, client) =>
{
    var options = serviceProvider
        .GetRequiredService<IOptions<PaymentOptions>>()
        .Value;

    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Add("X-API-Key", options.ApiKey);
});
```

Client:

```csharp
public sealed class PaymentClient
{
    private readonly HttpClient _httpClient;

    public PaymentClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<string> GetStatusAsync(CancellationToken cancellationToken)
    {
        return await _httpClient.GetStringAsync("/status", cancellationToken);
    }
}
```

## Review Questions

### What is the Options pattern?

The Options pattern binds configuration sections to strongly typed classes and injects them using `IOptions<T>`, `IOptionsSnapshot<T>`, or `IOptionsMonitor<T>`.

### Why not inject `IConfiguration` everywhere?

Because it spreads string keys across the codebase, weakens validation, and makes dependencies less explicit. Typed options are easier to validate, test, and maintain.

### What is the difference between `IOptions`, `IOptionsSnapshot`, and `IOptionsMonitor`?

`IOptions<T>` is stable and singleton-friendly. `IOptionsSnapshot<T>` is scoped and refreshes per request. `IOptionsMonitor<T>` is singleton-friendly and supports change notifications when the provider supports reload.

### What does `ValidateOnStart()` do?

It validates options during application startup instead of waiting until the first time the options are used. This helps fail fast when configuration is invalid.

### How do you override nested configuration with environment variables?

Use double underscores:

```text
Payment__TimeoutSeconds=5
```

ASP.NET Core maps it to:

```text
Payment:TimeoutSeconds
```

### How do you manage secrets?

Use user secrets locally and a production secret manager such as Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, Kubernetes secrets, or environment variables. Do not commit real secrets.

## Common Mistakes

### Mistake: Injecting `IConfiguration` everywhere

Why it is wrong:

> It creates repeated magic strings and makes configuration validation inconsistent.

Better answer:

> Use typed options for application settings and keep direct `IConfiguration` usage mostly in startup/composition code.

### Mistake: No validation on startup

Why it is wrong:

> The app may start successfully and fail later during real user traffic.

Better answer:

> Validate options with data annotations, custom validation, and `ValidateOnStart()`.

### Mistake: Real secrets in `appsettings.json`

Why it is wrong:

> Config files are commonly committed, copied, logged, or included in deployment artifacts.

Better answer:

> Use local user secrets for development and a secret manager or environment variables in production.

### Mistake: Assuming config changes always reload automatically

Why it is wrong:

> Reload depends on the configuration provider and how options are consumed.

Better answer:

> Use `IOptionsMonitor<T>` for change notifications and confirm that the configuration provider supports reload.

### Mistake: Injecting `IOptionsSnapshot<T>` into singleton services

Why it is wrong:

> `IOptionsSnapshot<T>` is scoped. A singleton cannot safely depend on scoped services.

Better answer:

> Use `IOptions<T>` or `IOptionsMonitor<T>` in singleton services.

## Practice Task

Create:

1. `PaymentOptions` with validation attributes;
2. `ValidateOnStart()`;
3. environment variable override using `Payment__BaseUrl`;
4. local user secret for `Payment:ApiKey`;
5. typed `HttpClient` that reads options;
6. short notes explaining when to use `IOptions`, `IOptionsSnapshot`, and `IOptionsMonitor`.

