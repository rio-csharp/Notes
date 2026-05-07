# Hangfire And Quartz.NET

## Core Idea

Hangfire and Quartz.NET are libraries for background jobs and scheduling in .NET.

## Background Job Scenarios

Move work to a background job when:

- the work is slow and should not block an HTTP request;
- the work can be retried;
- the work is scheduled;
- the work should survive process restart;
- the user only needs a submitted/accepted response.

Examples:

- send email;
- generate reports;
- process uploaded files;
- sync data from external systems;
- clean expired sessions;
- retry failed webhooks;
- publish outbox messages.

## BackgroundService vs Hangfire vs Quartz

| Tool | Best For | Built-in Persistence | Dashboard | Scheduling |
|---|---|---:|---:|---|
| `BackgroundService` | custom loops, queue consumers | no | no | manual |
| Hangfire | fire-and-forget, delayed, recurring jobs | yes | yes | good |
| Quartz.NET | advanced scheduling, calendars, clustering | optional | no default dashboard | excellent |

`BackgroundService` is simple but persistence, retries, and monitoring must be built separately.

## Hangfire Setup

```csharp
builder.Services.AddHangfire(config =>
{
    config.UseSqlServerStorage(
        builder.Configuration.GetConnectionString("Hangfire"));
});

builder.Services.AddHangfireServer();

var app = builder.Build();

app.UseHangfireDashboard("/hangfire");
```

Protect the dashboard with authorization in real applications.

## Hangfire Fire-And-Forget Job

```csharp
public interface IEmailJob
{
    Task SendWelcomeEmailAsync(int userId, CancellationToken ct = default);
}

public sealed class EmailJob : IEmailJob
{
    private readonly AppDbContext _dbContext;
    private readonly IEmailSender _emailSender;

    public EmailJob(AppDbContext dbContext, IEmailSender emailSender)
    {
        _dbContext = dbContext;
        _emailSender = emailSender;
    }

    public async Task SendWelcomeEmailAsync(int userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId, ct);

        if (user is null)
        {
            return;
        }

        await _emailSender.SendAsync(
            user.Email,
            "Welcome",
            "Thanks for signing up.",
            ct);
    }
}
```

Enqueue:

```csharp
BackgroundJob.Enqueue<IEmailJob>(job =>
    job.SendWelcomeEmailAsync(userId, CancellationToken.None));
```

## Delayed And Recurring Jobs

Delayed:

```csharp
BackgroundJob.Schedule<IEmailJob>(
    job => job.SendWelcomeEmailAsync(userId, CancellationToken.None),
    TimeSpan.FromMinutes(10));
```

Recurring:

```csharp
RecurringJob.AddOrUpdate<IReportJob>(
    "daily-sales-report",
    job => job.GenerateDailySalesReportAsync(CancellationToken.None),
    Cron.Daily);
```

Use stable recurring job IDs. Changing the ID creates a new recurring job instead of updating the existing one.

## Hangfire Retries

Hangfire retries failed jobs by default. Retry attempts can be controlled:

```csharp
[AutomaticRetry(Attempts = 3)]
public async Task GenerateDailySalesReportAsync(CancellationToken ct = default)
{
    // work
}
```

Retries are useful for transient failures, but the job must be idempotent.

## Idempotent Job Example

Report generation jobs may execute more than once.

Use a unique business key:

```sql
CREATE UNIQUE INDEX UX_Reports_ReportDate_Type
ON Reports (ReportDate, Type);
```

Job:

```csharp
public async Task GenerateDailySalesReportAsync(DateOnly reportDate, CancellationToken ct)
{
    var exists = await _dbContext.Reports.AnyAsync(
        x => x.ReportDate == reportDate && x.Type == "daily-sales",
        ct);

    if (exists)
    {
        return;
    }

    var report = await _reportBuilder.BuildDailySalesReportAsync(reportDate, ct);

    _dbContext.Reports.Add(report);
    await _dbContext.SaveChangesAsync(ct);
}
```

The unique index is the final protection against duplicates.

## Row Claiming Pattern

For batch jobs, claim rows safely.

```csharp
public async Task ProcessPendingEmailsAsync(CancellationToken ct)
{
    var batch = await _dbContext.EmailOutbox
        .Where(x => x.Status == EmailStatus.Pending)
        .OrderBy(x => x.CreatedAt)
        .Take(50)
        .ToListAsync(ct);

    foreach (var email in batch)
    {
        email.Status = EmailStatus.Processing;
        email.LockedAt = DateTimeOffset.UtcNow;
    }

    await _dbContext.SaveChangesAsync(ct);

    foreach (var email in batch)
    {
        await SendOneEmailAsync(email, ct);
    }
}
```

For multiple workers, use stronger database locking or atomic update patterns so two workers do not claim the same rows.

## Quartz.NET Setup

Quartz is excellent for advanced schedules.

```csharp
builder.Services.AddQuartz(config =>
{
    var jobKey = new JobKey("cleanup-expired-sessions");

    config.AddJob<CleanupExpiredSessionsJob>(options =>
        options.WithIdentity(jobKey));

    config.AddTrigger(options =>
        options
            .ForJob(jobKey)
            .WithIdentity("cleanup-expired-sessions-trigger")
            .WithCronSchedule("0 0/15 * * * ?"));
});

builder.Services.AddQuartzHostedService(options =>
{
    options.WaitForJobsToComplete = true;
});
```

Job:

```csharp
public sealed class CleanupExpiredSessionsJob : IJob
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<CleanupExpiredSessionsJob> _logger;

    public CleanupExpiredSessionsJob(
        AppDbContext dbContext,
        ILogger<CleanupExpiredSessionsJob> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var cutoff = DateTimeOffset.UtcNow.AddDays(-30);

        var deleted = await _dbContext.Sessions
            .Where(x => x.ExpiresAt < cutoff)
            .ExecuteDeleteAsync(ct);

        _logger.LogInformation("Deleted {Count} expired sessions", deleted);
    }
}
```

## Preventing Concurrent Execution

Quartz:

```csharp
[DisallowConcurrentExecution]
public sealed class CleanupExpiredSessionsJob : IJob
{
    public Task Execute(IJobExecutionContext context)
    {
        return Task.CompletedTask;
    }
}
```

Hangfire has attributes and distributed locks, but correctness should still come from idempotency and database constraints where possible.

## Cancellation And Shutdown

Jobs should accept cancellation tokens.

```csharp
public async Task ImportLargeFileAsync(int fileId, CancellationToken ct)
{
    await foreach (var row in _reader.ReadRowsAsync(fileId, ct))
    {
        ct.ThrowIfCancellationRequested();
        await _processor.ProcessRowAsync(row, ct);
    }
}
```

Long jobs should checkpoint progress:

```text
file id
last processed row
status
updated at
```

This allows safe resume after failure.

## Monitoring

Track:

- job success/failure count;
- retry count;
- job duration;
- queue length;
- oldest pending job age;
- recurring job last success time;
- stuck processing jobs;
- dead-letter/final failure count.

The background job patterns covered here -- fire-and-forget execution, scheduled recurrence, idempotent handlers, row-level claiming for batch processing, and progress checkpointing -- serve the majority of production scheduling needs.
