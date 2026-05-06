# Onion And Hexagonal Architecture

## Core Idea

Onion and Hexagonal Architecture protect business logic from external technical details.

Both emphasize:

```text
Business core should not depend on infrastructure.
```

## Onion Architecture

Conceptual layers:

```text
Domain Model
Domain Services
Application Services
Infrastructure / UI
```

Dependencies point inward.

## Hexagonal Architecture

Also called Ports and Adapters.

Core app defines ports:

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct);
}
```

Infrastructure provides adapters:

```csharp
public sealed class StripePaymentGateway : IPaymentGateway
{
    public Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken ct)
    {
        // call Stripe
        return Task.FromResult(new PaymentResult());
    }
}
```

## Complete Payment Port Example

The application core defines a port based on what the business workflow needs.

```csharp
public interface IPaymentGateway
{
    Task<PaymentAuthorizationResult> AuthorizeAsync(
        PaymentAuthorizationRequest request,
        CancellationToken ct);
}

public sealed record PaymentAuthorizationRequest(
    string PaymentMethodToken,
    decimal Amount,
    string Currency,
    string IdempotencyKey);

public sealed record PaymentAuthorizationResult(
    bool IsApproved,
    string? ProviderTransactionId,
    string? DeclineReason);
```

The use case depends on the port.

```csharp
public sealed class PayOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IPaymentGateway _paymentGateway;
    private readonly IUnitOfWork _unitOfWork;

    public PayOrderHandler(
        IOrderRepository orders,
        IPaymentGateway paymentGateway,
        IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _paymentGateway = paymentGateway;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(PayOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct);

        if (order is null)
        {
            throw new NotFoundException("Order not found.");
        }

        var result = await _paymentGateway.AuthorizeAsync(
            new PaymentAuthorizationRequest(
                command.PaymentMethodToken,
                order.Total.Amount,
                order.Total.Currency,
                command.IdempotencyKey),
            ct);

        if (!result.IsApproved)
        {
            order.MarkPaymentDeclined(result.DeclineReason ?? "Payment declined");
        }
        else
        {
            order.MarkPaid(result.ProviderTransactionId!);
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
```

The Stripe adapter lives outside the core.

```csharp
public sealed class StripePaymentGateway : IPaymentGateway
{
    private readonly HttpClient _httpClient;

    public StripePaymentGateway(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<PaymentAuthorizationResult> AuthorizeAsync(
        PaymentAuthorizationRequest request,
        CancellationToken ct)
    {
        using var httpRequest = new HttpRequestMessage(
            HttpMethod.Post,
            "/v1/payment_intents");

        httpRequest.Headers.Add("Idempotency-Key", request.IdempotencyKey);

        httpRequest.Content = JsonContent.Create(new
        {
            amount = request.Amount,
            currency = request.Currency,
            payment_method = request.PaymentMethodToken
        });

        using var response = await _httpClient.SendAsync(httpRequest, ct);

        if (!response.IsSuccessStatusCode)
        {
            return new PaymentAuthorizationResult(false, null, "Provider rejected request");
        }

        var providerResult = await response.Content
            .ReadFromJsonAsync<StripePaymentIntentResponse>(cancellationToken: ct);

        return new PaymentAuthorizationResult(
            true,
            providerResult?.Id,
            null);
    }
}
```

The test adapter can be tiny.

```csharp
public sealed class FakePaymentGateway : IPaymentGateway
{
    public PaymentAuthorizationResult Result { get; set; } =
        new(true, "fake-transaction-id", null);

    public Task<PaymentAuthorizationResult> AuthorizeAsync(
        PaymentAuthorizationRequest request,
        CancellationToken ct)
    {
        return Task.FromResult(Result);
    }
}
```

This is the practical value of ports and adapters: the core workflow can be tested without real Stripe, network, or secrets.

## Primary And Secondary Adapters

Primary adapters drive the application:

- REST controller;
- message consumer;
- CLI command;
- scheduled job.

Secondary adapters are driven by the application:

- database;
- payment provider;
- email provider;
- Redis;
- Kafka.

## Benefits

- testable business logic;
- replaceable infrastructure;
- clear boundaries;
- easier mocking;
- less framework coupling.

## Costs

- more abstractions;
- more files;
- mapping overhead;
- can be overkill for simple CRUD.

## Adapter Registration

```csharp
builder.Services.AddHttpClient<IPaymentGateway, StripePaymentGateway>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Stripe:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

Only the composition root knows which adapter is used.

## Primary Adapter Example

A REST endpoint is a primary adapter because it drives the application.

```csharp
[ApiController]
[Route("api/orders")]
public sealed class PaymentsController : ControllerBase
{
    private readonly PayOrderHandler _handler;

    public PaymentsController(PayOrderHandler handler)
    {
        _handler = handler;
    }

    [HttpPost("{orderId:int}/payment")]
    public async Task<IActionResult> Pay(
        int orderId,
        PayOrderRequest request,
        CancellationToken ct)
    {
        await _handler.Handle(
            new PayOrderCommand(
                orderId,
                request.PaymentMethodToken,
                request.IdempotencyKey),
            ct);

        return NoContent();
    }
}
```

A message consumer can drive the same use case:

```csharp
public sealed class PaymentRequestedConsumer
{
    private readonly PayOrderHandler _handler;

    public PaymentRequestedConsumer(PayOrderHandler handler)
    {
        _handler = handler;
    }

    public Task ConsumeAsync(PaymentRequestedMessage message, CancellationToken ct)
    {
        return _handler.Handle(
            new PayOrderCommand(
                message.OrderId,
                message.PaymentMethodToken,
                message.MessageId),
            ct);
    }
}
```

The application core does not care whether the trigger is HTTP, Kafka, RabbitMQ, or a scheduled job.

## Practice Task

Build payment integration with:

1. application port `IPaymentGateway`;
2. Stripe adapter;
3. fake adapter for tests;
4. API endpoint;
5. integration test boundary.
