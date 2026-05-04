# Knowledge Base Coverage Map

This file tracks how the detailed folder-based knowledge base maps to the original topic directory.

Status:

- `Done`: ready for the current learning plan.
- `Optional Expansion`: useful future improvement, but not required before starting the 30-day plan.

## 0. Execution Layer

Status: `Done`

Files:

- `01-README.md`
- `02-learning-path.md`
- `03-learning-roadmap.md`
- `04-dotnet-react-fullstack-knowledge-map.md`
- `05-fullstack-engineering-checklist.md`
- `06-30-day-study-plan.md`
- `07-coverage-map.md`

Optional future expansion:

- daily practice checklist.
- weekly knowledge check plan.
- must-read-first priority map.

## 1. .NET Platform

Status: `Done`

Files:

- `01-dotnet-platform/01-dotnet-overview.md` - now includes .NET platform layering, runtime vs CLR vs BCL vs SDK, build-time vs run-time flow, deployment models, and practical examples.
- `01-dotnet-platform/02-clr.md` - now includes CLR responsibility flow, managed vs unmanaged code, type safety examples, exception handling examples, and CLR vs runtime vs SDK distinctions.
- `01-dotnet-platform/03-execution-model.md` - now includes compilation flow, JIT per-process behavior, VM/container resource changes, stack/heap examples, closure examples, GC reachability, and async blocking vs non-blocking examples.
- `01-dotnet-platform/04-jit-aot-il.md` - now includes IL and metadata mental model, JIT first-use cost, tiered compilation, ReadyToRun details, Native AOT trade-offs, and serverless cold-start review scenario.
- `01-dotnet-platform/05-garbage-collection.md` - now includes GC roots, reachability diagrams, generations, mark/sweep/compact, SOH/LOH/POH, server vs workstation GC, background GC, pause causes, disposal, memory leak examples, and troubleshooting commands.
- `01-dotnet-platform/06-assembly-loading.md` - now includes assembly structure, default loading, dynamic plugin loading, `AssemblyLoadContext`, dependency version isolation, unload checks, and plugin leak causes.
- `01-dotnet-platform/07-reflection-and-attributes.md` - now includes reflection inspection examples, attribute execution model, reflection caching, source generators, AOT considerations, and review guidance.

Still useful later:

- diagnostics and profiling deep dive.
- Native AOT practical limitations.

## 2. C#

Status: `Done`

Files:

- `02-csharp/01-language-basics.md` - now includes classes, properties, constructors, primary constructors, access modifiers, static state risks, partial classes, common C# keywords, collection expressions, `IDisposable`, `yield return`, `ref/out/in`, `Span<T>`, `Memory<T>`, and expanded mistake explanations.
- `02-csharp/02-type-system.md` - now includes value/reference type mental models, passing references by value, boxing/unboxing details, class/struct/record trade-offs, nullable reference types, pattern matching, state modeling with types, generics, and equality examples.
- `02-csharp/03-oop.md` - now includes encapsulation examples, inheritance trade-offs, polymorphism, interface vs abstract class, composition/decorator examples, abstraction, complete order domain/application service examples, anemic model discussion, and review answers.
- `02-csharp/04-generics.md` - now includes generic methods/classes, constraints, boxing avoidance, covariance/contravariance, static abstract interface members, open generic DI registration, and repository trade-offs.
- `02-csharp/05-collections.md` - now includes collection selection guide, arrays/lists/dictionaries/hash sets/queues/stacks, `IEnumerable` vs `ICollection` vs `IList`, `List<T>`, `Dictionary<TKey,TValue>`, `HashSet<T>`, queue/stack, concurrent collection internals, immutable collections, and real API lookup examples.
- `02-csharp/06-linq.md` - now includes method/query syntax, deferred vs immediate execution, `SelectMany`, filtering/projection/grouping, modern LINQ operators, EF Core translation, `IEnumerable` vs `IQueryable`, multiple enumeration, and `First`/`Single` decision rules.
- `02-csharp/07-async-await.md` - now includes compiler state machine, awaiter pattern, continuation, thread pool, `ExecutionContext`, cancellation and timeout examples, `Task.WhenAll`, bounded concurrency, deadlock/starvation, `ConfigureAwait`, `ValueTask`, and fire-and-forget risks.
- `02-csharp/08-concurrency-threading.md` - now includes ThreadPool internals, starvation symptoms, blocking patterns, CPU-bound work in ASP.NET Core, async lock risks, race conditions, locks, semaphores, reader/writer locks, deadlock examples, channels/backpressure, immutable data, periodic timers, and diagnosis.
- `02-csharp/09-exception-handling.md` - now includes try/catch purpose, `throw` vs `throw ex`, custom exceptions, exception filters, async exceptions, API error mapping with `ProblemDetails`, validation vs exceptions, retry boundaries, cancellation handling, and expanded mistake explanations.

Optional future expansion:

- reflection and expression trees from C# angle.
- source generators.
- unsafe code and interop.

## 3. ASP.NET Core

Status: `Done`

Files:

- `03-aspnet-core/01-aspnet-core-overview.md` - now includes ASP.NET Core mental model, minimal hosting, Kestrel/reverse proxy deployment, controllers vs Minimal APIs, a complete Minimal API example, and where code should live.
- `03-aspnet-core/02-http-and-web-basics.md` - now includes HTTP versions, TLS, TCP byte stream fundamentals, sticky packet, half packet, and message framing.
- `03-aspnet-core/03-request-pipeline.md` - now includes pipeline composition, Kestrel, `HttpContext`, endpoint routing, and request DI scope internals.
- `03-aspnet-core/04-middleware.md` - now includes inline/class middleware, ordering, scoped services, short-circuiting, response-started rules, correlation ID, request timing, maintenance mode, and request body size guard examples.
- `03-aspnet-core/05-routing.md` - now includes attribute routing, route constraints, optional parameters, query request models, resource route design, complete order API route layout, and route conflict examples.
- `03-aspnet-core/06-controllers-and-minimal-api.md` - now includes `ActionResult<T>`, `[ApiController]`, validation, thin controller design, complete controller and Minimal API examples, endpoint filters, DTO boundaries, and Minimal API endpoint groups.
- `03-aspnet-core/07-filters.md` - now includes MVC filter pipeline stages, resource/action/exception/result filters, sync vs async filters, filter ordering, validation filter examples, and middleware vs filter decisions.
- `03-aspnet-core/08-authentication-authorization.md` - now includes authentication schemes, JWT validation, claims principal, role/policy/resource authorization, custom requirements/handlers, multi-tenant access, claim mapping, and 401 vs 403.
- `03-aspnet-core/09-configuration-options-pattern.md` - now includes configuration source priority, typed options, `IOptions` vs `IOptionsSnapshot` vs `IOptionsMonitor`, named options, validation, secrets, environment overrides, and typed `HttpClient`.
- `03-aspnet-core/10-logging-observability.md` - now includes structured logging, log levels, correlation IDs, logging scopes, sensitive data rules, OpenTelemetry, metrics, tracing, `ProblemDetails`, and production investigation flow.
- `03-aspnet-core/11-background-services.md` - now includes `IHostedService`, `BackgroundService`, scoped service usage, graceful shutdown, worker loop errors, queue consumers, idempotency, multi-instance job safety, outbox pattern, scheduling, and monitoring.
- `03-aspnet-core/12-aspnet-core-review-questions.md` - now includes expanded review questions with follow-up explanations for pipeline, filters, errors, model binding, options, auth, CORS, performance, `IHttpClientFactory`, observability, background processing, security, versioning, and controller vs Minimal API decisions.

## 4. Dependency Injection

Status: `Done`

Files:

- `04-dependency-injection/01-di-ioc-basics.md` - now includes container internals, service descriptors, constructor selection, lifetime caches, disposal, open generics, `IEnumerable<T>` resolution, and circular dependencies.
- `04-dependency-injection/02-service-lifetimes.md` - now includes singleton/scoped/transient mental model, lifetime caching, `DbContext` lifetime, `HttpClientFactory`, disposable service behavior, factory registration, and lifetime mistake explanations.
- `04-dependency-injection/03-captive-dependency.md` - now includes captive dependency root causes, current user and `DbContext` examples, scoped fixes, pass-data approach, complete request audit logging lifetime example, `IServiceScopeFactory`, root provider risks, and scope validation.
- `04-dependency-injection/04-factory-pattern-with-di.md` - now includes when factories are useful, simple factories, delegate factories, keyed services, runtime parameters, factory lifetime rules, and factory vs service locator.
- `04-dependency-injection/05-decorators-and-scrutor.md` - now includes decorator pattern examples, caching/logging decorators, manual decoration, Scrutor decoration/scanning, complete registration example, decorator order, cache invalidation with read/write decorators, and retry/idempotency warnings.

Still useful later:

- keyed services deeper examples.
- DI knowledge-check drill file.

## 5. Entity Framework Core

Status: `Done`

Files:

- `05-entity-framework-core/01-dbcontext-change-tracker.md` - now includes identity map, original value snapshots, `DetectChanges`, relationship fix-up, `SaveChanges` pipeline, and batching internals.
- `05-entity-framework-core/02-querying.md` - now includes query translation pipeline, expression trees, provider translation, query compilation, materialization, dynamic filtering, client evaluation, projection, and mistake explanations.
- `05-entity-framework-core/03-relationships.md` - now includes FK vs navigation properties, one-to-many/one-to-one/many-to-many, explicit join entities, eager/explicit/lazy loading, N+1, projection, relationship fix-up, delete behavior, and required vs optional relationships.
- `05-entity-framework-core/04-migrations.md` - now includes migration commands, model snapshot, migration history, production deployment strategy, idempotent scripts, expand-contract migration code, data migrations, index migrations, design-time context creation, migration bundles, dangerous generated changes, and rollback planning.
- `05-entity-framework-core/05-transactions-concurrency.md` - now includes `SaveChanges` transactions, manual transactions, isolation levels, optimistic concurrency, RowVersion SQL mental model, conflict handling, set-based atomic updates, pessimistic locking, execution strategy, order payment/outbox transaction example, and multi-context concerns.
- `05-entity-framework-core/06-value-converters-owned-entities.md` - now includes value objects, enum/string converters, custom converters, strongly typed IDs, `ValueComparer`, owned entities, owned collections, query translation concerns, and mapping mistake explanations.
- `05-entity-framework-core/07-raw-sql-stored-procedures.md` - now includes raw SQL use cases, `FromSql`, SQL composition, `ExecuteSql`, stored procedures, stored procedure migrations, keyless entity types, complete report endpoint example, SQL injection prevention, dynamic identifier whitelisting, and tracking behavior.
- `05-entity-framework-core/08-performance-optimization.md` - now includes diagnosis flow, projection, `AsNoTracking`, N+1, offset/keyset pagination, split queries, compiled queries, batch operations, index awareness, non-SARGable filters, complete optimized list API example, and performance review answers.
- `05-entity-framework-core/09-ef-core-review-questions.md` - now includes expanded review questions with follow-up explanations for `DbContext`, tracking, query translation, N+1, `Include`, concurrency, migrations, performance, repository pattern, transactions, raw SQL, and value converters.

