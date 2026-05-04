# EF Core Raw SQL And Stored Procedures

## Core Idea

EF Core supports raw SQL when LINQ is not enough or when you need database-specific queries.

Chinese notes:

- `raw SQL`: 原生 SQL.
- `stored procedure`: 存储过程.
- `parameterized query`: 参数化查询.
- `SQL injection`: SQL 注入.
- `keyless entity`: 无主键实体.

Key takeaway:

> I use LINQ for most queries, but I use raw SQL for provider-specific features, complex reporting, stored procedure integration, or measured performance needs. I always parameterize user input.

## When To Use Raw SQL

Use raw SQL when:

- query is too complex for LINQ;
- performance requires database-specific features;
- using existing stored procedures;
- reporting query is easier in SQL;
- bulk operations need custom SQL;
- provider-specific locking hints are required;
- you need a hand-tuned query after measurement.

Do not use raw SQL just because you are unfamiliar with LINQ.

## FromSql

```csharp
var orders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders WHERE Status = {status}")
    .ToListAsync(ct);
```

Interpolated `FromSql` creates parameters.

Conceptually:

```sql
SELECT * FROM Orders WHERE Status = @p0
```

Avoid string concatenation:

```csharp
var sql = "SELECT * FROM Orders WHERE Status = '" + status + "'";
```

Why it is dangerous:

> If `status` contains malicious SQL, it can change the meaning of the query.

## Composing Over FromSql

EF Core can sometimes compose LINQ over raw SQL:

```csharp
var recentPaidOrders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders")
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(20)
    .ToListAsync(ct);
```

Be careful:

> Composability depends on the SQL shape and provider. Stored procedure calls often cannot be composed in the same way.

## ExecuteSql

For commands:

```csharp
await _dbContext.Database.ExecuteSqlAsync(
    $"UPDATE Orders SET Status = {"Expired"} WHERE CreatedAt < {cutoff}");
```

Use for:

- set-based updates;
- maintenance commands;
- simple data fixes;
- provider-specific SQL.

Modern EF Core also supports `ExecuteUpdateAsync` and `ExecuteDeleteAsync` for many set-based operations without raw SQL.

## Stored Procedure Query

```csharp
var orders = await _dbContext.Orders
    .FromSql($"EXEC dbo.GetOrdersByStatus {status}")
    .ToListAsync(ct);
```

Stored procedures can be useful when:

- database team owns complex logic;
- legacy system already uses procedures;
- query needs carefully controlled execution;
- reporting logic is centralized in database.

Trade-offs:

- logic can be split between app and database;
- source control/versioning must be handled;
- testing may require real database integration tests;
- migrations do not automatically understand procedure body changes unless scripted.

Stored procedure deployed through migration:

```csharp
public partial class AddGetOrdersByStatusProcedure : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE OR ALTER PROCEDURE dbo.GetOrdersByStatus
                @Status nvarchar(30)
            AS
            BEGIN
                SET NOCOUNT ON;

                SELECT Id, CustomerId, Status, Total, CreatedAt
                FROM dbo.Orders
                WHERE Status = @Status
                ORDER BY CreatedAt DESC;
            END
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP PROCEDURE IF EXISTS dbo.GetOrdersByStatus");
    }
}
```

## Keyless Entity Type

For report results:

```csharp
public sealed class SalesReportRow
{
    public string Month { get; set; } = "";
    public decimal Total { get; set; }
}
```

Configuration:

```csharp
modelBuilder.Entity<SalesReportRow>()
    .HasNoKey();
```

Query:

```csharp
var report = await _dbContext.Set<SalesReportRow>()
    .FromSql($"EXEC dbo.GetMonthlySalesReport {year}")
    .ToListAsync(ct);
```

Use keyless entities for:

- database views;
- report results;
- stored procedure result sets;
- ad hoc read models without primary keys.

Important:

> Keyless entities are read-oriented and are not tracked for normal updates like regular entities.

## SQL Injection Risk

Bad:

```csharp
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
var users = await _dbContext.Users.FromSqlRaw(sql).ToListAsync(ct);
```

Good:

```csharp
var users = await _dbContext.Users
    .FromSql($"SELECT * FROM Users WHERE Email = {email}")
    .ToListAsync(ct);
```

Explicit parameter:

```csharp
var emailParameter = new SqlParameter("@email", email);

var users = await _dbContext.Users
    .FromSqlRaw("SELECT * FROM Users WHERE Email = @email", emailParameter)
    .ToListAsync(ct);
```

Rule:

> Values should be parameters. Do not concatenate untrusted input into SQL.

## Dynamic SQL Identifier Problem

Parameters work for values, not SQL identifiers.

This does not work as intended:

```csharp
var column = "Email";
var users = await _dbContext.Users
    .FromSql($"SELECT * FROM Users ORDER BY {column}")
    .ToListAsync(ct);
```

