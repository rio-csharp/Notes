# Integration Testing In ASP.NET Core

## Core Idea

Integration tests verify that multiple parts of the application work together.

- `WebApplicationFactory`: ASP.NET Core integration testing helper.

Integration tests are especially valuable for ASP.NET Core because many bugs happen at boundaries:

- routing;
- model binding;
- validation;
- authentication;
- authorization;
- dependency injection;
- middleware order;
- EF Core mapping;
- SQL behavior;
- JSON serialization;
- configuration.

## Basic `WebApplicationFactory`

Install packages:

```powershell
dotnet add tests/Api.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing
dotnet add tests/Api.IntegrationTests package FluentAssertions
```

Basic test:

```csharp
using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;

public sealed class OrdersApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public OrdersApiTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetOrders_Should_Return_Ok()
    {
        var response = await _client.GetAsync("/api/orders");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

For Minimal APIs, make `Program` visible to the test project:

```csharp
public partial class Program
{
}
```

## Custom Factory

A custom factory lets tests replace configuration, database, authentication, and external services.

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

public sealed class CustomWebApplicationFactory
    : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            var dbContextDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));

            if (dbContextDescriptor is not null)
            {
                services.Remove(dbContextDescriptor);
            }

            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseSqlite("Data Source=:memory:");
            });
        });
    }
}
```

This example uses SQLite in-memory. For SQL Server-specific behavior, prefer Testcontainers.

## EF Core InMemory Provider Limitations

EF Core InMemory is not a relational database.

It may miss:

- SQL translation bugs;
- foreign key constraints;
- unique constraints;
- transaction behavior;
- case sensitivity differences;
- relational query behavior;
- raw SQL mistakes.

Use EF InMemory for very small tests only when relational behavior does not matter.

## Testcontainers With SQL Server

Install:

```powershell
dotnet add tests/Api.IntegrationTests package Testcontainers.MsSql
```

Fixture:

```csharp
using Testcontainers.MsSql;

public sealed class SqlServerFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder()
        .WithPassword("Your_password123")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public Task InitializeAsync()
    {
        return _container.StartAsync();
    }

    public Task DisposeAsync()
    {
        return _container.DisposeAsync().AsTask();
    }
}
```

Factory using the container connection string:

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;

    public ApiFactory(string connectionString)
    {
        _connectionString = connectionString;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();

            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseSqlServer(_connectionString);
            });
        });
    }
}
```

Test class:

```csharp
public sealed class CreateOrderTests : IClassFixture<SqlServerFixture>
{
    private readonly SqlServerFixture _fixture;

    public CreateOrderTests(SqlServerFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task CreateOrder_Should_Persist_Order()
    {
        await using var factory = new ApiFactory(_fixture.ConnectionString);
        using var client = factory.CreateClient();

        var request = new
        {
            customerId = 10,
            items = new[]
            {
                new { sku = "SKU-1", quantity = 2 }
            }
        };

        var response = await client.PostAsJsonAsync("/api/orders", request);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }
}
```

## Applying Migrations In Tests

Before tests run, create the database schema.

```csharp
public static async Task InitializeDatabaseAsync(IServiceProvider services)
{
    using var scope = services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    await db.Database.MigrateAsync();
}
```

Call it after the factory is built:

```csharp
await using var factory = new ApiFactory(_fixture.ConnectionString);
await DatabaseInitializer.InitializeDatabaseAsync(factory.Services);
```

Using migrations in tests helps catch migration and mapping problems earlier.

## Seeding Test Data

Seed data through the DbContext:

```csharp
public static async Task SeedCustomerAsync(IServiceProvider services)
{
    using var scope = services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    db.Customers.Add(new Customer
    {
        Id = 100,
        Name = "Acme"
    });

    await db.SaveChangesAsync();
}
```

Or seed through API calls when the test should exercise the public API.

Use direct database seeding for setup. Use API calls when the setup behavior itself matters.

## Testing Authenticated Requests

For most integration tests, avoid calling a real identity provider.

Use a test authentication handler:

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

public sealed class TestAuthHandler
    : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "user-1"),
            new Claim(ClaimTypes.Name, "Test User"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim("tenant_id", "tenant-1")
        };

        var identity = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "Test");

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
```

Register in factory:

```csharp
builder.ConfigureServices(services =>
{
    services
        .AddAuthentication("Test")
        .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
});
```

Configure the app to use the test scheme in the `Testing` environment.

## Testing Authorization

Test both authentication and authorization outcomes:

```csharp
[Fact]
public async Task ApproveOrder_Should_Return_Forbidden_When_User_Lacks_Permission()
{
    using var client = _factory.CreateClient();

    var response = await client.PostAsync("/api/orders/100/approve", content: null);

    response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
}
```

Useful cases:

- anonymous -> 401;
- authenticated but not allowed -> 403;
- allowed user -> success;
- cross-tenant access -> 404 or 403 depending on design.

## Replacing External Services

Replace real external services with in-memory fakes or local HTTP stubs.

Example fake:

```csharp
public sealed class FakeEmailSender : IEmailSender
{
    public List<EmailMessage> SentMessages { get; } = new();

    public Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        SentMessages.Add(message);
        return Task.CompletedTask;
    }
}
```

Register:

```csharp
builder.ConfigureServices(services =>
{
    services.RemoveAll<IEmailSender>();
    services.AddSingleton<FakeEmailSender>();
    services.AddSingleton<IEmailSender>(sp => sp.GetRequiredService<FakeEmailSender>());
});
```

Then assert:

```csharp
var sender = factory.Services.GetRequiredService<FakeEmailSender>();
sender.SentMessages.Should().ContainSingle(m => m.To == "customer@example.com");
```

## Testing Error Contracts

If the API uses `ProblemDetails`, assert the contract.

```csharp
var response = await client.PostAsJsonAsync("/api/orders", new { items = Array.Empty<object>() });

response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

problem.Should().NotBeNull();
problem!.Title.Should().NotBeNullOrWhiteSpace();
problem.Status.Should().Be(400);
```

This protects frontend/API contracts.

## Test Data Isolation

Common strategies:

- new database per test class;
- transaction rollback per test;
- delete data after each test;
- unique tenant/test IDs;
- Respawn-style database reset;
- container per test suite.

Avoid tests that pass only when executed in a specific order.

## What To Test

High-value integration tests:

- create resource success;
- validation failure;
- not found;
- unauthorized;
- forbidden;
- conflict;
- database persistence;
- transaction rollback;
- JSON shape;
- query filtering and pagination;
- idempotency behavior.