Still useful later:

- provider-specific notes for SQL Server and PostgreSQL.
- compiled queries and bulk operations deeper examples.

## 6. Database / SQL

Status: `Done`

Files:

- `06-database-sql/01-relational-database-basics.md` - now includes relational fundamentals, constraints, complete customer/order/product schema, seed data, view examples, and stored procedure basics.
- `06-database-sql/02-sql-basics.md` - now includes SELECT/INSERT/UPDATE/DELETE, grouping, CTEs, window functions, NULL behavior, transactions, pagination, and practical query examples.
- `06-database-sql/03-joins.md` - now includes inner/left/right/full/cross/self/anti joins, sample data, left join filtering pitfalls, aggregation after joins, and practical sales/product examples.
- `06-database-sql/06-indexes.md` - now includes SQL Server B+ tree mental model, pages, leaf levels, key lookup, page split, fragmentation, statistics, and optimizer reasoning.
- `06-database-sql/07-query-optimization.md` - now includes connection pooling, pool exhaustion, tuning, common SQL Server wait categories, and practical DMV investigation queries.
- `06-database-sql/08-transactions-isolation.md` - now includes lock modes, lock granularity, blocking vs deadlock vs timeout, deadlock monitor, prevention, retry, deadlock graph queries, and investigation.
- `06-database-sql/04-database-design.md` - now includes partitioning, sharding, shard key selection, cross-shard queries, cross-shard transactions, global IDs, rebalancing, tenant sharding, and when not to shard.
- `06-database-sql/05-normalization-denormalization.md` - now includes 1NF/2NF/3NF examples, intentional order snapshot denormalization, daily sales summary read model, refresh SQL, and consistency strategies.

Still useful later:

- SQL Server specific notes.
- PostgreSQL specific notes.
- window functions deeper practice.

## 7. Web API Design

Status: `Done`

Files:

- `07-web-api-design/01-rest-api-design.md`
- `07-web-api-design/02-api-contracts-dtos.md` - now includes entity vs DTO boundaries, separate DTOs by use case, over-posting prevention, query projection mapping, contract evolution, and `ProblemDetails` validation shape.
- `07-web-api-design/03-pagination-filtering-sorting.md` - now includes offset pagination, cursor pagination, cursor encoding, filtering, safe sorting whitelist, response metadata, controller endpoint example, and stable ordering guidance.
- `07-web-api-design/04-api-versioning.md` - now includes versioning strategies, ASP.NET Core URL versioning example, backward-compatible evolution, breaking-change examples, deprecation headers, and migration guide outline.
- `07-web-api-design/05-idempotency.md` - now includes HTTP method idempotency, idempotency-key table design, request hashing, complete ASP.NET Core service/controller example, concurrency notes, and webhook idempotency.
- `07-web-api-design/06-swagger-openapi.md` - now includes Swagger/OpenAPI setup, XML comments, response documentation, JWT bearer configuration, `ProblemDetails`, Minimal API metadata, and contract-check guidance.
- `07-web-api-design/07-file-upload-download.md` - now includes small upload endpoint, validation, metadata entity, direct upload URL design, secure download service, path traversal protection, and abandoned upload cleanup worker.

Still useful later:

- GraphQL vs REST comparison.
- API gateway and BFF patterns.

## 8. Security

Status: `Done`

Files:

- `08-security/01-jwt.md` - now includes JWT structure, validation, access/refresh token flow, ASP.NET Core configuration, access token creation, refresh token hashing, rotation, revocation, reuse detection, frontend storage trade-offs, and claim-based authorization.
- `08-security/02-oauth2-oidc.md` - now includes OAuth/OIDC threat model, authorization code interception, PKCE, `state`, `nonce`, redirect URI validation, access token vs ID token misuse, refresh token rotation, JWKS/key rotation, BFF token storage, and common attacks.
- `08-security/03-authorization-permission-system.md` - now includes authentication vs authorization, RBAC/ABAC, resource-level authorization, ASP.NET Core authorization handlers, database permission loading, permission policies, frontend permission usage, permission caching, and audit logs.
- `08-security/04-owasp-top-10.md` - now includes OWASP Top 10:2021 categories, .NET/React-oriented prevention examples, access control checks, safer CORS, dependency scanning, security logging, and SSRF allowlist pattern.
- `08-security/05-xss-csrf-sql-injection.md` - now includes React XSS examples, DOMPurify sanitization, CSP, ASP.NET Core antiforgery examples, parameterized EF Core queries, dynamic sort whitelisting, and safe search endpoint.
- `08-security/06-password-hashing.md` - now includes password hashing concepts, ASP.NET Core `PasswordHasher`, registration/login examples, rehashing, lockout, password reset token hashing, and security logging.
- `08-security/07-secure-cookies-token-storage.md` - now includes token storage trade-offs, secure cookie examples, refresh endpoint sketch, BFF pattern, CSRF token example, and token handling rules.
- `08-security/08-rate-limiting-security.md` - now includes security use cases, ASP.NET Core rate limiter, Redis email/IP rate limiting, login endpoint example, user enumeration prevention, and distributed rate limiting concerns.
- `08-security/09-security-review-questions.md` - now includes security knowledge checks with examples for auth, JWT, token storage, permissions, SSRF, password storage, brute force protection, secrets, and file upload.

