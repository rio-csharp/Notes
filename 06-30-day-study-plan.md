# 30-Day Study Plan For .NET + React Full-stack Engineering

This plan turns the knowledge base into a daily learning system. It is designed for full-stack engineering growth, with advanced architecture and production depth.

The goal is not to read everything passively. The goal is to finish each day with visible output:

- notes you can review;
- code you can explain;
- answers you can speak out loud;
- project case notes you can reuse for reflection, documentation, and technical communication;
- system design reasoning you can defend.

Key Chinese notes are included for difficult terms, for example `eventual consistency（最终一致性）`, `idempotency（幂等性）`, `trade-off（权衡）`, and `observability（可观测性）`.

## How To Use This Plan

Recommended daily time:

- Minimum: 2 hours per day.
- Strong target: 3 to 4 hours per day.
- Intensive target: 5 to 6 hours per day if you are studying full time.

Daily structure:

1. Study: read the listed files.
2. Code: implement or modify something small.
3. Speak: answer questions out loud.
4. Write: record a short summary or project case note.
5. Review: mark weak points for the weekend.

Every day has four outputs:

- `Concept Output`: what you can explain.
- `Code Output`: what you built or practiced.
- `Teach-Back Output`: what you can explain clearly.
- `Weakness Log`: what to revisit later.

Create a simple local notebook file if you want:

```text
my-study-notes/
  day-01.md
  day-02.md
  ...
  weak-points.md
  project-case-notes.md
  system-design-notes.md
```

## Weekly Rhythm

Week 1: .NET, C#, ASP.NET Core, DI, EF Core, SQL.

Week 2: API design, security, TypeScript, React, frontend architecture.

Week 3: architecture, design patterns, Redis, Kafka, performance, testing, troubleshooting.

Week 4: system design, architecture decision making, project case notes, collaboration reflection notes, knowledge checks.

Final 2 days: intensive knowledge check simulation and weakness repair.

## Daily Non-Negotiables

Do these every day, even when the topic is difficult:

- Explain one concept in 2 minutes.
- Explain the same concept in 5 minutes.
- Write or read at least one code example.
- Answer at least 5 knowledge checks out loud.
- Add one sentence to your project case note bank.

Engineering learning improves when you can explain ideas clearly. Speaking practice matters.

## Day 1: .NET Platform And Execution Model

Study:

- `01-dotnet-platform/01-dotnet-overview.md`
- `01-dotnet-platform/02-clr.md`
- `01-dotnet-platform/03-execution-model.md`
- `01-dotnet-platform/04-jit-aot-il.md`

Concept Output:

- Explain the relationship between C#, IL, CLR, JIT, and machine code.
- Explain what happens from `dotnet run` to executing a request.
- Explain why .NET can be cross-platform.
- Explain JIT vs AOT and when AOT may help or hurt.

Code Output:

- Create a tiny console app.
- Add a method, build the project, and inspect the generated `bin` folder.
- Run the app in Debug and Release mode.
- Practice explaining why Release mode can behave differently due to optimization.

Teach-Back Output:

- Answer: "Explain the .NET execution model."
- Answer: "What is IL and why does .NET use it?"
- Answer: "What does the CLR provide besides executing code?"

Weakness Log:

- Mark any runtime term you cannot explain without memorized wording.

## Day 2: Garbage Collection, Memory, Reflection, And Assembly Loading

Study:

- `01-dotnet-platform/05-garbage-collection.md`
- `01-dotnet-platform/06-assembly-loading.md`
- `01-dotnet-platform/07-reflection-and-attributes.md`
- `02-csharp/02-type-system.md`

Concept Output:

- Explain stack vs heap carefully.
- Explain why "value types are always on the stack" is an oversimplification.
- Explain generations in garbage collection.
- Explain how reflection is useful and why it can be costly.
- Explain assembly loading and versioning at a high level.

Code Output:

- Write a small class with a custom attribute.
- Use reflection to read the attribute.
- Create a loop that allocates many objects and observe memory behavior with simple logging.

Teach-Back Output:

- Answer: "Can C# have memory leaks?"
- Answer: "What is reflection and when should you avoid it?"
- Answer: "How does garbage collection affect performance?"

Weakness Log:

- Write down the difference between managed memory and unmanaged resources.

## Day 3: C# Type System, OOP, Generics, And Collections

Study:

- `02-csharp/01-language-basics.md`
- `02-csharp/03-oop.md`
- `02-csharp/04-generics.md`
- `02-csharp/05-collections.md`

Concept Output:

- Explain encapsulation, inheritance, polymorphism, and abstraction.
- Explain `class`, `interface`, abstract class, and generic constraints.
- Explain `List<T>`, `Dictionary<TKey,TValue>`, `HashSet<T>`, `Queue<T>`, and `Stack<T>`.
- Explain why collection choice affects performance.
- Explain the internal model of `List<T>` capacity/resizing and `Dictionary<TKey,TValue>` buckets/collisions.
- Explain `var`, `dynamic`, `const`, `readonly`, `init`, `required`, `using`, `IDisposable`, and `yield return`.

Code Output:

- Implement a small `IRepository<T>` interface.
- Implement an in-memory repository using `Dictionary<Guid, T>`.
- Add generic constraints where appropriate.
- Write a few examples showing lookup, insert, update, and delete.
- Explain why repeated lookup should use `Dictionary` or `HashSet` instead of repeated `List.Contains`.

Teach-Back Output:

