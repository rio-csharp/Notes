# API Contracts And DTOs

## Core Idea

An API contract defines how clients and servers communicate.

Chinese notes:

- `contract`: 契约.
- `DTO`: Data Transfer Object, 数据传输对象.
- `backward compatibility`: 向后兼容.

Good API contracts are stable, explicit, and safe to evolve.

## Entity vs DTO

Entity:

- internal domain/database model;
- may contain behavior;
- may contain fields not safe for clients;
- may change with persistence needs.

DTO:

- API input/output shape;
- designed for client needs;
- versionable;
- safer to expose.

## Bad: Exposing Entity

```csharp
[HttpGet("{id:int}")]
public async Task<User> GetUser(int id)
{
    return await _dbContext.Users.FindAsync(id);
}
```

Problems:

- may expose password hash;
- couples API to database schema;
- can create circular JSON issues;
- hard to version.

## Good: Response DTO

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

## Request DTO

```csharp
public sealed record CreateUserRequest(
    string Email,
    string DisplayName,
    string Password);
```

Never trust client input. Validate request DTOs.

## Separate DTOs By Use Case

One DTO per use case is often clearer than one large reusable DTO.

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

Update profile request:

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

List item response:

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

Why separate DTOs help:

- create requests need password, responses should not return it;
- list responses should be small;
- detail responses can include more fields;
- update requests should expose only fields clients may change;
- future changes can be made per endpoint.

## Over-posting Example

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

Problem:

```json
{
  "email": "alice@example.com",
  "displayName": "Alice",
  "isAdmin": true,
  "passwordHash": "fake"
}
```

The client may send fields it should never control.

Better:

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

## Mapping In Query Projection

For read endpoints, map to DTOs inside the database query.

```csharp
var users = await _dbContext.Users
    .AsNoTracking()
    .Where(user => user.IsActive)
    .OrderBy(user => user.DisplayName)
    .Select(user => new UserListItemResponse(
        user.Id,
        user.DisplayName,
        user.Email,
        user.IsActive))
    .ToListAsync(ct);
```

This avoids loading full entities and prevents accidental exposure of internal fields.

## Contract Evolution

Usually safe:

- add optional response field;
- add optional request field;
- add new endpoint;
- add new enum value only if clients can handle it.

Risky:

- rename field;
- remove field;
- change type;
- change meaning;
- make optional field required;
- change status code behavior.

## Error Contract

Use consistent errors:

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

ASP.NET Core `ProblemDetails` example:

```csharp
builder.Services.AddProblemDetails();

app.UseExceptionHandler();
```

Custom validation response shape:

```csharp
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var problem = new ValidationProblemDetails(context.ModelState)
        {
            Title = "Validation failed",
            Status = StatusCodes.Status400BadRequest,
            Instance = context.HttpContext.Request.Path
        };

        problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;

        return new BadRequestObjectResult(problem);
    };
});
```

Key point:

> Error responses are part of the API contract. Clients should not need to parse random exception strings.

## Review Questions

### Why use DTOs?

> DTOs decouple API contracts from internal entities, prevent over-posting, avoid leaking sensitive fields, and make versioning easier.

### How do you avoid breaking clients?

> I keep contracts backward compatible, add optional fields instead of changing existing ones, version breaking changes, and document APIs through OpenAPI.

### What is over-posting?

> Over-posting happens when clients send fields they should not control, and the server binds them directly to entities.

## Common Mistakes

- Exposing EF entities.
- One DTO reused for create, update, and response.
- No error contract.
- Breaking enum/string values.
- No API documentation.
- Trusting frontend validation only.

## Practice Task

Design DTOs for:

1. create user;
2. update user profile;
3. user list item;
4. user detail;
5. validation error;
6. backward-compatible new field.
