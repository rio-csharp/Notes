# Collaboration Reflection

## Core Idea

Collaboration reflection helps engineers understand how work gets done with people, ambiguity, pressure, conflict, and responsibility.

Chinese notes:

- `collaboration`: 协作.
- `ownership`: 主动负责.
- `ambiguity`: 模糊性.
- `alignment`: 对齐.
- `reflection`: 反思.

Software quality is shaped by both technical decisions and collaboration habits.

## What To Reflect On

Reflect on:

- ownership;
- communication;
- judgment;
- mentoring;
- delivery;
- learning;
- calmness under pressure;
- conflict handling;
- scope negotiation;
- cross-functional alignment.

This is not about sounding impressive. It is about learning how to work better.

## STAR + Reflection

The STAR method helps structure a situation.

```text
Situation: what was happening?
Task: what needed to be done?
Action: what actions were taken?
Result: what changed?
Reflection: what was learned, and what would be improved next time?
```

Example:

```text
Situation:
The order approval feature had unclear requirements around who could approve high-value orders.

Task:
The team needed a safe permission model before implementation.

Action:
We clarified approval rules with product, wrote examples for edge cases,
defined backend permissions, and added integration tests for allowed and denied cases.

Result:
The feature shipped with fewer authorization ambiguities.

Reflection:
For permission-heavy features, examples should be written before API implementation.
```

## Technical Self-Summary

Use this as a personal learning snapshot.

```text
Current strengths:
  - backend API design;
  - database modeling;
  - React feature implementation;
  - troubleshooting.

Current growth areas:
  - deeper distributed systems;
  - architecture documentation;
  - frontend performance measurement;
  - leading cross-team changes.

Recent evidence:
  - built an order workflow end to end;
  - optimized a slow query;
  - added integration tests for authorization;
  - wrote an ADR for caching strategy.
```

Update this every few months.

## Ambiguous Requirements

Useful questions:

- What user problem are we solving?
- What is in scope?
- What is explicitly out of scope?
- What edge cases matter?
- What happens on failure?
- What permissions are required?
- What does success look like?

Example note:

```text
The requirement said "admins can export users."

Clarifications:
  - Which admin permission is required?
  - Is export tenant-scoped?
  - How many rows can be exported?
  - Should large exports be async?
  - Should export actions be audited?
  - What columns are allowed?
```

## Disagreement Or Conflict

Good collaboration separates people from problems.

Pattern:

```text
1. Understand the other person's concern.
2. Identify the shared goal.
3. Separate preference from risk.
4. Compare options against constraints.
5. Use evidence where possible.
6. Decide and document the trade-off.
```

Example:

```text
The disagreement was whether to use microservices immediately.
One concern was future scalability. Another concern was operational complexity.
We compared the options against team size, deployment maturity, transaction needs,
and domain stability. We chose a modular monolith and wrote revisit conditions.
```

Avoid:

- blame;
- "I convinced them";
- ignoring valid concerns;
- treating style preference as technical necessity.

## Production Incident Reflection

Use this structure:

```text
Impact:
Timeline:
Detection:
Mitigation:
Root cause:
Contributing factors:
What went well:
What went poorly:
Prevention:
```

Example:

```text
Impact:
The order creation API had high p95 latency.

Detection:
Latency alert fired, and traces showed SQL dominated request time.

Mitigation:
The recent query change was rolled back.

Root cause:
The new filter was not supported by a matching index.

Prevention:
Add query-plan review for high-traffic endpoints and integration tests with realistic data shape.
```

## Leadership Without A Title

Technical leadership can appear in everyday engineering:

- improving code review quality;
- mentoring through examples;
- documenting decisions;
- clarifying ambiguous requirements;
- coordinating incident response;
- reducing operational risk;
- creating reusable patterns;
- helping teams make trade-offs explicit.

Leadership is not control. It is making the work clearer and safer for others.

## Feedback Reflection

When receiving feedback:

```text
What was the feedback?
What evidence supports it?
What can I change?
What should I clarify?
How will I know I improved?
```

When giving feedback:

```text
What behavior or outcome am I commenting on?
What is the impact?
What specific suggestion can help?
Is this urgent or optional?
```

## Reflection Prompts

- What project taught me the most recently?
- What technical decision did I help clarify?
- What production issue changed how I build systems?
- What requirement was ambiguous, and how was it clarified?
- What disagreement became productive?
- What bug could have been prevented with a better test?
- What documentation would have saved time?
- What repetitive problem should become a pattern?
- What did I learn from another engineer?
- What do I want to become better at next?

## Useful Team Discussion Question

Ask:

```text
What are the biggest technical risks or learning areas for this project in the next few months?
```

This turns reflection into practical team improvement.

## Knowledge Checks

### Why reflect on collaboration?

Because many engineering problems are not purely technical. Requirements, communication, ownership, review quality, and incident response all affect system quality.

### What makes disagreement productive?

A productive disagreement focuses on shared goals, evidence, constraints, and trade-offs instead of personal preference.

### What is leadership without a title?

It is making the work clearer, safer, and more effective for others through technical judgment, documentation, mentoring, coordination, and ownership.

## Practice Task

Write three reflections:

```text
1. A technical challenge reflection.
2. A disagreement or trade-off reflection.
3. A production incident reflection.
```

For each one, include:

```text
Situation:
Task:
Action:
Result:
Reflection:
What I would improve:
```
