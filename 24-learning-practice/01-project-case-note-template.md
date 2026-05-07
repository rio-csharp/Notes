# Project Knowledge Capture

## Core Idea

A project case note transforms practical engineering work into reusable knowledge. The goal is not to document for its own sake but to capture what happened, why decisions were made, what trade-offs existed, and what can be applied to future systems.

Project memory fades quickly. Within months, the rationale behind architecture decisions, the shape of performance investigations, and the details of failure modes become hazy. Writing them down while they are fresh creates a personal and team knowledge base that compounds over time.

## Content Worth Capturing

Not every detail of a project is worth recording. The most valuable knowledge lives at the intersection of context, decision, and outcome.

### Business Context

Understanding why a system exists is as important as understanding how it works. The case note should capture the intended users, their workflows, and the business problem the system solves. This context prevents future engineers from making changes that optimize the wrong thing.

For example, a platform built for internal sales and operations teams has different priorities than a customer-facing e-commerce site. The internal platform may prioritize auditability and permission granularity over conversion rate optimization. Capturing this context at the start of a case note anchors all subsequent technical observations.

### Architecture Decisions

Architecture decisions are the most frequently lost form of project knowledge. A case note should record the key decisions made during the project, the options that were considered, and the reasons for the chosen approach. This does not require a full Architecture Decision Record for every choice, but the decisions that were expensive to make or that have long-lasting consequences deserve documentation.

For instance, choosing a modular monolith over microservices early in a project is a decision that shapes the entire development trajectory. Recording why that choice was made, what alternatives were considered, and under what conditions the team would revisit the decision saves future engineers from re-litigating the same debate.

### Performance Investigations

Performance issues are one of the richest sources of engineering knowledge. A case note should capture the symptom, the investigation path, the evidence gathered, the root cause, and the fix. This pattern is valuable not only for the specific issue but as a template for approaching similar problems in the future.

A typical performance entry might describe how an order list endpoint became slower as the table grew, how traces showed SQL dominating request time, how the execution plan revealed a scan and sort, and how the fix involved DTO projection, a composite covering index, and enforced pagination. The specific numbers matter less than the investigation methodology and the relationship between cause and effect.

### Failures and Mitigations

Production failures are inevitable. Recording them creates an organizational memory that prevents repeat incidents. The case note should capture the failure mode, the impact, how it was detected, the immediate mitigation, and the long-term fix.

For example, a notification worker that failed because of an email provider outage reveals a dependency that was not resilient. The case note would record the symptom (delayed notifications), the detection path (worker error rate alert), the mitigation (retry with backoff), and the long-term fix (outbox pattern with dead-letter queue).

## Structuring a Case Note

A well-structured case note balances completeness with readability. The following sections provide a logical progression, but not every project needs every section.

### Project Summary

A compact summary gives readers an immediate understanding of the project's scope. It answers: What was the business domain? Who were the primary users? What was the main technical challenge? What was the key trade-off? A reader should know from a single paragraph whether this case note is relevant to their current problem.

### System Architecture

A high-level architecture diagram or description shows how the major components fit together. It explains not only what components exist but why they are shaped that way. For instance, an API that handles synchronous user workflows, a database that stores source-of-truth business data, a cache for read-heavy lookup data, and a message broker for notifications and long-running work.

### Data Model

The core tables or documents in the system reveal the shape of the business domain. Describing the key entities and their relationships, along with the most important indexes and constraints, provides enough detail for a reader to understand query patterns and data flow.

### API Design

The main API contracts show how the system communicates. Listing representative endpoints with their inputs and outputs gives concrete shape to the architecture description. This is particularly important for understanding how frontend and backend boundaries are drawn.

### Key Technical Challenges

This section is the heart of a case note. It describes one or more specific technical challenges with enough detail to be instructive. Each challenge entry should follow a natural narrative: the symptom or problem, the investigation path, the evidence gathered, the root cause, the options considered, the chosen solution, and the outcome.

### Trade-offs

Every technical decision involves trade-offs. A case note should make these explicit. For each important decision, the entry should describe the options, why the chosen option was selected, the benefits and costs, the risks, and the conditions under which the decision should be revisited.

### Failure Scenarios

If the project experienced notable production failures, they should be documented with the same structure: impact, detection, mitigation, root cause, and prevention. These entries serve as both postmortem documentation and teaching material.

### Future Improvements

No system is complete. A case note should list concrete, actionable improvements that were identified but not implemented. This gives future teams a starting point and prevents the same lessons from being rediscovered.

## Writing Principles

**Be specific.** Vague statements like "the query was slow" are less useful than "p95 latency for the order list endpoint increased from 300ms to 8 seconds after the table grew to 500,000 rows." Specific numbers and concrete observations make the knowledge actionable.

**Include context, not just conclusions.** Recording that "we added a cache" is less valuable than explaining that "we added a cache because the database CPU reached 80% during traffic spikes and the data changed infrequently." The context is what allows future engineers to evaluate whether the same solution applies to their situation.

**Describe what the system needed, not what one person contributed.** Case notes are about the system, not about individual accomplishments. A note that says "the order module required database schema design, API contracts, validation, authorization, state transitions, and performance testing" is more useful as learning material than one that lists who worked on what.

**Keep it readable.** A case note that nobody wants to read has no value. Shorter sections with clear headings, concrete examples rather than abstract descriptions, and a consistent structure all improve readability.

## Using Case Notes

Case notes serve multiple audiences. For the original engineer, they are a personal reference that preserves hard-won knowledge. For teammates, they are a way to learn about projects they did not work on. For new team members, they are onboarding material that explains not just the current system state but how it got there.

A collection of case notes becomes a project knowledge base. Over time, patterns emerge across projects: recurring types of performance issues, common failure modes for certain technologies, effective investigation techniques. These patterns are more valuable than any single case note because they build engineering judgment.