- Answer: "When would you use an abstract class instead of an interface?"
- Answer: "How do generics improve type safety?"
- Answer: "Why is dictionary lookup usually fast?"
- Answer: "How does `List<T>` grow internally?"
- Answer: "What happens when `Dictionary<TKey,TValue>` has hash collisions?"

Weakness Log:

- List collection operations where you do not know time complexity.

## Day 4: LINQ, Deferred Execution, Exceptions, And Clean Error Handling

Study:

- `02-csharp/06-linq.md`
- `02-csharp/09-exception-handling.md`
- `07-web-api-design/02-api-contracts-dtos.md`
- `03-aspnet-core/07-filters.md`

Concept Output:

- Explain deferred execution（延迟执行）.
- Explain `IEnumerable` vs `IQueryable`.
- Explain when exceptions should be thrown and when validation errors should be returned.
- Explain why APIs should not leak internal exception details.

Code Output:

- Write LINQ examples using `Where`, `Select`, `GroupBy`, `Any`, `All`, and `FirstOrDefault`.
- Show a deferred execution example where changing the source collection changes the query result.
- Create a simple error response DTO similar to `ProblemDetails`.

Teach-Back Output:

- Answer: "What is LINQ deferred execution?"
- Answer: "Why can `IQueryable` be dangerous if passed across layers?"
- Answer: "How do you design consistent API error responses?"

Weakness Log:

- Record common LINQ operations that translate poorly to SQL.

## Day 5: Async/Await, Threading, Cancellation, And Concurrency

Study:

- `02-csharp/07-async-await.md`
- `02-csharp/08-concurrency-threading.md`
- `03-aspnet-core/11-background-services.md`
- `21-production-troubleshooting/03-high-cpu-memory.md`

Concept Output:

- Explain that `async` does not automatically create a new thread.
- Explain async state machine at a practical level.
- Explain thread pool starvation.
- Explain GC roots, generations, SOH/LOH/POH, server GC, background GC, and GC pause causes.
- Explain race condition, deadlock, lock, semaphore, and cancellation token.
- Explain CPU-bound vs I/O-bound work.
- Explain how to diagnose ThreadPool starvation with symptoms, metrics, and common causes.

Code Output:

- Write an async method that calls `HttpClient`.
- Add `CancellationToken`.
- Write a safe concurrent counter using `Interlocked` or `lock`.
- Write one bad example that blocks on `.Result`, then explain why it is risky.

Teach-Back Output:

- Answer: "How does async/await work in C#?"
- Answer: "How do you prevent thread pool starvation?"
- Answer: "How do you make async code cancellation-aware?"

Weakness Log:

- Mark any concurrency concept that still feels abstract.

## Day 6: ASP.NET Core Request Pipeline, Middleware, Routing, And Controllers

Study:

- `03-aspnet-core/01-aspnet-core-overview.md`
- `03-aspnet-core/02-http-and-web-basics.md`
- `03-aspnet-core/03-request-pipeline.md`
- `03-aspnet-core/04-middleware.md`
- `03-aspnet-core/05-routing.md`
- `03-aspnet-core/06-controllers-and-minimal-api.md`

Concept Output:

- Explain HTTP request and response structure.
- Explain HTTP/1.1, HTTP/2, HTTP/3, HTTPS/TLS, and connection-level trade-offs.
- Explain why TCP is a byte stream and how sticky packet / half packet problems are solved by message framing.
- Explain middleware ordering.
- Explain endpoint routing.
- Compare controllers and Minimal APIs.
- Explain model binding and validation at a high level.

Code Output:

- Create a small ASP.NET Core Web API.
- Add custom middleware that logs correlation ID.
- Add one controller endpoint and one Minimal API endpoint.
- Return a typed DTO instead of an entity.

Teach-Back Output:

- Answer: "Explain the ASP.NET Core request pipeline."
- Answer: "What are TCP sticky packet and half packet problems?"
- Answer: "Middleware vs filters: when do you use each?"
- Answer: "How does routing work in ASP.NET Core?"

Weakness Log:

- Draw the request pipeline from memory.

## Day 7: Dependency Injection, Lifetimes, Options, Logging, And Review

Study:

- `04-dependency-injection/01-di-ioc-basics.md`
- `04-dependency-injection/02-service-lifetimes.md`
- `04-dependency-injection/03-captive-dependency.md`
- `04-dependency-injection/04-factory-pattern-with-di.md`
- `03-aspnet-core/09-configuration-options-pattern.md`
- `03-aspnet-core/10-logging-observability.md`

Concept Output:

- Explain IoC and DI.
- Explain Singleton, Scoped, and Transient.
- Explain captive dependency（生命周期捕获）.
- Explain Options pattern.
- Explain structured logging and correlation ID.
- Explain how ASP.NET Core DI builds object graphs and caches services by lifetime.

Code Output:

- Register services with all three lifetimes.
- Create an example of a factory registration.
- Bind configuration to an options class.
- Add structured logging to one API endpoint.

Teach-Back Output:

- Answer: "Why is `DbContext` usually Scoped?"
- Answer: "What happens if a Singleton depends on a Scoped service?"
- Answer: "How do you make logs useful in production?"
- Answer: "How does the DI container create an object?"
- Answer: "Why is calling `BuildServiceProvider` manually risky?"

Weekly Review:

- Re-answer Days 1 to 6 questions out loud.
- Rebuild the small API from memory.
- Write one paragraph: "How a request flows through my .NET API."

