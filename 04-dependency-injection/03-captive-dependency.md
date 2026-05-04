# Captive Dependency

## Core Idea

Captive dependency happens when a long-lived service captures a shorter-lived service.

Chinese notes:

- `captive dependency`: 生命周期捕获.
- `scope`: 作用域.
- `root provider`: 根容器.
- `request-specific state`: 请求级状态.

Most common:

```text
Singleton depends on Scoped
```

Key takeaway:

> Captive dependency is dangerous because the longer-lived object can keep using a dependency after its intended lifetime, causing stale data, cross-request leaks, thread-safety issues, or disposed object errors.

## Why It Happens

DI lifetimes form ownership boundaries.

```text
Singleton
  lives for the whole application

Scoped
  usually lives for one HTTP request

Transient
  usually lives for one resolution
```

If a singleton constructor receives a scoped service, the singleton stores that scoped instance in a field.

```text
Application starts
  -> Singleton AuditService is created
  -> It receives CurrentUser from one scope
  -> AuditService lives forever
  -> CurrentUser was supposed to live for one request
```

That is the captive dependency.

## Bad Example: Singleton Captures Current User

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

Problem:

> `AuditService` is singleton, so it may hold onto request-related behavior forever. The current user should be evaluated per request, not captured by an app-wide service.

Depending on validation settings, ASP.NET Core may catch this during startup or first resolution.

## Bad Example: Singleton Captures DbContext

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

Why it is dangerous:

- `DbContext` is scoped;
- `DbContext` tracks entity instances;
- `DbContext` is not thread-safe;
- singleton may use it concurrently;
- it may hold stale tracked data;
- it may be disposed with a scope while the singleton still references it.

Practical explanation:

> A singleton should not capture `DbContext`. If I need database work in a singleton-like background service, I create a scope per unit of work.

## Correct Approach 1: Make The Service Scoped

If the service needs request-specific dependencies, make it scoped.

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

Why it works:

> `AuditService`, `CurrentUser`, and `DbContext` now share the same request scope.

## Correct Approach 2: Pass Data Instead Of Service

If the singleton only needs a value, pass the value into the method.

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

Usage from a scoped service:

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

Why it works:

> The singleton is stateless and receives request-specific data as method arguments.

## Correct Approach 3: Use IServiceScopeFactory For Background Work

Background services are long-lived, but they often need scoped services.

Use `IServiceScopeFactory`.

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

Why it works:

> The worker is long-lived, but each batch gets its own short-lived DI scope.

## ValidateScopes

Enable scope validation in development:

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

`ValidateScopes` helps catch:

- scoped service resolved from root provider;
- scoped service injected into singleton;
- some lifetime mismatch issues.

Important:

> Validation helps, but it is not a replacement for understanding lifetimes. Some lifetime problems are logical, not mechanically detectable.

## Root Provider Problem

Bad:

```csharp
var dbContext = app.Services.GetRequiredService<AppDbContext>();
```

Why it is wrong:

> `app.Services` is the root provider. Resolving scoped services from the root provider can make them live too long and bypass request scope boundaries.

Better:

```csharp
using var scope = app.Services.CreateScope();
var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
```

Common use case:

```csharp
using var scope = app.Services.CreateScope();
var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
await dbContext.Database.MigrateAsync();
```

## Complete ASP.NET Core Example

This example shows a clean lifetime design for request audit logging.

Registration:

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

Current user is request-specific:

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

The formatter is singleton because it is stateless:

```csharp
public sealed class AuditMessageFormatter
{
    public string Format(string? userId, string? tenantId, string action)
    {
        return $"tenant={tenantId ?? "unknown"} user={userId ?? "anonymous"} action={action}";
    }
}
```

The writer is scoped because it uses request-specific state and `DbContext`:

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

Controller usage:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly AuditWriter _auditWriter;

    public OrdersController(AuditWriter auditWriter)
    {
        _auditWriter = auditWriter;
    }

    [HttpPost("{id:int}/approve")]
    public async Task<IActionResult> Approve(int id, CancellationToken ct)
    {
        await _auditWriter.WriteAsync($"approved-order:{id}", ct);
        return NoContent();
    }
}
```

Why the lifetimes are correct:

- `CurrentUser` is scoped because it reads request state;
- `AuditWriter` is scoped because it combines request state and `DbContext`;
- `AuditMessageFormatter` is singleton because it is stateless and receives request data as parameters;
- no singleton stores `HttpContext`, `ICurrentUser`, or `DbContext`.

## Review Questions

### What is captive dependency?

Captive dependency happens when a service with a longer lifetime depends on a service with a shorter lifetime, such as singleton depending on scoped. It can cause stale state, thread-safety issues, disposed object usage, and data leaks.

### Why is singleton depending on scoped dangerous?

The singleton may store the scoped instance and reuse it after the scope has ended. If the scoped service contains request data or is not thread-safe, the behavior becomes incorrect and unsafe.

### How do you fix singleton needing scoped service?

First reconsider the design. Possible fixes are:

- make the singleton scoped if it is request-specific;
- pass required data into methods;
- create a scope with `IServiceScopeFactory` for background/infrastructure work;
- split responsibilities so the singleton remains stateless.

### Is using `IServiceScopeFactory` always the best fix?

No. It is appropriate for background services and infrastructure code. In normal request flow, making the service scoped or passing data explicitly is often cleaner.

### What is scope validation?

Scope validation is a development-time DI check that can detect some invalid lifetime relationships, such as scoped services captured by singletons.

## Common Mistakes

### Mistake: Singleton depending on `DbContext`

Why it is wrong:

> `DbContext` is scoped, stateful, and not thread-safe.

Better answer:

> Use scoped services in request flow, or create a scope per background unit of work.

### Mistake: Singleton storing current user

Why it is wrong:

> Current user is request-specific. A singleton is shared by all requests.

Better answer:

> Read current user in a scoped service or pass the user ID into singleton methods.

### Mistake: BackgroundService injecting scoped repositories directly

Why it is wrong:

> `BackgroundService` is long-lived. Scoped repositories should be created and disposed per batch or unit of work.

Better answer:

> Inject `IServiceScopeFactory` and create a scope inside the worker loop.

### Mistake: Disabling scope validation instead of fixing design

Why it is wrong:

> It hides a real lifetime bug that may appear under production traffic.

Better answer:

> Keep validation enabled in development and fix the dependency graph.

### Mistake: Using `IServiceProvider` to hide the problem

Why it is wrong:

> The dependency is still there, but now it is hidden and harder to test.

Better answer:

> Use explicit constructor dependencies and correct the lifetime boundary.

## Practice Task

Create three versions of an audit service:

1. a bad singleton that injects `ICurrentUser`;
2. a corrected scoped version;
3. a stateless singleton formatter that receives `userId` as a method parameter.

Then explain which version you would use in an ASP.NET Core API and why.