Still useful later:

- threat modeling practice.
- secure code review checklist.

## 9. HTML / CSS / Browser / JavaScript / TypeScript

Status: `Done`

Files:

- `09-frontend-foundation/01-html-basics.md` - now includes semantic HTML, complete order detail page, headings, images, links vs buttons, accessible tables, captions, and common mistakes.
- `09-frontend-foundation/02-forms-accessibility.md` - now includes labels, validation messages, `aria-describedby`, fieldsets, keyboard navigation, ARIA guidance, modal accessibility, focus handling, and complete form example.
- `09-frontend-foundation/03-css-basics.md` - now includes selectors, cascade, specificity, box model, reset styles, display, position, stacking contexts, focus states, and complete component style example.
- `09-frontend-foundation/04-css-layout-flex-grid.md` - now includes Flexbox, Grid, app shell, responsive card grid, holy grail layout, two-column form layout, `min-width: 0`, and common layout mistakes.
- `09-frontend-foundation/05-responsive-design.md` - now includes viewport setup, fluid layout, media queries, responsive tables, touch targets, responsive images, complete responsive order page, and mobile layout guidance.
- `09-frontend-foundation/06-browser-rendering.md` - now includes critical rendering path, parser/preload scanner behavior, render-blocking resources, layout thrashing, compositor-friendly animations, performance measurement, layout shift reduction, JavaScript loading, and batched DOM updates.
- `10-javascript-typescript/01-javascript-core.md` - now includes primitive/reference behavior, `var`/`let`/`const`, hoisting, equality, object/array updates, shallow spread, optional chaining, nullish coalescing, and modules.
- `10-javascript-typescript/02-prototype-this-closure.md` - now includes prototype chains, class/prototype mental model, `this`, lost `this`, arrow `this`, `call/apply/bind`, closure, private cache closure, loop closure, and React stale closure examples.
- `10-javascript-typescript/03-event-loop.md` - now includes browser event loop internals, call stack, microtask draining, rendering, splitting heavy work, Web Workers, `requestAnimationFrame`, async/await continuation, and browser vs Node.js.
- `10-javascript-typescript/04-promises-async-await.md` - now includes promises, `async` return behavior, sequential vs parallel awaits, error handling with `unknown`, `Promise.all`, `Promise.allSettled`, `AbortController`, typed fetch wrapper, timeout helper, and `Promise.race`.
- `10-javascript-typescript/05-typescript-basics.md` - now includes annotations, inference, optional vs nullable, object/interface types, unions, functions, generics, narrowing, assertions, type guards, and complete API type example.
- `10-javascript-typescript/06-typescript-advanced-types.md` - now includes unions, discriminated unions, generics, `keyof`, mapped types, conditional types, `infer`, type-safe API client, generic table columns, exhaustiveness checking, and `satisfies`.
- `10-javascript-typescript/07-tsconfig-and-tooling.md` - now includes strict tsconfig, additional strictness options, path aliases, declaration files, runtime validation with Zod, package scripts, ESLint config, Vite alias matching, and CI typechecking.

Still useful later:

- browser storage deeper file.
- CSS animations deeper file.
- frontend knowledge-check Q&A file.

## 10. React

Status: `Done`

Files:

- `11-react/01-react-basics.md` - now includes components, props, state, functional updates, conditional rendering, list rendering, composition, complete orders table/page example, accessible table markup, and loading/error/empty states.
- `11-react/02-hooks.md` - now includes hook call order internals, fiber hook state association, dependency comparison, and effect cleanup timing.
- `11-react/03-rendering-model.md` - now includes Fiber mental model, trigger-render-commit, batching, concurrent rendering, reconciliation details, keys, and derived state pitfalls.
- `11-react/04-react-router.md` - now includes route trees, params, query params, URL-backed filters, navigation, layout routes, protected routes, permission-aware guards, login redirect, loaders, and route errors.
- `11-react/05-forms.md` - now includes controlled/uncontrolled inputs, React Hook Form, Zod validation, complete create-order form, field arrays, server error mapping, loading state, redirect after success, and accessible labels.
- `11-react/06-state-management.md` - now includes local/server/URL/global state distinctions, Context current user provider, Redux Toolkit slice, Zustand store, URL state example, React Query server state example, and decision guide.
- `11-react/07-react-query.md` - now includes server state concepts, setup, basic queries, query key factory, query cancellation, `staleTime` vs `gcTime`, mutations, invalidation, optimistic updates, pagination, infinite queries, and typed API errors.
- `11-react/08-testing-react.md` - now includes React Testing Library, role-based tests, user interactions, async UI, MSW setup, error state tests, form tests, provider wrappers, and testing guidance.
- `11-react/09-react-review-questions.md` - now includes React knowledge checks with examples for re-rendering, reconciliation, keys, stale closures, memoization, effects, state management decisions, API data, and testing.

Still useful later:

- component design patterns.
- Suspense and concurrent rendering deeper file.

## 11. Frontend Architecture

Status: `Done`

Files:

- `12-frontend-architecture/01-project-structure.md` - now includes feature-based structure, dependency direction, public module APIs, path aliases, typed API layers, page/component/hook boundaries, shared UI design, design-system tokens, state placement, routing architecture, providers, environment validation, error boundaries, feature flags, testing boundaries, and micro-frontend trade-offs.
- `12-frontend-architecture/02-frontend-performance.md` - now includes browser performance mental model, Core Web Vitals, real user measurement, custom performance marks, bundle analysis, route/component code splitting, prefetching, image/font optimization, React rendering optimization, context value stability, virtualization, debounce/throttle, transitions, network optimization, HTTP caching, Web Workers, layout performance, memory leaks, and performance budgets.

