# Architecture Knowledge Checks

## Core Idea

Architecture is practical decision-making under constraints.

A good architecture explanation should usually include:

- the business goal;
- the current constraints;
- the quality attributes that matter;
- the trade-offs（权衡）between options;
- the failure modes;
- the migration path;
- the operational plan.

Chinese notes:

- `quality attributes`: 质量属性, such as scalability, reliability, security, maintainability.
- `trade-off`: 权衡.
- `ADR`: Architecture Decision Record, 架构决策记录.
- `migration path`: 迁移路径.

## 1. How do you choose between monolith, modular monolith, and microservices?

Use business and operational constraints.

```text
Small team + unclear boundaries + simple deployment needs
  -> monolith or modular monolith

Growing product + complex domain + clear internal boundaries
  -> modular monolith

Multiple teams + independent deployment + clear ownership + strong DevOps
  -> microservices
```

Microservices are useful when independent deployment and ownership justify the distributed-systems cost. A modular monolith is often a better starting point when domain boundaries are still evolving.

## 2. What makes a good service boundary?

A good service boundary:

- aligns with a business capability;
- owns its data;
- has clear APIs or events;
- minimizes chatty communication;
- can be owned by a team;
- can fail without taking the whole system down;
- has clear observability and operational responsibility.

Risky boundary:

```text
OrderService
OrderItemService
AddressService
```

This often creates distributed CRUD.

Better boundary:

```text
Ordering
Billing
Shipping
Catalog
Identity
Notification
```

## 3. How do you handle distributed transactions?

Avoid assuming one ACID transaction across services.

Use:

- saga;
- outbox;
- inbox or processed message table;
- idempotency keys;
- retries with backoff;
- dead-letter queues;
- compensating actions.

Example:

```text
Order submitted
  -> reserve inventory
  -> authorize payment
  -> confirm order

If payment fails:
  -> release inventory
  -> mark order payment failed
```

This is compensation, not database rollback.

## 4. What is the Outbox pattern?

The Outbox pattern stores business data and an event message in the same database transaction.

```text
Transaction:
  save order
  save outbox message

Worker:
  read unpublished message
  publish to broker
  mark as published
```

It prevents this failure:

```text
Database commit succeeds.
Event publish fails.
Other systems never hear about the change.
```

Outbox gives at-least-once delivery, so consumers must be idempotent.

## 5. How do you approach architecture decisions?

A practical flow:

```text
1. Clarify the business goal.
2. Identify constraints.
3. Identify quality attributes.
4. Compare options.
5. Make trade-offs explicit.
6. Choose the simplest responsible design.
7. Document the decision.
8. Define revisit conditions.
```

Example ADR:

```md
# ADR-004: Use Modular Monolith For Order Platform

## Context

The product has three developers, rapidly changing domain rules, and no need for independent deployments yet.

## Decision

Use a modular monolith with modules for Ordering, Billing, Catalog, and Notification.

## Consequences

Deployment remains simple. Module boundaries are enforced with project references and architecture tests. If Billing later needs independent scaling, it can be extracted.

## Revisit When

Billing has independent team ownership or scaling needs.
```

## 6. How do you design for scalability?

First identify the bottleneck.

Scalability tools:

- stateless services;
- horizontal scaling;
- caching;
- database indexing;
- read replicas;
- async queues;
- partitioning;
- CDN;
- pagination;
- reducing unnecessary work.

Example:

```text
Problem: order search is slow.

Possible causes:
  - missing index;
  - too many columns returned;
  - offset pagination over deep pages;
  - no cache for repeated filters;
  - database CPU saturation.

Do not add more API instances before checking the database bottleneck.
```

## 7. How do you design for reliability?

Reliability is both design and operations.

Use:

- timeouts;
- retries with backoff and jitter;
- circuit breakers;
- bulkheads;
- rate limiting;
- idempotency;
- health checks;
- graceful degradation;
- structured logs;
- metrics;
- distributed tracing;
- alerts;
- rollback plan;
- disaster recovery plan.

Example degradation:

```text
If recommendation service is down:
  show popular products instead of failing product page.
```

## 8. How do you modernize a legacy system?

Avoid big-bang rewrites unless the current system is truly unrecoverable.

Practical path:

```text
1. Identify critical workflows.
2. Add logging, metrics, and tracing.
3. Add tests around stable behavior.
4. Define module boundaries.
5. Move one workflow at a time.
6. Use the Strangler Fig pattern.
7. Retire old code gradually.
```

Strangler Fig pattern:

```text
Old System
  /orders      -> new Ordering module
  /billing     -> old system
  /reports     -> old system
```

Traffic moves gradually from old to new.

## 9. How do you balance technical debt and delivery?

Make technical debt visible and connect it to risk.

Useful categories:

- debt causing incidents;
- debt slowing every feature;
- debt blocking a migration;
- debt creating security risk;
- debt that is annoying but low impact.

Prioritize the first four. Avoid unbounded cleanup that has no clear outcome.

## 10. How do you communicate trade-offs to non-technical stakeholders?

Use business language.

Example:

```text
Option A: Faster delivery, but harder to scale reporting later.
Option B: Two extra weeks, but makes reporting independent and safer for high traffic.
Recommendation: choose A for launch, document the reporting migration trigger.
```

Good architecture communication names:

- cost;
- risk;
- user impact;
- delivery time;
- future flexibility.

## 11. How do you decide whether to use events?

Use events when something happened and multiple parts of the system may react independently.

Good event use:

```text
OrderSubmitted
  -> send confirmation email
  -> update analytics
  -> create invoice
```

Poor event use:

```text
ValidateOrderCommandEvent
```

That is a command disguised as an event.

## 12. How do you protect architecture from drifting?

Use lightweight guardrails:

- clear folder/project structure;
- public contracts;
- architecture tests;
- code ownership;
- ADRs;
- shared examples;
- dependency rules in CI;
- regular cleanup of obsolete decisions.

Example architecture test:

```csharp
var result = Types.InAssembly(typeof(Order).Assembly)
    .Should()
    .NotHaveDependencyOn("Microsoft.EntityFrameworkCore")
    .GetResult();

result.IsSuccessful.Should().BeTrue();
```

## Common Misconceptions

- Choosing microservices because they sound modern.
- Treating Clean Architecture as folder naming only.
- Assuming events are always asynchronous commands.
- Assuming message brokers provide exactly-once business behavior.
- Ignoring data ownership.
- Ignoring operational complexity.
- Drawing diagrams without discussing trade-offs.
- Optimizing for scalability before finding the bottleneck.
- Designing for ideal behavior but not failure behavior.
- Building abstractions that do not protect any real boundary.

## Practice Task

Pick a system such as an e-commerce platform, learning platform, or booking system.

Write one short architecture note:

```text
1. Business goal.
2. Main users.
3. Key modules or services.
4. Data ownership.
5. Communication style.
6. Consistency model.
7. Failure modes.
8. Observability plan.
9. First version design.
10. Conditions for future migration.
```
