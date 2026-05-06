# Captive Dependency

## Core Idea

Captive dependency is the lifetime mismatch that occurs when a longer-lived service captures a shorter-lived dependency and then continues to use it beyond the boundary that shorter-lived dependency was meant to obey. In ASP.NET Core, the most common example is a singleton depending on a scoped service.

This topic deserves its own treatment because it is one of the clearest ways dependency injection moves from configuration syntax into correctness failures. A registration can compile, a constructor can look innocent, and yet the application can still end up reusing request-specific state across requests or holding onto objects after their intended scope has ended.

## Lifetime Mismatch As A Design Bug

The danger begins with the lifetime hierarchy itself.

```text
singleton
  lives for the application lifetime

scoped
  usually lives for one HTTP request or one explicit scope

transient
  usually lives for one resolution
```

If a singleton stores a scoped service in a field, the scoped instance is now effectively being asked to behave as if it belonged to the application lifetime rather than to one request or short-lived scope. That is the essence of a captive dependency.

The failure is not merely theoretical. The longer-lived service may now:

- read stale request data;
- leak one request's context into another;
- use a non-thread-safe dependency concurrently;
- outlive the dependency's disposal boundary;
- behave unpredictably depending on when resolution first occurred.

## Request Context Captured By A Singleton

A common example is a singleton that captures something derived from `HttpContext`.

```csharp
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<AuditService>();

public interface ICurrentUser
{
    string? UserId { get; }
}

public sealed class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string? UserId =>
        _httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value;
}

public sealed class AuditService
{
    private readonly ICurrentUser _currentUser;

    public AuditService(ICurrentUser currentUser)
    {
        _currentUser = currentUser;
    }

    public void Write(string action)
    {
        Console.WriteLine($"{_currentUser.UserId}: {action}");
    }
}
```

The core problem is not just the interface type. It is that request-shaped behavior has been captured by an application-wide singleton. The service now depends on state whose meaning changes per request, but the object's own lifetime does not.

## `DbContext` As A Captive Dependency

`DbContext` is another classic example because its scope assumptions are strong.

```csharp
builder.Services.AddDbContext<AppDbContext>();
builder.Services.AddSingleton<ReportCache>();

public sealed class ReportCache
{
    private readonly AppDbContext _dbContext;

    public ReportCache(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }
}
```

This is dangerous because `DbContext` is scoped, tracks entity state, and is not thread-safe. A singleton that captures it may use it long after the original scope should have ended, may observe stale tracked entities, and may expose the same instance to concurrent activity it was never designed to handle.

This example is useful because it shows that captive dependency is not only about request identity. It is also about operational boundaries such as units of work and disposal ownership.

## Changing The Lifetime To Match The Dependency

The most direct fix is often to change the longer-lived service so that it shares the same boundary as the dependency it really needs.

```csharp
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<AuditService>();
```

```csharp
public sealed class AuditService
{
    private readonly ICurrentUser _currentUser;
    private readonly AppDbContext _dbContext;

    public AuditService(ICurrentUser currentUser, AppDbContext dbContext)
    {
        _currentUser = currentUser;
        _dbContext = dbContext;
    }

    public async Task WriteAsync(string action, CancellationToken cancellationToken)
    {
        _dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            Action = action,
            CreatedAt = DateTimeOffset.UtcNow
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
```

Now the service and its dependencies share the same request-bound scope. This is often the cleanest fix because it preserves the original dependency relationship while restoring correct lifetime alignment.

## Passing Data Instead Of Capturing A Scoped Service

Sometimes the longer-lived service does not actually need the shorter-lived service. It only needs a value derived from it. In those cases, the healthier design is often to pass the value into the method rather than storing the service.

```csharp
builder.Services.AddSingleton<AuditMessageFormatter>();

public sealed class AuditMessageFormatter
{
    public string Format(string userId, string action)
    {
        return $"{DateTimeOffset.UtcNow:o} user={userId} action={action}";
    }
}
```

