# Load Testing

## Core Idea

Load testing measures how a system behaves under expected and peak traffic.

## Purpose

Load testing exposes how a system behaves under expected and peak traffic. It answers questions that unit and integration tests cannot:

- Does memory grow over time (memory leak) or stabilize (steady-state)?
- Do errors appear before CPU is saturated (misconfiguration, throttling, connection pool limits)?
- Does scaling out actually improve throughput, or is the bottleneck shared (database, distributed lock)?
- Does latency degrade gracefully under load, or does it spike at a specific concurrency threshold?

## Types Of Tests

### Smoke Test

Small test to verify the script and environment.

```text
1-2 virtual users for 1 minute
```

### Load Test

Expected normal or peak traffic.

```text
200 virtual users for 15 minutes
```

### Stress Test

Push beyond expected traffic to find breaking point.

```text
Increase traffic until p95 latency or error rate becomes unacceptable.
```

### Spike Test

Sudden traffic increase.

```text
10 users -> 500 users in 30 seconds
```

### Soak Test

Long-running test to find leaks and stability issues.

```text
Expected load for 4-24 hours
```

## Metrics

### From the Load Tool

| Metric | What It Reveals |
|---|---|
| Requests per second | Achieved throughput; plateau indicates saturation |
| p50/p95/p99 latency | Typical and tail latency; p95/p99 rising signals queuing |
| Error rate | System failures, timeouts, 5xx, connection drops |
| Checks passed/failed | Functional correctness under load (status codes, response bodies) |
| Request duration by endpoint | Uneven load distribution or endpoint-specific bottlenecks |

### From the System Under Test

| Metric | What It Reveals |
|---|---|
| API CPU | Application-level CPU saturation |
| Memory (working set, GC heap size) | Steady-state vs. growing (leak); GC pressure |
| GC (Gen 0/1/2 collections per second, pause durations, LOH size) | Allocation rate, GC overhead, large object fragmentation |
| Thread pool queue length | Thread pool starvation or blocked threads |
| SQL CPU / query duration | Database-side bottlenecks |
| SQL connection pool usage (active vs. idle connections) | Pool exhaustion or connection leaks |
| Redis / cache latency | Cache efficiency and network overhead |
| Queue depth (message broker) | Consumer throughput vs. producer throughput |
| External dependency latency | Downstream service degradation |

In .NET applications, additional runtime counters (available via `dotnet-counters` or Application Insights) help pinpoint the bottleneck:
- `dotnet.thread_pool.thread.count` rising rapidly while CPU is low signals thread pool starvation.
- `dotnet.gc.heap.total_allocated` growing quickly indicates high allocation rate.
- `dotnet.gc.pause.time` increasing as throughput rises suggests GC is becoming a bottleneck.

### Relationship Between VUs, Think Time, and RPS

The relationship is governed by Little's Law:

```
RPS = VUs / (latency + think time)
```

For example, 100 virtual users with a 500 ms average latency and 500 ms think time generate approximately 100 RPS. Reducing think time or increasing VUs increases achieved throughput -- until the system saturates, at which point latency rises and throughput stabilizes or drops.

To determine the correct number of virtual users for a target RPS:

```
VUs = RPS * (latency + think time)
```

### Avoiding Coordinated Omission

Coordinated omission occurs when the load tool only measures requests that complete successfully and ignores those that time out or fail. This produces an artificially optimistic latency picture -- the tool reports low p95 latency even though many requests never received a response.

Symptom: reported p95 looks excellent, but error rate is high and measured throughput is far below target.

To avoid coordinated omission:
- Measure latency from the client's perspective, including timeouts and failures.
- Use open-loop load generation (arrival rate is independent of response time) rather than closed-loop (wait for response before sending next request).
- k6 is an open-loop generator by default, which makes it suitable for latency measurement.

## k6 Smoke Test

```js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 2,
  duration: "1m"
};

export default function () {
  const res = http.get("https://api.example.com/api/orders?page=1&pageSize=20");

  check(res, {
    "status is 200": r => r.status === 200
  });

  sleep(1);
}
```

Run smoke tests before larger tests.

## k6 Load Test With Stages

```js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "5m", target: 100 },
    { duration: "2m", target: 0 }
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"]
  }
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/orders?page=1&pageSize=20`);

  check(res, {
    "orders status is 200": r => r.status === 200,
    "orders returned body": r => r.body.length > 0
  });

  sleep(1);
}
```

Run:

```bash
k6 run -e BASE_URL=https://api.example.com load-orders.js
```

## Realistic Request Mix

A useful load test should represent actual traffic.

Example:

```text
70% GET /api/orders?page=1&pageSize=20
15% GET /api/orders/{id}
10% POST /api/orders
5% POST /api/orders/{id}/cancel
```

k6 example:

```js
import http from "k6/http";
import { sleep } from "k6";