Optional future expansion:

- dedicated design-system case study.
- micro-frontend migration case study.

## 12. Architecture

Status: `Done`

Files:

- `13-architecture/01-layered-architecture.md` - now includes layered responsibilities, dependency direction, complete order cancellation flow, controller/application/domain/infrastructure examples, DI registration, tests, and guidance on when layers can be skipped.
- `13-architecture/02-clean-architecture.md` - now includes dependency rule, project references, dependency inversion, use-case validation, domain events without framework coupling, API mapping boundaries, and repository trade-offs.
- `13-architecture/03-onion-hexagonal-architecture.md` - now includes ports/adapters mental model, complete payment gateway port, Stripe adapter, fake test adapter, adapter registration, REST primary adapter, and message-consumer primary adapter.
- `13-architecture/04-ddd.md` - now includes ubiquitous language, entities, value objects, aggregate boundaries, strongly typed IDs, domain events, repositories, EF Core mapping, bounded contexts, and anti-corruption layer examples.
- `13-architecture/05-cqrs.md` - now includes command/query separation, simple CQRS with one database, MediatR, validation and logging pipeline behaviors, optimized read models, projection workers, and eventual consistency.
- `13-architecture/06-event-driven-architecture.md` - now includes event vs command, domain vs integration events, outbox table, outbox publisher worker, inbox/processed-message table, idempotent consumers, event contract design, and schema versioning.
- `13-architecture/07-modular-monolith.md` - now includes module project structure, contracts, module registration, facades, internal events, schema ownership, extraction criteria, and boundary tests.
- `13-architecture/08-microservices.md` - now includes service boundary design, database ownership, sync/async communication, service health endpoints, resilient HTTP clients, API contracts, saga state, resilience patterns, and observability.
- `13-architecture/09-distributed-systems.md` - now includes consistency patterns, outbox, inbox, saga, cache consistency, message ordering, version handling, timeout/retry/idempotency examples, circuit breaker, bulkhead, clock issues, and correlation IDs.
- `13-architecture/10-architecture-review-questions.md` - now reframed as architecture knowledge checks with decision-making flow, ADR example, scalability/reliability reasoning, legacy modernization, technical debt, trade-off communication, event usage, and architecture drift prevention.

Still useful later:

- architecture diagrams for major scenarios.
- architecture kata practice.

## 13. Design Patterns

Status: `Done`

Files:

- `14-design-patterns/01-solid.md` - now includes SOLID principles with .NET examples, React-oriented interpretation, service boundaries, DI, substitution risks, focused interfaces, dependency inversion, common misconceptions, and practical checklist.
- `14-design-patterns/02-creational-patterns.md` - now includes Factory, DI factories, keyed services, Abstract Factory, Builder, test data builders, Singleton lifetime rules, Prototype with C# records, and React immutable update examples.
- `14-design-patterns/03-structural-patterns.md` - now includes Adapter, Decorator, Facade, Proxy, Composite, payment adapter, logging/caching decorators, checkout facade, authorization proxy, menu tree examples, and React recursive composition.
- `14-design-patterns/04-behavioral-patterns.md` - now includes Strategy, Observer, Command, Mediator, Chain of Responsibility, State, Template Method, ASP.NET Core middleware, MediatR pipeline behavior, domain/integration events, and React composition examples.
- `14-design-patterns/05-repository-unit-of-work.md` - now includes EF Core repository trade-offs, aggregate repositories, read repositories, generic repository risks, `IQueryable` boundary concerns, transaction boundary examples, outbox with Unit of Work, and fake repository testing.
- `14-design-patterns/06-mediator-strategy-decorator.md` - now includes practical MediatR commands/queries, validation pipeline, shipping strategy, caching decorator, Scrutor/manual decoration, combined backend flow, React equivalents, and when not to use each pattern.

Still useful later:

- dedicated React design patterns file if the frontend section later needs even more depth.

## 14. DSA

Status: `Done`

Files:

- `15-data-structures-algorithms/01-complexity.md` - now includes Big O/Omega/Theta, best/worst/average case, nested-loop reasoning, recursion complexity, amortized `List<T>.Add`, dictionary average/worst case, and real application complexity considerations.
- `15-data-structures-algorithms/02-arrays-strings.md` - now includes array memory mental model, `List<T>` count/capacity, string immutability, Unicode notes, prefix sums, product except self, grouping anagrams, in-place removal, `StringBuilder`, and `Span<T>` basics.
- `15-data-structures-algorithms/03-linked-list.md` - now includes linked list vs array trade-offs, node construction, iterative and recursive reversal, fast/slow pointers, cycle detection and cycle entry, merge sorted lists, remove nth from end, and add-two-numbers example.
- `15-data-structures-algorithms/04-stack-queue.md` - now includes stack/queue operations, valid parentheses optimization, min stack, BFS, monotonic stack, monotonic queue for sliding-window maximum, and queue using two stacks.
- `15-data-structures-algorithms/05-hash-table.md` - now includes hash table internals, buckets, collisions, custom equality, stable keys, frequency counting, group anagrams, longest consecutive sequence, prefix-sum hash map, and LRU cache.
- `15-data-structures-algorithms/06-binary-search.md` - now includes closed vs half-open interval templates, lower/upper bound, first/last position, binary search on answer, rotated sorted array search, and shipping capacity example.
- `15-data-structures-algorithms/07-two-pointers-sliding-window.md` - now includes invariants, sorted two sum, palindrome, three sum, fixed and variable windows, longest substring, minimum subarray sum, permutation in string, and at-most-K-distinct pattern.
- `15-data-structures-algorithms/08-tree-graph.md` - now includes tree/graph differences, recursive and iterative DFS, traversal orders, BFS level order, max depth, BST validation, lowest common ancestor, adjacency list/matrix, grid DFS, clone graph, topological sort, and Union Find.
- `15-data-structures-algorithms/09-heap-priority-queue.md` - now includes binary heap array model, .NET `PriorityQueue`, min/max heap usage, custom comparer, top K, kth largest, merge K sorted lists, and median from data stream.
- `15-data-structures-algorithms/10-sorting.md` - now includes .NET sorting stability notes, merge sort, quicksort, counting sort, sort colors, interval merging, custom comparer for largest number, and sorting trade-offs.
- `15-data-structures-algorithms/11-dynamic-programming.md` - now includes DP state/transition/base-case method, memoization, tabulation, climbing stairs, house robber, coin change, LIS, LCS, 0/1 knapsack, and space optimization.