## Day 8: EF Core Fundamentals, DbContext, Change Tracking, And Migrations

Study:

- `05-entity-framework-core/01-dbcontext-change-tracker.md`
- `05-entity-framework-core/04-migrations.md`
- `05-entity-framework-core/03-relationships.md`
- `05-entity-framework-core/02-querying.md`

Concept Output:

- Explain `DbContext`.
- Explain change tracking.
- Explain EF Core query translation from expression tree to SQL and materialization.
- Explain tracking vs no-tracking queries.
- Explain migrations and production migration risk.
- Explain one-to-one, one-to-many, and many-to-many relationships.

Code Output:

- Add EF Core to your sample API.
- Create `Product`, `Order`, and `OrderItem` entities.
- Add a migration.
- Create endpoints for listing and creating orders.
- Use DTOs instead of returning EF entities directly.

Teach-Back Output:

- Answer: "What is the EF Core change tracker?"
- Answer: "When do you use `AsNoTracking`?"
- Answer: "How do you run database migrations safely in production?"

Weakness Log:

- Record any EF behavior that surprised you.

## Day 9: EF Core Performance, Transactions, Concurrency, Raw SQL

Study:

- `05-entity-framework-core/08-performance-optimization.md`
- `05-entity-framework-core/05-transactions-concurrency.md`
- `05-entity-framework-core/07-raw-sql-stored-procedures.md`
- `05-entity-framework-core/06-value-converters-owned-entities.md`
- `05-entity-framework-core/09-ef-core-review-questions.md`

Concept Output:

- Explain N+1 queries.
- Explain projection vs `Include`.
- Explain optimistic concurrency（乐观并发）.
- Explain transaction boundaries.
- Explain when raw SQL or stored procedures are appropriate.

Code Output:

- Write a bad N+1 query and then fix it with projection.
- Add a `RowVersion` or concurrency token.
- Wrap order creation in a transaction.
- Write one raw SQL query safely with parameters.

Teach-Back Output:

- Answer: "How do you optimize EF Core queries?"
- Answer: "How do you handle concurrent updates?"
- Answer: "When would you avoid EF Core for a specific query?"

Weakness Log:

- Record the exact symptoms of an N+1 query.

## Day 10: SQL Basics, Joins, Aggregation, And Database Design

Study:

- `06-database-sql/01-relational-database-basics.md`
- `06-database-sql/02-sql-basics.md`
- `06-database-sql/03-joins.md`
- `06-database-sql/04-database-design.md`
- `06-database-sql/05-normalization-denormalization.md`

Concept Output:

- Explain primary key, foreign key, unique constraint, and check constraint.
- Explain inner join, left join, and many-to-many joins.
- Explain normalization and denormalization.
- Explain how to model orders, users, products, and payments.
- Explain partitioning vs sharding and when not to shard.
- Explain shard key selection and the cross-shard query problem.

Code Output:

- Write SQL queries for order totals by customer.
- Write a query with `GROUP BY` and `HAVING`.
- Draw a small schema for an e-commerce order system.
- Identify constraints that protect data integrity.
- Design a tenant shard map and explain how requests route to one shard.

Teach-Back Output:

- Answer: "How do you design a relational schema?"
- Answer: "When would you denormalize?"
- Answer: "How do you prevent duplicate orders?"
- Answer: "How do you choose a shard key?"
- Answer: "Why should you not shard too early?"

Weakness Log:

- Save 3 SQL queries you found hard.

## Day 11: Indexes, Query Optimization, Transactions, And Isolation

Study:

- `06-database-sql/06-indexes.md`
- `06-database-sql/07-query-optimization.md`
- `06-database-sql/08-transactions-isolation.md`
- `17-performance-scalability/02-database-performance.md`

Concept Output:

- Explain clustered and non-clustered indexes.
- Explain SQL Server rowstore indexes as B+ tree structures.
- Explain covering index.
- Explain key lookup and why many key lookups can be expensive.
- Explain execution plan basics.
- Explain transaction isolation levels.
- Explain deadlock and lock contention.
- Explain blocking vs deadlock vs timeout.
- Explain database connection pooling and pool exhaustion.
- Explain common SQL Server wait categories at a practical level.

Code Output:

- Create a table with enough sample rows to test an indexed lookup.
- Compare a query with and without an index.
- Write a pagination query.
- Write a transaction example and identify what should be inside the transaction.

Teach-Back Output:

- Answer: "How do indexes improve reads but hurt writes?"
- Answer: "What data structure does SQL Server use for indexes?"
- Answer: "How do you troubleshoot a slow SQL query?"
- Answer: "What isolation level would you choose and why?"
- Answer: "How do you avoid SQL Server deadlocks?"
- Answer: "How do you troubleshoot connection pool exhaustion?"

Weakness Log:

- Write down the difference between blocking, deadlock, and timeout.

## Day 12: REST API Design, DTOs, Pagination, Versioning, Idempotency

Study:

- `07-web-api-design/01-rest-api-design.md`
- `07-web-api-design/02-api-contracts-dtos.md`
- `07-web-api-design/03-pagination-filtering-sorting.md`
- `07-web-api-design/04-api-versioning.md`
- `07-web-api-design/05-idempotency.md`
- `07-web-api-design/06-swagger-openapi.md`

Concept Output:

- Explain REST resource design.
- Explain DTOs and contract stability.
- Explain offset and cursor pagination.
- Explain API versioning strategy.
- Explain idempotency（幂等性）.
- Explain why OpenAPI is useful in team collaboration.

