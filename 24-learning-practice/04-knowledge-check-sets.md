# Knowledge Check Sets

## Core Idea

Knowledge checks help turn passive reading into active understanding.

Chinese notes:

- `knowledge check`: 知识检查.
- `learning drill`: 学习练习.
- `self-assessment`: 自我评估.
- `trade-off`: 权衡.

Use these sets to practice explaining concepts, connecting topics, and finding weak points.

## How To Use These Sets

For each set:

```text
1. Answer out loud.
2. Draw or write a small example.
3. Check the relevant knowledge-base file.
4. Add weak points to a review note.
5. Revisit weak points after a few days.
```

Do not memorize perfect wording. Practice accurate reasoning.

## Set 1: .NET Backend Foundations

Duration: 60 minutes.

### Warm-up

1. Explain the .NET execution model.
2. Explain what CLR provides.
3. Explain value type vs reference type with examples.
4. Explain why `async` does not automatically create a new thread.

### ASP.NET Core

1. Explain the request pipeline.
2. Middleware vs filters.
3. How should global exceptions be handled?
4. What is `ProblemDetails`?
5. How does model binding work?
6. How does validation work with `[ApiController]`?

### Dependency Injection

1. Explain Singleton, Scoped, and Transient.
2. Why is `DbContext` usually scoped?
3. What goes wrong if a scoped service is captured by a singleton?
4. When would a factory be useful?

### EF Core

1. What is change tracking?
2. Tracking vs no-tracking query.
3. What causes N+1 queries?
4. Include vs projection.
5. How can query shape affect performance?

## Set 2: React And Full-stack UI

Duration: 60 minutes.

### React

1. What causes React re-renders?
2. Explain reconciliation.
3. Why are keys important?
4. Explain stale closure.
5. How does `useEffect` cleanup work?

### State And Data Fetching

1. What is server state?
2. What problem does TanStack Query solve?
3. How do query keys work?
4. How do you handle optimistic updates?
5. Context vs Redux vs Zustand.

### Full-stack Page Design

1. Design an order list page with filters and pagination.
2. Where should filters live: component state or URL state?
3. How should frontend and backend contracts be defined?
4. How should API errors be displayed?
5. How should auth expiration be handled?

### Practical Scenario

1. Users report a blank page after deployment. What evidence do you collect?
2. A table with 100,000 rows is slow. What should change on frontend and backend?

## Set 3: Security And Identity

Duration: 45 minutes.

1. Authentication vs authorization.
2. JWT structure and validation.
3. Access token vs refresh token.
4. OAuth vs OIDC.
5. Authorization Code Flow with PKCE.
6. Where should tokens be stored in an SPA?
7. How can RBAC be designed?
8. What is resource-level authorization?
9. What is XSS and how can it be reduced?
10. What is CSRF and when does it matter?
11. How should webhook endpoints be protected?
12. Why is validating a JWT signature not enough?

## Set 4: Architecture

Duration: 75 minutes.

1. Explain layered architecture vs Clean Architecture.
2. When is DDD useful?
3. What is an aggregate?
4. What is CQRS?
5. Does CQRS require event sourcing?
6. What is the Outbox pattern?
7. Microservices vs modular monolith.
8. How can service boundaries be chosen?
9. How can distributed transactions be avoided?
10. What should an ADR include?
11. How can legacy systems be modernized safely?

## Set 5: System Design

Duration: 60 minutes.

Problem:

```text
Design a notification system.
```

Expected flow:

1. Clarify requirements.
2. Estimate scale.
3. Define APIs.
4. Design data model.
5. Draw high-level architecture.
6. Discuss queue and workers.
7. Discuss retries and dead-letter queue.
8. Discuss idempotency.
9. Discuss observability.
10. Discuss trade-offs.

Follow-ups:

### What if the provider is down?

Do not block the user request on the provider. Store the notification job, retry with exponential backoff, use a dead-letter queue after max attempts, and optionally fail over to another provider for critical notifications.

### How can duplicate notifications be prevented?

Use an idempotency key such as `notificationId` or `(eventId, channel, recipient)`. Store send attempts and make the worker check whether the notification was already successfully sent before sending again.

### How can user preferences be supported?

Store preferences by user, channel, topic, and frequency. The worker should check preferences before sending. For example, a user may allow email for billing but disable marketing notifications.

### How can workers scale?

Add more worker instances consuming from the queue, partition by topic or tenant if needed, control concurrency, and respect provider rate limits. Scaling must preserve idempotency because retries and parallelism can create duplicates.

### How can failures be monitored?

Track queue length, processing latency, retry count, dead-letter count, provider error rate, send success rate, and worker health. Alerts should fire when backlog or failure rate crosses a threshold.

## Set 6: Production Troubleshooting

Duration: 45 minutes.

Scenario:

```text
The order creation API suddenly has p95 latency of 8 seconds.
It was 300ms yesterday.
```

Questions:

1. What do you check first?
2. How do you determine scope?
3. What metrics do you check?
4. What logs do you check?
5. How do traces help?
6. What database checks do you do?
7. How do you mitigate quickly?
8. How do you verify recovery?
9. What goes into the postmortem?

Expected reasoning:

```text
Define symptom and impact.
Check recent changes.
Use traces to locate slow spans.
Check SQL plans, blocking, connection pool, external calls, CPU, memory, and thread pool.
Mitigate based on evidence.
Verify p95, error rate, and user impact.
Create prevention actions.
```

## Set 7: Collaboration Reflection

Duration: 45 minutes.

1. What technical problem taught you the most recently?
2. What disagreement helped clarify a better design?
3. What production issue changed your engineering habits?
4. What requirement was ambiguous, and how was it clarified?
5. What documentation would have prevented confusion?
6. What mistake became a better test, process, or design?
7. What trade-off did you accept, and why?
8. What kind of technical problem do you want to understand better next?

## Self-Scoring

After each answer, score:

```text
0 = I cannot answer.
1 = I know keywords only.
2 = I can explain basics.
3 = I can explain with an example.
4 = I can explain trade-offs and pitfalls.
5 = I can connect it to a practical project or production scenario.
```

Learning target:

```text
Core topics should gradually reach 4 or 5.
Weak topics should become next week's study plan.
```

## Practice Task

Pick one set and produce:

```text
Strong topics:
Weak topics:
One code example to write:
One diagram to draw:
One file to reread:
One follow-up question:
```
