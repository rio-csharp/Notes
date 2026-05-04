# Senior Full-stack Engineer Readiness Checklist

Use this checklist as a self-assessment. If you cannot explain an item clearly, mark it for review.

## .NET / C#

- I can explain CLR, IL, JIT, GC, and assembly loading.
- I can explain GC roots, mark/sweep/compact, SOH/LOH/POH, server vs workstation GC, background GC, and GC pause causes.
- I can explain stack vs heap in C#.
- I can explain value type vs reference type.
- I can explain boxing and unboxing.
- I can explain `class`, `struct`, and `record`.
- I can explain how `List<T>` is backed by an array, how capacity grows, and why middle insert/remove is `O(n)`.
- I can explain how `Dictionary<TKey,TValue>` uses hashing, buckets, entries, equality, collisions, and resizing.
- I can explain `IEnumerable` vs `IQueryable`.
- I can explain deferred execution in LINQ.
- I can explain async state machine.
- I can explain what the compiler generates for `async/await`.
- I can explain `Task`, `ValueTask`, and `Thread`.
- I can explain deadlock, race condition, and thread safety.
- I can write cancellation-aware async code.
- I can diagnose ThreadPool starvation symptoms and explain common causes such as sync-over-async, blocking calls, and CPU-bound work on request threads.
- I can explain `var`, `dynamic`, `const`, `readonly`, `init`, `required`, `using`, `IDisposable`, `yield return`, and when these features matter.

## ASP.NET Core

- I can explain the request pipeline.
- I can explain how middleware is composed into a request delegate.
- I can explain Kestrel, `HttpContext`, endpoint routing, and request scope at a high level.
- I can explain middleware ordering.
- I can design global exception handling.
- I can use `ProblemDetails`.
- I can explain filters and when to use them.
- I can explain model binding and validation.
- I can configure logging, options, and environments.
- I can implement authentication and authorization.
- I can explain CORS and preflight requests.
- I can explain HTTP/1.1, HTTP/2, HTTP/3, HTTPS/TLS, keep-alive, multiplexing, and connection trade-offs.
- I can explain TCP sticky packet and half packet problems, and how delimiter or length-prefix framing solves them.

## Dependency Injection

- I can explain IoC and DI.
- I can explain Singleton, Scoped, and Transient.
- I can explain how the DI container stores registrations, chooses constructors, builds object graphs, and caches services by lifetime.
- I can identify captive dependency（生命周期捕获）bugs.
- I can explain why `DbContext` is usually Scoped.
- I can use factory registration.
- I can explain decorators and keyed services.

## Database / EF Core

- I can design normalized tables.
- I can explain vertical partitioning, horizontal partitioning, and sharding.
- I can choose a shard key based on query patterns, ownership boundaries, load distribution, and cross-shard transaction risk.
- I can explain cross-shard query, pagination, reporting, and rebalancing problems.
- I can explain when not to shard.
- I can write joins, aggregations, and pagination queries.
- I can explain clustered and non-clustered indexes.
- I can explain SQL Server rowstore indexes using a B+ tree mental model.
- I can explain key lookup, page split, fragmentation, statistics, and logical reads.
- I can read a basic execution plan.
- I can explain transaction isolation levels.
- I can troubleshoot deadlocks.
- I can explain blocking vs deadlock vs timeout.
- I can explain database connection pooling, pool exhaustion, and common SQL Server wait categories.
- I can avoid EF Core N+1 queries.
- I can use projection and `AsNoTracking`.
- I can explain EF Core query translation from expression trees to provider SQL, query compilation, materialization, and tracking.
- I can explain EF Core identity map, original value snapshots, DetectChanges, and SaveChanges pipeline.
- I can handle optimistic concurrency.

## Frontend / React

