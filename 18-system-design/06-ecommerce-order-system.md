# E-commerce Order System Design

## Problem

Design an e-commerce order system from cart checkout to payment, inventory, shipping, and notification.

Chinese notes:

- `order lifecycle`: 订单生命周期.
- `inventory reservation`: 库存预留.
- `saga`: 分布式事务协调模式.
- `compensation`: 补偿操作.

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

Checkout may be retried.

Use:

```http
Idempotency-Key: checkout-user-123-cart-456
```

Database:

```sql
CREATE UNIQUE INDEX UX_Orders_IdempotencyKey
ON Orders (IdempotencyKey);
```

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

## Saga Flow

```text
CreateOrder
  -> ReserveInventory
  -> CreatePayment
  -> ConfirmOrder
```

If payment fails:

```text
CancelOrder
ReleaseInventory
```

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

## Knowledge Checks

### How do you prevent duplicate orders?

Use idempotency key, unique constraint, and return the existing order result for repeated checkout requests.

### How do you avoid overselling?

Use inventory reservation with transaction/concurrency control, expiration for unpaid orders, and clear compensation logic.

### How do you handle payment success but order update failure?

Use idempotent payment callbacks, reconciliation jobs, and durable event/outbox processing so the system can recover and eventually update order state.

## Common Mistakes

- No idempotency in checkout.
- No inventory reservation expiration.
- Treating payment provider callback as always reliable.
- No reconciliation.
- Distributed transaction across services without clear strategy.
- No audit log for order state changes.

## Practice Task

Design:

1. order state machine;
2. checkout API;
3. inventory reservation;
4. payment callback;
5. saga compensation;
6. outbox events;
7. reconciliation job.
