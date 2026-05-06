# Background Services In ASP.NET Core

## Core Idea

Not all useful application work belongs on the HTTP request path. ASP.NET Core also hosts long-running or repeating processes that operate beside the request pipeline: queue consumers, outbox publishers, cleanup workers, schedulers, and similar background activities.

This chapter treats background services as part of the application's hosting model rather than as an afterthought. Once work moves outside the request path, the operational concerns change. Lifetime management, cancellation, retries, idempotency, multi-instance behavior, and visibility become central.

## Hosted Services As Long-Lived Application Components

ASP.NET Core supports hosted services through `IHostedService` and the more commonly used `BackgroundService` base type.

```csharp
public interface IHostedService
{
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}
```

```csharp
public abstract class BackgroundService : IHostedService, IDisposable
{
    protected abstract Task ExecuteAsync(CancellationToken stoppingToken);
}
```

The important idea is not the interface shape alone. Hosted services are long-lived parts of the host. They are closer to application infrastructure than to ordinary request-scoped objects. That difference drives much of the design guidance that follows.

## A Typical Worker Loop

A background worker often follows a loop of "create a unit of work, process it, handle failures, wait or continue."

```csharp
public sealed class OutboxPublisher : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxPublisher> _logger;

    public OutboxPublisher(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxPublisher> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Outbox publisher started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var processor = scope.ServiceProvider.GetRequiredService<OutboxProcessor>();

                await processor.ProcessBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Outbox publisher failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }

        _logger.LogInformation("Outbox publisher stopped.");
    }
}
```

```csharp
builder.Services.AddHostedService<OutboxPublisher>();
```

This example already illustrates several deeper themes: worker loops must be cancellation-aware, should usually create scoped units of work, and must survive ordinary processing failures without silently disappearing.

## Scoped Dependencies In Long-Lived Workers

One of the most frequent design errors in background-service code is injecting scoped services directly into the long-lived worker object.

```csharp
public sealed class BadWorker : BackgroundService
{
    private readonly AppDbContext _dbContext;

    public BadWorker(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }
}
```

This is risky because the worker is long-lived while `DbContext` is scoped and not thread-safe. Even if the code appears to run, it often creates stale state, excessive tracking, disposal problems, or subtle concurrency issues.

The usual pattern is to create a scope per batch or per unit of work:

```csharp
public sealed class GoodWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public GoodWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            await dbContext.SaveChangesAsync(stoppingToken);

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
```

This aligns dependency lifetime with actual work lifetime instead of stretching scoped infrastructure across the entire process lifetime.

## Cancellation And Graceful Shutdown

Background services must respect host shutdown. Cloud platforms, orchestrators, and deployment systems rely on cooperative shutdown rather than hard process termination whenever possible.

```csharp
await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
await processor.ProcessAsync(stoppingToken);
```

Ignoring the supplied cancellation token produces brittle workers:

```csharp
Thread.Sleep(TimeSpan.FromSeconds(5));
await processor.ProcessAsync(CancellationToken.None);
```

This is more than etiquette. Shutdown-aware workers can stop predictably, reduce data corruption risk, and avoid delaying deployments because the host is waiting for uncooperative background code to end.

## Failure Handling Inside The Loop

A background worker that exits on the first ordinary exception is often operationally weak.

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    while (!stoppingToken.IsCancellationRequested)
    {
        await ProcessAsync(stoppingToken);
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
    }
}
```

If `ProcessAsync` throws here, the worker may stop entirely. A more robust structure isolates failures and continues operating:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    var delay = TimeSpan.FromSeconds(5);

    while (!stoppingToken.IsCancellationRequested)
    {
        try
        {
            await ProcessAsync(stoppingToken);
            delay = TimeSpan.FromSeconds(5);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            break;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Background processing failed.");
            delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
        }

        await Task.Delay(delay, stoppingToken);
    }
}
```

Backoff is especially important when the failure source is a downstream system. Without it, the worker may become a loop that continuously hammers an already-failing dependency.

## Queue Consumers And At-Least-Once Reality

Many background services are queue consumers.

```csharp
public interface IMessageQueue
{
    Task<QueueMessage?> ReceiveAsync(CancellationToken cancellationToken);
    Task CompleteAsync(QueueMessage message, CancellationToken cancellationToken);
    Task AbandonAsync(QueueMessage message, CancellationToken cancellationToken);
}
```

```csharp
public sealed class EmailQueueWorker : BackgroundService
{
    private readonly IMessageQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EmailQueueWorker> _logger;

    public EmailQueueWorker(
        IMessageQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<EmailQueueWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var message = await _queue.ReceiveAsync(stoppingToken);

            if (message is null)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                continue;
            }

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var sender = scope.ServiceProvider.GetRequiredService<EmailSender>();

                await sender.SendAsync(message.Body, stoppingToken);
                await _queue.CompleteAsync(message, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to process message {MessageId}",
                    message.Id);

                await _queue.AbandonAsync(message, stoppingToken);
            }
        }
    }
}
```

Queue consumers must be designed with the assumption that the same message may arrive more than once. At-least-once delivery is a normal reliability model, not an exceptional edge case.

## Idempotency As A Worker Requirement

