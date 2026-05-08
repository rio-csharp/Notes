# API Contracts, DTOs, And Evolution Boundaries

## Core Idea

An API contract is the public shape through which clients understand the system. DTOs exist to protect and shape that contract. They are not an unnecessary mapping layer placed between controllers and entities. They are the mechanism that decouples external behavior from internal persistence and domain change.

## Internal Models Versus Public Contracts

An entity model and an API contract solve different problems.

An entity usually exists to support persistence and domain behavior. A DTO exists to support communication with a client.

That difference becomes obvious when an entity contains:

- persistence-only fields;
- behavior methods;
- navigation properties;
- internal flags;
- security-sensitive data.

Returning such a type directly from the API often couples clients to implementation details that the service should remain free to change.

## The Risks Of Exposing Entities

This controller shape is convenient but fragile:

```csharp
[HttpGet("{id:int}")]
public async Task<User> GetUser(int id)
{
    return await _dbContext.Users.FindAsync(id);
}
```

The risks are not theoretical.

- sensitive fields may leak;
- persistence changes may become API breaking changes;
- JSON shape may follow navigation structure rather than client needs;
- over-posting becomes easier on write endpoints;
- versioning pressure increases because internal refactors become external changes.

The contract surface should therefore be deliberate rather than accidental.

## Response DTOs

A response DTO should express what the client needs to know, not what the database happens to store.

```csharp
public sealed record UserResponse(
    int Id,
    string Email,
    string DisplayName);
```

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<UserResponse>> GetUser(int id, CancellationToken ct)
{
    var user = await _dbContext.Users
        .AsNoTracking()
        .Where(u => u.Id == id)
        .Select(u => new UserResponse(u.Id, u.Email, u.DisplayName))
        .FirstOrDefaultAsync(ct);

    return user is null ? NotFound() : Ok(user);
}
```

Mapping within the query is often preferable because it avoids loading full entities that the endpoint does not actually need.

## Request DTOs

Request DTOs should represent only the fields a client is allowed to supply.

```csharp
public sealed record CreateUserRequest(
    string Email,
    string DisplayName,
    string Password);
```

This is important because an API contract is also an authorization boundary. A field omitted from the request type is not merely undocumented. It is structurally unavailable for client control.

## Use-Case-Specific DTOs

One DTO per use case is often clearer than one large reusable shape.

Create request:

```csharp
public sealed class CreateUserRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = "";

    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string DisplayName { get; init; } = "";

    [Required]
    [MinLength(12)]
    public string Password { get; init; } = "";
}
```

Profile update:

```csharp
public sealed class UpdateUserProfileRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string DisplayName { get; init; } = "";

    [Url]
    public string? AvatarUrl { get; init; }
}
```

List item:

```csharp
public sealed record UserListItemResponse(
    int Id,
    string DisplayName,
    string Email,
    bool IsActive);
```

Detail response:

```csharp
public sealed record UserDetailResponse(
    int Id,
    string Email,
    string DisplayName,
    string? AvatarUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);
```

These shapes differ because the client tasks differ. API design improves when the contract follows the use case instead of forcing every endpoint into one generic payload.

## Over-Posting And Write Safety

Over-posting happens when the client can send fields the server should never allow it to control.

Bad:

```csharp
[HttpPost]
public async Task<IActionResult> Create(User entity, CancellationToken ct)
{
    _dbContext.Users.Add(entity);
    await _dbContext.SaveChangesAsync(ct);
    return Ok(entity);
}
```

A client could attempt to set:

- `IsAdmin`;
- `PasswordHash`;
- internal flags;
- timestamps the server should own.

The safer pattern is to accept a restricted request DTO and construct the entity explicitly:

```csharp
[HttpPost]
public async Task<ActionResult<UserDetailResponse>> Create(
    CreateUserRequest request,
    CancellationToken ct)
{
    var user = new User
    {
        Email = request.Email.Trim().ToLowerInvariant(),
        DisplayName = request.DisplayName.Trim(),
        PasswordHash = _passwordHasher.Hash(request.Password),
        IsAdmin = false,
        CreatedAt = DateTimeOffset.UtcNow
    };

    _dbContext.Users.Add(user);
    await _dbContext.SaveChangesAsync(ct);

    var response = new UserDetailResponse(
        user.Id,
        user.Email,
        user.DisplayName,
        user.AvatarUrl,
        user.CreatedAt,
        user.LastLoginAt);

    return CreatedAtAction(nameof(GetById), new { id = user.Id }, response);
}
```

This is slightly more explicit, but that explicitness is exactly what makes the write boundary safer.

## Error Payloads Are Contract Shapes Too

Success responses are not the only DTOs that matter. Error responses are also part of the contract.

```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Validation failed",
  "status": 400,
  "traceId": "00-abcd",
  "errors": {
    "email": ["Email is required."]
  }
}
```

Using `ProblemDetails` and `ValidationProblemDetails` consistently keeps failure behavior predictable and makes client code less fragile than it would be if every endpoint returned ad hoc error payloads.

## DTO Shape And Immutability

DTOs benefit from being immutable. Immutable types make it impossible to accidentally modify a response after construction, and they signal clearly that the DTO is a snapshot of data rather than a mutable object with behavior.

C# record types provide a concise way to define immutable DTOs:

```csharp
public sealed record UserResponse(
    int Id,
    string Email,
    string DisplayName,
    DateTimeOffset CreatedAt);