Column names cannot be normal SQL parameters.

Better:

```csharp
var orderBy = request.SortBy switch
{
    "email" => "Email",
    "createdAt" => "CreatedAt",
    _ => throw new ValidationException("Unsupported sort column.")
};

var sql = $"SELECT * FROM Users ORDER BY {orderBy}";
var users = await _dbContext.Users.FromSqlRaw(sql).ToListAsync(ct);
```

Why this is safe:

> The SQL identifier comes from a whitelist, not directly from user input.

## Raw SQL And Tracking

Raw SQL entity queries can still track entities.

```csharp
var orders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders WHERE Status = {status}")
    .AsNoTracking()
    .ToListAsync(ct);
```

Use `AsNoTracking` for read-only raw SQL queries.

## Complete Report Endpoint Example

Report row:

```csharp
public sealed class CustomerSalesReportRow
{
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public decimal TotalSales { get; set; }
    public int OrderCount { get; set; }
}
```

DbContext configuration:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<CustomerSalesReportRow>()
        .HasNoKey()
        .ToView(null);
}
```

Query service:

```csharp
public sealed class SalesReportService
{
    private readonly AppDbContext _dbContext;

    public SalesReportService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<CustomerSalesReportRow>> GetCustomerSalesAsync(
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken ct)
    {
        return await _dbContext.Set<CustomerSalesReportRow>()
            .FromSql($"""
                SELECT
                    c.Id AS CustomerId,
                    c.Name AS CustomerName,
                    SUM(o.Total) AS TotalSales,
                    COUNT(*) AS OrderCount
                FROM dbo.Customers c
                INNER JOIN dbo.Orders o ON o.CustomerId = c.Id
                WHERE o.CreatedAt >= {from}
                  AND o.CreatedAt < {to}
                GROUP BY c.Id, c.Name
                ORDER BY TotalSales DESC
            """)
            .AsNoTracking()
            .ToListAsync(ct);
    }
}
```

Controller:

```csharp
[ApiController]
[Route("api/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly SalesReportService _reports;

    public ReportsController(SalesReportService reports)
    {
        _reports = reports;
    }

    [HttpGet("customer-sales")]
    public async Task<ActionResult<IReadOnlyList<CustomerSalesReportRow>>> GetCustomerSales(
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        CancellationToken ct)
    {
        if (from >= to)
        {
            return BadRequest("`from` must be earlier than `to`.");
        }

        var rows = await _reports.GetCustomerSalesAsync(from, to, ct);
        return Ok(rows);
    }
}
```

Why this design is useful:

- input values are parameterized by `FromSql`;
- report shape is explicit through a keyless type;
- `AsNoTracking` avoids unnecessary tracking;
- raw SQL is isolated in a report service instead of scattered through controllers.

## Review Questions

### When would you use raw SQL in EF Core?

When LINQ is not expressive enough, when using database-specific features, when integrating with existing stored procedures, or when a reporting/performance query is clearer in SQL.

### How do you prevent SQL injection with raw SQL?

Use parameterized APIs such as interpolated `FromSql` or explicit parameters. Never concatenate untrusted input into SQL strings.

### What is a keyless entity?

A keyless entity maps query results that do not have a primary key, often used for views, reports, or stored procedure results.

### Are stored procedures always faster?

No. Performance depends on query shape, indexing, execution plan, parameter sniffing, and data volume. Stored procedures can help in some cases, but they are not automatically faster.

### Do migrations manage stored procedure changes automatically?

No. If you want migrations to deploy stored procedure changes, you usually script them with `migrationBuilder.Sql`.

## Common Mistakes

### Mistake: String concatenation with user input

Why it is wrong:

> It allows SQL injection.

Better answer:

> Use interpolated `FromSql` or explicit parameters.

### Mistake: Returning tracked entities from complex raw SQL unnecessarily

Why it is wrong:

> Tracking adds overhead and can behave unexpectedly if raw SQL returns duplicate entity keys.

Better answer:

> Use DTO/keyless types or `AsNoTracking` for read-only queries.

### Mistake: Using stored procedures for all business logic by default

Why it is wrong:

> Business rules become split across app code and database code, making testing and versioning harder.

Better answer:

> Use stored procedures deliberately for reporting, legacy integration, or database-specific performance needs.

### Mistake: Forgetting migrations do not manage stored procedure body automatically

Why it is wrong:

> Procedure changes may not deploy with the application.

Better answer:

> Version stored procedure scripts and include them in migrations or database deployment pipeline.

### Mistake: Trying to parameterize table or column names

Why it is wrong:

> SQL parameters represent values, not identifiers.

Better answer:

> Use a whitelist for dynamic identifiers.

## Practice Task

Create:

1. raw SQL query with parameter;
2. report keyless entity;
3. stored procedure call;
4. unsafe SQL injection example and fix;
5. dynamic sort using whitelist;
6. integration test for raw SQL query.
