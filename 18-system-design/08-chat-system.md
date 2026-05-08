# Chat System Design

## Problem

Design a chat system that supports one-to-one and group messaging.

## Requirements

Functional:

- send messages;
- receive messages in real time;
- support one-to-one chat;
- support group chat;
- store message history;
- show read receipts;
- show online status.

Non-functional:

- low latency;
- scalable connections;
- durable message storage;
- ordering within conversation;
- offline delivery;
- abuse prevention.

## High-level Architecture

```text
Client
  -> WebSocket / SignalR Gateway
  -> Chat Service
  -> Message Database
  -> Message Queue
  -> Notification Service
  -> Presence Store (Redis)
```

## WebSocket / SignalR

SignalR is a good choice in .NET ecosystems.

Hub:

```csharp
public sealed class ChatHub : Hub
{
    public async Task JoinConversation(string conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, conversationId);
    }

    public async Task SendMessage(string conversationId, string text)
    {
        await Clients.Group(conversationId).SendAsync("MessageReceived", new
        {
            ConversationId = conversationId,
            Text = text,
            SentAt = DateTimeOffset.UtcNow
        });
    }
}
```

Production note:

Do not only broadcast. Persist message first, then publish.

## Message Send Flow

```text
1. Validate sender membership.
2. Persist message in database.
3. Assign conversation order.
4. Publish real-time event.
5. Update unread counters.
6. Send push notification if recipient is offline.
```

```csharp
public async Task SendMessageAsync(
    Guid conversationId,
    int senderUserId,
    string text,
    CancellationToken ct)
{
    var message = new ChatMessage
    {
        ConversationId = conversationId,
        SenderUserId = senderUserId,
        Body = text,
        CreatedAt = DateTimeOffset.UtcNow
    };

    _dbContext.Messages.Add(message);
    await _dbContext.SaveChangesAsync(ct);

    await _hub.Clients.Group(conversationId.ToString())
        .SendAsync("MessageReceived", new
        {
            MessageId = message.Id,
            ConversationId = conversationId,
            SenderUserId = senderUserId,
            Text = text,
            SentAt = message.CreatedAt
        }, ct);
}
```

## Data Model

```sql
CREATE TABLE Conversations
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    Type NVARCHAR(50) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);

CREATE TABLE ConversationMembers
(
    ConversationId UNIQUEIDENTIFIER NOT NULL,
    UserId INT NOT NULL,
    JoinedAt DATETIMEOFFSET NOT NULL,
    PRIMARY KEY (ConversationId, UserId)
);

CREATE TABLE Messages
(
    Id BIGINT IDENTITY PRIMARY KEY,
    ConversationId UNIQUEIDENTIFIER NOT NULL,
    SenderUserId INT NOT NULL,
    Body NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);
```

Index:

```sql
CREATE INDEX IX_Messages_Conversation_CreatedAt_Id
ON Messages (ConversationId, CreatedAt DESC, Id DESC);
```

## Message Ordering

Ordering is usually per conversation.

Options:

- database auto-increment ID;
- timestamp + ID;
- sequence per conversation;
- Kafka partition by conversation ID.

For strict ordering, route messages of the same conversation through the same partition/actor.

## Read Receipts

```sql
CREATE TABLE MessageReceipts
(
    MessageId BIGINT NOT NULL,
    UserId INT NOT NULL,
    ReadAt DATETIMEOFFSET NOT NULL,
    PRIMARY KEY (MessageId, UserId)
);
```

Read receipts can be high-volume. For large groups, consider summarized read state instead of writing one receipt per user per message.

## Offline Sync

```http
GET /api/conversations/{conversationId}/messages?afterMessageId=12345&limit=100
```

Reconnect flow:

```text
1. Client reconnects.
2. Client sends last seen message ID per conversation.
3. Server returns missed messages.
4. Real-time connection resumes from current state.
```

## Abuse Prevention

Use:

- rate limiting;
- spam detection;
- blocklist;
- content moderation if required;
- group membership validation;
- attachment scanning.

## Offline Delivery

If user is offline:

- store message;
- update unread count;
- send push notification;
- deliver history when user reconnects.

## Presence

Tracking which users are online and which conversations they are in enables features like online status indicators and "user is typing" notifications.

### Redis-Based Presence

Store each user's active SignalR connection IDs in a Redis set. The set membership expires after a timeout (e.g., 60 seconds), and the client sends periodic heartbeats within the timeout to retain membership.

```text
Key:   presence:user:{userId}:connections
Value: set of connection IDs
TTL:   60 seconds (reset by heartbeat)
```

When all connections for a user expire, the user is considered offline. A pub/sub channel (`presence:events`) announces online/offline transitions so other services can react (e.g., hide the "online" badge).

### Heartbeat Mechanism

```csharp
// Client sends heartbeat every 30 seconds
public async Task Heartbeat()
{
    await _redis.KeyExpireAsync($"presence:user:{userId}:connections",
        TimeSpan.FromSeconds(60));
}
```

If the client disconnects abruptly (network failure, browser crash), the TTL handles the cleanup: the user appears online for at most 60 seconds after the last heartbeat. An immediate cleanup on disconnect improves accuracy:

```csharp
public override async Task OnDisconnectedAsync(Exception? exception)
{
    await _redis.SetRemoveAsync($"presence:user:{userId}:connections", Context.ConnectionId);
    // Optionally announce offline if no connections remain
    await base.OnDisconnectedAsync(exception);
}
```

## Scaling SignalR

Single-server SignalR is simple: all connections and in-memory groups are local. When traffic exceeds a single server, the architecture must route messages to the correct server that holds each connection.

### Sticky Sessions Nuance

SignalR requires that all HTTP requests for a specific connection be handled by the same server process. Sticky sessions (also called session affinity) are required unless one of these conditions holds:

1. The app runs on a single server in a single process.
2. The app uses the Azure SignalR Service (sticky sessions are handled by the service, not the app).
3. All clients are configured to use only WebSockets **and** the `SkipNegotiation` setting is enabled.

Even when using the Redis backplane, sticky sessions are still required because the backplane forwards messages to the correct *server*, but each server must continue serving its own connections.

### Options for Multi-Server SignalR

| Approach | Mechanism | Trade-off |
|---|---|---|
| **Sticky sessions** | Load balancer routes the same client to the same server using a cookie or IP hash | Breaks client connection if the server goes down; required unless conditions above are met |
| **Redis backplane** | Servers subscribe to a shared Redis pub/sub channel. When a message targets a connection on another server, the backplane forwards it | Adds per-message latency; still requires sticky sessions; simple to self-host |
| **Azure SignalR Service** | The service manages connections centrally; app servers are stateless and require only a constant number of connections to the service | Vendor lock-in; per-connection cost; eliminates sticky sessions; scales connections separately from app logic |

### Choosing Between Backplane Options

For self-hosted deployments, the Redis backplane is the most common approach. It uses Redis pub/sub to broadcast messages to all servers. Each server subscribes to a Redis channel, and when a message is published, every server receives it and forwards it to its local connections. This adds a network hop per message but is simple to set up and operate.

For Azure-hosted applications, the Azure SignalR Service is recommended by the ASP.NET Core team because it eliminates server-side connection management, eliminates the sticky session requirement, and allows the app servers to scale independently of the number of concurrent connections. The trade-off is a per-connection cost and dependency on the Azure service.

## Verification

Key aspects to verify:

1. one-to-one chat;
2. group chat;
3. message persistence;
4. WebSocket delivery;
5. offline sync;
6. read receipts;
7. presence with Redis.
