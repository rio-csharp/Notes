# Azure For .NET And React Applications

## Core Idea

Azure provides managed services for hosting, databases, storage, identity, messaging, secrets, networking, and observability.

Chinese notes:

- `App Service`: 托管 Web 应用服务.
- `Container Apps`: 托管容器应用平台.
- `Key Vault`: 密钥管理服务.
- `Managed Identity`: 托管身份, Azure resource can authenticate without storing credentials.
- `Application Insights`: 应用监控.
- `Private Endpoint`: 私有终结点, access a service through private network instead of public internet.

The engineering goal is not to use every Azure service. The goal is to choose the smallest reliable platform for the application.

## Common Azure Building Blocks

| Need | Common Azure Service |
| --- | --- |
| Host ASP.NET Core API | App Service, Container Apps, AKS, Virtual Machine |
| Host React SPA | Static Web Apps, Storage Static Website, App Service, CDN |
| Relational database | Azure SQL Database |
| Cache | Azure Cache for Redis |
| File/object storage | Blob Storage |
| Secrets | Key Vault |
| Messaging | Service Bus, Event Hubs |
| Background jobs | WebJobs, Functions, Container Apps jobs |
| Monitoring | Application Insights, Log Analytics, Azure Monitor |
| Identity | Microsoft Entra ID |
| Container registry | Azure Container Registry |

## Choosing A Hosting Option

### App Service

Good for:

- ASP.NET Core APIs;
- standard web applications;
- fast deployment;
- simple scaling;
- built-in TLS, deployment slots, health checks, and app settings.

Trade-off:

- less control than Kubernetes;
- not ideal for complex multi-container orchestration.

### Azure Container Apps

Good for:

- containerized APIs and workers;
- scale-to-zero or event-driven scaling;
- simpler operations than AKS;
- background processing with container jobs.

Trade-off:

- fewer low-level controls than Kubernetes;
- requires container image build and registry.

### AKS

Good for:

- complex Kubernetes workloads;
- custom networking and ingress;
- many services with shared platform patterns;
- teams already able to operate Kubernetes.

Trade-off:

- more operational complexity;
- cluster upgrades, networking, policies, and monitoring require discipline.

### Static Web Apps

Good for:

- React SPA;
- integrated global hosting;
- simple GitHub-based deployment;
- optional serverless APIs.

Trade-off:

- dynamic server behavior must live elsewhere.

## Reference Architecture

```text
User
  -> Azure Front Door / CDN
  -> React static assets
  -> ASP.NET Core API
  -> Azure SQL
  -> Azure Cache for Redis
  -> Blob Storage
  -> Service Bus
  -> Application Insights / Log Analytics
  -> Key Vault through Managed Identity
```

For smaller systems:

```text
React Static Web Apps
ASP.NET Core App Service
Azure SQL
Blob Storage
Key Vault
Application Insights
```

This is often enough for a real production application.

## App Service For ASP.NET Core

Typical deployment flow:

```text
GitHub Actions
  -> dotnet publish
  -> deploy artifact to App Service
  -> App Service injects environment configuration
  -> app starts with Kestrel behind App Service front end
  -> Application Insights collects telemetry
```

Important settings:

```text
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__Default=...
Redis__ConnectionString=...
Jwt__Authority=...
ApplicationInsights__ConnectionString=...
```

App Service settings override `appsettings.json` values.

## Deployment Slots

Deployment slots allow safer releases.

```text
production slot = current live app
staging slot    = new version
```

Flow:

```text
1. Deploy to staging slot.
2. Warm up the app.
3. Run smoke tests against staging slot.
4. Swap staging with production.
5. Monitor production.
6. Swap back if needed.
```

Slot settings are configuration values that should not swap, such as production database connection strings.

## Azure SQL Database

Azure SQL is a managed SQL Server database.

Important areas:

- compute tier and sizing;
- indexes and query plans;
- connection pooling;
- firewall rules;
- private endpoints;
- backup retention;
- point-in-time restore;
- geo-replication;
- long-running queries;
- deadlocks and blocking;
- migration strategy.

Connection string example:

```text
Server=tcp:my-server.database.windows.net,1433;Initial Catalog=orders;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

With Microsoft Entra authentication or Managed Identity, avoid storing database passwords where possible.

## EF Core With Azure SQL

Register SQL Server provider:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("Default"),
        sql =>
        {
            sql.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(10),
                errorNumbersToAdd: null);
        });
});
```

`EnableRetryOnFailure` helps with transient errors.

Chinese note:

- `transient error`: 瞬时错误, such as temporary network or failover issues.

Do not use retries to hide permanent problems such as bad SQL, missing tables, or wrong credentials.

## Blob Storage

Blob Storage is object storage for files.

Use it for:

- user uploads;
- images and documents;
- generated reports;
- exports;
- backups;
- large files that should not live in the database.

Install package:

```powershell
dotnet add package Azure.Storage.Blobs
dotnet add package Azure.Identity
```

Register a client with Managed Identity:

```csharp
using Azure.Identity;
using Azure.Storage.Blobs;

builder.Services.AddSingleton(_ =>
{
    var accountName = builder.Configuration["Storage:AccountName"];
    var containerName = builder.Configuration["Storage:ContainerName"];

    var serviceUri = new Uri($"https://{accountName}.blob.core.windows.net");
    var serviceClient = new BlobServiceClient(serviceUri, new DefaultAzureCredential());

    return serviceClient.GetBlobContainerClient(containerName);
});
```

Upload service:

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

public sealed class BlobFileStorage
{
    private readonly BlobContainerClient _container;

    public BlobFileStorage(BlobContainerClient container)
    {
        _container = container;
    }

    public async Task<string> UploadAsync(
        Stream stream,
        string originalFileName,
        string contentType,
        CancellationToken ct)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: ct);

        var safeExtension = Path.GetExtension(originalFileName);
        var blobName = $"{DateTimeOffset.UtcNow:yyyy/MM/dd}/{Guid.NewGuid():N}{safeExtension}";
        var blob = _container.GetBlobClient(blobName);

        await blob.UploadAsync(
            stream,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
            },
            ct);

        return blobName;
    }
}
```

Avoid trusting the original file name as the storage key. User-provided names can contain unsafe or duplicate values.

## Secure Blob Downloads

Private containers should not be made public by default.

Common options:

- API streams the file after authorization;
- API creates a short-lived SAS URL;
- CDN/private access patterns for high-traffic files.

SAS means Shared Access Signature.

Chinese note:

- `SAS`: 带过期时间和权限范围的临时访问签名.

Example concept:

```csharp
public async Task<Stream> OpenReadAsync(string blobName, CancellationToken ct)
{
    var blob = _container.GetBlobClient(blobName);
    var response = await blob.DownloadStreamingAsync(cancellationToken: ct);
    return response.Value.Content;
}
```

For large files, stream instead of loading everything into memory.

## Key Vault

Key Vault stores:

- API keys;
- connection strings;
- certificates;
- signing keys;
- encryption keys.

Add packages:

```powershell
dotnet add package Azure.Extensions.AspNetCore.Configuration.Secrets
dotnet add package Azure.Identity
```

Load Key Vault into .NET configuration:

```csharp
using Azure.Identity;

var keyVaultUri = builder.Configuration["KeyVault:Uri"];

if (!string.IsNullOrWhiteSpace(keyVaultUri))
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUri),
        new DefaultAzureCredential());
}
```

Then read secrets like normal configuration:

```csharp
var connectionString = builder.Configuration.GetConnectionString("Default");
```

Use RBAC or access policies so the application can read only the secrets it needs.

## Managed Identity

Managed Identity lets an Azure resource authenticate to Azure services without a stored password.

Flow:

```text
App Service / Container App / VM
  -> has managed identity enabled
  -> Azure issues token for that identity
  -> SDK uses token to access Key Vault, Blob Storage, SQL, etc.
```

Local development uses developer identity:

```text
DefaultAzureCredential
  -> environment variables
  -> Visual Studio
  -> Azure CLI
  -> managed identity in Azure
```

Example:

```csharp
var credential = new DefaultAzureCredential();
var blobClient = new BlobServiceClient(
    new Uri("https://myaccount.blob.core.windows.net"),
    credential);
```

## Application Insights

Application Insights collects telemetry:

- requests;
- dependencies;
- exceptions;
- traces;
- metrics;
- availability checks;
- distributed traces.

Add package:

```powershell
dotnet add package Microsoft.ApplicationInsights.AspNetCore
```

Register:

```csharp
builder.Services.AddApplicationInsightsTelemetry();
```

Add useful custom telemetry:

```csharp
app.MapPost("/orders", async (
    CreateOrderRequest request,
    IOrderService service,
    ILogger<Program> logger,
    CancellationToken ct) =>
{
    using var scope = logger.BeginScope(new Dictionary<string, object>
    {
        ["CustomerId"] = request.CustomerId
    });

    var orderId = await service.CreateAsync(request, ct);
    logger.LogInformation("Order {OrderId} created", orderId);

    return Results.Created($"/orders/{orderId}", new { orderId });
});
```

Avoid logging secrets, tokens, passwords, or full payment data.

## Azure Service Bus

Service Bus is a managed message broker.

Use queues when one consumer should process each message:

```text
Order API
  -> sends CreateInvoice command
  -> invoice queue
  -> Billing Worker processes it
```

Use topics/subscriptions when multiple systems need the same event:

```text
OrderCreated event
  -> topic
  -> billing subscription
  -> email subscription
  -> analytics subscription
