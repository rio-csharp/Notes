# Background Services In ASP.NET Core

## Core Idea

Background services run work outside the HTTP request path.

Chinese notes:

- `BackgroundService`: 后台服务.
- `IHostedService`: 托管服务.
- `worker`: 后台工作进程.
- `graceful shutdown`: 优雅关闭.
- `outbox`: 发件箱模式, used to reliably publish messages after database changes.
- `idempotency`: 幂等性, meaning repeated execution has the same final effect.

Use background services for:

- queue consumers;
- scheduled cleanup;
- outbox publishers;
- email sending;
- report generation;
- file processing;
- cache warmup;
- periodic health checks.

Key takeaway:

> I use background services for work that should not block the HTTP request, but I design them with cancellation, retry, idempotency, monitoring, and multi-instance safety.

## IHostedService And BackgroundService

`IHostedService` is the low-level interface:

```csharp
public interface IHostedService
{
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}
```

`BackgroundService` is a helper base class for long-running services:

```csharp
public abstract class BackgroundService : IHostedService, IDisposable
{
    protected abstract Task ExecuteAsync(CancellationToken stoppingToken);
}
```

Most application workers use `BackgroundService`.

## Basic BackgroundService Example

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

Registration:

```csharp
builder.Services.AddHostedService<OutboxPublisher>();
```

## Scoped Services In BackgroundService

Hosted services are long-lived. They are effectively singleton-like.

Do not inject scoped services directly:

```csharp
public sealed class BadWorker : BackgroundService
{
    private readonly AppDbContext _dbContext; // bad

    public BadWorker(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        return Task.CompletedTask;
    }
}
```

Why it is wrong:

- `DbContext` is scoped;
- `DbContext` is not thread-safe;
- a long-lived `DbContext` can track too many entities;
- dependencies may be disposed incorrectly;
- data can become stale.

Better:

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

Practical explanation:

> I create a DI scope per unit of work or per batch, then resolve scoped services inside that scope.

## Graceful Shutdown

Background services must respect `CancellationToken`.

Good:

```csharp
await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
await processor.ProcessAsync(stoppingToken);
```

Bad:

```csharp
Thread.Sleep(TimeSpan.FromSeconds(5));
await processor.ProcessAsync(CancellationToken.None);
```

Why it matters:

- deployments need to stop the app cleanly;
- Kubernetes and cloud platforms send shutdown signals;
- in-flight work may need to finish or stop safely;
- ignoring cancellation can delay shutdown or cause data corruption.

Pattern:

```csharp
try
{
    await DoWorkAsync(stoppingToken);
}
catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
{
    // Expected during shutdown.
}
```

## Error Handling In Worker Loops

A common bug:

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

If `ProcessAsync` throws, the worker can stop permanently.

Better:

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

This uses simple backoff.

Chinese note:

> `backoff` means waiting longer after repeated failures to avoid hammering a failing dependency.

## Queue Consumer Example

Background services are often used as queue consumers.

Conceptual interface:

```csharp
public interface IMessageQueue
{
    Task<QueueMessage?> ReceiveAsync(CancellationToken cancellationToken);
    Task CompleteAsync(QueueMessage message, CancellationToken cancellationToken);
    Task AbandonAsync(QueueMessage message, CancellationToken cancellationToken);
}
```

Consumer:

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

Key point:

> Queue systems often provide at-least-once delivery, which means the same message may be delivered more than once. Consumers must be idempotent.

## Idempotent Processing

Problem:

```text
Worker sends an email.
Worker crashes before acknowledging the queue message.
Queue redelivers the same message.
Worker sends the email again.
```

Solutions:

- store processed message IDs;
- use business unique keys;
- design operations to be naturally idempotent;
- use database constraints;
- use outbox/inbox patterns;
- make external calls with idempotency keys if supported.

Example:

```csharp
public sealed class InboxMessage
{
    public string MessageId { get; init; } = "";
    public DateTime ProcessedAtUtc { get; init; }
}
```

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

Caveat:

> If the side effect happens before saving the inbox record, a crash can still duplicate the side effect. For external calls, prefer idempotency keys when available.

## Avoiding Duplicate Background Jobs Across Instances

In production, you may run multiple app instances:

```text
api-1
api-2
api-3
```

If each instance runs the same cleanup job, it may execute three times.

Solutions:

| Solution | When to use |
| --- | --- |
| Queue competing consumers | Work can be split into messages |
| Database row claiming | Jobs are stored in DB and workers claim rows |
| Distributed lock | Only one instance should run a job |
| Leader election | One active scheduler at a time |
| External scheduler | Cloud scheduler, Hangfire, Quartz, Kubernetes CronJob |

