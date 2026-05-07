# GraphQL

## Core Idea

GraphQL is an API query language where clients request exactly the data they need.

## The Problem GraphQL Solves

REST endpoints often return fixed response shapes.

```text
Mobile app needs: order id, status
Web app needs: order id, status, customer, items, payment
Admin app needs: order id, audit trail, fraud flags
```

GraphQL lets each client ask for a shape:

```graphql
query {
  order(id: 123) {
    id
    status
    customer {
      name
    }
  }
}
```

## Schema Example

```graphql
type Query {
  order(id: ID!): Order
  orders(status: OrderStatus, first: Int!, after: String): OrderConnection!
}

type Mutation {
  cancelOrder(input: CancelOrderInput!): CancelOrderPayload!
}

type Order {
  id: ID!
  orderNumber: String!
  status: OrderStatus!
  customer: Customer!
  items: [OrderItem!]!
  total: Decimal!
}

type Customer {
  id: ID!
  name: String!
}

type OrderItem {
  productName: String!
  quantity: Int!
  unitPrice: Decimal!
}

enum OrderStatus {
  DRAFT
  SUBMITTED
  PAID
  CANCELLED
}
```

The schema is the contract.

## GraphQL With Hot Chocolate

Install packages:

```bash
dotnet add package HotChocolate.AspNetCore
dotnet add package HotChocolate.Data.EntityFramework
```

Register:

```csharp
builder.Services
    .AddGraphQLServer()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .RegisterDbContext<AppDbContext>();

app.MapGraphQL("/graphql");
```

Query type:

```csharp
public sealed class Query
{
    public Task<OrderDto?> GetOrderAsync(
        int id,
        [Service] AppDbContext dbContext,
        CancellationToken ct)
    {
        return dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new OrderDto(
                x.Id,
                x.OrderNumber,
                x.Status.ToString(),
                x.TotalAmount))
            .FirstOrDefaultAsync(ct);
    }
}
```

## Resolver And N+1 Problem

Naive resolver:

```csharp
public sealed class OrderResolvers
{
    public Task<Customer?> GetCustomerAsync(
        [Parent] OrderDto order,
        [Service] AppDbContext dbContext,
        CancellationToken ct)
    {
        return dbContext.Customers
            .FirstOrDefaultAsync(x => x.Id == order.CustomerId, ct);
    }
}
```

If a query returns 100 orders, this can run 100 customer queries.

```text
1 query for orders
100 queries for customers
```

That is N+1.

## DataLoader

DataLoader batches related loads.

```csharp
public sealed class CustomerByIdDataLoader
    : BatchDataLoader<int, Customer>
{
    private readonly IDbContextFactory<AppDbContext> _dbContextFactory;

    public CustomerByIdDataLoader(
        IBatchScheduler batchScheduler,
        IDbContextFactory<AppDbContext> dbContextFactory)
        : base(batchScheduler)
    {
        _dbContextFactory = dbContextFactory;
    }

    protected override async Task<IReadOnlyDictionary<int, Customer>> LoadBatchAsync(
        IReadOnlyList<int> keys,
        CancellationToken cancellationToken)
    {
        await using var dbContext = await _dbContextFactory
            .CreateDbContextAsync(cancellationToken);

        return await dbContext.Customers
            .Where(x => keys.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
    }
}
```

Resolver:

```csharp
public Task<Customer> GetCustomerAsync(
    [Parent] OrderDto order,
    CustomerByIdDataLoader loader,
    CancellationToken ct)
{
    return loader.LoadAsync(order.CustomerId, ct);
}
```

Now many customer requests can be batched into one query.

## Mutation Example

```csharp
public sealed record CancelOrderInput(
    int OrderId,
    string Reason);

public sealed record CancelOrderPayload(
    int OrderId,
    string Status);
```

```csharp
public sealed class Mutation
{
    public async Task<CancelOrderPayload> CancelOrderAsync(
        CancelOrderInput input,
        [Service] CancelOrderHandler handler,
        CancellationToken ct)
    {
        var order = await handler.HandleAsync(
            new CancelOrderCommand(input.OrderId, input.Reason),
            ct);

        return new CancelOrderPayload(order.Id, order.Status.ToString());
    }
}
```

Mutations should still use application use cases. Do not put business rules directly into GraphQL resolvers.

## Authorization

GraphQL needs authorization at the operation and field/resource level.

```csharp
builder.Services
    .AddGraphQLServer()
    .AddAuthorization();
```

```csharp
[Authorize]
public sealed class Query
{
    public Task<OrderDto?> GetOrderAsync(
        int id,
        [Service] ICurrentUser currentUser,
        [Service] AppDbContext dbContext,
        CancellationToken ct)
    {
        return dbContext.Orders
            .Where(x => x.Id == id && x.TenantId == currentUser.TenantId)
            .Select(x => new OrderDto(x.Id, x.OrderNumber, x.Status.ToString(), x.TotalAmount))
            .FirstOrDefaultAsync(ct);
    }
}
```

Do not rely only on hiding fields in the UI. The server must enforce access.

## Query Cost Controls

GraphQL can execute expensive nested queries.

Controls:

- maximum depth;
- complexity limit;
- pagination required for collections;
- timeout;
- persisted queries;
- disable introspection in some public production scenarios;
- rate limiting;
- field-level authorization.

Example mental model:

```text
orders(first: 1000) {
  items {
    product {
      reviews(first: 1000) {
        author { ... }
      }
    }
  }
}
```

Flexible queries require cost controls.

## Pagination

Prefer connection-style pagination for large collections.

```graphql
type OrderConnection {
  nodes: [Order!]!
  pageInfo: PageInfo!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}
```

Avoid unbounded list fields:

```graphql
type Query {
  orders: [Order!]!
}
```

That can accidentally load too much data.

## GraphQL vs REST

GraphQL:

- flexible client-selected data;
- strongly typed schema;
- single endpoint;
- good for multiple clients with different data needs;
- requires query cost controls.

REST:

- resource-oriented;
- uses HTTP status and caching semantics naturally;
- simpler operational visibility;
- easier for public APIs and browser/network tooling.

The GraphQL patterns covered -- schema-driven query design, DataLoader-based batching, resolver authorization, and query cost controls -- enable building flexible yet safe client-facing APIs.
