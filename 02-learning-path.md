# Learning Path For .NET + React Full-stack Engineering

This learning path goes from foundation to advanced engineering and architecture-level thinking.

## Phase 1: Core Engineering Foundation

Focus:

- C# type system
- .NET execution model
- async / await
- collections and LINQ
- HTTP and REST
- SQL fundamentals
- React components, hooks, state
- TypeScript basics

Outcome:

- You can build a CRUD feature end to end.
- You can explain your code and its runtime behavior.
- You can debug common API, database, and UI issues.

## Phase 2: Production Web Application Skills

Focus:

- ASP.NET Core middleware pipeline
- dependency injection lifetimes
- EF Core performance
- validation and error handling
- authentication and authorization
- frontend routing and data fetching
- React Query / TanStack Query
- form validation
- logging and monitoring

Outcome:

- You can build production-ready APIs.
- You can secure endpoints.
- You can handle errors consistently.
- You can reason about API and frontend performance.

## Phase 3: Advanced Engineering Depth

Focus:

- database indexes and query plans
- transaction isolation
- concurrency control
- caching strategies
- Redis
- Kafka and message queues
- clean architecture
- DDD basics
- testing strategy
- production troubleshooting

Outcome:

- You can explain design choices and trade-offs.
- You can improve slow systems.
- You can investigate incidents.
- You can guide other developers.

## Phase 4: Architect-Level Thinking

Focus:

- system design methodology
- scalability
- reliability
- distributed systems
- eventual consistency（最终一致性）
- idempotency（幂等性）
- event-driven architecture
- microservices boundaries
- modular monolith
- migration strategy
- architecture decision records

Outcome:

- You can design systems under real constraints.
- You can compare alternatives.
- You can communicate risk.
- You can create a migration plan instead of only describing an ideal system.

## Phase 5: Practice And Reflection

Focus:

- technical self-summary
- project case note writing
- collaboration reflection questions
- English technical explanation
- system design practice
- coding and DSA patterns

Outcome:

- You can answer questions clearly and calmly.
- You can show ownership.
- You can identify what you do not know and learn the missing piece.
- You can turn your project experience into reusable engineering knowledge.

## Recommended Study Order

1. `01-dotnet-platform`
2. `02-csharp`
3. `03-aspnet-core`
4. `04-dependency-injection`
5. `05-entity-framework-core`
6. `06-database-sql`
7. `10-javascript-typescript`
8. `11-react`
9. `08-security`
10. `17-performance-scalability`
11. `13-architecture`
12. `16-common-technologies`
13. `18-system-design`
14. `21-production-troubleshooting`
15. `22-business-scenarios`
16. `23-architecture-decision-making`
17. `24-learning-practice`

## How To Know You Are Ready

You are building solid practical readiness when you can:

- explain `async/await` without only saying "it does not block";
- explain why a `Scoped` service cannot be safely injected into a `Singleton`;
- optimize an EF Core query and avoid N+1 queries;
- design JWT refresh token flow and discuss token storage risk;
- explain React re-rendering and stale closures;
- design pagination, filtering, and sorting APIs;
- discuss SQL indexes using execution plan terms;
- design a rate limiter or notification system;
- troubleshoot a slow API using logs, metrics, traces, and database evidence;
- describe trade-offs between monolith, modular monolith, and microservices.
