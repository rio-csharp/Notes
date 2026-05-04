# Swagger And OpenAPI

## Core Idea

OpenAPI is a standard for describing HTTP APIs. Swagger tools generate interactive documentation and client SDKs from OpenAPI definitions.

Chinese notes:

- `OpenAPI`: API 描述标准.
- `Swagger`: 常用 API 文档工具.
- `schema`: 数据结构描述.

## Why It Matters

OpenAPI helps:

- frontend/backend collaboration;
- API documentation;
- contract review;
- client generation;
- testing;
- onboarding.

## ASP.NET Core Setup

```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Orders API",
        Version = "v1",
        Description = "HTTP API for orders, payments, and fulfillment."
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

Required namespaces:

```csharp
using Microsoft.OpenApi.Models;
```

## XML Comments

Project file:

```xml
<GenerateDocumentationFile>true</GenerateDocumentationFile>
```

Controller:

```csharp
/// <summary>
/// Gets an order by ID.
/// </summary>
[HttpGet("{id:int}")]
public async Task<ActionResult<OrderDto>> GetById(int id)
{
    return Ok();
}
```

Include XML comments in Swagger:

```csharp
builder.Services.AddSwaggerGen(options =>
{
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    options.IncludeXmlComments(xmlPath);
});
```

Required namespaces:

```csharp
using System.Reflection;
```

## Response Documentation

```csharp
[ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[HttpGet("{id:int}")]
public async Task<ActionResult<OrderDto>> GetById(int id)
{
    return Ok();
}
```

## Authentication In Swagger

Swagger can be configured to send bearer tokens.

Concept:

```csharp
options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
{
    Name = "Authorization",
    Type = SecuritySchemeType.Http,
    Scheme = "Bearer",
    BearerFormat = "JWT",
    In = ParameterLocation.Header
});
```

Complete JWT setup:

```csharp
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            []
        }
    });
});
```

## Documenting Errors

Use `ProblemDetails` and document it consistently.

```csharp
[ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
[ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
[ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
[HttpGet("{id:int}")]
public async Task<ActionResult<OrderDto>> GetById(int id, CancellationToken ct)
{
    var order = await _orders.GetByIdAsync(id, ct);
    return order is null ? NotFound() : Ok(order);
}
```

Validation response:

```csharp
[ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
[HttpPost]
public async Task<ActionResult<OrderDto>> Create(
    CreateOrderRequest request,
    CancellationToken ct)
{
    var order = await _orders.CreateAsync(request, ct);
    return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
}
```

## Minimal API OpenAPI Metadata

```csharp
app.MapPost("/api/orders", async (
        CreateOrderRequest request,
        IOrderService orders,
        CancellationToken ct) =>
    {
        var order = await orders.CreateAsync(request, ct);
        return Results.Created($"/api/orders/{order.Id}", order);
    })
    .WithName("CreateOrder")
    .WithTags("Orders")
    .Produces<OrderDto>(StatusCodes.Status201Created)
    .ProducesValidationProblem()
    .ProducesProblem(StatusCodes.Status500InternalServerError)
    .WithOpenApi();
```

## OpenAPI As A Contract Check

Teams can generate OpenAPI in CI and compare it against the previous version.

What to check:

- removed endpoints;
- changed response schemas;
- changed required fields;
- undocumented error responses;
- auth requirement changes;
- version-specific docs still generated correctly.

Key point:

> OpenAPI is not just a pretty UI. It is a machine-readable contract that can be reviewed and tested.

## Review Questions

### What is OpenAPI?

> OpenAPI is a machine-readable specification for HTTP APIs, including endpoints, request/response schemas, status codes, and authentication.

### Why use Swagger?

> Swagger provides interactive documentation and helps frontend, backend, QA, and external consumers understand and test APIs.

### Is Swagger enough as API contract?

> It helps, but teams still need versioning, examples, error contracts, and communication around breaking changes.

## Common Mistakes

- Swagger enabled publicly without protection.
- Missing response status documentation.
- DTO names unclear.
- Error response not documented.
- Documentation not matching actual behavior.

## Practice Task

Add Swagger docs for:

1. orders API;
2. request and response DTOs;
3. validation error;
4. JWT bearer auth;
5. examples for common endpoints.