Code Output:

- Add pagination, filtering, and sorting to your order list endpoint.
- Add an idempotency key to a create-payment or create-order endpoint.
- Add Swagger/OpenAPI metadata.
- Add validation for invalid query parameters.

Teach-Back Output:

- Answer: "How do you design a clean REST API?"
- Answer: "How do you prevent duplicate payment requests?"
- Answer: "How do you evolve an API without breaking clients?"

Weakness Log:

- Record API designs that feel ambiguous.

## Day 13: Authentication, Authorization, JWT, OAuth2, OIDC

Study:

- `08-security/01-jwt.md`
- `08-security/02-oauth2-oidc.md`
- `08-security/03-authorization-permission-system.md`
- `03-aspnet-core/08-authentication-authorization.md`

Concept Output:

- Explain authentication vs authorization.
- Explain JWT structure and validation.
- Explain access token vs refresh token.
- Explain OAuth2 vs OIDC.
- Explain role-based, policy-based, and resource-based authorization.
- Explain OAuth threat model, PKCE, `state`, `nonce`, redirect URI validation, and token replay.
- Explain issuer, audience, signature, algorithm, JWKS, and key rotation.
- Explain refresh token rotation and reuse detection.

Code Output:

- Add JWT authentication to your API.
- Protect one endpoint with `[Authorize]`.
- Add a simple policy.
- Write pseudocode for refresh token rotation.
- Write a short token validation checklist for your API.

Teach-Back Output:

- Answer: "How do you design login with JWT?"
- Answer: "Where should access tokens be stored?"
- Answer: "How do you implement permission checks?"
- Answer: "Why is validating JWT signature not enough?"
- Answer: "How do you protect refresh tokens?"

Weakness Log:

- Mark security topics where your answer is too vague.

## Day 14: OWASP, XSS, CSRF, SQL Injection, Passwords, Token Storage

Study:

- `08-security/04-owasp-top-10.md`
- `08-security/05-xss-csrf-sql-injection.md`
- `08-security/06-password-hashing.md`
- `08-security/07-secure-cookies-token-storage.md`
- `08-security/08-rate-limiting-security.md`
- `08-security/09-security-review-questions.md`

Concept Output:

- Explain XSS, CSRF, SQL injection, broken access control, SSRF, and insecure deserialization.
- Explain password hashing with salt and work factor.
- Explain cookie security flags.
- Explain frontend token storage trade-offs.
- Explain rate limiting as both security and reliability protection.

Code Output:

- Add rate limiting to your API.
- Review your endpoints for missing authorization checks.
- Write examples of safe parameterized queries.
- Write a secure cookie configuration checklist.

Teach-Back Output:

- Answer: "How do you prevent XSS in React?"
- Answer: "How do you prevent CSRF?"
- Answer: "How do you store passwords securely?"

Weekly Review:

- Explain the full backend path: request, middleware, auth, controller, service, EF Core, database.
- Redesign one endpoint with validation, authorization, logging, and error handling.

## Day 15: HTML, CSS, Accessibility, Forms, Responsive Layout

Study:

- `09-frontend-foundation/01-html-basics.md`
- `09-frontend-foundation/02-forms-accessibility.md`
- `09-frontend-foundation/03-css-basics.md`
- `09-frontend-foundation/04-css-layout-flex-grid.md`
- `09-frontend-foundation/05-responsive-design.md`
- `09-frontend-foundation/06-browser-rendering.md`

Concept Output:

- Explain semantic HTML.
- Explain accessibility（可访问性）basics.
- Explain Flexbox and Grid.
- Explain responsive design.
- Explain browser rendering pipeline, critical rendering path, render-blocking resources, layout thrashing, and compositor-friendly animations.

Code Output:

- Build a responsive order list page with semantic HTML.
- Add labels, keyboard focus, and accessible form errors.
- Create a two-column desktop layout and a single-column mobile layout.
- Avoid layout shift when loading data.

Teach-Back Output:

- Answer: "What makes a form accessible?"
- Answer: "When do you use Flexbox vs Grid?"
- Answer: "How does the browser render a page?"

Weakness Log:

- Record CSS layout cases that still feel slow to solve.

## Day 16: JavaScript Runtime, Event Loop, Promises, TypeScript Basics

Study:

- `10-javascript-typescript/01-javascript-core.md`
- `10-javascript-typescript/02-prototype-this-closure.md`
- `10-javascript-typescript/03-event-loop.md`
- `10-javascript-typescript/04-promises-async-await.md`
- `10-javascript-typescript/05-typescript-basics.md`

Concept Output:

- Explain `var`, `let`, and `const`.
- Explain closure（闭包）.
- Explain `this`.
- Explain event loop, microtasks, and macrotasks.
- Explain Promise states.
- Explain TypeScript type safety.
- Explain why Promise callbacks run before `setTimeout`.
- Explain how long JavaScript tasks block rendering.

Code Output:

- Write closure examples.
- Predict output order for event loop examples.
- Create TypeScript interfaces for API DTOs.
- Convert a JavaScript function to a typed TypeScript function.

Teach-Back Output:

- Answer: "Explain the JavaScript event loop."
- Answer: "What is a closure and why is it useful?"
- Answer: "How does TypeScript help large frontend projects?"
- Answer: "What is the difference between browser event loop and Node.js event loop?"

Weakness Log:

- Save 3 event loop examples and explain them later.

## Day 17: Advanced TypeScript, Tooling, Typed API Client

