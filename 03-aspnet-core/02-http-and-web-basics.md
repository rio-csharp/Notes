# HTTP And Web Basics For ASP.NET Core

## Core Idea

ASP.NET Core is built on HTTP. Good backend engineering requires understanding HTTP semantics, not just framework attributes.

## TCP, HTTP, And Application Protocols

HTTP is an application-layer protocol. TCP is a transport-layer protocol.

High-level relationship:

```text
HTTP request/response
  -> encoded as bytes
  -> sent over TCP connection
  -> received as byte stream
  -> parsed back into HTTP messages
```

TCP is a byte stream, not a message protocol.

This means TCP does not preserve your application-level "message boundaries".

If the application sends:

```text
Message A
Message B
```

the receiver may see:

```text
Message A + Message B together
```

or:

```text
first half of Message A
second half of Message A + Message B
```

This is normal TCP behavior.

## HTTP Versions, TLS, And Connections

### HTTP/1.1

HTTP/1.1 is text-based and commonly uses persistent TCP connections.

Important ideas:

- request/response model;
- headers and body;
- keep-alive connections;
- head-of-line blocking at the connection level;
- multiple parallel connections are often used by browsers.

### HTTP/2

HTTP/2 is binary-framed and supports multiplexing multiple streams over one TCP connection.

Benefits:

- fewer connections;
- header compression;
- concurrent streams;
- better connection utilization.

But because it still commonly runs over TCP, packet loss can still affect streams sharing that TCP connection.

### HTTP/3

HTTP/3 runs over QUIC, which uses UDP underneath.

Benefits:

- faster connection setup in many cases;
- improved multiplexing behavior compared with HTTP/2 over TCP;
- built-in TLS 1.3 style security.

Practical answer:

> HTTP/1.1 is request/response over TCP with keep-alive. HTTP/2 adds binary framing and multiplexing over one TCP connection. HTTP/3 uses QUIC over UDP to reduce some TCP-level head-of-line blocking issues.

### HTTPS / TLS

HTTPS is HTTP over TLS.

TLS provides:

- encryption;
- server authentication with certificates;
- integrity protection;
- optional client certificate authentication.

Simplified flow:

```text
Client connects
TLS handshake
Server proves certificate identity
Keys are negotiated
Encrypted HTTP data flows
```

Production notes:

- TLS protects data in transit, not data after it reaches the server;
- certificates must be valid and trusted;
- termination may happen at load balancer, reverse proxy, or application server;
- use HSTS for browser-facing HTTPS sites where appropriate.

## TCP Sticky Packet And Half Packet

These names are common in Chinese engineering practice:

More precise English wording:

- TCP stream coalescing;
- TCP fragmentation at application read boundary;
- message framing problem.

### Sticky Packet Example

Sender writes:

```text
SEND: "LOGIN alice\n"
SEND: "PING\n"
```

Receiver might read:

```text
"LOGIN alice\nPING\n"
```

If the receiver assumes one read equals one message, it breaks.

### Half Packet Example

Sender writes:

```text
SEND: "CREATE_ORDER {large json}\n"
```

Receiver might read:

```text
Read 1: "CREATE_ORDER {lar"
Read 2: "ge json}\n"
```

If the receiver tries to parse after Read 1, it fails because the message is incomplete.

## Why Sticky/Half Packets Happen

Reasons include:

- TCP is stream-oriented;
- sender writes do not equal receiver reads;
- OS socket buffers;
- network segmentation;
- Nagle's algorithm;
- delayed ACKs;
- receiver buffer size;
- TLS framing;
- proxies or gateways.

Key idea:

> The network is allowed to split or combine bytes. Your application protocol must define how to find complete messages.

## How To Solve Sticky/Half Packet Problems

Common framing strategies:

### 1. Delimiter-Based Protocol

Each message ends with a delimiter:

```text
LOGIN alice\n
PING\n
```

Receiver buffers bytes until it sees `\n`.

Good for:

- simple text protocols;
- logs;
- line-based commands.

Risks:

- delimiter may appear inside payload unless escaped;
- large messages still need size limits.

### 2. Length-Prefix Protocol

Send message length before payload:

```text
[length=128][128 bytes payload]
```

Receiver:

```text
1. Read enough bytes for length header.
2. Parse length.
3. Keep reading until payload length is satisfied.
4. Parse one complete message.
```

Good for:

- binary protocols;
- high-performance systems;
- custom TCP protocols.

### 3. Fixed-Length Protocol

Every message has a fixed size:

```text
64 bytes per message
```

Simple but inflexible.

### 4. Existing Protocols

Prefer existing protocols when possible:

- HTTP uses headers such as `Content-Length` or chunked transfer encoding;
- WebSocket has its own frame format;
- gRPC uses HTTP/2 framing;
- Kafka has its own binary protocol framing.

TCP sticky and half-packet problems are not bugs in TCP. They happen because TCP is a byte stream. The solution is to design proper message framing, such as delimiter-based framing, length-prefix framing, fixed-length messages, or using an existing framed protocol such as HTTP, WebSocket, or gRPC.

## Simple Length-Prefix Parser Mental Model

Pseudo-code:

```csharp
var buffer = new List<byte>();

while (true)
{
    var bytesRead = await socket.ReceiveAsync(tempBuffer, ct);
    buffer.AddRange(tempBuffer[..bytesRead]);

    while (buffer.Count >= 4)
    {
        var length = ReadInt32(buffer.Take(4));

        if (buffer.Count < 4 + length)
        {
            break; // half packet: wait for more bytes
        }

        var payload = buffer.Skip(4).Take(length).ToArray();
        buffer.RemoveRange(0, 4 + length);

        HandleMessage(payload);
    }
}
```

- keep an accumulated buffer;
- parse only complete messages;
- leave incomplete bytes for the next read;
- protect against huge declared lengths;
- handle disconnects and timeouts.

## Why HTTP Usually Hides This From You

In ASP.NET Core, you usually do not manually solve sticky packet problems for normal HTTP APIs.

Why:

- Kestrel parses HTTP;
- HTTP defines message boundaries;
- request headers and body length/chunking are handled by the server;
- controllers receive already-parsed requests.

But you should understand the concept for:

- custom TCP protocols;
- socket programming;
- WebSocket message handling;
- high-performance networking;
- debugging strange network behavior;
- learning checks that test fundamentals.

## HTTP Request

Contains:

- method;
- path;
- query string;
- headers;
- body;
- cookies.

Example:

```http
POST /api/orders?source=web HTTP/1.1
Content-Type: application/json
Authorization: Bearer token

{
  "customerId": 1
}
```

ASP.NET Core maps this request into:

```csharp
[HttpPost]
public async Task<ActionResult<OrderDto>> Create(
    [FromBody] CreateOrderRequest request,
    [FromQuery] string? source,
    CancellationToken ct)
{
    // source = "web"
    // request.CustomerId = 1
}
```

Common binding sources:

- route values: `/api/orders/{id}`;
- query string: `?page=1`;
- headers: `Authorization`, `X-Correlation-ID`;
- body: JSON request model;
- form data: file uploads and form posts.

## HTTP Response

Contains:

- status code;
- headers;
- body.

Example:

```http
201 Created
Location: /api/orders/123
Content-Type: application/json

{
  "id": 123,
  "status": "Draft"
}
```

ASP.NET Core response example:

```csharp
[HttpPost]
public ActionResult<OrderDto> Create(CreateOrderRequest request)
{
    var order = new OrderDto(123, "Draft");

    return CreatedAtAction(
        nameof(GetById),
        new { id = order.Id },
        order);
}
```

This produces a `201 Created` response and usually sets a `Location` header pointing to the new resource.

## HTTP Methods

- `GET`: read.
- `POST`: create or non-idempotent action.
- `PUT`: replace.
- `PATCH`: partial update.
- `DELETE`: delete.

Example API design:

```http
GET    /api/orders/123
POST   /api/orders
PUT    /api/orders/123
PATCH  /api/orders/123/status
DELETE /api/orders/123
```

Action-style endpoint example:

```http
POST /api/orders/123/approve
```

This is acceptable when the operation is a business action rather than simple CRUD replacement.

## Safe And Idempotent

Safe:

- should not change server state.
- `GET` should be safe.

- repeated requests have same effect.
- `GET`, `PUT`, and `DELETE` are generally idempotent by design.

Examples:

```text
GET /api/orders/123
  safe: should not change server state
  idempotent: repeating it should not create additional effects

PUT /api/users/123
  idempotent: replacing with the same representation repeatedly has the same final state

POST /api/payments
  often not idempotent by default: repeating it may create duplicate payments
```

For risky `POST` operations, use an idempotency key:

```http
POST /api/payments
Idempotency-Key: payment-user-42-cart-99
```

HTTP method semantics are not just stylistic conventions. They affect retries, caching, browser behavior, proxies, and client expectations.

## Status Codes

Common status codes:

| Code | Meaning | Example |
| --- | --- | --- |
| `200 OK` | request succeeded | get order |
| `201 Created` | resource created | create order |
| `202 Accepted` | accepted for async processing | export report job queued |
| `204 No Content` | success with no body | delete succeeded |
| `400 Bad Request` | invalid input | malformed request |
| `401 Unauthorized` | not authenticated | missing/invalid token |
| `403 Forbidden` | authenticated but not allowed | no permission |
| `404 Not Found` | resource not found | order id does not exist |
| `409 Conflict` | state conflict | concurrency conflict |
| `422 Unprocessable Entity` | semantically invalid request | validation failed in some API styles |
| `429 Too Many Requests` | rate limited | too many login attempts |
| `500 Internal Server Error` | unexpected server failure | unhandled exception |

ASP.NET Core examples:

```csharp
return Ok(order);
return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
return NoContent();
return BadRequest(problem);
return Unauthorized();
return Forbid();
return NotFound();
return Conflict(problem);
```

## Content Negotiation

ASP.NET Core can serialize response based on request/response content type.

Common:

```text
application/json
multipart/form-data
application/octet-stream
```

JSON request example:

```http
Content-Type: application/json
Accept: application/json
```

File upload example:

```http
Content-Type: multipart/form-data
```

Binary download example:

```csharp
return File(bytes, "application/pdf", "report.pdf");
```

Common mistake:

> Sending JSON without `Content-Type: application/json` can prevent correct model binding.

## Cookies And Headers

Cookies are automatically sent by browsers to matching domains.

Headers are often used for:

- authorization;
- content type;
- correlation ID;
- caching;
- API versioning.

Common headers:

```text
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
X-Correlation-ID: abc123
If-Match: "row-version"
Cache-Control: no-store
```

Correlation ID example:

```csharp
var correlationId = Request.Headers.TryGetValue("X-Correlation-ID", out var value)
    ? value.ToString()
    : HttpContext.TraceIdentifier;
```

Use headers for metadata about the request. Use the body for business data.

## CORS

CORS is a browser security feature. It controls whether JavaScript from one origin can call another origin.

Example:

```text
Frontend: https://app.example.com
API:      https://api.example.com
```

Because these are different origins, the browser enforces CORS.

ASP.NET Core example:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("https://app.example.com")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

app.UseCors("Frontend");
```

CORS protects browsers. It is not a replacement for authentication or authorization, and it does not block server-to-server calls.

## HTTP Design Notes

HTTP status codes should communicate server intent precisely. `401 Unauthorized` means the request is not authenticated or presents invalid credentials. `403 Forbidden` means the user is authenticated but still not permitted to perform the requested action.

`POST` is typically used to create resources or trigger non-idempotent actions. `PUT` usually replaces a resource representation and should be idempotent. That distinction matters when clients retry requests and when APIs communicate resource semantics clearly.

CORS preflight is the browser's `OPTIONS` probe that checks whether a cross-origin request is allowed before the real request is sent. Because CORS is enforced by browsers rather than by the API protocol itself, it should never be treated as the application's true security boundary. APIs still need authentication, authorization, rate limiting, and input validation.

Validation failures commonly return `400 Bad Request` or, in some API styles, `422 Unprocessable Entity`. In ASP.NET Core APIs using `[ApiController]`, invalid model state usually maps to `400`, which makes that status code the most common default.

TCP sticky-packet and half-packet problems exist because TCP is a byte stream rather than a message protocol. One logical message may span several reads, and several logical messages may arrive in one read. ASP.NET Core applications usually do not face this directly because Kestrel handles HTTP framing, including content length, chunking, and header parsing. Those lower-level concerns matter more when implementing custom socket protocols or transport layers directly.
