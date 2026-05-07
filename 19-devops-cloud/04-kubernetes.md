# Kubernetes Basics For Application Engineers

## Core Idea

Kubernetes orchestrates containers across a cluster of machines.

Application engineers do not always operate the cluster directly, but they should understand how their application runs inside it.

## Pod

A pod is the smallest deployable unit.

It usually contains one application container.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: orders-api
spec:
  containers:
    - name: orders-api
      image: myregistry/orders-api:1.0.0
      ports:
        - containerPort: 8080
```

## Deployment

A deployment manages replicas and rolling updates.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders-api
  template:
    metadata:
      labels:
        app: orders-api
    spec:
      containers:
        - name: orders-api
          image: myregistry/orders-api:1.0.0
          ports:
            - containerPort: 8080
```

## Service

A service provides stable networking for pods.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  selector:
    app: orders-api
  ports:
    - port: 80
      targetPort: 8080
```

## ConfigMap And Secret

ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-api-config
data:
  ASPNETCORE_ENVIRONMENT: Production
```

Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: orders-api-secrets
type: Opaque
stringData:
  ConnectionStrings__Default: "Server=..."
```

Do not store raw secrets in Git.

## Health Checks

ASP.NET Core:

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>();

app.MapHealthChecks("/health");
```

Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

Liveness:

- should the container be restarted?

Readiness:

- should the pod receive traffic?

## Resource Requests And Limits

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "512Mi"
```

Requests help scheduling.

Limits prevent one container from consuming too much.

## Under The Hood: Kubernetes Networking

Kubernetes networking is built around a few practical rules:

```text
Every pod gets its own IP.
Pods can talk to other pods.
Services provide stable virtual addresses.
Ingress/load balancers bring traffic from outside the cluster.
```

Basic flow:

```text
Browser
  -> Load Balancer / Ingress
  -> Service
  -> one ready Pod endpoint
  -> container port
```

Inside the cluster:

```text
orders-api.default.svc.cluster.local
  -> ClusterIP
  -> selected pod IPs
```

Important mental model:

> A Service is not your application. It is a stable networking abstraction over changing Pods.

Pods are temporary:

- they can be killed;
- they can be rescheduled;
- their IP can change;
- a deployment can replace them during rolling update.

Services stay stable:

- stable DNS name;
- stable virtual IP;
- load-balancing across ready endpoints.

## Service Types

Common Service types:

| Type | Use Case |
| --- | --- |
| `ClusterIP` | internal service-to-service traffic |
| `NodePort` | expose on each node port, often for simple testing |
| `LoadBalancer` | provision external cloud load balancer |
| `ExternalName` | DNS alias to an external service |

Example:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  type: ClusterIP
  selector:
    app: orders-api
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

`port` is the Service port.

`targetPort` is the container port.

A common misunderstanding is that a Service always has reachable endpoints. If the Service selector does not match Pod labels, the Service has no endpoints. The DNS name may resolve, but traffic has nowhere useful to go.

## Ingress And External Traffic

Ingress usually manages HTTP/HTTPS routing.

Example:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orders-api
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: orders-api
                port:
                  number: 80
```

Typical production path:

```text
Client
  -> DNS
  -> cloud load balancer
  -> ingress controller
  -> Kubernetes Service
  -> ready Pod
```

- TLS often terminates at ingress or load balancer;
- path-based routing can send traffic to different services;
- ingress is HTTP-aware, Service is lower-level;
- ingress controller must be installed separately in many clusters.

## Readiness, Liveness, And Startup Probes

Readiness:

```text
Can this pod receive traffic right now?
```

Liveness:

```text
Should Kubernetes restart this container?
```

Startup:

```text
Has this slow-starting app finished booting?
```

Recommended split for ASP.NET Core:

```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(
        builder.Configuration.GetConnectionString("Default")!,
        name: "sql",
        tags: new[] { "ready" });

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
```

