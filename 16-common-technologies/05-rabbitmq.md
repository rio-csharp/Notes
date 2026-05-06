# RabbitMQ

## Core Idea

RabbitMQ is a message broker commonly used for work queues, routing, retries, and asynchronous business processing.

## Mental Model

RabbitMQ does not send messages directly to queues by default. Producers publish messages to an exchange. The exchange routes messages to queues through bindings.

```text
Producer
  -> Exchange
    -> Binding
      -> Queue
        -> Consumer
```

Core concepts:

- Producer: sends messages.
- Exchange: routes messages.
- Queue: stores messages until consumed.
- Consumer: processes messages.
- Binding: connects exchange to queue.
- Routing key: value used by exchanges to decide routing.

## Exchange Types

### Direct Exchange

Routes by exact routing key.

```text
exchange: order.commands
routing key: order.email.send
queue: order-email-queue
```

Use for command-style routing where the route is explicit.

### Fanout Exchange

Broadcasts to all bound queues.

Use for simple publish/subscribe inside RabbitMQ.

```text
OrderCreated
  -> email queue
  -> analytics queue
  -> notification queue
```

### Topic Exchange

Routes by pattern.

```text
order.created
order.cancelled
payment.captured
inventory.reserved
```

Binding examples:

```text
order.*        matches order.created and order.cancelled
order.#        matches order.created.us.east
*.captured     matches payment.captured
```

### Headers Exchange

Routes by message headers instead of routing key. Useful but less common than direct/topic/fanout.

## Basic .NET Publisher

Example using `RabbitMQ.Client`.

```csharp
public sealed class RabbitMqOptions
{
    public string HostName { get; init; } = "localhost";
    public string UserName { get; init; } = "guest";
    public string Password { get; init; } = "guest";
    public string ExchangeName { get; init; } = "orders";
}
```

```csharp
public sealed class RabbitMqPublisher : IAsyncDisposable
{
    private readonly IConnection _connection;
    private readonly IModel _channel;
    private readonly RabbitMqOptions _options;

    public RabbitMqPublisher(IOptions<RabbitMqOptions> options)
    {
        _options = options.Value;

        var factory = new ConnectionFactory
        {
            HostName = _options.HostName,
            UserName = _options.UserName,
            Password = _options.Password,
            DispatchConsumersAsync = true
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.ExchangeDeclare(
            exchange: _options.ExchangeName,
            type: ExchangeType.Topic,
            durable: true,
            autoDelete: false);
    }

    public Task PublishAsync<T>(
        string routingKey,
        T message,
        CancellationToken ct)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(message);

        var properties = _channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";
        properties.MessageId = Guid.NewGuid().ToString("N");
        properties.Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds());

        _channel.BasicPublish(
            exchange: _options.ExchangeName,
            routingKey: routingKey,
            mandatory: false,
            basicProperties: properties,
            body: body);

        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        _channel.Dispose();
        _connection.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

Message:

```csharp
public sealed record OrderSubmittedMessage(
    Guid MessageId,
    int OrderId,
    decimal Total,
    DateTimeOffset SubmittedAt);
```

## Consumer With Manual Ack

Do not acknowledge before processing succeeds.

```csharp
public sealed class OrderEmailConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderEmailConsumer> _logger;
    private IConnection? _connection;
    private IModel? _channel;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory
        {
            HostName = "localhost",
            DispatchConsumersAsync = true
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.ExchangeDeclare("orders", ExchangeType.Topic, durable: true);
        _channel.QueueDeclare("order-email-queue", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueBind("order-email-queue", "orders", "order.submitted");
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 10, global: false);

        var consumer = new AsyncEventingBasicConsumer(_channel);

        consumer.Received += async (_, args) =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var emailService = scope.ServiceProvider.GetRequiredService<IOrderEmailService>();

                var message = JsonSerializer.Deserialize<OrderSubmittedMessage>(
                    args.Body.Span);

                if (message is null)
                {
                    _channel.BasicReject(args.DeliveryTag, requeue: false);
                    return;
                }

                await emailService.SendOrderSubmittedEmailAsync(message, stoppingToken);

                _channel.BasicAck(args.DeliveryTag, multiple: false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process order email message");
                _channel.BasicNack(args.DeliveryTag, multiple: false, requeue: false);
            }
        };

        _channel.BasicConsume(
            queue: "order-email-queue",
            autoAck: false,
            consumer: consumer);

        return Task.CompletedTask;
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
        base.Dispose();
    }
}
```

Important points:

- `autoAck: false` means manual acknowledgement.
- `BasicAck` happens only after successful processing.
- `BasicNack(..., requeue: false)` sends the message to DLQ if configured.
- `BasicQos` controls prefetch so one consumer does not receive too many unprocessed messages.

## Durability

Durability requires several pieces:

```text
durable exchange
durable queue
persistent message
```

Example:

```csharp
_channel.ExchangeDeclare("orders", ExchangeType.Topic, durable: true);
_channel.QueueDeclare("order-email-queue", durable: true, exclusive: false, autoDelete: false);

