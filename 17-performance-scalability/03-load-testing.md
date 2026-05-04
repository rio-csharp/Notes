# Load Testing

## Core Idea

Load testing measures how a system behaves under expected and peak traffic.

Chinese notes:

- `load test`: 负载测试.
- `stress test`: 压力测试.
- `spike test`: 峰值冲击测试.
- `soak test`: 稳定性长跑测试.
- `throughput`: 吞吐量.
- `p95 latency`: 95 分位延迟.

## Why Load Test?

Load testing helps answer:

- How many requests per second can the system handle?
- What is p95/p99 latency under expected traffic?
- Where is the first bottleneck?
- What happens when traffic spikes?
- Does memory grow over time?
- Do errors appear before CPU is saturated?
- Does scaling out actually improve throughput?

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

Track from the load tool:

- requests per second;
- p50/p95/p99 latency;
- error rate;
- checks passed/failed;
- request duration by endpoint.

Track from the system:

- API CPU;
- memory;
- GC;
- thread pool queue length;
- SQL CPU;
- SQL query duration;
- SQL connection pool usage;
- Redis latency;
- queue depth;
- external dependency latency.

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

Warm-up matters because first requests may include:

- JIT compilation;
- connection pool creation;
- cache misses;
- EF Core model initialization;
- TLS connection setup.

Use a warm-up stage before measuring.

```text
2 minutes warm-up
10 minutes measurement
```

## Interpreting Results

Example:

```text
RPS: 180
p95: 850 ms
error rate: 0.2%
API CPU: 35%
SQL CPU: 90%
SQL logical reads high
```

Likely bottleneck:

```text
database
```

Example:

```text
RPS: 120
p95: 2.5 s
API CPU: 25%
thread pool queue length growing
many blocked threads
```

Likely bottleneck:

```text
sync blocking / thread pool starvation
```

Example:

```text
API CPU: 90%
SQL CPU: 20%
allocation rate high
GC pause high
```

Likely bottleneck:

```text
application CPU/allocation/serialization
```

## Finding The Saturation Point

Increase load gradually.

```text
50 RPS -> healthy
100 RPS -> healthy
150 RPS -> p95 starts rising
200 RPS -> error rate increases
```

The saturation point is where a resource becomes overloaded and latency rises sharply.

Do not only record maximum RPS. Record the highest RPS that meets the latency and error goals.

## Testing Scaling

To test horizontal scaling:

```text
Run test with 1 instance.
Run same test with 2 instances.
Run same test with 4 instances.
Compare throughput, latency, and bottlenecks.
```

If throughput does not improve, the bottleneck may be:

- database;
- external dependency;
- shared lock;
- distributed cache;
- message broker;
- load balancer configuration.

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

## Common Mistakes

- Testing with tiny database.
- Only looking at average latency.
- No warm-up.
- Ignoring errors.
- Unrealistic request mix.
- Testing only one endpoint.
- Running load tests against shared production without controls.
- Not correlating load-tool metrics with server metrics.
- Forgetting external dependency limits.

## Knowledge Checks

### What do you look at in a load test?

Look at throughput, latency percentiles, error rate, CPU, memory, GC, database metrics, external dependency latency, and saturation points.

### Average latency vs p95?

Average hides tail latency. p95 shows the latency experienced by slower 5% of requests and is usually more useful for user experience.

### How do you find bottlenecks?

Correlate latency with resource metrics and traces. If API CPU is low but DB time is high, focus on database. If thread pool queue grows, check blocking calls.

## Practice Task

Load test:

1. order list API;
2. order creation API;
3. login endpoint;
4. measure p95 latency;
5. identify first bottleneck;
6. document before/after optimization.
