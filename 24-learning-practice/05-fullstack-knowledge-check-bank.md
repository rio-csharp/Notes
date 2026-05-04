# Full-stack Knowledge Check Bank

## Core Idea

This bank is a broad self-assessment tool for `.NET + React` full-stack engineering knowledge.

Chinese notes:

- `knowledge check`: 知识检查.
- `self-assessment`: 自我评估.
- `weak point`: 薄弱点.
- `verbal explanation`: 口头解释.

Use it to find gaps, not to memorize answers.

## How To Practice

For each question:

```text
1. Give a short answer.
2. Add one practical example.
3. Mention one common mistake.
4. If possible, connect it to code or production behavior.
```

Example:

```text
Question:
What causes N+1 queries?

Short answer:
N+1 happens when the app first loads a list and then runs one extra query per item.

Example:
Load 50 orders, then query items once per order.

Common mistake:
Using lazy loading or loops without checking generated SQL.

Practical fix:
Use projection, Include carefully, or batch queries.
```

## Round 1: C# And .NET

1. Explain the .NET execution model.
2. What is IL and why does .NET use it?
3. What does the CLR provide?
4. Explain value type vs reference type.
5. Is every value type stored on the stack?
6. What is boxing and why can it hurt performance?
7. Explain `class` vs `struct` vs `record`.
8. Explain `IEnumerable` vs `IQueryable`.
9. What is LINQ deferred execution?
10. Explain `async/await`.
11. Does `async` create a new thread?
12. What is thread pool starvation?
13. How do you handle cancellation?
14. What is `IDisposable`?
15. Can C# have memory leaks?
16. Explain GC roots and reachability.
17. What are SOH, LOH, and POH?
18. Server GC vs workstation GC.
19. What causes GC pauses?
20. `var` vs `dynamic` vs `object`.
21. `const` vs `readonly` vs `static readonly`.
22. Why does `IDisposable` matter if C# has garbage collection?
23. What does `yield return` do?
24. What are `init` and `required` useful for?
25. What are `Span<T>` and `Memory<T>` used for?

## Round 2: ASP.NET Core

1. Explain the request pipeline.
2. Middleware vs filters.
3. How do you design global exception handling?
4. What is `ProblemDetails`?
5. How does model binding work?
6. How does validation work with `[ApiController]`?
7. Explain authentication vs authorization.
8. Explain policy-based authorization.
9. How do you implement resource-based authorization?
10. What is CORS?
11. What are TCP sticky packet and half packet problems?
12. How do delimiter-based and length-prefix protocols solve TCP message boundary issues?
13. HTTP/1.1 vs HTTP/2 vs HTTP/3.
14. What does TLS provide?
15. How do you configure options?
16. `IOptions` vs `IOptionsSnapshot` vs `IOptionsMonitor`.
17. How do you implement structured logging?
18. What is correlation ID?
19. How do you make an API observable?

## Round 3: EF Core And SQL

1. What is `DbContext`?
2. What is change tracking?
3. Tracking vs no-tracking query.
4. What causes N+1 queries?
5. `Include` vs projection.
6. How do you optimize EF Core queries?
7. What are migrations?
8. How do you do production migrations safely?
9. What is optimistic concurrency?
10. What is a database index?
11. Clustered vs non-clustered index.
12. What is a covering index?
13. How do you read an execution plan?
14. What is transaction isolation?
15. How do you handle deadlocks?
16. Explain EF Core query translation from LINQ to SQL.
17. Expression tree vs delegate.
18. What is EF Core materialization?
19. What are compiled queries?
20. How does database connection pooling work?
21. What causes connection pool exhaustion?
22. What are common SQL Server wait categories?
23. Partitioning vs sharding.
24. How do you choose a shard key?
25. What is the cross-shard query problem?
26. How do you handle cross-shard reporting and pagination?
27. When should you not shard?

## Round 4: React And TypeScript

1. What causes a React re-render?
2. What is reconciliation?
3. Why are keys important?
4. Explain stale closure.
5. `useEffect` dependency array.
6. `useMemo` vs `useCallback`.
7. Controlled vs uncontrolled components.
8. Context vs Redux vs Zustand.
9. What problem does React Query solve?
10. How do query keys work?
11. How do you handle optimistic updates?
12. How do you optimize frontend performance?
13. What are Core Web Vitals?
14. How do you reduce bundle size?
15. TypeScript `type` vs `interface`.
16. Explain browser rendering pipeline.
17. What is layout thrashing?
18. Why are transform and opacity cheaper to animate?
19. Why do React hooks depend on call order?
20. How does `useEffect` cleanup work?
21. How do you design reusable components?
22. Page component vs feature component vs shared UI component.
23. What belongs in a design system?
24. When would you use micro-frontends?
25. Why can micro-frontends be overkill?

## Round 5: Security

1. Authentication vs authorization.
2. JWT structure and validation.
3. Access token vs refresh token.
4. OAuth vs OIDC.
5. Authorization Code Flow with PKCE.
6. RBAC vs ABAC.
7. How do you design permissions?
8. What is XSS?
9. What is CSRF?
10. How do you prevent SQL injection?
11. Token storage trade-offs.
12. What is SSRF?
13. What is broken access control?
14. How do you hash passwords?
15. How do you design rate limiting?
16. Why is validating a JWT signature not enough?
17. How does PKCE protect authorization code flow?
18. What are `state` and `nonce` used for?
19. How do you validate redirect URIs safely?
20. What is refresh token rotation and reuse detection?
21. What are JWKS, `kid`, and signing key rotation?
22. When would you use a BFF instead of storing tokens in a React SPA?
23. Access token vs ID token misuse: what can go wrong?

