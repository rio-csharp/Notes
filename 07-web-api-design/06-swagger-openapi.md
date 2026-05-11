# OpenAPI, Documentation, And Contract Visibility

## Core Idea

An API contract that exists only in controller code is harder to review, harder to test, and harder for clients to trust. OpenAPI provides a machine-readable description of the contract, while tools such as Swagger UI, Scalar, and ReDoc make that contract inspectable by humans. The real value is not the interactive UI alone. The value is visibility.

## Documentation As Part Of The API Surface

Clients need to know:

- which endpoints exist;
- what each endpoint accepts;
- what it returns;
- which status codes are possible;
- what authentication is required;
- how errors are shaped.

If those details are inferred only from examples or tribal knowledge, the contract is weak even if the API itself behaves correctly. Documentation therefore belongs inside the contract story, not outside it.

## OpenAPI As A Machine-Readable Contract

OpenAPI is valuable because it describes the API in a format tools can consume. That enables:

- interactive documentation;
- client SDK generation;
- contract review in pull requests;
- automated diffing between versions;
- test harness generation;
- onboarding for new teams.

This is especially important once the API serves more than one consumer, because manual documentation tends to drift precisely when consistency matters most.

## Built-In OpenAPI Support In ASP.NET Core

Since .NET 9, ASP.NET Core provides built-in OpenAPI document generation through the `Microsoft.AspNetCore.OpenApi` package. This replaces Swashbuckle as the default approach in project templates, though third-party packages remain available for specialized needs.

The basic setup registers the OpenAPI services and exposes the generated document at a development-only endpoint:

```csharp
using Microsoft.AspNetCore.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.Run();
```

`AddOpenApi` registers the services required for document generation. `MapOpenApi` adds an endpoint that serves the serialized OpenAPI document as JSON. Restricting this endpoint to the development environment reduces the risk of exposing internal API metadata in production.

### Visualizing The Document

The `Microsoft.AspNetCore.OpenApi` package does not include a built-in UI. Swagger UI can be added using a UI package such as `Swashbuckle.AspNetCore.SwaggerUI`, which provides the web assets independently of the built-in document generation pipeline:

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "v1");
    });
}
```

Scalar offers a modern alternative with a cleaner interface and can be added using the `Scalar.AspNetCore` package:

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}
```

ReDoc is another option that provides a well-structured two-panel documentation view. These tools all consume the same generated `openapi.json` document and differ primarily in presentation and interactivity.

### Document Customization With Transformers

The generated document can be customized using transformer APIs that modify the document, operations, or schemas before serialization:

```csharp
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Info.Title = "Orders API";
        document.Info.Version = "v1";
        document.Info.Description = "HTTP API for orders, payments, and fulfillment.";
        return Task.CompletedTask;
    });
    
    options.AddOperationTransformer((operation, context, ct) =>
    {
        operation.Summary ??= "No description provided.";
        return Task.CompletedTask;
    });
});
```

Document transformers are useful for injecting cross-cutting metadata such as contact information, license details, or server URLs. Operation transformers can add consistent summaries, descriptions, or deprecated-version annotations.

### Build-Time Document Generation

OpenAPI documents can also be generated at build time using the `Microsoft.Extensions.ApiDescription.Server` package. This enables contract review in pull requests without running the application:

```xml
<PropertyGroup>
  <OpenApiGenerateDocuments>true</OpenApiGenerateDocuments>
  <OpenApiDocumentsDirectory>$(MSBuildProjectDirectory)</OpenApiDocumentsDirectory>
</PropertyGroup>

<ItemGroup>
  <PackageReference Include="Microsoft.Extensions.ApiDescription.Server" Version="10.0.*-*">
    <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
</ItemGroup>
```

Running `dotnet build` produces a serialized OpenAPI document that can be checked into version control, compared against previous versions, or validated with a linter such as Spectral.

### Programmatic Access In .NET 10

.NET 10 introduces `IOpenApiDocumentProvider`, which allows programmatic access to OpenAPI documents outside HTTP request contexts:

```csharp
public sealed class CustomDocumentService(
    [FromKeyedServices("v2")] IOpenApiDocumentProvider documentProvider)
{
    public async Task<OpenApiDocument> GetApiDocumentAsync(
        CancellationToken ct = default)
    {
        var document = await documentProvider.GetOpenApiDocumentAsync(ct);
        document.Info = new OpenApiInfo
        {
            Title = "Custom API Title",
            Version = "v2",
            Description = "Custom description."
        };
        return document;
    }
}
```

This enables scenarios such as generating client SDKs in background jobs, validating API contracts in integration tests, or exporting documents to external registries.

## Response Metadata And Error Visibility

Making non-success responses explicit is one of the highest-value uses of OpenAPI metadata. The `ProducesResponseType` attribute documents the status codes and response types an endpoint can return:

```csharp
[HttpGet("{id:int}")]
[ProducesResponseType<OrderResponse>(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
public async Task<ActionResult<OrderResponse>> GetById(int id, CancellationToken ct)
{
    // ...
}
```

This metadata flows into the generated OpenAPI document, making the full API surface visible rather than only the success path. Without these annotations, the generated document describes only what the endpoint returns on success, leaving consumers to guess at failure modes.

If an endpoint can return:

- `200 OK`;
- `404 Not Found`;
- validation errors;
- authorization failures;
- `409 Conflict`;

those should be reflected in the contract documentation rather than left implicit. Otherwise the client sees only the happy path while the real API surface remains larger and less predictable.

This is why structured error contracts such as `ProblemDetails` matter twice: once at runtime and once in documentation.

## Authentication And Security Schemes

Security requirements should also be part of the documented contract. OpenAPI configuration for bearer authentication is useful not only because it enables testing from the UI, but because it makes the authentication shape explicit in the generated specification:

```csharp
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Components ??= new();
        document.Components.SecuritySchemes["Bearer"] = new()
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        };
        return Task.CompletedTask;
    });
});
```

An undocumented authentication requirement is still a contract requirement. OpenAPI simply makes it visible and tool-friendly. The security chapters cover token design, OAuth flows, and authorization models in detail, and those chapters should be consulted when deciding what authentication mechanisms the API needs to document.

## XML Comments, Examples, And Readability

Human-readable documentation still matters alongside machine-readable structure. XML comments, summaries, descriptions, and examples improve contract clarity, especially for:

- ambiguous request fields;
- less obvious state transitions;
- asynchronous workflows;
- versioned or deprecated endpoints.

XML documentation files are generated at compile time by setting the `GenerateDocumentationFile` property in the project file:

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
</PropertyGroup>
```

These comments are picked up by the OpenAPI generation pipeline when the appropriate transformer or options are configured. The goal is not exhaustive prose on every endpoint. The goal is enough semantic guidance that a consumer can understand the contract without guessing the author's intent from property names alone.

## OpenAPI In CI And Contract Review

One of the most mature uses of OpenAPI is contract diffing in continuous integration. Once the spec is generated consistently, teams can compare one version against the previous one and detect:

- removed endpoints;
- changed response schemas;
- newly required fields;
- missing error documentation;
- altered security requirements.

Tools such as Spectral can lint generated documents against OpenAPI specification rules, catching structural issues before they reach consumers:

```bash
spectral lint openapi.json
```

This turns API review from subjective documentation checking into a more objective contract-governance process.

## Design Consequences

OpenAPI and related tools are most valuable when treated as contract visibility tools. They make the API inspectable, reviewable, and automatable. A good specification does not replace thoughtful versioning, error design, or semantic discipline, but it makes all of those things easier to verify. In mature API work, that visibility is not optional polish. It is part of the engineering control surface.
