# Microservices

## Core Idea

Microservices architecture structures a system as independently deployable services around business capabilities.

Microservices are not automatically better than monoliths.

They trade code-level simplicity for organizational and operational scalability.

## Conditions That Favor Microservices

Microservices may help when:

- teams need independent deployment;
- business domains are clearly separated;
- modules have different scaling needs;
- technology independence matters;
- failure isolation matters;
- organization is large enough to own services.

## Conditions That Work Against Microservices

They hurt when:

- team is small;
- domain boundaries are unclear;
- DevOps maturity is low;
- distributed tracing and monitoring are weak;
- data consistency requirements are strong;
- the system is mostly simple CRUD.

## Modular Monolith First

Starting with a modular monolith is often the right call when domain boundaries are still changing. It keeps deployment and transactions simple while enforcing module boundaries. Later, modules with clear boundaries and independent scaling needs can be extracted into services.

## Service Boundary

Bad boundary:

```text
UserService
OrderService
OrderItemService
AddressService
```

This may be entity-based and too chatty.

Better boundary:

```text
Ordering
Billing
Shipping
Identity
Notification
Catalog
```

Boundaries should follow business capabilities.

## Database Per Service

Microservices should own their data.

Avoid:

```text
Service A directly reads Service B database tables.
```

Prefer:

- API calls;
- events;
- replicated read models;
- integration contracts.

## Communication

### Synchronous

REST/gRPC.

Pros:

- simple request-response;
- immediate result.

Cons:

- runtime coupling;
- cascading failures;
- latency accumulation.

### Asynchronous

Kafka/RabbitMQ/Azure Service Bus.

Pros:

- decoupling;
- resilience;
- buffering;
- eventual consistency.

Cons:

- harder debugging;
- duplicate messages;
- ordering challenges;
- eventual consistency.

## API Gateway Pattern

Client applications rarely communicate directly with individual services in production. An API Gateway sits between clients and services, providing a single entry point that handles routing, authentication, rate limiting, and protocol translation.

Responsibilities:

- route requests to the appropriate service;
- enforce authentication and authorization centrally;
- apply rate limiting and throttling;
- transform request/response formats (for example, aggregate multiple responses);
- translate between external protocols (HTTP/WebSocket) and internal protocols (gRPC/AMQP).

An API Gateway reduces the number of client-to-service round trips and centralizes cross-cutting concerns. However, it introduces a potential single point of failure and must be deployed with high availability. For complex systems, multiple fine-grained gateways (one per client type or domain) are preferred over a single monolithic entry point, following the Backends for Frontends pattern.

## Service Template

A service should have clear ownership, API contracts, data ownership, and operational endpoints.

Example service structure:

```text
Ordering.Api
  Controllers
  Contracts
  Application
  Domain
  Infrastructure
  Program.cs
```

Health endpoints:

```csharp
builder.Services
    .AddHealthChecks()
    .AddSqlServer(builder.Configuration.GetConnectionString("Ordering")!);

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");
```

Use:

- liveness for process health;
- readiness for dependency readiness;
- metrics and tracing for operations.

## Resilient HTTP Client

Synchronous service calls need timeouts and resilience.

```csharp
builder.Services.AddHttpClient<IPaymentClient, PaymentClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payment:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

Client:

```csharp
public sealed class PaymentClient : IPaymentClient
{
    private readonly HttpClient _httpClient;

    public PaymentClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<PaymentResult> AuthorizeAsync(
        AuthorizePaymentRequest request,
        CancellationToken ct)
    {
        using var response = await _httpClient.PostAsJsonAsync(
            "/api/payments/authorize",
            request,
            ct);

        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            return PaymentResult.Declined("Payment conflict.");
        }

        response.EnsureSuccessStatusCode();

        return await response.Content
            .ReadFromJsonAsync<PaymentResult>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Empty payment response.");
    }
}
```

Add retries only for safe operations. A payment authorization should use an idempotency key before retrying.

## API Contract Ownership

Each service owns its public contract.

```csharp
public sealed record AuthorizePaymentRequest(
    Guid RequestId,
    int OrderId,
    decimal Amount,
    string Currency,
    string PaymentMethodToken);