Database row claiming idea:

```sql
UPDATE TOP (10) OutboxMessages
SET Status = 'Processing',
    LockedUntilUtc = DATEADD(minute, 5, SYSUTCDATETIME())
OUTPUT inserted.*
WHERE Status = 'Pending'
  AND (LockedUntilUtc IS NULL OR LockedUntilUtc < SYSUTCDATETIME());
```

The goal:

> Multiple workers can run safely because each worker claims a different set of rows.

## Outbox Pattern

Problem:

```text
1. Save order to database.
2. Publish OrderCreated message to Kafka.
```

What if the database save succeeds but publishing fails?

The system becomes inconsistent.

Outbox solution:

```text
In the same database transaction:
  1. Save order.
  2. Save OutboxMessage(OrderCreated).

Background worker:
  1. Reads pending outbox messages.
  2. Publishes them to Kafka/message broker.
  3. Marks them as published.
```

Example entity:

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

Processor sketch:

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

Production caveat:

> In multi-instance systems, this simple query can allow two workers to pick the same rows. Production implementations need row claiming, locks, or broker semantics.

## Scheduling

For simple periodic work, `BackgroundService` with `PeriodicTimer` is clearer than manual `Task.Delay`.

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

For complex scheduling, use:

- Hangfire;
- Quartz.NET;
- cloud scheduler;
- Kubernetes CronJob;
- Azure WebJobs / Functions.

## Monitoring Background Services

Track:

- last successful run time;
- failure count;
- retry count;
- processing latency;
- queue backlog;
- dead-letter count;
- items processed per minute;
- worker health status.

Example log:

```csharp
_logger.LogInformation(
    "Processed {MessageCount} outbox messages in {ElapsedMilliseconds}ms",
    count,
    elapsedMilliseconds);
```

Important:

> A background service can fail silently if no one monitors it. Production worker design should include logs, metrics, health signals, and clear failure handling.

## Review Questions

### When use a background service?

Use it when work should happen outside the request path, such as queue processing, scheduled cleanup, outbox publishing, report generation, or file processing.

### Why not inject `DbContext` directly?

Hosted services are long-lived. `DbContext` is scoped and not thread-safe. Create a scope for each unit of work and resolve `DbContext` inside that scope.

### How do you avoid duplicate background processing across instances?

Use queue competing consumers, database row claiming, distributed locks, leader election, or an external scheduler depending on the job.

### How do you handle failures in a worker?

Catch exceptions inside the loop, log them, use retry/backoff, move poison messages to a dead-letter queue, and expose metrics or health checks.

### Why is idempotency important for queue consumers?

Most queue systems provide at-least-once delivery. A message may be processed more than once after crashes, timeouts, or acknowledgement failures. Idempotent consumers prevent duplicate side effects.

### What is the outbox pattern?

The outbox pattern saves business data and an outgoing message in the same database transaction. A background worker later publishes the message and marks it as published. This avoids losing messages when database writes and message publishing cannot share one transaction.

## Common Mistakes

### Mistake: Ignoring cancellation token

Why it is wrong:

> The app may fail to shut down cleanly during deployments or scale-in events.

Better answer:

> Pass `CancellationToken` to async APIs and handle expected cancellation.

### Mistake: Injecting scoped service directly

Why it is wrong:

> Hosted services are long-lived, while scoped services are designed for a scope such as a request or batch.

Better answer:

> Inject `IServiceScopeFactory` and create a scope per unit of work.

### Mistake: No error handling in loop

Why it is wrong:

> One exception can stop the worker permanently.

Better answer:

> Catch exceptions inside the loop, log them, and use retry/backoff.

### Mistake: Tight loop with no delay or backoff

Why it is wrong:

> It can consume CPU and overload a failing dependency.

Better answer:

> Use `PeriodicTimer`, queue blocking reads, or delay with backoff.

### Mistake: No monitoring for failed jobs

Why it is wrong:

> Background failures may not affect HTTP health immediately, but business workflows can silently stop.

Better answer:

> Track worker metrics, logs, last success time, and dead-letter queues.

### Mistake: Running heavy jobs inside API request

Why it is wrong:

> It increases request latency and makes user-facing operations fragile.

Better answer:

> Persist the request, enqueue work, and process it asynchronously when appropriate.

## Practice Task

Implement:

1. a `BackgroundService` using `PeriodicTimer`;
2. scoped `DbContext` resolution with `IServiceScopeFactory`;
3. error handling with backoff;
4. an idempotent queue consumer using processed message IDs;
5. a simple outbox publisher;
6. metrics/logs for success count, failure count, and last successful run.
