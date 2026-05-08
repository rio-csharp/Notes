# Raw SQL, Stored Procedures, And Database-Specific Paths

## Core Idea

LINQ should be the default query surface in EF Core, but it is not the only one. There are legitimate cases where raw SQL or stored procedures are the better tool: provider-specific functionality, reporting queries, complex hand-tuned statements, legacy database integration, or set-based operations that are clearer in SQL than in LINQ.

Raw SQL should remain deliberate, parameterized, and isolated to the places where relational specificity is genuinely part of the design.

## LINQ First, SQL When Justified

Raw SQL is not a mark of sophistication by itself. In many codebases it becomes a symptom of unclear query ownership or limited familiarity with EF Core's query capabilities. The better default is:

- use LINQ for ordinary application queries;
- use raw SQL when translation, provider features, or measured performance justify it;
- keep the SQL boundary explicit.

This preserves the benefits of EF Core while still acknowledging that relational systems sometimes need relationally direct expression.

## SQL Query Limitations

When returning entity types from raw SQL, several constraints apply. The query must return data for all properties of the entity type -- partial column sets are not supported for entity materialization. Column names in the result set must match the column names that properties are mapped to in the model, not the property names themselves. Finally, `FromSql` can only be called directly on a `DbSet<T>`, not composed over an arbitrary LINQ query.

## Scalar SQL Queries

For read operations that need only single values or non-entity results, EF Core provides `SqlQuery<T>`:

```csharp
var totals = await _dbContext.Database
    .SqlQuery<decimal>($"SELECT [Total] FROM [Orders] WHERE [Status] = {status}")
    .ToListAsync(ct);
```

This returns scalar results without requiring a keyless entity type. The output column must be named according to the target type's mapping -- for primitive types, aliasing the column as `Value` enables LINQ composition over the SQL query.

The raw variant `SqlQueryRaw` supports dynamically constructed SQL for the same scenarios, following the same safety rules as `FromSqlRaw`.

## `FromSql` And Parameterization

EF Core provides two forms for raw SQL entity queries:

```csharp
// Preferred: interpolated string, automatically parameterized
var orders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders WHERE Status = {status}")
    .ToListAsync(ct);

// Explicit: raw string with separate parameters
var orders = await _dbContext.Orders
    .FromSqlRaw("SELECT * FROM Orders WHERE Status = {0}", status)
    .ToListAsync(ct);
```

`FromSql` (interpolated) converts its arguments to `DbParameter` instances automatically. `FromSqlRaw` requires the caller to supply parameter values separately. The interpolated form is generally preferred because it makes parameterization harder to forget.

Interpolated `FromSql` parameterizes values rather than concatenating them into the SQL text. That distinction is critical. Raw SQL is only acceptable if untrusted values remain parameters.

By contrast, this is unsafe:

```csharp
var sql = "SELECT * FROM Orders WHERE Status = '" + status + "'";
```

The design rule is straightforward: values may vary through parameters; SQL structure should not be assembled from untrusted input.

## Commands And Set-Based Operations

EF Core also supports raw SQL commands through the same interpolated and raw variants:

```csharp
// Interpolated, automatically parameterized
await _dbContext.Database.ExecuteSqlAsync(
    $"UPDATE Orders SET Status = {"Expired"} WHERE CreatedAt < {cutoff}");

// Raw with separate parameters
await _dbContext.Database.ExecuteSqlRawAsync(
    "UPDATE Orders SET Status = {0} WHERE CreatedAt < {1}",
    "Expired", cutoff);
```

These commands are useful for maintenance operations, data fixes, or set-based actions that are clearer or more provider-specific than what LINQ expresses well.

Even here, raw SQL should not be the first reflex. Modern EF Core also offers `ExecuteUpdateAsync` and `ExecuteDeleteAsync`, which often cover the set-based scenario while preserving provider translation and type safety.

## Stored Procedures

Stored procedures are most relevant when:

- the database already exposes an established procedural contract;
- the database team owns part of the logic;
- operational control or legacy integration makes procedures the existing boundary;
- reporting or provider-specific plan control is more naturally expressed in SQL.

They should not be assumed faster by default. Performance depends on plan quality, indexing, data volume, and query semantics, not on procedure syntax alone.

Stored procedures can also be versioned through migrations when the team wants schema and procedural changes to evolve together:

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
}
```

That said, once procedure bodies become part of the system, application reasoning is no longer purely code-centric. Testing and operational review must include the database layer as a first-class component.

## Keyless Read Models

Raw SQL often pairs naturally with keyless entity types for reporting or view-like result sets:

```csharp
public sealed class SalesReportRow
{
    public string Month { get; set; } = "";
    public decimal Total { get; set; }
}
```

```csharp
modelBuilder.Entity<SalesReportRow>()
    .HasNoKey();
```

```csharp
var report = await _dbContext.Set<SalesReportRow>()
    .FromSql($"EXEC dbo.GetMonthlySalesReport {year}")
    .ToListAsync(ct);
```

Keyless types work well when the result is genuinely read-oriented and does not represent an updatable aggregate root. They allow the application to keep a typed shape without pretending the result is a normal tracked entity.

## Composability And Its Limits

Some raw SQL queries can still be composed with LINQ:

```csharp
var recentPaidOrders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders")
    .Where(o => o.Status == OrderStatus.Paid)
    .OrderByDescending(o => o.CreatedAt)
    .Take(20)
    .ToListAsync(ct);
```

This can be useful, but it should not be assumed universally. Composability works only when the SQL is itself a valid subquery -- a `SELECT` statement without trailing semicolons, query-level hints, or non-subquery-compatible `ORDER BY` clauses. Stored procedure calls cannot be composed at all on SQL Server: any attempt to apply additional LINQ operators after `FromSql` on a stored procedure produces invalid SQL. In that case, `AsEnumerable` or `AsAsyncEnumerable` must be used right after `FromSql` to force client-side composition.

That boundary should be respected. If the query is fundamentally SQL-defined, it is often clearer to keep the surrounding application logic SQL-aware at that point rather than pretending the entire path remains ordinary LINQ composition.

## Dynamic SQL And Identifier Safety

Parameterization solves value safety, not identifier safety. Table names, column names, and sort directions are part of SQL structure and cannot be treated as normal parameters.

If the application must vary identifiers, the safe approach is whitelisting:

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

The whitelist is what makes the variation safe. Without that restriction, the code would be exposing SQL structure to untrusted input.

## Tracking And Raw SQL

Raw SQL entity queries still participate in EF Core tracking unless the application disables it:

```csharp
var orders = await _dbContext.Orders
    .FromSql($"SELECT * FROM Orders WHERE Status = {status}")
    .AsNoTracking()
    .ToListAsync(ct);
```

This matters because the SQL surface changes, but the `DbContext` behavior around tracking, identity resolution, and save boundaries still applies. Raw SQL is a different query authoring path, not a separate persistence runtime.

## Design Consequences

Raw SQL and stored procedures should be treated as explicit relational boundaries in the application. They are most successful when they remain parameterized, scoped to the places where SQL-level specificity is genuinely valuable, and paired with clear typed models such as keyless read shapes.

Used well, they complement EF Core. Used casually, they undermine the clarity EF Core is supposed to provide by scattering ad hoc SQL through the codebase. The difference is not the presence of SQL. It is whether the boundary is intentional.