Study:

- `10-javascript-typescript/06-typescript-advanced-types.md`
- `10-javascript-typescript/07-tsconfig-and-tooling.md`
- `07-web-api-design/02-api-contracts-dtos.md`
- `07-web-api-design/06-swagger-openapi.md`

Concept Output:

- Explain union, intersection, generics, mapped types, conditional types, and discriminated unions.
- Explain strict TypeScript settings.
- Explain how frontend and backend contracts stay aligned.
- Explain generated clients vs handwritten clients.

Code Output:

- Create typed API response types.
- Add a `Result<T>` or discriminated union for frontend request states.
- Write a small typed API client using `fetch`.
- Validate one response shape at runtime if possible.

Teach-Back Output:

- Answer: "Type vs interface?"
- Answer: "How do you model API errors in TypeScript?"
- Answer: "How do you keep frontend types synchronized with backend DTOs?"

Weakness Log:

- Record advanced TypeScript features you can recognize but not yet use fluently.

## Day 18: React Basics, Hooks, Rendering Model, Forms

Study:

- `11-react/01-react-basics.md`
- `11-react/02-hooks.md`
- `11-react/03-rendering-model.md`
- `11-react/05-forms.md`
- `11-react/09-react-review-questions.md`

Concept Output:

- Explain component, props, state, and JSX.
- Explain hooks rules.
- Explain why hook call order matters and how hook state is associated with a component fiber.
- Explain render and reconciliation.
- Explain controlled vs uncontrolled components.
- Explain stale closure（陈旧闭包）.
- Explain React Fiber, render phase, commit phase, batching, and keys.

Code Output:

- Build an order search page.
- Add `useState`, `useEffect`, and custom hook usage.
- Build a controlled create-order form.
- Add loading, empty, success, and error states.

Teach-Back Output:

- Answer: "What causes a React component to re-render?"
- Answer: "Why are keys important?"
- Answer: "What is a stale closure and how do you fix it?"
- Answer: "What is React Fiber?"
- Answer: "Why can copying props into state cause bugs?"

Weakness Log:

- Mark hooks scenarios that still require guessing.

## Day 19: React Router, State Management, React Query, Frontend Testing

Study:

- `11-react/04-react-router.md`
- `11-react/06-state-management.md`
- `11-react/07-react-query.md`
- `11-react/08-testing-react.md`
- `20-testing-quality/03-frontend-testing.md`

Concept Output:

- Explain client-side routing.
- Compare local state, Context, Redux, Zustand, and React Query.
- Explain server state vs client state.
- Explain query keys, cache invalidation, optimistic updates.
- Explain component testing with user behavior.

Code Output:

- Add routes for order list, order detail, and create order.
- Use React Query for fetching order data.
- Add mutation and cache invalidation.
- Write one test for a form or data-loading component.

Teach-Back Output:

- Answer: "What problem does React Query solve?"
- Answer: "How do you choose a state management tool?"
- Answer: "How do you test React components?"

Weakness Log:

- Record one frontend bug that would be hard to test.

## Day 20: Frontend Architecture And Performance

Study:

- `12-frontend-architecture/01-project-structure.md`
- `12-frontend-architecture/02-frontend-performance.md`
- `17-performance-scalability/01-backend-performance.md`
- `20-testing-quality/04-e2e-testing.md`

Concept Output:

- Explain feature-based frontend structure.
- Explain component boundaries.
- Explain page, feature, reusable UI, and primitive component responsibilities.
- Explain design system basics and when micro-frontends are justified.
- Explain bundle size, lazy loading, memoization, and Core Web Vitals.
- Explain E2E test value and cost.
- Explain how frontend architecture supports team scaling.

Code Output:

- Refactor your React app into feature folders.
- Add route-level lazy loading.
- Add one memoization only where there is a real reason.
- Write one E2E test scenario in plain English.

Teach-Back Output:

- Answer: "How do you structure a large React application?"
- Answer: "How do you improve frontend performance?"
- Answer: "When should you avoid premature optimization?"

Weakness Log:

- Identify parts of frontend architecture you need examples for.

## Day 21: Clean Architecture, DDD, CQRS, Design Patterns

Study:

- `13-architecture/01-layered-architecture.md`
- `13-architecture/02-clean-architecture.md`
- `13-architecture/04-ddd.md`
- `13-architecture/05-cqrs.md`
- `14-design-patterns/01-solid.md`
- `14-design-patterns/05-repository-unit-of-work.md`
- `14-design-patterns/06-mediator-strategy-decorator.md`

Concept Output:

- Explain layered architecture vs Clean Architecture.
- Explain dependency direction.
- Explain entity, value object, aggregate, repository, and domain service.
- Explain CQRS and when it is too much.
- Explain SOLID with practical examples.

Code Output:

- Refactor a small backend feature into Controller, Application Service, Domain, Infrastructure.
- Add one value object, for example `Email` or `Money`.
- Add one command handler or service method for creating an order.
- Write one unit test for domain logic.

Teach-Back Output:

- Answer: "How do you design maintainable backend architecture?"
- Answer: "What is an aggregate in DDD?"
- Answer: "When would you use CQRS?"

Weekly Review:

- Demo your full-stack mini project out loud.
- Explain one feature from database to API to React UI.
- Identify the weakest backend and frontend topics so far.

## Day 22: Redis, Caching, Kafka, RabbitMQ, Background Jobs

Study:

- `16-common-technologies/01-redis.md`
- `16-common-technologies/02-redis-advanced.md`
- `16-common-technologies/03-kafka.md`
- `16-common-technologies/04-kafka-advanced.md`
- `16-common-technologies/05-rabbitmq.md`
- `16-common-technologies/08-hangfire-quartz.md`
- `16-common-technologies/06-elasticsearch.md`
- `13-architecture/06-event-driven-architecture.md`

Concept Output:

- Explain cache-aside, write-through, write-behind, and distributed cache.
- Explain Redis command execution model, internal data structure mental models, expiration vs eviction.
- Explain cache penetration, breakdown, and avalanche.
- Explain Redis hot key, big key, request coalescing, TTL jitter, and Redis outage degradation.
- Explain Kafka topic, partition, offset, consumer group.
- Explain Kafka partition log, segments, retention, leader/follower replicas, ISR, and consumer group coordination.
- Explain Kafka duplicate consumption, failed consumption, offset commit timing, retry topics, DLT, and rebalance.
- Compare Kafka and RabbitMQ.
- Explain retry, dead-letter queue（死信队列）, and background job scheduling.
- Explain Elasticsearch inverted index, analyzer pipeline, `text` vs `keyword`, shards/replicas, refresh, BM25, deep pagination, aliases, and reindexing.

Code Output:

- Add pseudocode for Redis cache-aside around a product lookup.
- Design an outbox table for reliable event publishing.
- Write a Kafka event schema for `OrderCreated`.
- Write retry and dead-letter handling rules.
- Design a product search index with SQL source of truth, alias-based reindexing, and `search_after` pagination.

Teach-Back Output:

- Answer: "How do you design caching for a high-traffic API?"
- Answer: "How do you prevent Redis cache avalanche, breakdown, and penetration?"
- Answer: "When would you use Kafka instead of RabbitMQ?"
- Answer: "How do you avoid losing messages?"
- Answer: "Why can Kafka consume the same message twice, and how do you handle it?"
- Answer: "Why use Elasticsearch instead of SQL LIKE?"
- Answer: "How do you keep Elasticsearch consistent with SQL?"

Weakness Log:

- Record the exact difference between queue and event stream.

## Day 23: Performance, Scalability, Observability, Load Testing

Study:

- `17-performance-scalability/01-backend-performance.md`
- `17-performance-scalability/02-database-performance.md`
- `17-performance-scalability/03-load-testing.md`
- `16-common-technologies/12-opentelemetry-monitoring.md`
- `03-aspnet-core/10-logging-observability.md`

Concept Output:

- Explain latency, throughput, saturation, and bottleneck.
- Explain horizontal vs vertical scaling.
- Explain logs, metrics, and traces.
- Explain OpenTelemetry at a high level.
- Explain load testing and realistic test data.

Code Output:

- Add timing logs around one endpoint.
- Define metrics for request count, error rate, latency, and database duration.
- Write a load test plan for your order API.
- Create a performance checklist for release readiness.

Teach-Back Output:

- Answer: "How do you investigate a slow API?"
- Answer: "How do you know whether the bottleneck is app or database?"
- Answer: "What would you monitor in production?"

Weakness Log:

- Record one performance topic where you need more numbers or examples.

## Day 24: DevOps, Cloud, Docker, CI/CD, Kubernetes, Secrets

Study:

- `19-devops-cloud/01-git.md`
- `19-devops-cloud/02-docker.md`
- `19-devops-cloud/03-ci-cd.md`
- `19-devops-cloud/04-kubernetes.md`
- `19-devops-cloud/05-azure.md`
- `19-devops-cloud/06-nginx-iis-kestrel.md`
- `19-devops-cloud/07-secrets-configuration.md`

Concept Output:

- Explain Docker image vs container.
- Explain CI vs CD.
- Explain environment-based configuration.
- Explain reverse proxy and Kestrel.
- Explain Kubernetes Deployment, Service, ConfigMap, Secret, and Ingress.
- Explain Kubernetes pod IP, ClusterIP, Service endpoints, ingress traffic path, DNS/service discovery, and kube-proxy mental model.
- Explain readiness vs liveness vs startup probes.
- Explain rolling updates, graceful shutdown, `SIGTERM`, resource requests/limits, CPU throttling, and OOMKilled.
- Explain safe secret management.

Code Output:

- Write a Dockerfile outline for ASP.NET Core.
- Write a CI pipeline checklist: restore, build, test, scan, publish.
- Draw a simple deployment diagram with browser, CDN, React app, API, database.
- Write a rollback plan.
- Write Kubernetes manifests with readiness/liveness/startup probes, resources, and graceful shutdown settings.

Teach-Back Output:

- Answer: "How do you deploy a .NET API?"
- Answer: "How do you handle secrets?"
- Answer: "What should a CI/CD pipeline include?"
- Answer: "How does Kubernetes route traffic to pods?"
- Answer: "What does OOMKilled mean and how would you investigate it?"

Weakness Log:

- Record cloud concepts you have used vs only studied.

## Day 25: Testing, Code Quality, Review, Maintainability

Study:

- `20-testing-quality/01-testing-strategy.md`
- `20-testing-quality/02-integration-testing-dotnet.md`
- `20-testing-quality/05-code-review-quality.md`
- `25-code-quality-maintainability/01-code-quality-and-maintainability.md`
- `14-design-patterns/02-creational-patterns.md`
- `14-design-patterns/03-structural-patterns.md`
- `14-design-patterns/04-behavioral-patterns.md`

Concept Output:

