# gRPC

## Core Idea

gRPC is a high-performance RPC framework using HTTP/2 and Protocol Buffers.

## gRPC Use Cases

Use gRPC for:

- internal service-to-service communication;
- low-latency APIs;
- strongly typed contracts;
- streaming;
- polyglot systems;
- high-throughput backend communication.

REST/JSON may be better for:

- public browser APIs;
- simple CRUD APIs;
- APIs that need easy manual testing;
- HTTP caching semantics;
- broad third-party adoption.

## Proto File

```proto
syntax = "proto3";

option csharp_namespace = "Orders.Grpc";

package orders;

service OrderService {
  rpc GetOrder (GetOrderRequest) returns (OrderReply);
  rpc StreamOrderEvents (StreamOrderEventsRequest) returns (stream OrderEventReply);
}

message GetOrderRequest {
  int32 id = 1;
}

message OrderReply {
  int32 id = 1;
  string order_number = 2;
  string status = 3;
  double total = 4;
}

message StreamOrderEventsRequest {
  int32 order_id = 1;
}

message OrderEventReply {
  int32 order_id = 1;
  string event_type = 2;
  string occurred_at = 3;
}
```

Field numbers are part of the wire contract. Do not reuse old field numbers for different meanings.

## .NET Service

```csharp
public sealed class OrdersGrpcService : OrderService.OrderServiceBase
{
    private readonly AppDbContext _dbContext;

    public OrdersGrpcService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public override async Task<OrderReply> GetOrder(
        GetOrderRequest request,
        ServerCallContext context)
    {
        var order = await _dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Id == request.Id)
            .Select(x => new OrderReply
            {
                Id = x.Id,
                OrderNumber = x.OrderNumber,
                Status = x.Status.ToString(),
                Total = decimal.ToDouble(x.TotalAmount)
            })
            .FirstOrDefaultAsync(context.CancellationToken);

        if (order is null)
        {
            throw new RpcException(new Status(
                StatusCode.NotFound,
                "Order not found."));
        }

        return order;
    }
}
```

Register:

```csharp
builder.Services.AddGrpc();

var app = builder.Build();

app.MapGrpcService<OrdersGrpcService>();
```

## .NET Client

```csharp
builder.Services.AddGrpcClient<OrderService.OrderServiceClient>(options =>
{
    options.Address = new Uri(builder.Configuration["Grpc:OrdersUrl"]!);
});
```

Usage:

```csharp
public sealed class OrderGateway
{
    private readonly OrderService.OrderServiceClient _client;

    public OrderGateway(OrderService.OrderServiceClient client)
    {
        _client = client;
    }

    public async Task<OrderDto?> GetOrderAsync(int orderId, CancellationToken ct)
    {
        try
        {
            using var deadlineCts = CancellationTokenSource
                .CreateLinkedTokenSource(ct);

            deadlineCts.CancelAfter(TimeSpan.FromSeconds(3));

            var reply = await _client.GetOrderAsync(
                new GetOrderRequest { Id = orderId },
                deadline: DateTime.UtcNow.AddSeconds(3),
                cancellationToken: deadlineCts.Token);

            return new OrderDto(
                reply.Id,
                reply.OrderNumber,
                reply.Status,
                (decimal)reply.Total);
        }
        catch (RpcException ex) when (ex.StatusCode == StatusCode.NotFound)
        {
            return null;
        }
    }
}
```

Always use deadlines/timeouts for remote calls.

## Error Mapping

Common gRPC status codes:

| Status | Meaning |
|---|---|
| `InvalidArgument` | validation failed |
| `NotFound` | resource not found |
| `AlreadyExists` | duplicate resource |
| `PermissionDenied` | authenticated but not allowed |
| `Unauthenticated` | missing/invalid auth |
| `Unavailable` | service temporarily unavailable |
| `DeadlineExceeded` | call timed out |
| `Internal` | unexpected server error |

Example:

```csharp
throw new RpcException(new Status(
    StatusCode.InvalidArgument,
    "Quantity must be positive."));
```

## Server Streaming

```csharp
public override async Task StreamOrderEvents(
    StreamOrderEventsRequest request,
    IServerStreamWriter<OrderEventReply> responseStream,
    ServerCallContext context)
{
    await foreach (var orderEvent in _eventStore
        .ReadOrderEventsAsync(request.OrderId, context.CancellationToken))
    {
        await responseStream.WriteAsync(new OrderEventReply
        {
            OrderId = orderEvent.OrderId,
            EventType = orderEvent.Type,
            OccurredAt = orderEvent.OccurredAt.ToString("O")
        });
    }
}
```

Client:

```csharp
using var call = _client.StreamOrderEvents(
    new StreamOrderEventsRequest { OrderId = orderId },
    cancellationToken: ct);

await foreach (var item in call.ResponseStream.ReadAllAsync(ct))
{
    Console.WriteLine($"{item.EventType} at {item.OccurredAt}");
}
```

## Versioning Proto Contracts

Safe changes:

- add new fields with new field numbers;
- stop using a field but reserve its number;
- add new RPC methods.

Risky changes:

- renaming fields may affect generated code;
- changing field type;
- reusing field numbers;
- changing meaning of an existing field;
- removing fields without migration.

Reserve removed fields:

```proto
message OrderReply {
  reserved 5;
  reserved "old_status_reason";

  int32 id = 1;
  string order_number = 2;
}
```

## gRPC vs REST

gRPC:

- binary protocol;
- strongly typed;
- efficient;
- supports streaming;
- great for internal services.

REST:

- JSON is human-readable;
- browser-friendly;
- easier public API adoption;
- aligns with HTTP caching and resource semantics.

The gRPC patterns shown -- protobuf contract definition, deadline propagation, structured error mapping, and server streaming -- provide the foundational elements for inter-service communication.