YAML:

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 8080
  failureThreshold: 30
  periodSeconds: 2
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  periodSeconds: 10
```

Putting database checks in liveness can create restart storms. If the database is temporarily down, restarting every API pod usually makes recovery worse. Database dependency is often better in readiness, not liveness.

## Rolling Updates And Graceful Shutdown

During a rolling update:

```text
1. Deployment creates new pod.
2. New pod starts.
3. Readiness probe passes.
4. Service sends traffic to new pod.
5. Old pod receives termination signal.
6. Old pod stops accepting new work and finishes in-flight requests.
```

Kubernetes sends `SIGTERM` before killing the container.

ASP.NET Core handles graceful shutdown through the host lifetime and cancellation tokens, but the application code must cooperate.

Example:

```csharp
app.MapPost("/orders", async (
    CreateOrderRequest request,
    IOrderService service,
    CancellationToken ct) =>
{
    var orderId = await service.CreateAsync(request, ct);
    return Results.Created($"/orders/{orderId}", new { orderId });
});
```

Deployment settings:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    spec:
      terminationGracePeriodSeconds: 30
```

Practical concerns:

- stop taking traffic before shutdown;
- respect `CancellationToken`;
- make background workers stop safely;
- avoid losing messages during shutdown;
- make operations idempotent because clients may retry.

## Resource Requests, Limits, CPU Throttling, And OOMKilled

Requests affect scheduling:

```text
Kubernetes chooses a node that has enough requested CPU/memory available.
```

Limits affect enforcement:

```text
CPU limit -> throttling.
Memory limit -> possible OOMKilled.
```

Symptoms of CPU throttling:

- latency rises under load;
- CPU usage may not look like 100% inside the app;
- request processing becomes uneven;
- ThreadPool starvation symptoms may appear in .NET services.

Symptoms of OOMKilled:

- pod restarts;
- exit code often 137;
- logs suddenly stop;
- memory graph climbs before restart.

Practical .NET notes:

- server GC can use multiple heaps and more memory;
- large object allocations can increase memory pressure;
- container memory limits should be realistic;
- load test with production-like limits.

Useful commands:

```powershell
kubectl describe pod orders-api-abc123
kubectl top pod
kubectl logs orders-api-abc123 --previous
```

## ConfigMap, Secret, And Configuration Binding

ASP.NET Core commonly reads configuration from environment variables.

Nested configuration uses double underscore:

```yaml
env:
  - name: ConnectionStrings__Default
    valueFrom:
      secretKeyRef:
        name: orders-api-secrets
        key: defaultConnection
  - name: Redis__ConnectionString
    valueFrom:
      secretKeyRef:
        name: orders-api-secrets
        key: redisConnectionString
```

C# binding:

```csharp
builder.Services.Configure<RedisOptions>(
    builder.Configuration.GetSection("Redis"));
```

- Kubernetes Secrets are base64-encoded, not automatically fully secure.
- Restrict RBAC access.
- Consider cloud secret stores.
- Never log secrets.
- Rotate secrets with a deployment plan.

## Horizontal Scaling And Stateless Apps

Horizontal Pod Autoscaler (HPA) can scale replicas.

Example:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

For app engineers, the key requirement is statelessness:

- do not store user session only in local memory;
- do not store uploaded files only in container filesystem;
- use external database/cache/object storage;
- design background processing so duplicate work is safe.

Kubernetes can add replicas, but the application must be horizontally scalable. If the app depends on local memory sessions, local files, or non-idempotent background work, scaling can create correctness bugs.

## Kubernetes Debugging Checklist

When a deployment is broken:

```powershell
kubectl get pods
kubectl describe pod <pod>
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl get events --sort-by=.lastTimestamp
kubectl get endpoints <service>
kubectl describe ingress <ingress>
```

Common symptoms:

| Symptom | Likely Causes |
| --- | --- |
| `CrashLoopBackOff` | app crashes at startup, bad config, missing secret |
| `ImagePullBackOff` | image name/tag/registry auth problem |
| `Pending` | not enough node resources, scheduling constraints |
| Service returns no traffic | selector mismatch, readiness failing, wrong targetPort |
| 502/503 at ingress | no ready endpoints, backend timeout, ingress config |
| Random restarts | OOMKilled, liveness too strict, app crash |
| Slow under load | CPU throttling, DB bottleneck, connection pool exhaustion |