```csharp
public sealed class OrderService
{
    private readonly ICurrentUser _currentUser;
    private readonly AuditMessageFormatter _formatter;

    public OrderService(ICurrentUser currentUser, AuditMessageFormatter formatter)
    {
        _currentUser = currentUser;
        _formatter = formatter;
    }

    public string CreateAuditMessage(string action)
    {
        var userId = _currentUser.UserId ?? "anonymous";
        return _formatter.Format(userId, action);
    }
}
```

Here the singleton stays stateless and the request-specific value remains local to the request-bound caller. This is often a better design than stretching service lifetime downward just to preserve a field reference.

## Explicit Scope Creation For Long-Lived Infrastructure

Long-lived infrastructure components still sometimes need access to scoped services. Background services are the most common example.

In that situation, the usual answer is not to inject the scoped service directly. It is to create a scope per unit of work.

```csharp
public sealed class AuditWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditWorker> _logger;

    public AuditWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<AuditWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                await ProcessPendingAuditLogsAsync(dbContext, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Audit worker failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    private static Task ProcessPendingAuditLogsAsync(
        AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
```

This pattern works because the long-lived worker does not store a scoped service permanently. It creates a fresh scope for each batch of work and allows the scoped dependency to live within the right boundary.

## The Root Provider As Another Lifetime Trap

Captive dependency is closely related to another common mistake: resolving scoped services directly from the root provider.

```csharp
var dbContext = app.Services.GetRequiredService<AppDbContext>();
```

`app.Services` is the root provider, so resolving a scoped service there stretches it beyond the request or operation boundary it was meant to inhabit.

The safer pattern is to create an explicit scope:

```csharp
using var scope = app.Services.CreateScope();
var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
await dbContext.Database.MigrateAsync();
```

This keeps scope ownership visible and aligns resolution with intended disposal.

## Validation And What It Can Catch

Development-time validation can catch some lifetime mismatches early.

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

`ValidateScopes` is especially useful for detecting cases where scoped services are captured by singletons or resolved from the root provider in invalid ways.

Even so, validation is only a safety net. Some lifetime problems are conceptually wrong even if they are not immediately rejected by the container. Good lifetime design still depends on understanding scope boundaries rather than relying on tooling alone.

## A Clean Lifetime Composition Example

The following example illustrates a lifetime arrangement that avoids captive dependency while preserving separation of responsibility.

```csharp
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<AuditWriter>();
builder.Services.AddSingleton<AuditMessageFormatter>();
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default"));
});
```

```csharp
public interface ICurrentUser
{
    string? UserId { get; }
    string? TenantId { get; }
}

public sealed class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string? UserId =>
        _httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value;

    public string? TenantId =>
        _httpContextAccessor.HttpContext?.User.FindFirst("tenant_id")?.Value;
}
```

```csharp
public sealed class AuditMessageFormatter
{
    public string Format(string? userId, string? tenantId, string action)
    {
        return $"tenant={tenantId ?? "unknown"} user={userId ?? "anonymous"} action={action}";
    }
}
```

```csharp
public sealed class AuditWriter
{
    private readonly ICurrentUser _currentUser;
    private readonly AuditMessageFormatter _formatter;
    private readonly AppDbContext _dbContext;

    public AuditWriter(
        ICurrentUser currentUser,
        AuditMessageFormatter formatter,
        AppDbContext dbContext)
    {
        _currentUser = currentUser;
        _formatter = formatter;
        _dbContext = dbContext;
    }

    public async Task WriteAsync(string action, CancellationToken ct)
    {
        var message = _formatter.Format(
            _currentUser.UserId,
            _currentUser.TenantId,
            action);

        _dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = _currentUser.UserId,
            TenantId = _currentUser.TenantId,
            Action = action,
            Message = message,
            CreatedAt = DateTimeOffset.UtcNow
        });

        await _dbContext.SaveChangesAsync(ct);
    }
}
```

This arrangement works because request-shaped services stay scoped, while the singleton collaborator remains stateless and accepts request-derived data only as parameters.