- Explain test pyramid.
- Explain unit, integration, contract, E2E, and smoke tests.
- Explain code review goals.
- Explain maintainability, cohesion, coupling, and technical debt.
- Explain common design patterns without forcing them everywhere.

Code Output:

- Add one backend unit test.
- Add one integration test plan for an API endpoint.
- Review your own code and write 5 review comments.
- Refactor one method for readability.

Teach-Back Output:

- Answer: "How do you decide what to test?"
- Answer: "What do you look for in code review?"
- Answer: "How do you improve legacy code safely?"

Weakness Log:

- Record which tests you can write quickly and which tests slow you down.

## Day 26: Production Troubleshooting And Incident Thinking

Study:

- `21-production-troubleshooting/01-troubleshooting-method.md`
- `21-production-troubleshooting/02-slow-api.md`
- `21-production-troubleshooting/03-high-cpu-memory.md`
- `21-production-troubleshooting/04-frontend-blank-screen.md`
- `22-business-scenarios/04-payment-callback.md`
- `22-business-scenarios/05-webhook-design.md`

Concept Output:

- Explain incident triage.
- Explain how to use logs, metrics, traces, dashboards, and recent deployments.
- Explain slow API investigation.
- Explain high CPU and memory investigation.
- Explain frontend blank screen investigation.
- Explain webhook reliability and payment callback idempotency.

Code Output:

- Write an incident timeline template.
- Write a postmortem template.
- Add correlation ID to a frontend-to-backend request flow.
- Design a payment callback handler with idempotency.

Teach-Back Output:

- Answer: "Production is slow. What do you do first?"
- Answer: "How do you debug a frontend blank screen?"
- Answer: "Describe an incident you handled."

Weakness Log:

- Draft one incident story using STAR: Situation, Task, Action, Result.

## Day 27: System Design Method And Core Problems

Study:

- `18-system-design/01-system-design-method.md`
- `18-system-design/02-rate-limiter.md`
- `18-system-design/03-notification-system.md`
- `18-system-design/04-file-storage-system.md`
- `18-system-design/05-url-shortener.md`

Concept Output:

- Explain how to clarify requirements.
- Explain capacity estimation.
- Explain API design, data model, high-level architecture, bottlenecks, and trade-offs.
- Explain rate limiting algorithms.
- Explain rate limiter algorithm trade-offs, atomic Redis/Lua updates, and fail-open vs fail-closed.
- Explain file upload and object storage.

Code Output:

- Design a rate limiter with Redis.
- Design a notification system with queue and worker.
- Design a file upload API with pre-signed URLs.
- Draw each system with boxes and arrows.

Teach-Back Output:

- Run a 45-minute practice design session for rate limiter.
- Run a 30-minute practice design session for notification system.
- Practice saying: "I would start with requirements, then scale assumptions, then API and data model."

Weakness Log:

- Record where you got stuck during system design.

## Day 28: Advanced System Design, Business Scenarios, Multi-Tenancy

Study:

- `18-system-design/06-ecommerce-order-system.md`
- `18-system-design/07-payment-system.md`
- `18-system-design/08-chat-system.md`
- `18-system-design/09-search-autocomplete.md`
- `18-system-design/10-logging-system.md`
- `18-system-design/11-reporting-export-system.md`
- `22-business-scenarios/02-multi-tenant-system.md`
- `22-business-scenarios/03-admin-dashboard.md`
- `22-business-scenarios/01-fullstack-project-case-study.md`

Concept Output:

- Explain order lifecycle.
- Explain payment consistency and idempotency.
- Explain chat delivery and read receipts.
- Explain autocomplete using search index and cache.
- Explain multi-tenancy models.
- Explain reporting/export architecture.

Code Output:

- Draw an e-commerce order system.
- Design a reporting export flow using background jobs.
- Design tenant isolation for database and authorization.
- Write one project case study using the full-stack project template.

Teach-Back Output:

- Run one 60-minute e-commerce system design practice session.
- Answer: "How do you design multi-tenant SaaS?"
- Answer: "How do you export a large report without timing out?"

Weekly Review:

- Pick 3 system designs and explain each in 10 minutes.
- Write your top 5 architecture trade-offs.

## Day 29: Architecture Decision Making, Technical Influence, ADR, Migration Strategy

Study:

- `13-architecture/08-microservices.md`
- `13-architecture/07-modular-monolith.md`
- `13-architecture/09-distributed-systems.md`
- `13-architecture/10-architecture-review-questions.md`
- `23-architecture-decision-making/01-architecture-decision-record.md`
- `24-learning-practice/01-project-case-note-template.md`
- `24-learning-practice/02-collaboration-reflection.md`

Concept Output:

- Explain modular monolith vs microservices.
- Explain distributed systems failure modes.
- Explain eventual consistency.
- Explain outbox, inbox, saga, cache consistency, message ordering, and idempotent consumers.
- Explain how to write an ADR.
- Explain how engineers can influence technical direction without formal authority.
- Explain migration strategy from legacy to modern architecture.

Code Output:

- Write one ADR: "Use modular monolith before microservices."
- Write one ADR: "Use Redis cache-aside for product catalog."
- Write a migration plan from legacy API to new API version.
- Write a risk register for an architecture change.

Teach-Back Output:

- Answer: "Why not microservices?"
- Answer: "How do you handle disagreement on architecture?"
- Answer: "Describe a technical decision and its trade-offs."

Weakness Log:

- Mark collaboration reflections that need clearer evidence or trade-off reasoning.

## Day 30: Full Knowledge Check Day

Study:

- `24-learning-practice/05-fullstack-knowledge-check-bank.md`
- `24-learning-practice/04-knowledge-check-sets.md`
- `24-learning-practice/03-engineering-english.md`
- `05-fullstack-engineering-checklist.md`
- `03-learning-roadmap.md`

Full Knowledge Check:

- 10 minutes: technical self-summary.
- 20 minutes: .NET / C# / ASP.NET Core.
- 20 minutes: database / EF Core / SQL.
- 20 minutes: React / TypeScript / frontend.
- 20 minutes: security / performance / troubleshooting.
- 45 minutes: system design.
- 20 minutes: collaboration reflection questions.
- 15 minutes: write follow-up questions and summarize what you learned.

Code Output:

- Rebuild one backend endpoint from scratch.
- Rebuild one React page from scratch.
- Solve one DSA problem from `15-data-structures-algorithms`.
- Review your project code and prepare a 5-minute walkthrough.

Teach-Back Output:

- Prepare your final technical self-summary.
- Prepare 3 project case notes.
- Prepare 2 incident stories.
- Prepare 1 leadership story.
- Prepare 1 conflict story.
- Prepare 1 failure story.
- Prepare 1 architecture trade-off story.

Final Readiness Check:

- You can explain your strongest project end to end.
- You can answer follow-up questions without freezing.
- You can say "I do not know, but here is how I would investigate" in a professional way.
- You can discuss trade-offs instead of pretending every choice is obvious.

## Daily Speaking Template

Use this for every concept:

```text
The concept is ...
It matters because ...
In a real .NET + React project, I would use it when ...
The main trade-offs are ...
Common mistakes include ...
If it fails in production, I would debug it by ...
```

Example:

```text
Idempotency means the same operation can be safely repeated without creating duplicate side effects.
It matters because clients, payment providers, and message consumers may retry requests.
In a .NET API, I can store an idempotency key with the request result and return the previous result for duplicates.
The trade-off is extra storage and more complexity around expiration and concurrency.
Common mistakes include checking the key too late or not protecting the check-and-insert operation with a transaction.
If it fails in production, I would look for duplicate records, retry logs, idempotency key usage, and transaction boundaries.
```

## DSA Daily Add-On

Spend 20 to 40 minutes per day on DSA. Do not try to solve random problems only. Study patterns.

Use:

- `15-data-structures-algorithms/01-complexity.md`
- `15-data-structures-algorithms/02-arrays-strings.md`
- `15-data-structures-algorithms/05-hash-table.md`
- `15-data-structures-algorithms/07-two-pointers-sliding-window.md`
- `15-data-structures-algorithms/06-binary-search.md`
- `15-data-structures-algorithms/04-stack-queue.md`
- `15-data-structures-algorithms/08-tree-graph.md`
- `15-data-structures-algorithms/09-heap-priority-queue.md`
- `15-data-structures-algorithms/11-dynamic-programming.md`

Suggested rotation:

- Days 1-5: arrays, strings, hash maps.
- Days 6-10: two pointers, sliding window, binary search.
- Days 11-15: stack, queue, linked list.
- Days 16-20: trees and graphs.
- Days 21-25: heap, sorting, intervals.
- Days 26-30: dynamic programming and mixed mock problems.

For each problem:

1. State brute force.
2. State optimized approach.
3. Explain time and space complexity.
4. Code cleanly.
5. Test edge cases.

## Project Case Note Bank

By the end of 30 days, prepare these stories:

- End-to-end feature story: database to API to React UI.
- Performance story: slow API, slow query, or frontend performance improvement.
- Security story: authentication, authorization, token storage, or OWASP issue.
- Incident story: production issue, diagnosis, mitigation, postmortem.
- Architecture story: modularization, migration, integration, or system redesign.
- Leadership story: mentoring, code review, alignment, conflict resolution.
- Failure story: mistake, lesson learned, process improvement.

Use this structure:

```text
Situation:
Task:
Action:
Result:
Technical depth:
Trade-offs:
What I would improve next time:
```

## What To Do If You Fall Behind

Do not restart from Day 1. Use this priority order:

1. Finish backend fundamentals: Days 1-14.
2. Finish React and TypeScript: Days 15-20.
3. Finish architecture and common technologies: Days 21-24.
4. Finish troubleshooting and system design: Days 25-29.
5. Always keep Day 30 knowledge review.

If you only have 14 days:

- Days 1-5: .NET, C#, ASP.NET Core, DI, EF Core.
- Days 6-7: SQL, API design, security.
- Days 8-10: TypeScript, React, frontend architecture.
- Days 11-12: Redis, Kafka, performance, troubleshooting.
- Day 13: system design.
- Day 14: full knowledge review.

## Final Review Readiness Bar

You are ready for deeper engineering practice when you can:

- explain core .NET runtime behavior without sounding memorized;
- build and explain a production-style ASP.NET Core API;
- optimize EF Core and SQL queries with practical reasoning;
- design secure authentication and authorization;
- build React UI with typed API integration and clean state management;
- explain architecture choices with trade-offs;
- use Redis, Kafka, queues, background jobs, and observability appropriately;
- handle system design with requirements, estimation, APIs, data model, architecture, bottlenecks, and trade-offs;
- write project case notes that show ownership, judgment, trade-off reasoning, and practical impact.

The most important habit: every topic must become something you can explain, not just something you have read.
