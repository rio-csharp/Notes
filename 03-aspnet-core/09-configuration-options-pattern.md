# Configuration And Options Pattern

## Core Idea

ASP.NET Core configuration is the mechanism by which an application receives operational settings from its environment. The Options pattern turns those settings into typed dependencies that can be validated, documented, and injected consistently.

This chapter matters because configuration is not only a startup concern. It is part of the contract between code and deployment. Weak configuration design leads to stringly typed settings, late runtime failures, hidden environment differences, and secrets leaking into the wrong places. Strong configuration design makes operational intent explicit.

## Configuration As A Composed Source Of Truth

ASP.NET Core configuration is built from multiple providers rather than from one monolithic file.

Common sources include:

- `appsettings.json`
- `appsettings.{Environment}.json`
- local user secrets
- environment variables
- command-line arguments
- secret stores such as Azure Key Vault
- custom configuration providers

Later sources can override earlier ones. A common layering looks like this:

```text
appsettings.json
  overridden by environment-specific JSON
  overridden by user secrets
  overridden by environment variables
  overridden by command-line arguments
```

This design allows the same application code to run in different environments without rebuilding for each one. It also explains why operational behavior should not be inferred from a single file alone.

## Direct Configuration Access And Its Limits

The framework allows direct access through `IConfiguration`:

```csharp
var baseUrl = builder.Configuration["Payment:BaseUrl"];
var timeoutSeconds = builder.Configuration.GetValue<int>("Payment:TimeoutSeconds");
```

This is acceptable when a small amount of startup logic needs to inspect settings directly. It becomes weaker when used as the main configuration model throughout the application.

The problem is not that `IConfiguration` is wrong. The problem is that widespread direct access tends to produce:

- repeated string keys;
- weak discoverability;
- fragmented validation;
- unclear dependency shape;
- harder testing of consumers.

Once configuration becomes a real dependency of application services, typed options are usually the better model.

## Strongly Typed Options

The Options pattern binds a configuration section to a .NET type:

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

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(options => Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _),
        "Payment BaseUrl must be an absolute URI.")
    .ValidateOnStart();
```

This makes the dependency explicit and typed. It also creates one obvious place where the expected configuration shape is documented in code.

## Why Typed Options Improve Design

Typed options are not simply a convenience wrapper around configuration keys. They improve design in several ways.

They make configuration structure visible in the consuming type:

```csharp
public sealed class PaymentClient
{
    private readonly PaymentOptions _options;

    public PaymentClient(IOptions<PaymentOptions> options)
    {
        _options = options.Value;
    }
}
```

They centralize validation rather than scattering it across call sites. They also make configuration a real dependency that can be reasoned about in tests and refactors, instead of a hidden set of string lookups embedded throughout the codebase.

This matters especially in production systems where a malformed URL, missing key, or wrong timeout should be treated as an operational misconfiguration rather than as an obscure runtime surprise.

## `IOptions<T>`, `IOptionsSnapshot<T>`, And `IOptionsMonitor<T>`

ASP.NET Core offers several access patterns for options because different consumers have different lifetime needs.

`IOptions<T>` is the simplest form. It is stable and works well for configuration that does not need to change per request or during application lifetime.

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

`IOptionsSnapshot<T>` is scoped and recomputed per request scope in web applications. It is useful when configuration may reload between requests, but it is not suitable for singleton consumers.

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

`IOptionsMonitor<T>` supports change observation and can still be used by singleton services.

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
            logger.LogInformation(
                "Payment options changed. TimeoutSeconds={TimeoutSeconds}",
                options.TimeoutSeconds);
        });
    }

    public void Dispose()
    {
        _subscription?.Dispose();
    }
}
```

The right choice depends on both lifetime and reload expectations. Configuration design is therefore tied directly to dependency injection lifetime design.

## Validation And Fail-Fast Behavior

Configuration should usually fail early when required settings are missing or malformed.

Without fail-fast validation, an application may start successfully and then break only when a specific feature is first exercised. That delay makes operational diagnosis harder and can shift misconfiguration discovery into customer-facing behavior.

ASP.NET Core supports validation through:

- data annotations;
- custom `.Validate(...)` predicates;
- custom `IValidateOptions<T>` implementations.

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

```csharp
builder.Services.AddSingleton<IValidateOptions<PaymentOptions>, PaymentOptionsValidator>();

builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.SectionName))
    .ValidateOnStart();
```

`ValidateOnStart()` is especially valuable for infrastructure settings such as service URLs, credentials, timeouts, and feature toggles that should never fail lazily in the middle of real traffic.

## Named Options And Repeated Configuration Shapes

Named options are useful when the same configuration shape appears several times with different identities.

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

```csharp
builder.Services.Configure<PaymentOptions>(
    "Stripe",
    builder.Configuration.GetSection("Payments:Stripe"));

builder.Services.Configure<PaymentOptions>(
    "PayPal",
    builder.Configuration.GetSection("Payments:PayPal"));
```

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

Named options are useful when several providers, tenants, or external clients share the same settings structure but not the same values. They preserve type safety without forcing artificial option classes for every variant.

## Secrets And Operational Boundaries

Configuration includes secrets, but secrets should not be treated like ordinary static settings.

The following should not be committed into source control as live values:

- database passwords;
- API keys;
- signing keys;
- connection strings with credentials;
- private certificates;
- third-party access tokens.

Local development commonly uses user secrets:

```bash
dotnet user-secrets init
dotnet user-secrets set "Payment:ApiKey" "dev-secret"
```

Production systems commonly use:

- environment variables;
- managed secret stores;
- managed identity where possible;
- platform-specific secret injection.

The deeper principle is that configuration design should respect the operational sensitivity of data. Not every setting belongs in the same storage or delivery path.

## Environment-Specific Configuration

ASP.NET Core applications often change behavior based on environment.

```csharp
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSwaggerGen();
}
```

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

Environment-aware configuration is useful, but it should not become a dumping ground for arbitrary divergent behavior. The purpose is to express meaningful operational differences such as diagnostics, safety settings, or external endpoints, not to maintain several unrelated application personalities under one codebase.

## Options And Outgoing HTTP Clients

Configuration and typed options often intersect naturally with `IHttpClientFactory`.

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

This is a good example of configuration becoming a typed operational dependency rather than a loose set of string values retrieved ad hoc.
