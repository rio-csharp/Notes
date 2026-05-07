# Technical Communication

## Core Idea

Engineering work is only as valuable as the team's ability to understand it. A well-designed system that nobody can reason about, a performance fix that nobody can explain, and an architecture decision that is not communicated effectively all lose much of their value in practice.

Technical communication is the ability to explain systems, decisions, problems, risks, and trade-offs clearly. It is a skill that improves with practice, like debugging or database design. Good technical communication is concrete, structured, and evidence-based.

## Principles of Clear Technical Communication

### Be Concrete, Not Abstract

Abstract descriptions leave room for misinterpretation. Saying "the system was slow" does not convey useful information. Saying "POST /api/orders p95 latency increased from 300ms to 8 seconds starting at 10:05 UTC, with a 12% error rate, limited to the order creation endpoint" gives the reader a precise understanding of the situation.

Concrete communication includes specific measurements, time ranges, affected components, and observable behavior. It avoids vague qualifiers like "very slow," "a lot of errors," or "sometime last night."

### Structure Information Logically

Information is easier to absorb when it follows a logical structure. Three structures that work well for engineering communication are:

**Problem, Evidence, Decision.** Start with the problem, present the evidence that clarifies it, and then state the decision or conclusion. This structure works for design documents, incident reports, and code review explanations.

**Context, Options, Consequences.** Start with the context that frames the decision, list the options that were considered, and describe the consequences of each. This structure works for architecture discussions and trade-off analyses.

**Symptom, Scope, Mitigation.** Start with the symptom, describe the scope (what is affected and what is not), and then explain the mitigation. This structure works for incident updates and troubleshooting communication.

### Match Detail to Audience

A description of the same system should look different depending on who is reading it. A non-technical stakeholder needs to understand the business impact and the timeline for resolution, not the thread pool configuration. Another engineer needs to understand the mechanism of the problem, not just the outcome.

When communicating across audiences, start with the highest-level summary and offer to go deeper. This gives the audience control over how much detail they receive.

## Technical Writing Patterns

### Explaining a System Architecture

A clear architecture explanation covers what the system does, who uses it, and how the major components fit together. It does not need to list every technology in the stack. It needs to convey the shape of the system and the reasoning behind it.

For example: "This project is a B2B order management platform. It helps internal teams create orders, manage approvals, upload documents, track payment status, and monitor fulfillment. The backend uses ASP.NET Core, EF Core, and SQL Server. The frontend uses React and TypeScript. Redis is used for selected read-heavy data, and a message broker handles asynchronous notifications and background processing."

This tells the reader the domain, the users, the core functions, and the technology choices in a compact form.

### Explaining a Technical Challenge

When describing a problem that was solved, the most useful format follows the investigation path. Start with the symptom, describe the measurements and evidence that narrowed the search, explain the root cause, and then describe the fix and its effect.

For example: "The order list endpoint became slower as data volume increased. Instead of adding cache immediately, we measured where time was spent. Traces showed that most latency came from SQL. The execution plan showed a scan and sort on a growing table. We improved the query with DTO projection, server-side pagination, and a composite covering index. The fix reduced query duration without adding cache complexity."

This structure teaches the reader not just the solution but the methodology used to find it.

### Explaining a Trade-off

Trade-off explanations are most useful when they are explicit about what was gained and what was sacrificed. A trade-off that only mentions benefits is not a trade-off, it is marketing.

For example: "We considered microservices, but we started with a modular monolith. The benefit was simpler deployment, easier transactions, and faster development while the domain boundaries were still changing. The cost was that modules could not be deployed or scaled independently. We accepted that cost and documented revisit conditions."

This tells the reader both the upside and the downside, which allows them to evaluate whether the same trade-off makes sense for a different context.

### Explaining a Production Issue

Production issue communication serves two purposes: informing stakeholders during the incident and documenting the resolution afterward. Both require the same structure but at different levels of detail.

A compact incident update: "Impact: Order creation is slow for approximately 20% of requests. Start time: 10:05 UTC. Current action: We are rolling back the latest API deployment and monitoring latency. Next update: In 15 minutes."

This is short, factual, and gives stakeholders everything they need to know: what is affected, when it started, what is being done, and when to expect the next communication.

### Writing a Technical Background

A technical introduction for documentation, onboarding, or cross-team collaboration should give the reader a clear picture of the engineer's scope and focus areas. It is not a resume summary. It describes the kinds of systems and problems the engineer works with.

For example: "I work across backend and frontend systems using .NET, ASP.NET Core, React, TypeScript, and SQL databases. My work includes API design, database modeling, frontend workflows, authorization, performance optimization, testing, and production troubleshooting. I try to connect implementation details with system qualities such as security, maintainability, observability, and reliability."

This tells a reader what to ask about and what expertise to expect, without listing every technology the engineer has ever touched.

## Code Review Communication

Code review is one of the most frequent forms of technical communication. Effective code review comments are specific, respectful, and focused on behavior rather than style.

A weak comment says: "This is wrong." It does not explain why it is wrong or what the impact might be. A more effective comment says: "This query does not include TenantId. Could it return data from another tenant if the order ID is guessed?" This identifies the specific issue, explains the risk, and asks a question rather than issuing a command.

Similarly, instead of saying "This is bad," try: "This migration drops a column immediately. Can we use an expand-contract approach so old application instances remain compatible during rolling deployment?" This explains the concern and offers a concrete alternative.

When reviewing retries or resilience patterns: "This retry has no upper bound. If the provider is slow, it may amplify traffic. Could we add timeout, backoff, and a maximum attempt count?"

The pattern in each case is the same: identify the specific code or behavior, explain the risk or concern, and suggest a concrete improvement.

## Handling Uncertainty

Engineers frequently face situations where they do not know the answer. How they communicate this uncertainty matters more than whether they know the answer.

A productive way to acknowledge uncertainty: "I have not used that exact tool in production, but I understand the concept. Based on similar systems, I would evaluate it by looking at reliability, operational complexity, cost, and team familiarity. I would verify the details in the official documentation before making a final decision."

This is more useful than pretending certainty and being wrong, or saying "I don't know" and stopping. It tells the listener what the speaker does know, how they would approach the problem, and what they would verify before deciding.

## Clarifying Questions

Asking good clarifying questions is as important as giving good explanations. Questions that surface hidden assumptions, constraints, and priorities prevent wasted work.

Questions worth asking before starting a significant piece of work: "Are we optimizing for latency, cost, reliability, or delivery speed? Is strong consistency required? What is the expected scale? What is the failure behavior if this dependency is unavailable? Which users are affected? Is this a temporary workaround or the long-term design?"

These questions do not have obvious answers. Asking them early prevents the team from optimizing for the wrong dimension.

## Common Terminology

Technical communication relies on shared vocabulary. Terms like authentication, authorization, concurrency, scalability, availability, consistency, observability, idempotency, orchestration, reconciliation, eventual consistency, and cache invalidation have precise meanings. Using them correctly reduces ambiguity.

When a term is central to a discussion but may be unfamiliar to some readers, define it explicitly. A sentence like "We need idempotency here, meaning that processing the same event multiple times produces the same result, so the system can safely retry" is clearer than assuming everyone shares the same definition.