- I can explain React rendering and reconciliation.
- I can explain React Fiber, render phase, commit phase, batching, and why render must be pure.
- I can explain hooks rules.
- I can explain how React tracks hook state by call order on the component fiber, and how effect dependencies/cleanup work.
- I can explain stale closure（陈旧闭包）.
- I can explain JavaScript event loop, microtasks, macrotasks, rendering, and why long tasks freeze the UI.
- I can explain the browser rendering pipeline, critical rendering path, render-blocking resources, layout thrashing, and compositor-friendly animations.
- I can choose between local state, context, Redux, Zustand, and React Query.
- I can design type-safe API clients with TypeScript.
- I can optimize rendering and bundle size.
- I can handle forms, validation, loading, empty, and error states.
- I can explain XSS risk in frontend code.
- I can design component boundaries, reusable UI components, and design-system conventions.
- I can explain when micro-frontends are useful and when they are unnecessary complexity.

## Security

- I can explain authentication vs authorization.
- I can design JWT access token and refresh token flow.
- I can explain OAuth 2.0 and OpenID Connect at a high level.
- I can explain OAuth/OIDC threat model, PKCE, `state`, `nonce`, redirect URI validation, token replay, and open redirect risk.
- I can explain why JWT signature validation is not enough without issuer, audience, lifetime, algorithm, token type, and claim validation.
- I can explain JWKS, signing key rotation, and `kid`.
- I can explain refresh token rotation and reuse detection.
- I can compare SPA token storage with BFF and HttpOnly cookie approaches.
- I can explain XSS, CSRF, SQL injection, SSRF, and broken access control.
- I can hash passwords safely.
- I can apply rate limiting.
- I can discuss token storage trade-offs.

## Architecture

- I can explain layered architecture.
- I can explain Clean Architecture.
- I can explain DDD tactical patterns.
- I can compare monolith, modular monolith, and microservices.
- I can explain CQRS.
- I can design idempotent APIs.
- I can use outbox pattern for reliable event publishing.
- I can document architecture decisions.

## Middleware / Distributed Systems

- I can explain Redis data structures and caching patterns.
- I can explain Redis internal data structure mental models, command execution model, expiration vs eviction, and slow command risks.
- I can explain cache penetration, breakdown, and avalanche.
- I can explain TTL jitter, request coalescing, hot key, big key, and Redis outage degradation.
- I can explain Kafka topic, partition, consumer group, and offset.
- I can explain Kafka partition logs, log segments, retention, leader/follower replicas, ISR, and producer partitioning.
- I can explain Kafka duplicate consumption, consumption failure, offset commit timing, retry topics, DLT, rebalance, and consumer lag.
- I can compare Kafka and RabbitMQ.
- I can explain Elasticsearch inverted index, analyzer pipeline, `text` vs `keyword`, shards/replicas, refresh/flush/merge, BM25, deep pagination, aliases, and reindexing.
- I can design Elasticsearch indexing from SQL using outbox/CDC and explain eventual consistency.
- I can design retry and dead-letter handling.
- I can explain eventual consistency.
- I can explain outbox, inbox, saga, compensation, cache consistency, message ordering, and read-your-writes trade-offs.

## System Design

- I can gather functional and non-functional requirements.
- I can estimate traffic and storage.
- I can design APIs and data models.
- I can use load balancers, cache, queues, workers, object storage, and CDN.
- I can discuss consistency, availability, latency, and scalability.
- I can design rate limiter, notification system, file storage, chat, and payment callback systems.

## Production Troubleshooting

- I can investigate 500 errors.
- I can investigate slow APIs.
- I can investigate database timeout and deadlock.
- I can investigate high CPU and memory.
- I can investigate frontend blank screen.
- I can use logs, metrics, and traces.
- I can communicate during an incident.
- I can write a postmortem.

## DevOps / Kubernetes

- I can explain container image vs container.
- I can explain Kubernetes Pod, Deployment, Service, Ingress, ConfigMap, Secret, and HPA.
- I can explain pod IP, ClusterIP, Service endpoints, kube-proxy mental model, DNS/service discovery, and ingress traffic flow.
- I can explain readiness, liveness, and startup probes and choose what each should check.
- I can explain rolling updates, graceful shutdown, `SIGTERM`, and termination grace period.
- I can explain resource requests/limits, CPU throttling, and OOMKilled.
- I can debug common Kubernetes symptoms such as CrashLoopBackOff, ImagePullBackOff, Pending pods, no Service endpoints, and ingress 502/503.