public sealed record PaymentResult(
    bool Approved,
    string? TransactionId,
    string? DeclineReason)
{
    public static PaymentResult Declined(string reason)
    {
        return new PaymentResult(false, null, reason);
    }
}
```

Changing contracts requires compatibility planning:

- add fields before removing fields;
- support old and new consumers during migration;
- version APIs or events when needed;
- monitor usage before deleting old fields.

## Distributed Transaction Problem

In a monolith:

```text
Save order + save payment record in one database transaction
```

In microservices:

```text
Ordering database
Billing database
Shipping database
```

Two-phase commit is often avoided because it adds complexity and coupling.

Use:

- saga pattern;
- outbox pattern;
- idempotent consumers;
- compensating actions.

## Saga Example

Order flow:

```text
Create Order
  -> Reserve Inventory
  -> Charge Payment
  -> Create Shipment
  -> Confirm Order
```

If payment fails:

```text
Release Inventory
Cancel Order
```

## Saga State Example

A saga often needs persisted state.

```sql
CREATE TABLE OrderCheckoutSagas
(
    OrderId int NOT NULL PRIMARY KEY,
    Status nvarchar(50) NOT NULL,
    InventoryReservationId nvarchar(100) NULL,
    PaymentTransactionId nvarchar(100) NULL,
    CreatedAt datetimeoffset NOT NULL,
    UpdatedAt datetimeoffset NOT NULL
);
```

Saga handler:

```csharp
public sealed class OrderCheckoutSaga
{
    private readonly CheckoutDbContext _dbContext;
    private readonly IInventoryClient _inventory;
    private readonly IPaymentClient _payment;

    public OrderCheckoutSaga(
        CheckoutDbContext dbContext,
        IInventoryClient inventory,
        IPaymentClient payment)
    {
        _dbContext = dbContext;
        _inventory = inventory;
        _payment = payment;
    }

    public async Task HandleAsync(OrderSubmittedEvent message, CancellationToken ct)
    {
        var saga = new OrderCheckoutSagaState
        {
            OrderId = message.OrderId,
            Status = "Started",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _dbContext.OrderCheckoutSagas.Add(saga);
        await _dbContext.SaveChangesAsync(ct);

        var reservation = await _inventory.ReserveAsync(message.OrderId, ct);
        saga.InventoryReservationId = reservation.ReservationId;
        saga.Status = "InventoryReserved";
        saga.UpdatedAt = DateTimeOffset.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        var payment = await _payment.AuthorizeAsync(
            new AuthorizePaymentRequest(
                message.MessageId,
                message.OrderId,
                message.Total,
                message.Currency,
                message.PaymentMethodToken),
            ct);

        if (!payment.Approved)
        {
            await _inventory.ReleaseAsync(reservation.ReservationId, ct);
            saga.Status = "PaymentFailedInventoryReleased";
            saga.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
            return;
        }

        saga.PaymentTransactionId = payment.TransactionId;
        saga.Status = "Completed";
        saga.UpdatedAt = DateTimeOffset.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
    }
}
```

This is simplified. Real sagas also need idempotency, retries, compensation failure handling, and monitoring.

## Resilience Patterns

- timeout;
- retry with backoff;
- circuit breaker;
- bulkhead;
- rate limiting;
- fallback;
- idempotency;
- dead-letter queue.

## Service Mesh

In larger deployments, implementing resilience patterns in every service becomes repetitive. A service mesh offloads these concerns to a sidecar proxy that intercepts all service-to-service traffic. Each service instance runs alongside a proxy (such as Envoy), forming a mesh data plane managed by a control plane (such as Istio or Consul Connect).

A service mesh provides uniform retry policies, circuit breaker thresholds, mutual TLS, traffic routing for canary deployments, and distributed tracing without modifying application code. It adds operational complexity (proxy overhead, debugging through an extra hop, control plane management) and is rarely justified below 10-15 services, but for large heterogeneous deployments it can reduce per-service boilerplate significantly.

## Observability

Microservices require:

- structured logs;
- correlation ID;
- distributed tracing;
- metrics;
- dashboards;
- alerts;
- service health checks.

Without observability, microservices become very hard to operate.

Microservices offer organizational and operational scaling at the cost of distributed complexity. They are most effective when bounded by business capabilities, each owning its data and communicating through well-defined contracts. The decision to adopt microservices should be driven by concrete needs for independent deployment, team autonomy, or specialized scaling, not by architectural fashion. For most systems, starting with a modular monolith and extracting services only when the boundaries are proven and operational maturity is established leads to better outcomes.

> Architecture decisions at this scale benefit from formal documentation. Chapter 23.01 (Architecture Decision Records) provides a template and methodology for recording why a particular architectural style was chosen, what alternatives were considered, and when the decision should be revisited.
