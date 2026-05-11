# E-commerce Order System Design

## Problem

Design an e-commerce order system from cart checkout to payment, inventory, shipping, and notification.

## Requirements

Functional:

- create order from cart;
- reserve inventory;
- process payment;
- confirm order;
- cancel order;
- create shipment;
- notify user.

Non-functional:

- correctness;
- idempotency;
- consistency;
- high availability;
- observability;
- fraud/risk controls;
- scalability for traffic spikes.

## Order States

```text
Draft
PendingPayment
Paid
Confirmed
Shipped
Completed
Cancelled
Expired
Refunded
```

Use explicit state transitions.

## API Surface

```http
POST /api/orders/checkout
Idempotency-Key: checkout-user-123-cart-456
```

```http
GET /api/orders/{orderId}
```

```http
POST /api/orders/{orderId}/cancel
```

## Order Table

```sql
CREATE TABLE Orders
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    UserId INT NOT NULL,
    IdempotencyKey NVARCHAR(200) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    TotalAmount DECIMAL(18,2) NOT NULL,
    Currency NVARCHAR(10) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    UpdatedAt DATETIMEOFFSET NOT NULL
);
```

## High-level Architecture

```text
Frontend
  -> Order API
  -> Order DB
  -> Inventory Service
  -> Payment Service
  -> Shipping Service
  -> Notification Service
  -> Message Broker
```

## Checkout Flow

```text
1. User submits checkout.
2. Order API validates cart and address.
3. Create order as PendingPayment.
4. Reserve inventory.
5. Create payment intent.
6. User completes payment.
7. Payment callback marks payment captured.
8. Order becomes Confirmed.
9. Shipping is created.
10. Notification is sent.
```

## Idempotency

Checkout may be retried. The client sends an idempotency key in the request header (or request body), and the server stores the first accepted result for that key so repeated submissions return the same logical outcome instead of creating duplicate orders or charges.

```http
Idempotency-Key: checkout-user-123-cart-456
```

The server checks the idempotency key before processing. If the key already exists and the previous request completed successfully, return the stored result without re-executing. If the previous request failed, the server should return the existing error or, depending on the semantics, allow retrying with a new attempt.

Database:

```sql
CREATE UNIQUE INDEX UX_Orders_IdempotencyKey
ON Orders (IdempotencyKey);
```

### Idempotency Key Scope

Idempotency keys must be unique per operation scope. For checkout, the scope is the user and cart: `checkout:{userId}:{cartId}`. For payments, the scope is the order: `payment:{orderId}`. For refunds, the scope is the payment and refund attempt number: `refund:{paymentId}:{attempt}`. Using the same key for different operations can cause unintended deduplication.

## Inventory Reservation

Avoid overselling.

Options:

- reserve stock during checkout;
- deduct stock after payment;
- use database transaction and row version;
- use inventory service with reservation expiration.

Reservation table:

```sql
CREATE TABLE InventoryReservations
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    ProductId INT NOT NULL,
    OrderId UNIQUEIDENTIFIER NOT NULL,
    Quantity INT NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL
);
```

Reservation lifecycle:

```text
Pending -> Reserved -> Consumed
Pending -> Expired
Reserved -> Released
```

## Distributed Transaction via Saga

An order checkout spans multiple services (order, inventory, payment, shipping). A distributed transaction with ACID guarantees across all services is impractical; instead, the system uses a saga -- a sequence of local transactions with compensating actions for rollback.

### Saga Execution

```text
CreateOrder          -> Order DB
  -> ReserveInventory   -> Inventory Service
  -> CreatePayment      -> Payment Service
  -> ConfirmOrder       -> Order DB
```

If `CreatePayment` fails:

```text
CancelOrder          -> Order DB (compensation)
ReleaseInventory     -> Inventory Service (compensation)
```

### Choreography vs. Orchestration

**Choreography**: each service emits events after completing its local transaction, and the next service in the saga subscribes. No central coordinator exists.

```
OrderCreated -> InventoryService reserves stock -> InventoryReserved -> PaymentService charges -> PaymentCaptured -> OrderService confirms
```

Choreography is loosely coupled but hard to trace and debug because saga progress is distributed across independent event handlers.

**Orchestration**: a central coordinator (orchestrator) tells each service what to do and tracks the saga state. If a step fails, the orchestrator issues compensating commands.

```
Orchestrator -> OrderService    (CreateOrder)
Orchestrator -> InventoryService (ReserveInventory)
Orchestrator -> PaymentService   (CreatePayment)
```

Orchestration is more centralized, making saga progress visible and compensating logic explicit. The orchestration state (current step, success/failure, retry count) is persisted in a saga log, allowing the orchestrator to resume after a crash.

For an e-commerce checkout with financial consequences and multiple compensation paths, orchestration is the safer choice.

## Payment Callback Handling

```csharp
public async Task HandlePaymentCapturedAsync(
    PaymentCapturedEvent message,
    CancellationToken ct)
{
    var order = await _dbContext.Orders
        .FirstOrDefaultAsync(x => x.Id == message.OrderId, ct);

    if (order is null || order.Status is "Paid" or "Confirmed" or "Shipped")
    {
        return;
    }

    order.Status = "Paid";
    order.UpdatedAt = DateTimeOffset.UtcNow;
    await _dbContext.SaveChangesAsync(ct);
}
```

Callbacks can be duplicated or delayed, so state changes must be idempotent.

## Reconciliation Job

```text
1. Find orders stuck in PendingPayment.
2. Query payment provider for truth.
3. If paid externally, mark order paid.
4. If failed externally, release inventory and cancel order.
5. Alert on unresolved mismatches.
```

## Outbox Events

Events:

- `OrderCreated`
- `InventoryReserved`
- `PaymentCaptured`
- `OrderConfirmed`
- `OrderCancelled`
- `ShipmentCreated`

Use outbox to publish reliably.

> The outbox pattern, CQRS with separate read models, and event-driven integration are discussed in detail in Chapters 13.05 (CQRS) and 13.06 (Event-Driven Architecture). The decision between a modular monolith and microservices for an e-commerce system is covered in Chapters 13.07 and 13.08.

## Verification

Key aspects to verify:

1. order state machine;
2. checkout API;
3. inventory reservation;
4. payment callback;
5. saga compensation;
6. outbox events;
7. reconciliation job.
