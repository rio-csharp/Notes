# Production Troubleshooting Method

## Core Idea

Production troubleshooting is a structured way to reduce impact, find evidence, understand causes, and prevent repeat failures.

The first principle:

> Stabilize first, investigate deeply second.

During an incident, the priority is:

1. protect users;
2. reduce impact;
3. restore service;
4. preserve evidence;
5. identify root cause;
6. prevent recurrence.

## Troubleshooting Flow

```text
Symptom
  -> scope
  -> impact
  -> recent changes
  -> logs
  -> metrics
  -> traces
  -> dependency checks
  -> hypothesis
  -> mitigation
  -> verification
  -> root cause
  -> prevention actions
```

This flow prevents random guessing.

## Step 1: Define The Symptom

Bad:

```text
The system is slow.
```

Better:

```text
POST /api/orders p95 latency increased from 300ms to 8s starting at 10:05 UTC.
Error rate is 12%.
Impact is limited to order creation.
The issue appears only in production version 2026.05.03.4.
```

A useful symptom statement includes:

- affected feature;
- affected endpoint or page;
- start time;
- severity;
- latency/error rate;
- impacted users or tenants;
- deployment version;
- region/environment.

## Step 2: Check Scope

Ask:

```text
Which endpoint/page?
Which users or tenants?
Which region?
Which deployment version?
Which browser or device?
Which database or shard?
All traffic or one path?
Only reads, only writes, or both?
Only authenticated users?
```

Scope helps reduce the search area.

Example:

```text
All endpoints slow -> infrastructure, database, thread pool, CPU, network, global dependency.
One endpoint slow -> query, code path, external call, payload, lock contention.
One tenant slow -> data volume, tenant-specific config, bad record, permission scope.
One browser broken -> frontend compatibility, cache, polyfill, CSP, asset issue.
```

## Step 3: Review Recent Changes

Recent changes are not always the cause, but they are often the fastest place to check.

Common changes:

- application deployment;
- configuration change;
- database migration;
- index change;
- secret rotation;
- traffic spike;
- feature flag change;
- infrastructure scaling;
- CDN/cache change;
- third-party outage;
- certificate update;
- dependency package upgrade.

Create a change timeline:

```text
09:50 database migration completed
10:00 API version 2026.05.03.4 deployed
10:05 p95 latency increased
10:07 SQL DTU/CPU increased
10:10 error rate increased
```

The timeline helps compare symptoms against events.

## Step 4: Logs, Metrics, And Traces

Logs answer:

```text
What happened?
Which request/user/tenant?
What exception?
What important state was present?
```

Metrics answer:

```text
How many?
How often?
Since when?
How severe?
Is the system saturated?
```

Traces answer:

```text
Where is time spent?
Which dependency is slow?
Which spans failed?
Which service called which service?
```

Use all three together. Logs without metrics can over-focus on one error. Metrics without traces do not show where time went. Traces without logs may miss business context.

## Correlation IDs

Correlation IDs connect a user request across logs, traces, and service calls. (For a deeper discussion of logging, observability, and OpenTelemetry, see Chapter 3, "Logging And Observability In ASP.NET Core".)

ASP.NET Core middleware example:

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-ID";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ILogger<CorrelationIdMiddleware> logger)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var value)
            ? value.ToString()
            : Guid.NewGuid().ToString("N");

        context.Response.Headers[HeaderName] = correlationId;

        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId
        }))
        {
            // BeginScope creates a logging scope that appends the key-value
            // pair to every log message emitted within this block. The scope
            // propagates through the async context automatically, so logs
            // written by deep call chains carry the same CorrelationId.
            await _next(context);
        }
    }
}
```

Register:

```csharp
app.UseMiddleware<CorrelationIdMiddleware>();
```

Log example:

```csharp
logger.LogInformation(
    "Creating order for CustomerId {CustomerId}",
    request.CustomerId);