```

For request DTOs that require validation attributes, the positional record syntax is less convenient. A record with explicit properties using `init` accessors offers the same immutability with room for attributes:

```csharp
public sealed record CreateUserRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = "";

    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string DisplayName { get; init; } = "";

    [Required]
    [MinLength(12)]
    public string Password { get; init; } = "";
}
```

The `init` accessor allows object initializer syntax during construction but prevents modification afterward. Properties can also be marked `required` (C# 11+) to enforce that callers supply them:

```csharp
public sealed record CreateOrderRequest
{
    public required int CustomerId { get; init; }
    public required string Currency { get; init; }
    public required List<OrderLineDto> Lines { get; init; }
}
```

Record structs offer a value-type alternative for high-throughput scenarios where allocation pressure is a concern:

```csharp
public readonly record struct OrderLineDto(
    int ProductId,
    int Quantity,
    decimal UnitPrice);
```

The choice between record class, record struct, and plain class depends on allocation profile, serialization needs, and whether the DTO carries behavior.

## JSON Serialization Configuration

The `System.Text.Json` serializer used by ASP.NET Core exposes configuration options that affect the contract shape:

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition =
            JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
```

Property-level attributes such as `[JsonPropertyName]`, `[JsonIgnore]`, and `[JsonInclude]` give finer control over the serialized shape without changing the C# type:

```csharp
public sealed record UserResponse(
    int Id,
    string Email,
    [property: JsonPropertyName("display_name")]
    string DisplayName);
```

For Native AOT deployments, source generators avoid runtime reflection:

```csharp
[JsonSerializable(typeof(UserResponse))]
[JsonSerializable(typeof(CreateUserRequest))]
internal sealed partial class AppJsonContext : JsonSerializerContext { }
```

Then registered in the serialization options:

```csharp
options.JsonSerializerOptions.TypeInfoResolverChain.Add(AppJsonContext.Default);
```

## DTO Mapping Approaches

Mapping between entities and DTOs can be handled in several ways, each with different trade-offs.

Explicit mapping within LINQ projections is the most transparent approach. It avoids loading entire entities and makes the mapping visible in the query:

```csharp
var user = await _dbContext.Users
    .Where(u => u.Id == id)
    .Select(u => new UserResponse(u.Id, u.Email, u.DisplayName, u.CreatedAt))
    .FirstOrDefaultAsync(ct);
```

Mapping methods or extension methods keep the logic reusable without introducing a mapping library:

```csharp
public static UserResponse ToResponse(this User user) =>
    new(user.Id, user.Email, user.DisplayName, user.CreatedAt);
```

Mapping libraries such as AutoMapper reduce repetitive code when the mapping is straightforward, but they introduce implicit behavior that can make debugging harder. In general, the simplest mapping approach that keeps the projection explicit enough to reason about is the right choice.

## Backward-Compatible Evolution

Some changes are usually safe:

- adding an optional response field;
- adding an optional request field;
- adding a new endpoint;
- expanding the API in a way old clients can ignore.

Some changes are risky or breaking:

- removing a field;
- renaming a field;
- changing a field type;
- changing semantic meaning;
- turning an optional field into a required one;
- changing expected status-code behavior.

This is why DTO design and API versioning are closely connected. A casual internal refactor should not become a breaking public contract change.

## Design Consequences

DTOs should be treated as the language of the API contract. They isolate client-facing behavior from persistence details, reduce write-surface risk, and make contract evolution more deliberate. The more stable and explicit the DTO boundary is, the easier it becomes to change the internals of the service without turning every internal improvement into a client migration problem.