Still useful later:

- curated LeetCode study plan.
- coding practice set.

## 15. Common Technologies / Middleware

Status: `Done`

Files:

- `16-common-technologies/01-redis.md` - now includes Redis execution model, internal data structure mental models, expiration vs eviction, cache failure modes, hot key, big key, and outage degradation.
- `16-common-technologies/02-redis-advanced.md` - now includes cache penetration, breakdown, avalanche, request coalescing, logical expiration, hot key, big key, and outage degradation.
- `16-common-technologies/03-kafka.md` - includes Kafka broker/topic/partition basics, producer/consumer flow, .NET producer and consumer examples, offset commit, consumer groups, ordering, retention, delivery semantics, and operational concepts.
- `16-common-technologies/04-kafka-advanced.md` - now includes partition logs, segments, retention, leader/follower replicas, ISR, consumer group coordination, duplicate consumption, failed consumption playbook, rebalance safety, offset commit failure, retry topic, DLT, and ordering trade-offs.
- `16-common-technologies/05-rabbitmq.md` - now includes exchanges, queues, bindings, routing keys, direct/fanout/topic exchanges, .NET publisher and manual-ack consumer examples, durability, prefetch, DLQ, retry queues, idempotent consumers, RabbitMQ vs Kafka, and operational signals.
- `16-common-technologies/06-elasticsearch.md` - now includes inverted index internals, analyzer pipeline, `text` vs `keyword`, shards/replicas, refresh/flush/merge, near real-time search, BM25, filter vs query context, deep pagination, aliases, reindexing, SQL consistency, and tenant filtering.
- `16-common-technologies/07-signalr-websocket.md` - now includes WebSocket handshake, frames, connection lifetime, heartbeats, strongly typed hubs, hub authorization, React client lifecycle, Redis backplane, scaling, authentication, and durable notification design.
- `16-common-technologies/08-hangfire-quartz.md` - now includes BackgroundService vs Hangfire vs Quartz, Hangfire setup, fire-and-forget/delayed/recurring jobs, retries, idempotent jobs, row claiming, Quartz cron setup, concurrency prevention, cancellation, checkpointing, and monitoring.
- `16-common-technologies/09-grpc.md` - now includes proto contracts, .NET gRPC service/client, deadlines, error mapping, server streaming, protobuf versioning, gRPC vs REST trade-offs, and common mistakes.
- `16-common-technologies/10-graphql.md` - now includes schema design, Hot Chocolate setup, query and mutation examples, resolver design, N+1 problem, DataLoader batching, authorization, query cost controls, pagination, and GraphQL vs REST trade-offs.
- `16-common-technologies/11-api-gateway.md` - now includes gateway responsibilities, YARP reverse proxy setup, authentication, rate limiting, correlation IDs, Gateway vs BFF, aggregation, timeout/resilience concerns, and gateway risks.
- `16-common-technologies/12-opentelemetry-monitoring.md` - now includes observability fundamentals, logs/metrics/traces, .NET OpenTelemetry setup, custom activities and metrics, structured logging, RED/USE methods, p95/p99 latency, correlation IDs, alerting, and dashboard design.

Still useful later:

- common .NET library comparison.
- frontend library comparison.

## 16. Performance / System Design / DevOps / Testing / Troubleshooting

Status: `Done`

Already has the core files needed for the current full-stack engineering learning plan.

Completed in Batch D:

- `17-performance-scalability/01-backend-performance.md` - now includes performance goals, investigation flow, latency vs throughput, tracing slow requests, async I/O, thread pool starvation, CPU-bound work, allocations/GC, streaming responses, caching and stampede protection, pagination, serialization, `IHttpClientFactory`, external-call resilience, bounded concurrency, and horizontal scaling.
- `17-performance-scalability/02-database-performance.md` - now includes SQL Server measurement, actual execution plans, index design, composite/covering indexes, SARGability, EF Core query shape, N+1 queries, offset vs keyset pagination, lock contention, deadlock retry, connection pool exhaustion, statistics/parameter sniffing, read scaling, and tuning checklist.
- `17-performance-scalability/03-load-testing.md` - now includes load/stress/spike/soak tests, k6 smoke/load scripts, staged tests, thresholds, realistic request mix, authentication, test data, warm-up, result interpretation, saturation point, scaling tests, safe load testing, and report template.
- `18-system-design/01-system-design-method.md` - now includes requirement clarification, scope definition, capacity estimation, API/data modeling, high-level architecture, sequence flow, failure modes, observability, security/privacy, ADR example, and engineering checklist.
- `18-system-design/02-rate-limiter.md` - now includes algorithm trade-offs, Redis Lua atomicity, token bucket Lua model, fail-open vs fail-closed design, ASP.NET Core middleware shape, and distributed deployment considerations.
- `18-system-design/03-notification-system.md` - now includes notification API, data model, outbox, queue message contracts, worker flow, retry/DLQ, scheduled notifications, provider failure handling, preferences, idempotency, privacy, and metrics.
- `18-system-design/04-file-storage-system.md` - now includes direct upload vs API proxy upload, pre-signed URL flow, metadata indexes, upload request code, confirmation flow, virus scanning, abandoned upload cleanup, secure downloads, CDN trade-offs, and lifecycle concerns.
- `18-system-design/05-url-shortener.md` - now includes API/data model, Base62 code generation, collision constraints, Redis cache-aside redirect service, async analytics, expiration, custom aliases, and abuse prevention.
- `18-system-design/06-ecommerce-order-system.md` - now includes order state machine, checkout API, order table, inventory reservation lifecycle, idempotency, payment callback handling, saga compensation, outbox events, and reconciliation.
- `18-system-design/07-payment-system.md` - now includes payment/refund states, payment table, idempotency table, provider webhook deduplication, refund table, reconciliation, signature verification, security, and audit logs.
- `18-system-design/08-chat-system.md` - now includes SignalR/WebSocket architecture, message persistence before broadcast, send flow code, message ordering, read receipts, offline sync, presence with Redis, scaling, and abuse prevention.
- `18-system-design/09-search-autocomplete.md` - now includes autocomplete requirements, Trie model, Elasticsearch/Redis options, ranking signals, query flow, frontend debounce/cancellation, caching, and abuse protection.
- `18-system-design/10-logging-system.md` - now includes centralized logging architecture, structured JSON logs, ingestion reliability, indexing, retention/tiering, cost controls, query examples, alerting, and security.
- `18-system-design/11-reporting-export-system.md` - now includes small vs large export design, export job API, job data model, background job code, streaming CSV, job statuses, object storage, secure downloads, audit, and permission filters.
- `19-devops-cloud/01-git.md` - now includes daily commands, reading history, commit design, merge vs rebase, conflict resolution, stash, revert vs reset, branching strategies, tags/releases, pull request templates, and common workflow mistakes.
- `19-devops-cloud/02-docker.md` - now includes image vs container, .NET multi-stage builds, non-root runtime containers, React static builds with Nginx SPA fallback, `.dockerignore`, Docker Compose with SQL Server health checks, ASP.NET Core health checks, configuration injection, image tagging, and operational mistakes.
- `19-devops-cloud/03-ci-cd.md` - now includes CI vs CD, .NET and React GitHub Actions workflows, SQL Server integration tests, Docker image build/push, artifact-based deployment, environment configuration, EF Core migration scripts, expand-contract migrations, deployment strategies, smoke tests, rollback/roll-forward, OIDC, and CI secret handling.
- `19-devops-cloud/04-kubernetes.md` - now includes pod networking, Service/ClusterIP/endpoints, ingress traffic path, DNS/service discovery, readiness/liveness/startup probes, rolling update, graceful shutdown, resource requests/limits, CPU throttling, OOMKilled, HPA, and debugging checklist.
- `19-devops-cloud/05-azure.md` - now includes Azure hosting choices, App Service, deployment slots, Container Apps, AKS, Static Web Apps, Azure SQL, Blob Storage code, secure downloads, Key Vault, Managed Identity, Application Insights, Service Bus, Redis, private networking, backup/restore, and cost awareness.
- `19-devops-cloud/06-nginx-iis-kestrel.md` - now includes Kestrel configuration, reverse proxy responsibilities, forwarded headers, Nginx API proxying, React SPA fallback, WebSocket proxying, IIS hosting, request size limits, security headers, health checks, and common proxy failures.
- `19-devops-cloud/07-secrets-configuration.md` - now includes configuration provider order, typed options, options validation, `IOptions` variants, user secrets, environment variables, Key Vault with Managed Identity, Kubernetes Secrets, secret rotation, feature flags, frontend secret boundaries, log masking, and startup validation.
- `20-testing-quality/01-testing-strategy.md` - now includes test pyramid trade-offs, unit/integration/E2E responsibilities, behavior-focused test design, Arrange-Act-Assert, risk-based testing, coverage limitations, naming conventions, and an order-system test matrix.
- `20-testing-quality/02-integration-testing-dotnet.md` - now includes `WebApplicationFactory`, custom factories, SQL Server Testcontainers, EF Core migrations in tests, data seeding, test authentication, authorization cases, external service fakes, error contract assertions, and test data isolation.
- `20-testing-quality/03-frontend-testing.md` - now includes React Testing Library, accessible queries, Vitest setup, component tests, form tests, MSW API mocking, async UI testing, custom hook testing, snapshot guidance, and loading/error/empty/permission states.
- `20-testing-quality/04-e2e-testing.md` - now includes Playwright setup, page object guidance, test data strategy, authenticated storage state, avoiding fixed sleeps, stable selectors, file upload/download tests, external service simulation, traces/screenshots/videos, and flakiness prevention.
- `20-testing-quality/05-code-review-quality.md` - now includes review priority, PR size and descriptions, correctness review, authorization and tenant scope, migration risk, error handling, performance, frontend review points, test review, comment quality, author/reviewer responsibilities, and review note format.
- `21-production-troubleshooting/01-troubleshooting-method.md` - now includes structured incident flow, symptom/scope definition, recent change timelines, logs/metrics/traces, correlation IDs, mitigation choices, evidence preservation, database blocking checks, message backlog investigation, frontend issue triage, communication, hypotheses, and postmortem actions.
- `21-production-troubleshooting/02-slow-api.md` - now includes latency percentiles, trace-based bottleneck analysis, request timing middleware, slow SQL, SARGability, EF Core query shape, N+1 queries, lock contention, connection pool exhaustion, thread pool starvation, external dependency latency, large payloads, cache stampede, and mitigation checklists.
- `21-production-troubleshooting/03-high-cpu-memory.md` - now includes high CPU and memory causes, unbounded cache examples, `dotnet-counters`, `dotnet-dump`, `dotnet-gcdump`, `dotnet-trace`, runtime counters, GC pressure, LOH, event subscription leaks, thread pool starvation, regex CPU spikes, retry storms, container memory limits, and `OOMKilled` investigation.
- `21-production-troubleshooting/04-frontend-blank-screen.md` - now includes browser DevTools investigation, startup config validation, React error boundaries, chunk load errors, SPA cache headers, one-time chunk reload recovery, auth redirect loops, failed root API calls, CSP issues, service worker cache, source maps/error tracking, browser compatibility, and base path problems.
- `22-business-scenarios/01-fullstack-project-case-study.md` - now uses a public knowledge-base case-study style for an order management platform, covering architecture, modules, database design, API design, backend and frontend implementation, security, performance, reliability, incidents, trade-offs, and knowledge checks.
- `22-business-scenarios/02-multi-tenant-system.md` - now includes tenant models, tenant identification, tenant context, EF Core global filters, resource-level authorization, tenant-aware cache keys, background job tenant context, admin cross-tenant access, index design, logging/metrics, and isolation tests.
- `22-business-scenarios/03-admin-dashboard.md` - now includes admin dashboard goals, API design, URL-persisted filters, server-side pagination/search/sort, backend query examples, frontend API types, React Query, reusable table design, authorization, destructive actions, audit logs, async exports, and performance concerns.
- `22-business-scenarios/04-payment-callback.md` - now includes payment state transitions, raw-body webhook endpoint, signature and timestamp verification, webhook event table, idempotent handling, uniqueness constraints, outbox events, return code strategy, reconciliation jobs, and sensitive data rules.
- `22-business-scenarios/05-webhook-design.md` - now includes receiver and sender flows, signature verification, replay protection, idempotent event storage, fast acknowledgements, async processing workers, webhook subscription and delivery tables, retry with backoff, dead-letter handling, SSRF concerns, and observability.
- `23-architecture-decision-making/01-architecture-decision-record.md` - now includes ADR purpose, lifecycle, template, decision drivers, Redis cache ADR with .NET code, modular monolith ADR, Service Bus vs Kafka ADR, token strategy ADR, decision matrix, ADR index, implementation checklists, consequences, and revisit conditions.
- `24-learning-practice/01-project-case-note-template.md` - now includes project case note purpose, short and detailed templates, business context, architecture notes, technical challenge template, trade-off template, failure handling template, checklist, and practice task.
- `24-learning-practice/02-collaboration-reflection.md` - now includes collaboration reflection, STAR plus reflection, technical self-summary, ambiguous requirements, disagreement handling, incident reflection, leadership without title, feedback reflection, prompts, and practice tasks.
- `24-learning-practice/03-engineering-english.md` - now includes engineering English for project explanations, technical challenges, trade-offs, ADRs, production issues, incident updates, clarifying questions, uncertainty, code review comments, technical writing patterns, pronunciation terms, and daily practice.
- `24-learning-practice/04-knowledge-check-sets.md` - now includes structured knowledge check sets for .NET backend, React/full-stack UI, security, architecture, system design, production troubleshooting, collaboration reflection, and self-scoring.
- `24-learning-practice/05-fullstack-knowledge-check-bank.md` - now includes broad self-assessment rounds for C#/.NET, ASP.NET Core, EF Core/SQL, React/TypeScript, security, architecture, middleware/distributed systems, system design, DevOps/cloud/Kubernetes, production troubleshooting, and collaboration reflection.
- `25-code-quality-maintainability/01-code-quality-and-maintainability.md` - now includes maintainability principles, naming, function responsibility, guard clauses, cohesion, coupling, primitive obsession, invalid-state prevention, error handling, observability, testing, refactoring, technical debt, abstraction quality, API maintainability, frontend maintainability, code review checklist, and quality metrics.

Optional future expansion:

- frontend performance deeper examples.
- incident-specific database timeout and deployment failure files.
- agile/product/team collaboration dedicated files.

## Recommended Next Batches

Batch A:

- Completed: EF Core querying, transactions/concurrency, value converters.
- Completed: SQL basics, joins, database design, normalization.
- Completed: Web API contracts, pagination, versioning, idempotency.

Batch B:

- Completed: HTML, CSS, JavaScript, TypeScript basics.
- Completed: React basics, router, forms, state management, testing.

Batch C:

- Completed: Design patterns.
- Completed: Architecture missing files.
- Completed: Common technologies: RabbitMQ, Elasticsearch, SignalR, Hangfire, gRPC, GraphQL, API Gateway, OpenTelemetry.

Batch D:

- Completed: DevOps, testing, troubleshooting, performance, and code quality essentials.
- Still useful later: behavioral and project packaging refinements.