```

Service Bus features:

- dead-letter queue;
- duplicate detection;
- scheduled messages;
- sessions for ordering;
- lock renewal;
- retry policies.

Add package:

```powershell
dotnet add package Azure.Messaging.ServiceBus
```

Send message:

```csharp
using Azure.Messaging.ServiceBus;

public sealed class OrderEventPublisher
{
    private readonly ServiceBusSender _sender;

    public OrderEventPublisher(ServiceBusClient client)
    {
        _sender = client.CreateSender("order-created");
    }

    public async Task PublishAsync(OrderCreatedEvent evt, CancellationToken ct)
    {
        var body = BinaryData.FromObjectAsJson(evt);
        var message = new ServiceBusMessage(body)
        {
            MessageId = evt.OrderId.ToString(),
            ContentType = "application/json",
            Subject = "OrderCreated"
        };

        await _sender.SendMessageAsync(message, ct);
    }
}
```

Consumers should be idempotent because messages can be delivered more than once.

Chinese note:

- `idempotent`: 幂等, running the same operation multiple times has the same final effect.

## Azure Cache For Redis

Use Redis for:

- distributed cache;
- session storage;
- rate limiting;
- temporary locks;
- expensive query result caching.

Be careful with:

- cache stampede;
- cache avalanche;
- stale data;
- large values;
- no expiration;
- using Redis as the only source of truth.

Cache access should fail gracefully when possible. A temporary Redis issue should not always take down the whole application.

## Networking And Private Access

Public endpoints are simpler, but production systems often restrict access.

Common controls:

- App Service access restrictions;
- private endpoints for SQL, Storage, Key Vault;
- VNet integration;
- firewall allow lists;
- network security groups;
- Front Door or Application Gateway in front of apps.

Mental model:

```text
Public internet
  -> Front Door / WAF
  -> App Service or Container App
  -> private endpoint
  -> Azure SQL / Storage / Key Vault
```

Chinese note:

- `WAF`: Web Application Firewall, Web 应用防火墙.

## Backup And Restore

Backups are only useful if restore has been tested.

Important checks:

- database point-in-time restore;
- storage soft delete/versioning;
- Key Vault soft delete and purge protection;
- infrastructure configuration backup;
- restore time objective;
- restore point objective.

Chinese notes:

- `RTO`: Recovery Time Objective, 可接受的恢复时间.
- `RPO`: Recovery Point Objective, 可接受的数据丢失时间范围.

Example:

```text
RTO = 2 hours
RPO = 15 minutes
```

This means the system should be recoverable within 2 hours, with at most about 15 minutes of data loss.

## Cost Awareness

Azure cost problems often come from:

- over-provisioned databases;
- unused App Service plans;
- verbose logs retained too long;
- high egress traffic;
- large storage without lifecycle rules;
- always-on environments that are not needed at night/weekends.

Practical habits:

- set budgets and alerts;
- tag resources by application/environment/team;
- use autoscaling carefully;
- define log retention;
- move old blobs to cool/archive tiers;
- delete temporary resources.

## Common Mistakes

- Putting production secrets in `appsettings.json`.
- Making blob containers public accidentally.
- Overusing AKS when App Service or Container Apps is enough.
- No Application Insights or structured logs.
- No health checks.
- No restore test.
- Giving one identity access to every secret.
- Using public database endpoints without network restrictions.
- Storing uploaded files on local app disk.
- Ignoring connection limits and database sizing.

## Knowledge Checks

### When is App Service a good choice?

App Service is good for standard APIs and web apps that need managed hosting, TLS, scaling, deployment slots, health checks, and easy configuration without operating Kubernetes.

### Why use Managed Identity?

Managed Identity avoids storing credentials in code or configuration. Azure issues tokens to the resource identity, and SDKs can use those tokens to access services such as Key Vault or Blob Storage.

### Why should Blob Storage usually store uploaded files instead of the database?

Blob Storage is built for large binary objects, streaming, lifecycle policies, and lower storage cost. The database should usually store metadata and the blob key, not the entire file.

### What does Application Insights help you understand?

It helps connect requests, dependencies, exceptions, traces, and performance metrics so production behavior can be investigated with evidence.

### What is the difference between Service Bus and Kafka-like event streaming?

Service Bus is a message broker for queues, topics, commands, workflows, and dead-letter handling. Kafka-like systems are append-only event logs designed for high-throughput streams and replay.

## Practice Task

Design an Azure deployment for:

1. React frontend.
2. ASP.NET Core API.
3. Azure SQL.
4. Blob Storage uploads.
5. Redis cache.
6. Key Vault with Managed Identity.
7. Application Insights.
8. Service Bus background processing.
9. CI/CD deployment.

Write down:

```text
Which service hosts each component?
Where are secrets stored?
How does the app authenticate to Azure services?
How are files uploaded and downloaded?
How are logs and traces collected?
How would you restore the database?
Which parts are public and which parts are private?
```