```

The logging scope attaches `CorrelationId` to every log inside the request.

## Quick Mitigation Options

Mitigation reduces impact. It may not fix root cause yet.

Common options:

- rollback a deployment;
- disable a feature flag;
- scale out;
- restart unhealthy instances after preserving evidence;
- route traffic away from a bad region;
- temporarily reduce traffic to a failing dependency;
- pause background workers;
- stop a bad scheduled job;
- clear or bypass a bad cache carefully;
- kill a blocking database session carefully;
- increase capacity if the bottleneck is proven.

Do not blindly:

- increase timeouts;
- restart everything without collecting data;
- clear all caches;
- kill database sessions without understanding impact;
- make several unrelated changes at once.

## Evidence To Preserve

Before restarting or changing too much, capture:

```text
deployment version
configuration version
error logs
metrics screenshots or query links
traces
thread dump / process dump when needed
database blocking/deadlock info
queue depth
CPU and memory counters
browser console/network info for frontend issues
```

For .NET:

```powershell
dotnet-counters monitor --process-id 1234 --counters System.Runtime
dotnet-dump collect --process-id 1234 --output app.dmp
dotnet-gcdump collect --process-id 1234 --output app.gcdump
```

Note: in newer versions of `dotnet-counters`, provider names must be passed with the `--counters` flag as comma-separated values rather than space-separated positional arguments.

In containers/Kubernetes:

```powershell
kubectl get pods
kubectl describe pod orders-api-abc123
kubectl logs orders-api-abc123
kubectl logs orders-api-abc123 --previous
kubectl top pod
kubectl get events --sort-by=.lastTimestamp
```

## Slow API Investigation

Check:

- request duration percentiles;
- database duration;
- external API duration;
- Redis/cache latency;
- thread pool metrics;
- CPU and memory;
- query plan;
- lock waits;
- payload size;
- retry behavior;
- connection pool usage.

Example trace shape:

```text
POST /api/orders                  8.2s
  Authorization middleware        15ms
  Validate request                4ms
  SQL: SELECT Customer            40ms
  SQL: INSERT Order               80ms
  HTTP: payment provider          7.8s
  SQL: UPDATE PaymentStatus       90ms
```

Here the payment provider dominates.

## Database Timeout Investigation

Check:

- slow query logs;
- actual execution plan;
- missing indexes;
- blocking sessions;
- deadlocks;
- connection pool exhaustion;
- transaction duration;
- recent schema/index changes;
- statistics freshness;
- parameter sniffing;
- large result sets.

SQL Server blocking query:

```sql
SELECT
    r.session_id,
    r.blocking_session_id,
    r.status,
    r.wait_type,
    r.wait_time,
    r.command,
    t.text AS sql_text
FROM sys.dm_exec_requests AS r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) AS t
WHERE r.blocking_session_id <> 0;
```

## Queue Or Message Backlog Investigation

A queue backlog means producers are creating work faster than consumers finish it.

Check:

- queue length;
- oldest message age;
- consumer error rate;
- consumer throughput;
- dead-letter queue;
- retry count;
- downstream dependency latency;
- recent message contract changes;
- poison messages;
- partition or consumer group imbalance.

Example:

```text
Orders API publishes 500 messages/min.
Billing worker processes 80 messages/min.
Queue depth grows by 420 messages/min.
Oldest message age is now 45 minutes.
```

Mitigation options:

- scale consumers;
- pause producers if safe;
- fix poison message handling;
- move invalid messages to DLQ;
- reduce slow downstream calls;
- increase partition/consumer capacity if the system supports it.

## Frontend Blank Screen

Check:

- browser console;
- network tab;
- failed JavaScript chunks;
- JavaScript runtime errors;
- API 401/403 loops;
- incorrect environment variables;
- CDN cache;
- source maps;
- auth redirect loop;
- CSP errors.

Frontend issues often do not appear in backend logs.

## Incident Communication

Good update:

```text
Impact: Order creation is failing for approximately 12% of requests.
Start time: 10:05 UTC.
Current action: We rolled back API version 2026.05.03.4 and are monitoring error rate.
Next update: 15 minutes.
```

Avoid:

- vague updates;
- blame;
- too much speculation;
- silence;
- changing estimated recovery time repeatedly without evidence.

## Working With Hypotheses

Use evidence-based hypotheses.

```text
Hypothesis:
The new order query causes table scans for large tenants.

Evidence:
p95 latency increased after deployment.
Trace shows SQL span dominates.
Actual plan shows clustered index scan.
Large tenants are affected more than small tenants.

Test:
Run query with production-like parameter values and inspect actual plan.

Mitigation:
Rollback query change or add safe index after validation.
```

This keeps investigation disciplined.

## Postmortem Template

```text
Title:
Date:
Severity:
Impact:
Timeline:
Detection:
Root cause:
Contributing factors:
What went well:
What went poorly:
Where we got lucky:
Prevention actions:
Owners:
Due dates:
```

Good action items are specific and owned:

```text
Add p95 latency alert for POST /api/orders.
Owner: API team.
Due: 2026-05-10.
```

Weak action item:

```text
Be more careful next time.
```