Duplicate delivery becomes dangerous when side effects are not idempotent.

```text
worker sends email
worker crashes before acknowledging message
queue redelivers message
worker sends email again
```

Typical responses include:

- storing processed message IDs;
- using business-level unique keys;
- relying on external idempotency-key support;
- using inbox or outbox patterns;
- designing the operation itself to be naturally repeat-safe.

```csharp
public async Task ProcessMessageAsync(QueueMessage message, CancellationToken cancellationToken)
{
    var alreadyProcessed = await _dbContext.InboxMessages
        .AnyAsync(x => x.MessageId == message.Id, cancellationToken);

    if (alreadyProcessed)
    {
        return;
    }

    await SendEmailAsync(message.Body, cancellationToken);

    _dbContext.InboxMessages.Add(new InboxMessage
    {
        MessageId = message.Id,
        ProcessedAtUtc = DateTime.UtcNow
    });

    await _dbContext.SaveChangesAsync(cancellationToken);
}
```

Even here, the ordering of the side effect and the inbox record matters. If the external effect happens first and the process crashes before the record is stored, duplicates remain possible. Idempotency is therefore not a checkbox. It is a property of the full workflow.

## Multi-Instance Coordination

In production, an application often runs on more than one instance. That changes the worker problem.

```text
api-1
api-2
api-3
```

If all three instances run the same scheduled cleanup or outbox poller without coordination, work may be duplicated or race-prone.

Common coordination strategies include:

- competing consumers on a queue;
- row-claiming in a database;
- distributed locks;
- leader election;
- external schedulers such as Hangfire, Quartz, or platform cron systems.

```sql
UPDATE TOP (10) OutboxMessages
SET Status = 'Processing',
    LockedUntilUtc = DATEADD(minute, 5, SYSUTCDATETIME())
OUTPUT inserted.*
WHERE Status = 'Pending'
  AND (LockedUntilUtc IS NULL OR LockedUntilUtc < SYSUTCDATETIME());
```

The point of such a pattern is not database cleverness for its own sake. It is to turn a multi-instance race into an explicit coordination protocol.

## The Outbox Pattern

One of the most important reliability patterns for background processing is the outbox.

The underlying problem is straightforward:

```text
1. save order in database
2. publish OrderCreated to message broker
```

If the database transaction succeeds but message publication fails, the system becomes inconsistent. The outbox pattern solves this by storing the outgoing message in the same database transaction as the business change, then letting a background worker publish it later.

```text
transaction:
  save order
  save outbox message

background worker:
  read pending outbox rows
  publish them
  mark them as sent
```

```csharp
public sealed class OutboxMessage
{
    public Guid Id { get; init; }
    public string Type { get; init; } = "";
    public string PayloadJson { get; init; } = "";
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? PublishedAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public string? LastError { get; set; }
}
```

```csharp
public sealed class OutboxProcessor
{
    private readonly AppDbContext _dbContext;
    private readonly IMessagePublisher _publisher;

    public OutboxProcessor(AppDbContext dbContext, IMessagePublisher publisher)
    {
        _dbContext = dbContext;
        _publisher = publisher;
    }

    public async Task ProcessBatchAsync(CancellationToken cancellationToken)
    {
        var messages = await _dbContext.OutboxMessages
            .Where(x => x.PublishedAtUtc == null)
            .OrderBy(x => x.CreatedAtUtc)
            .Take(20)
            .ToListAsync(cancellationToken);

        foreach (var message in messages)
        {
            try
            {
                await _publisher.PublishAsync(message.Type, message.PayloadJson, cancellationToken);

                message.PublishedAtUtc = DateTime.UtcNow;
                message.LastError = null;
            }
            catch (Exception ex)
            {
                message.AttemptCount++;
                message.LastError = ex.Message;
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
```

The outbox is not just a data-access pattern. It is a coordination pattern between transactional data and eventually delivered side effects.

## Periodic Work And Scheduling Choices

For simple repeating work, `PeriodicTimer` often expresses intent more clearly than manually managed delay loops.

```csharp
public sealed class CleanupWorker : BackgroundService
{
    private readonly ILogger<CleanupWorker> _logger;

    public CleanupWorker(ILogger<CleanupWorker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            _logger.LogInformation("Running cleanup.");
            await RunCleanupAsync(stoppingToken);
        }
    }

    private static Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
```

Once scheduling becomes more complex, specialized infrastructure often becomes the better choice. ASP.NET Core hosting can run workers, but it is not always the best scheduler for every workload. Cron-driven jobs, externally orchestrated scheduled tasks, or dedicated job frameworks may offer stronger guarantees and clearer operational visibility.

## Visibility And Operational Safety

Background services can fail quietly if the application emits no signal about their health.

Useful signals often include:

- last successful run time;
- failure count;
- retry count;
- queue backlog;
- processing latency;
- dead-letter volume;
- items processed per interval;
- explicit worker health status.

```csharp
_logger.LogInformation(
    "Processed {MessageCount} outbox messages in {ElapsedMilliseconds}ms",
    count,
    elapsedMilliseconds);
```

This is another place where observability and architecture meet. A worker that technically runs but cannot be monitored is often harder to trust in production than one whose behavior is explicit and measurable.
