# Chat System Design

## Problem

Design a chat system that supports one-to-one and group messaging.

Chinese notes:

- `real-time`: 实时.
- `presence`: 在线状态.
- `fan-out`: 扇出.
- `message ordering`: 消息顺序.

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

Redis can store online users:

```text
user:{userId}:connections -> set of connection IDs
```

Use TTL/heartbeat to avoid stale presence.

## Scaling SignalR

Single server is simple.

Multiple servers need:

- sticky sessions, or
- SignalR backplane, or
- managed service such as Azure SignalR Service.

## Knowledge Checks

### How do you guarantee message delivery?

Persist the message before acknowledging success, use client-side acknowledgement, retry on failure, and let clients sync missed messages after reconnecting.

### How do you scale WebSocket connections?

Use multiple gateway instances, a backplane or managed SignalR service, connection tracking, and separate real-time delivery from durable message storage.

### How do you handle offline users?

Store messages durably, track unread state, and deliver missed messages when they reconnect. Push notifications can be sent separately.

## Common Mistakes

- Broadcasting before saving.
- No reconnect strategy.
- No message IDs.
- No pagination for history.
- Storing presence permanently without TTL.
- Assuming timestamps alone guarantee ordering.
- No abuse/rate limiting.

## Practice Task

Design:

1. one-to-one chat;
2. group chat;
3. message persistence;
4. WebSocket delivery;
5. offline sync;
6. read receipts;
7. presence with Redis.