export default function () {
  const roll = Math.random();

  if (roll < 0.7) {
    http.get(`${__ENV.BASE_URL}/api/orders?page=1&pageSize=20`);
  } else if (roll < 0.85) {
    http.get(`${__ENV.BASE_URL}/api/orders/123`);
  } else if (roll < 0.95) {
    http.post(
      `${__ENV.BASE_URL}/api/orders`,
      JSON.stringify({
        customerId: 1,
        items: [{ productId: 10, quantity: 1 }]
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } else {
    http.post(`${__ENV.BASE_URL}/api/orders/123/cancel`);
  }

  sleep(1);
}
```

## Authentication

Load tests often need tokens.

Setup token once per virtual user:

```js
import http from "k6/http";

export function setup() {
  const res = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    email: "load-test@example.com",
    password: __ENV.LOAD_TEST_PASSWORD
  }), {
    headers: { "Content-Type": "application/json" }
  });

  return {
    token: res.json("accessToken")
  };
}

export default function (data) {
  http.get(`${__ENV.BASE_URL}/api/orders`, {
    headers: {
      Authorization: `Bearer ${data.token}`
    }
  });
}
```

Do not run load tests with real user credentials.

## Test Data

Use realistic data:

- table sizes similar to production;
- realistic users and tenants;
- realistic order/item counts;
- realistic filters;
- realistic payload sizes;
- enough historical data for pagination/search;
- external dependencies mocked only when the test goal allows it.

Testing against tiny local data hides real bottlenecks.

## Warm-up

Warm-up stabilizes the runtime before measurement begins. Without it, first-request latency and resource usage are dominated by one-time initialization costs that do not reflect steady-state behavior.

### What Happens During Warm-up

- **JIT compilation**: the .NET runtime compiles IL to machine code on first call to each method. Tiered compilation (available since .NET Core 3.0) initially generates a low-optimized version (tier 0) and later replaces it with a highly optimized version (tier 1) once the method is recognized as hot. This two-tier approach means methods improve in performance over the first few invocations as the JIT background thread promotes hot methods. A request that exercises code paths still at tier 0 will be measurably slower than the same request after all hot methods reach tier 1.
- **Connection pool creation**: the first request triggers the creation of database and HTTP connections, which takes time and may cause initial latency spikes.
- **Cache misses**: in-memory and distributed caches are cold. The first requests hit the database directly.
- **EF Core model initialization**: the first query triggers EF Core's model building and view compilation, which can take hundreds of milliseconds.
- **TLS connection setup**: the initial TLS handshake with the load tool adds round-trips that are amortized over long-running connections.
- **ASP.NET middleware and routing**: endpoint discovery, middleware pipeline warmup, and compiled Razor pages are initialized on first request.

### Warm-up Procedure

Run a warm-up phase before collecting measurement data:

```text
2 minutes warm-up    -> discard this data
10 minutes measurement -> collect data from this window
```

Configure the warm-up to exercise the same endpoints and payload sizes as the actual test, ensuring the relevant code paths are JIT-compiled and caches are populated. A warm-up that hits only a health-check endpoint does not warm up the order-processing pipeline.

## Interpreting Results

Diagnosing a bottleneck requires correlating metrics from the load tool and the system under test. The following patterns illustrate common scenarios.

### Pattern 1: Database Bottleneck

```text
RPS: 180 (plateaued)
p95: 850 ms and rising
error rate: 0.2%
API CPU: 35%
SQL CPU: 90%
SQL logical reads high
```

Interpretation: the database is saturated (SQL CPU at 90%). The API server has headroom (35% CPU) but cannot serve requests faster because it waits on database queries. The solution is to optimize the slow queries, add indexes, cache the hot data, or scale the database.

### Pattern 2: Thread Pool Starvation

```text
RPS: 120 (below target)
p95: 2.5 s
API CPU: 25%
thread pool queue length growing
many blocked threads
```

Interpretation: threads are blocked synchronously (`.Result`, `.Wait()`, synchronous I/O). The thread pool cannot keep up, and requests queue. CPU is low because threads are waiting, not computing. Fix by eliminating synchronous blocking from the request path.

### Pattern 3: Application CPU Saturation

```text
RPS: 250
p95: 1.2 s
API CPU: 90%
SQL CPU: 20%
GC time: 15% of CPU
allocation rate: 200 MB/s
```

Interpretation: the application is CPU-bound, with significant overhead from garbage collection (15% of CPU spent in GC). Reduce allocation rate or profile hot paths for CPU optimizations.

### Pattern 4: External Dependency Degradation

```text
RPS: 150
p95: 4 s (was 200 ms at lower load)
error rate: 5%
API CPU: 40%
dependency HTTP latency: 3 s average
```

Interpretation: an external API or service is slowing down under load. Circuit breaker or bulkhead patterns would isolate the impact. Consider caching the dependency response or adding a fallback.

### Pattern 5: Throttling / Connection Pool Exhaustion

```text
RPS: plateaued at 80
p95: stable at 300 ms then sudden timeouts
error rate: spikes to 15% intermittently
SQL connection pool: 100% used
```

Interpretation: the database connection pool is exhausted. New requests cannot acquire connections and time out. Shorten transaction duration, increase pool size, or reduce concurrent requests hitting the database.

## Finding The Saturation Point

The saturation point is the load level at which a system resource becomes fully utilized and latency rises sharply. Beyond this point, throughput plateaus or drops because the system spends more time managing contention (queuing, context switching, lock waiting) than doing productive work.

### Method

Increase load gradually in a series of steps, holding each level long enough for the system to reach steady state. Plot latency and error rate against throughput.

```text
50 RPS  -> p95: 50 ms,   errors: 0%
100 RPS -> p95: 55 ms,   errors: 0%
150 RPS -> p95: 70 ms,   errors: 0%
200 RPS -> p95: 350 ms,  errors: 0.5%   <-- saturation begins
250 RPS -> p95: 1.2 s,   errors: 3%
300 RPS -> p95: 3.5 s,   errors: 12%
```

In this example, the saturation point is around 150-200 RPS. The system can handle 150 RPS comfortably; at 200 RPS latency quadruples and errors appear.

### What to Report

Do not report only the maximum RPS achieved. Report the maximum RPS that meets the system's latency and error goals:

```text
Peak throughput meeting SLO: 150 RPS at p95 < 100 ms, 0% errors
Absolute max throughput:     300 RPS (but p95 = 3.5 s, 12% errors)
```

The difference between these two numbers reveals how graceful (or sudden) the degradation curve is. A sudden cliff suggests a hard resource limit (connection pool, CPU); a gradual slope suggests queuing in the system.

### The Elastic Limit

In queuing theory, the "elastic limit" is the load point where latency begins increasing faster than throughput. Below this point, the system can absorb additional load with minimal latency impact. Beyond it, latency rises non-linearly because service time is dominated by queue wait.

Plotting latency versus throughput on a graph, the elastic limit is the knee in the curve. Operating below this knee ensures that brief traffic bursts do not trigger cascading latency spikes. Production capacity planning should set headroom (typically 30-50% below the measured saturation point) to absorb traffic variability.

## Testing Horizontal Scaling

To validate that the system benefits from horizontal scaling, run the same load test with increasing instance counts and compare the results.

### Method

```text
1. Run test with 1 instance.
2. Run same test with 2 instances (same target throughput).
3. Run same test with 4 instances.
4. Normalize results by instance count.
```

### Interpreting Scaling Results

| 1 Instance | 2 Instances | 4 Instances | Conclusion |
|---|---|---|---|
| 100 RPS | 200 RPS | 400 RPS | **Perfect linear scaling** -- no shared bottleneck. |
| 100 RPS | 150 RPS | 180 RPS | **Shared bottleneck** -- some resource is saturated. |
| 100 RPS | 100 RPS | 100 RPS | **Fully bottlenecked** -- the shared resource is maxed out on 1 instance. |

### Common Shared Bottlenecks That Prevent Scaling

- **Database**: if the database is the bottleneck, adding app instances increases contention, not throughput. Optimize queries, add read replicas, or implement caching before scaling horizontally.
- **External dependency**: a rate-limited third-party API or a single shared service instance can cap throughput regardless of app instances.
- **Distributed lock**: if all instances contend for the same distributed lock (e.g., Redis `SET NX`), adding instances increases lock wait time but not throughput.
- **Distributed cache**: if every request requires a cache round-trip, the cache itself can become a bottleneck under high concurrency.
- **Message broker**: if workers consume from a single partition or queue, partition count may limit parallelism.
- **Load balancer**: the load balancer's connection handling or SSL termination capacity can become the limiting factor.

## Safe Load Testing

Do not run uncontrolled load tests against shared production.

Use:

- dedicated environment;
- production-like data;
- clear test window;
- rate limits;
- monitoring;
- rollback/stop plan;
- stakeholder communication when testing shared systems.

## Load Test Report Template

```md
# Load Test Report

## Goal

Order list API p95 < 500 ms at 100 RPS.

## Environment

API instances:
Database size:
Cache:
External dependencies:

## Scenario

Request mix:
Duration:
Virtual users:
Data set:

## Results

RPS:
p50:
p95:
p99:
Error rate:

## Bottleneck

Evidence:

## Changes Tested

Before:
After:

## Conclusion

Pass/fail:
Next actions:
```

## Verification

A load test can be validated by:

1. testing the order list API;
2. testing the order creation API;
3. testing the login endpoint;
4. measuring p95 latency;
5. identifying the first bottleneck;
6. documenting before/after optimization results.