## Round 6: Architecture

1. Layered architecture vs Clean Architecture.
2. What is DDD?
3. Entity vs Value Object.
4. What is an aggregate?
5. What is bounded context?
6. What is CQRS?
7. Does CQRS require event sourcing?
8. What is the Outbox pattern?
9. Monolith vs modular monolith vs microservices.
10. How do you choose service boundaries?
11. How do you handle distributed transactions?
12. What is eventual consistency?
13. How do you make APIs idempotent?
14. How do you document architecture decisions?
15. How do you modernize legacy systems?

## Round 7: Middleware And Distributed Systems

1. Redis data types.
2. Cache aside pattern.
3. Cache penetration, breakdown, avalanche.
4. Hot key and big key.
5. Redis distributed lock.
6. Kafka topic, partition, offset.
7. Kafka consumer group.
8. Kafka ordering guarantee.
9. At-least-once vs exactly-once.
10. Idempotent consumer.
11. Retry topic and dead-letter topic.
12. Kafka vs RabbitMQ.
13. Message queue vs event streaming.
14. How do you monitor consumer lag?
15. How do you handle duplicate messages?
16. Why can Kafka consume the same message twice?
17. What do you do when a Kafka message cannot be consumed successfully?
18. How do retry topics affect ordering?
19. How do you prevent Redis cache avalanche?
20. How do you handle Redis cache breakdown for a hot key?
21. How do you handle cache penetration for missing data?
22. How do you design Redis degradation when Redis is down?
23. Explain Redis internal data structures at a high level.
24. Redis expiration vs eviction.
25. Kafka partition log and log segment.
26. Kafka leader/follower replica and ISR.
27. How does producer partitioning affect ordering?
28. How does an Elasticsearch inverted index work?
29. `text` vs `keyword` mapping.
30. How does an analyzer affect search results?
31. What are Elasticsearch shards and replicas?
32. Why is Elasticsearch near real-time?
33. What is BM25 relevance scoring at a high level?
34. Why should you avoid deep `from/size` pagination?
35. How do `search_after` and stable sorting work?
36. How do you change Elasticsearch mappings safely?
37. How do you keep Elasticsearch consistent with SQL source of truth?

## Round 8: System Design

1. Design a rate limiter.
2. Design a notification system.
3. Design a file storage system.
4. Design a chat system.
5. Design an e-commerce order system.
6. Design a payment system.
7. Design a multi-tenant SaaS system.
8. Design an admin dashboard backend.
9. Design audit logging.
10. Design webhook processing.
11. Design search autocomplete.
12. Design reporting/export system.
13. Design permission system.
14. Design API gateway for microservices.
15. Design a resilient background job system.
16. Design consistency for order-payment-inventory flow using outbox/inbox/saga.
17. Design cache consistency for product details vs account balance.
18. Explain fail-open vs fail-closed in rate limiting.
19. Compare fixed window, sliding log, token bucket, and leaky bucket.

## Round 9: DevOps, Cloud, And Kubernetes

1. Docker image vs container.
2. How do you deploy a .NET API to Kubernetes?
3. Pod vs Deployment vs Service.
4. How does Kubernetes route traffic to pods?
5. ClusterIP vs NodePort vs LoadBalancer.
6. What does Ingress do?
7. How does Kubernetes service discovery work?
8. Readiness vs liveness vs startup probe.
9. Why should database checks usually not be liveness checks?
10. What happens during a rolling update?
11. How do you design graceful shutdown for ASP.NET Core in Kubernetes?
12. What are resource requests and limits?
13. What is CPU throttling?
14. What does `OOMKilled` mean?
15. How do you debug `CrashLoopBackOff`?
16. How do you debug a Service with no endpoints?
17. How do you handle secrets in Kubernetes?

## Round 10: Production Troubleshooting

1. How do you troubleshoot slow API?
2. How do you troubleshoot 500 errors?
3. How do you troubleshoot database timeouts?
4. How do you troubleshoot deadlocks?
5. How do you troubleshoot high memory?
6. How do you troubleshoot thread pool starvation?
7. How do you troubleshoot frontend blank screen?
8. How do you troubleshoot CORS errors?
9. How do you handle a bad deployment?
10. How do you write a postmortem?

## Round 11: Collaboration Reflection

1. What technical problem taught you the most recently?
2. What production issue changed how you build systems?
3. What disagreement helped clarify a better design?
4. What requirement was ambiguous, and how was it clarified?
5. What documentation would have saved time?
6. What mistake became a better test, process, or design?
7. What trade-off did you accept, and why?
8. What kind of engineering problem do you want to understand better next?

## Score Sheet

```text
Topic:
Score:
Evidence:
Weak point:
Relevant files to reread:
Code example to write:
Date to revisit:
```

Scoring:

```text
0 = I cannot answer.
1 = I know keywords only.
2 = I can explain basics.
3 = I can explain with an example.
4 = I can explain trade-offs and pitfalls.
5 = I can connect it to a practical project or production scenario.
```