var properties = _channel.CreateBasicProperties();
properties.Persistent = true;
```

This improves survival across broker restart, but it does not remove the need for publisher confirms, monitoring, and retry strategy.

## Dead-letter Queue

Use a dead-letter exchange for messages that cannot be processed.

```csharp
var queueArguments = new Dictionary<string, object>
{
    ["x-dead-letter-exchange"] = "orders.dlx",
    ["x-dead-letter-routing-key"] = "order.email.dead"
};

_channel.ExchangeDeclare("orders.dlx", ExchangeType.Direct, durable: true);
_channel.QueueDeclare("order-email-dlq", durable: true, exclusive: false, autoDelete: false);
_channel.QueueBind("order-email-dlq", "orders.dlx", "order.email.dead");

_channel.QueueDeclare(
    queue: "order-email-queue",
    durable: true,
    exclusive: false,
    autoDelete: false,
    arguments: queueArguments);
```

Reasons a message can become dead-lettered:

- rejected with `requeue: false`;
- nacked with `requeue: false`;
- message TTL expires;
- queue length limit is exceeded.

## Retry With Delay Queues

RabbitMQ does not automatically know your retry policy. A common pattern is retry queues with TTL.

```text
main queue
  failure -> retry queue with TTL
  TTL expires -> message routes back to main queue
  too many failures -> DLQ
```

Retry count can be stored in headers.

```csharp
public static int GetRetryCount(IBasicProperties properties)
{
    if (properties.Headers is null ||
        !properties.Headers.TryGetValue("x-retry-count", out var value))
    {
        return 0;
    }

    return Convert.ToInt32(value);
}
```

Avoid infinite requeue loops. Requeueing immediately can create a hot failure loop that consumes CPU and hides the real problem.

## Idempotent Consumer

```sql
CREATE TABLE ProcessedMessages
(
    MessageId uniqueidentifier NOT NULL PRIMARY KEY,
    ConsumerName nvarchar(200) NOT NULL,
    ProcessedAt datetimeoffset NOT NULL
);
```

```csharp
public async Task HandleAsync(OrderSubmittedMessage message, CancellationToken ct)
{
    var alreadyProcessed = await _dbContext.ProcessedMessages
        .AnyAsync(x => x.MessageId == message.MessageId, ct);

    if (alreadyProcessed)
    {
        return;
    }

    await _emailSender.SendAsync(message.OrderId, ct);

    _dbContext.ProcessedMessages.Add(new ProcessedMessage
    {
        MessageId = message.MessageId,
        ConsumerName = "order-email-consumer",
        ProcessedAt = DateTimeOffset.UtcNow
    });

    await _dbContext.SaveChangesAsync(ct);
}
```

For stronger protection, use a unique constraint and commit the business effect and processed marker in the same transaction when possible.

## RabbitMQ vs Kafka

RabbitMQ:

- broker with queues;
- flexible routing;
- work queues and commands;
- per-message acknowledgement;
- good for business workflow tasks;
- messages are usually removed after consumption.

Kafka:

- distributed durable log;
- high-throughput event streaming;
- replay by offset;
- consumer groups read independently;
- good for event pipelines and analytics;
- messages are retained based on time/size policy.

## Operational Signals

Monitor:

- queue depth;
- ready vs unacked messages;
- consumer count;
- consumer processing duration;
- publish rate;
- deliver/ack rate;
- DLQ count;
- connection/channel churn;
- memory and disk alarms.

Queue depth by itself is not enough. A growing queue plus flat consumer throughput usually means consumers are failing, too slow, or under-provisioned.

## Practice Task

Design:

1. order email queue;
2. retry queue;
3. dead-letter queue;
4. idempotent consumer;
5. queue depth alert.
