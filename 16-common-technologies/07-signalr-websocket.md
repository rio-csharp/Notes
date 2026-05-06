# SignalR And WebSocket

## Core Idea

SignalR is a .NET library for real-time communication. It uses WebSocket when available and falls back to other transports when needed.

## Under The Hood: WebSocket Handshake

WebSocket starts as an HTTP request and upgrades the connection.

Simplified request:

```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
```

Simplified response:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: ...
```

After the upgrade, the connection becomes a persistent bidirectional WebSocket connection.

Practical explanation:

> WebSocket begins with an HTTP upgrade handshake. After the server returns `101 Switching Protocols`, both sides communicate over WebSocket frames on the same connection.

## WebSocket Frames

WebSocket is message-oriented at the WebSocket layer, but it runs over TCP.

WebSocket defines frames so the receiver can know message boundaries.

Frame concepts:

- text frame;
- binary frame;
- continuation frame;
- ping;
- pong;
- close.

This is why raw TCP sticky/half packet issues are usually hidden from application WebSocket code:

> TCP is a byte stream, but WebSocket adds framing above TCP.

Still, large WebSocket messages can be fragmented into multiple frames. Libraries usually reassemble them for you.

## Connection Lifetime And Heartbeats

Persistent connections introduce operational concerns:

- clients disconnect unexpectedly;
- mobile networks change;
- proxies close idle connections;
- server deployments drop connections;
- backpressure can build if clients are slow.

Use:

- ping/pong or keep-alive;
- reconnect strategy on client;
- connection timeout;
- message size limits;
- backpressure handling;
- authentication renewal strategy.

## Scaling SignalR

If one server instance handles all connections, broadcasting is simple.

With multiple instances:

```text
Client A connected to Server 1
Client B connected to Server 2
```

Server 1 cannot directly know all connections on Server 2 unless there is shared coordination.

Options:

- sticky sessions;
- Redis backplane;
- Azure SignalR Service;
- message broker integration.

Engineering perspective:

> Scaling WebSocket/SignalR is not only CPU scaling. You must handle connection affinity, broadcast across instances, reconnects, backpressure, and authentication for long-lived connections.

## Use Cases

- chat;
- notifications;
- live dashboards;
- collaborative editing;
- real-time progress updates.

## Hub Example

```csharp
public sealed class NotificationHub : Hub
{
    public async Task JoinUserGroup(string userId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
    }
}
```

## Strongly Typed Hub

Strongly typed hubs reduce string-based mistakes.

```csharp
public interface INotificationClient
{
    Task NotificationReceived(NotificationMessage message);
    Task OrderStatusChanged(OrderStatusChangedMessage message);
}

public sealed class NotificationHub : Hub<INotificationClient>
{
    public async Task JoinUserGroup()
    {
        var userId = Context.UserIdentifier;

        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new HubException("User is not authenticated.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
    }
}
```

Send:

```csharp
public sealed class NotificationService
{
    private readonly IHubContext<NotificationHub, INotificationClient> _hub;

    public NotificationService(IHubContext<NotificationHub, INotificationClient> hub)
    {
        _hub = hub;
    }

    public Task SendToUserAsync(string userId, NotificationMessage message)
    {
        return _hub.Clients.User(userId).NotificationReceived(message);
    }
}
```

## Hub Authorization

```csharp
[Authorize]
public sealed class NotificationHub : Hub<INotificationClient>
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public async Task JoinOrderGroup(int orderId)
    {
        if (!await UserCanAccessOrderAsync(orderId))
        {
            throw new HubException("Access denied.");
        }

        await Groups.AddToGroupAsync(
            Context.ConnectionId,
            $"order:{orderId}");
    }

    private Task<bool> UserCanAccessOrderAsync(int orderId)
    {
        // Check tenant, ownership, role, or permission.
        return Task.FromResult(true);
    }
}
```

Important:

- authenticate the connection;
- authorize hub methods;
- validate group membership;
- never trust a client-supplied user ID;
- avoid broadcasting sensitive data to broad groups.

Send message:

```csharp
public sealed class NotificationService
{
    private readonly IHubContext<NotificationHub> _hub;

    public NotificationService(IHubContext<NotificationHub> hub)
    {
        _hub = hub;
    }

    public Task SendToUserAsync(int userId, string message)
    {
        return _hub.Clients.Group($"user:{userId}")
            .SendAsync("NotificationReceived", message);
    }
}
```

## Client Example

```ts
const connection = new HubConnectionBuilder()
  .withUrl("/hubs/notifications")
  .withAutomaticReconnect()
  .build();

connection.on("NotificationReceived", message => {
  console.log(message);
});

await connection.start();
```

React connection lifecycle:

```tsx
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { useEffect, useMemo, useState } from "react";

export function useNotifications() {
  const [messages, setMessages] = useState<string[]>([]);

  const connection = useMemo(() => {
    return new HubConnectionBuilder()
      .withUrl("/hubs/notifications")
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();
  }, []);

  useEffect(() => {
    connection.on("NotificationReceived", (message: string) => {
      setMessages((current) => [message, ...current]);
    });

    async function start() {
      if (connection.state === HubConnectionState.Disconnected) {
        await connection.start();
      }
    }

    void start();

    return () => {
      connection.off("NotificationReceived");
      void connection.stop();
    };
  }, [connection]);

  return messages;
}
```

The client must handle reconnects because long-lived connections are not permanent.

## Scaling

Multiple app instances need:

- Azure SignalR Service;
- Redis backplane;
- sticky sessions depending on hosting.

Redis backplane example:

```csharp
builder.Services
    .AddSignalR()
    .AddStackExchangeRedis(
        builder.Configuration.GetConnectionString("Redis")!,
        options =>
        {
            options.Configuration.ChannelPrefix = "myapp-signalr";
        });
```

Backplane trade-offs:

- broadcasts can reach clients connected to different app instances;
- Redis becomes part of the real-time path;
- very high fanout can create pressure on Redis and app instances;
- message persistence is still not guaranteed.

For large-scale real-time workloads, managed services such as Azure SignalR Service can reduce operational burden.

## Authentication

SignalR can use JWT/cookies.

For browser WebSocket auth, token may be sent in query string by some clients. Protect logs and use HTTPS.

## Message Delivery Semantics

SignalR is good for live delivery, not durable event storage.

If a user is offline, they may miss a SignalR message unless the event is also stored elsewhere.

Reliable notification pattern:

```text
1. Save notification in database.
2. Publish live SignalR message if user is connected.
3. Client also loads unread notifications from API.
```

This combines durable storage with real-time delivery.

## Practice Task

Build:

1. notification hub;
2. join user group;
3. send notification from API;
4. React client connection;
5. reconnect handling;
6. authorization check.
