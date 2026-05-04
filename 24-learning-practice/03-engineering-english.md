# Engineering English Communication

## Core Idea

Engineering English is the ability to explain systems, decisions, problems, risks, and trade-offs clearly in English.

Chinese notes:

- `clarify`: 澄清.
- `trade-off`: 权衡.
- `mitigation`: 缓解措施.
- `assumption`: 假设.
- `constraint`: 约束.

Good engineering communication is concrete, structured, and evidence-based.

## Explaining Technical Background

Use this as a compact technical introduction in documentation, team onboarding, or collaboration.

```text
I work across backend and frontend systems using .NET, ASP.NET Core, React,
TypeScript, and SQL databases.

My work often includes API design, database modeling, frontend workflows,
authorization, performance optimization, testing, and production troubleshooting.

I try to connect implementation details with system qualities such as security,
maintainability, observability, and reliability.
```

## Explaining A Project

```text
This project is a B2B order management platform.
It helps internal teams create orders, manage approvals, upload documents,
track payment status, and monitor fulfillment.

The backend uses ASP.NET Core, EF Core, and SQL Server.
The frontend uses React, TypeScript, React Router, and TanStack Query.
Redis is used for selected read-heavy data, and a message broker is used for
asynchronous notifications and background processing.
```

## Explaining A Technical Challenge

```text
The order list endpoint became slower as data volume increased.
Instead of adding cache immediately, we first measured where time was spent.

Traces showed that most latency came from SQL.
The execution plan showed that the query was scanning and sorting more rows
than necessary.

We improved the query by using DTO projection, AsNoTracking, server-side
pagination, and a composite covering index that matched the filter and sort pattern.
```

## Explaining A Trade-off

```text
We considered microservices, but we started with a modular monolith.

The benefit was simpler deployment, easier transactions, and faster development
while the domain boundaries were still changing.

The cost was that modules could not be deployed or scaled independently yet.
We accepted that cost and documented revisit conditions, such as clear module
ownership or very different scaling needs.
```

Useful phrases:

```text
The benefit is...
The cost is...
The risk is...
The trade-off depends on...
This is acceptable because...
We should revisit this if...
```

## Explaining An Architecture Decision

```text
The decision was to use Redis for product lookup caching.

The context was that the product lookup API had repeated read traffic and
database CPU increased during spikes.

The alternatives were database-only reads, in-memory cache, Redis, and read replicas.

We chose Redis because the application runs multiple API instances and needs a
shared cache. The main risks are stale data, cache invalidation, and Redis becoming
an operational dependency.
```

## Explaining A Production Issue

```text
The symptom was that POST /api/orders p95 latency increased from 300ms to 8 seconds.

The impact was limited to order creation. Read endpoints were healthy.

We checked recent changes, metrics, logs, and traces.
The traces showed that most time was spent in one SQL query.

The immediate mitigation was to roll back the recent query change.
The long-term fix was to add a better index and include query-plan review for
high-traffic endpoints.
```

## Incident Update Template

```text
Impact:
Order creation is slow for approximately 20% of requests.

Start time:
10:05 UTC.

Current status:
The API is available, but p95 latency is elevated.

Current action:
We are rolling back the latest API deployment and monitoring latency.

Next update:
In 15 minutes.
```

Keep incident updates short, factual, and calm.

## Clarifying Questions

Useful phrases:

```text
Can I clarify the requirement first?
Are we optimizing for latency, cost, reliability, or delivery speed?
Is strong consistency required?
What is the expected scale?
What is the failure behavior if this dependency is unavailable?
Which users are affected?
Is this a temporary workaround or the long-term design?
```

## When You Need Time To Think

```text
Let me think through the trade-offs for a moment.
I would approach this in a few steps.
The first thing I would check is...
There are two separate concerns here: correctness and operations.
```

## When You Are Unsure

```text
I have not used that exact tool in production, but I understand the concept.
Based on similar systems, I would evaluate it by looking at reliability,
operational complexity, cost, and team familiarity.

I would verify the details in the official documentation before making a final decision.
```

This is better than pretending certainty.

## Code Review Language

Specific and respectful:

```text
This query does not include TenantId. Could it return data from another tenant
if the order ID is guessed?
```

```text
This migration drops a column immediately. Can we use an expand-contract approach
so old application instances remain compatible during rolling deployment?
```

```text
This retry has no upper bound. If the provider is slow, it may amplify traffic.
Could we add timeout, backoff, and a maximum attempt count?
```

## Technical Writing Patterns

### Problem - Evidence - Decision

```text
Problem:
The order list endpoint became slow for large tenants.

Evidence:
Traces showed SQL dominated request time, and the execution plan showed a scan.

Decision:
Change the query shape and add a composite index before introducing cache.
```

### Context - Options - Consequences

```text
Context:
The team needs asynchronous notifications.

Options:
Database polling, Service Bus, Kafka, RabbitMQ.

Consequences:
Service Bus gives managed queues and DLQ support, but it is less suitable than Kafka
for replayable event streams.
```

### Symptom - Scope - Mitigation

```text
Symptom:
Frontend users see a blank screen after deployment.

Scope:
Only returning users are affected. Incognito sessions work.

Mitigation:
Purge CDN cache and add safer cache headers for index.html.
```

## Pronunciation Practice Terms

- authentication
- authorization
- concurrency
- scalability
- availability
- consistency
- observability
- idempotency
- orchestration
- reconciliation
- dependency injection
- distributed transaction
- optimistic concurrency
- eventual consistency
- architecture decision record
- correlation ID
- graceful shutdown
- cache invalidation

## Daily English Practice

Every day, explain one concept in English:

1. short version: 2 minutes.
2. detailed version: 5 minutes.
3. practical version: include one code or system example.

Suggested topics:

- dependency injection lifetime;
- EF Core query optimization;
- React rendering;
- JWT validation;
- Redis cache-aside;
- Kafka consumer groups;
- database deadlock;
- frontend blank screen;
- ADR trade-off.

## Knowledge Checks

### What makes engineering English clear?

Clear engineering English is structured, concrete, and tied to evidence. It explains context, decision, trade-offs, and consequences.

### Why is it okay to say you are unsure?

Technical accuracy matters. It is better to state uncertainty and explain how you would verify than to pretend knowledge.

### Why are incident updates different from deep technical explanations?

Incident updates should be short and focused on impact, current action, and next update. Deep technical analysis can come after stabilization.

## Practice Task

Write English explanations for:

```text
1. One system you worked on or studied.
2. One slow API investigation.
3. One architecture trade-off.
4. One production incident update.
5. One code review comment.
```
