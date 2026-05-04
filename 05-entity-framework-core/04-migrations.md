# EF Core Migrations

## Core Idea

EF Core migrations track database schema changes over time.

Chinese notes:

- `migration`: 数据库迁移.
- `schema`: 数据库结构.
- `rollback`: 回滚.
- `idempotent script`: 幂等脚本, safe to run when some migrations may already be applied.
- `expand-contract`: 扩展-收缩, a zero-downtime schema change pattern.

Migrations help keep the application model and database schema in sync.

Key takeaway:

> In production, I treat migrations as database deployment artifacts. I review generated SQL, consider locks and data volume, and design backward-compatible changes for rolling deployments.

## Basic Commands

Add migration:

```bash
dotnet ef migrations add InitialCreate
```

Apply to database:

```bash
dotnet ef database update
```

Rollback to previous migration:

```bash
dotnet ef database update PreviousMigrationName
```

Generate SQL script:

```bash
dotnet ef migrations script
```

Generate idempotent script:

```bash
dotnet ef migrations script --idempotent
```

Idempotent scripts are useful for deployment pipelines because they check migration history before applying changes.

## Migration File

```csharp
public partial class AddOrderStatus : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Status",
            table: "Orders",
            type: "nvarchar(30)",
            nullable: false,
            defaultValue: "Draft");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Status",
            table: "Orders");
    }
}
```

`Up` applies changes.

`Down` reverts changes.

## Model Snapshot

EF Core keeps a model snapshot file.

Conceptually:

```text
Current EF model
  compared with
Model snapshot
  -> generates new migration
```

Important:

> Do not randomly edit or delete migration files after they have been applied to shared environments. Migration history must remain consistent across developers, CI, and production.

## Migration History Table

EF Core records applied migrations in a table, usually:

```text
__EFMigrationsHistory
```

This table lets EF know which migrations have already been applied.

Idempotent scripts use this history to avoid reapplying migrations.

## Production Migration Strategy

For production, avoid blindly running migrations from app startup for critical systems.

Safer options:

- generate SQL script;
- review SQL;
- run in deployment pipeline;
- backup before risky schema changes;
- monitor after deployment;
- separate destructive changes;
- test on production-like data volume;
- coordinate with rolling deployment strategy.

Why startup migrations are risky:

- multiple app instances may try to migrate at once;
- migrations can require elevated database permissions;
- failed migrations can stop app startup;
- long schema changes can block user traffic;
- schema changes should often be reviewed by database owners or experienced engineers.

Acceptable cases:

> Startup migrations may be fine for local development, prototypes, or small internal apps. For serious production systems, reviewed scripts are safer.

## Zero-downtime Migration Pattern

For breaking changes, use expand-contract.

Example: rename column `Name` to `FullName`.

Bad:

```text
Deploy migration that renames column
Deploy app that uses new column
```

This can break during rolling deployment because old app instances may still read `Name` while new app instances read `FullName`.

Better:

1. Add new nullable column `FullName`.
2. Deploy app writing both `Name` and `FullName`.
3. Backfill data.
4. Deploy app reading `FullName`.
5. Stop writing `Name`.
6. Remove old `Name` column later.

This keeps old and new application versions compatible during deployment.

Migration step 1: expand schema.

```csharp
public partial class AddFullNameToUsers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "FullName",
            table: "Users",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "FullName",
            table: "Users");
    }
}
```

Temporary application write path:

```csharp
user.Name = request.FullName;
user.FullName = request.FullName;
```

Backfill migration:

```csharp
public partial class BackfillUserFullName : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE Users
            SET FullName = Name
            WHERE FullName IS NULL
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE Users
            SET FullName = NULL
        """);
    }
}
```

Final cleanup after all app instances read `FullName`:

```csharp
public partial class DropOldUserNameColumn : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Name",
            table: "Users");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Name",
            table: "Users",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: true);
    }
}
```

Key point:

> The cleanup migration is intentionally delayed. Removing old schema too early is what breaks rolling deployments.

## Data Migration

Migrations can include data updates:

```csharp
migrationBuilder.Sql("""
    UPDATE Orders
    SET Status = 'Submitted'
    WHERE Status IS NULL
""");
```

Be careful:

- large updates can lock tables;
- large transactions can fill logs;
- data changes may need batching;
- test on production-like data;
- consider background backfill for very large tables.

Batching idea:

```sql
WHILE 1 = 1
BEGIN
    UPDATE TOP (1000) Orders
    SET Status = 'Submitted'
    WHERE Status IS NULL;

    IF @@ROWCOUNT = 0 BREAK;
END
```

## Index Migrations

Adding an index can be expensive on large tables.

Example:

```csharp
migrationBuilder.CreateIndex(
    name: "IX_Orders_Status_CreatedAt",
    table: "Orders",
    columns: new[] { "Status", "CreatedAt" });
```

Key point:

> Index creation can lock or slow a large table depending on database edition/options. I review the generated SQL and choose online index creation if supported and required.

Provider-specific SQL can be used when EF's fluent migration API does not expose the exact option needed.

SQL Server example:

```csharp
migrationBuilder.Sql("""
    CREATE INDEX IX_Orders_Status_CreatedAt
    ON dbo.Orders (Status, CreatedAt DESC)
    INCLUDE (Total)
    WITH (ONLINE = ON)
""");
```

Important:

> `ONLINE = ON` depends on SQL Server edition/version and workload. Always test the generated SQL against a production-like database.

## Dangerous Generated Changes

Always review migrations for:

- drop column;
- drop table;
- rename detected as drop/add;
- column type narrowing;
- nullable to non-nullable without default/backfill;
- large default constraints;
- cascade delete changes;
- index rebuilds on huge tables.

Example risk:

```text
Rename FullName -> DisplayName
EF generates DropColumn FullName + AddColumn DisplayName
Data is lost unless migration is corrected
```

Better:

```csharp
migrationBuilder.RenameColumn(
    name: "FullName",
    table: "Users",
    newName: "DisplayName");
```

## Rollback Strategy

Rollback is not always simply running `Down`.

Consider:

- was data deleted?
- did the app write new data in a new format?
- are old binaries compatible with new schema?
- should rollback be app rollback, database rollback, or forward fix?

Engineering perspective:

> I prefer backward-compatible migrations so application rollback is possible without emergency database rollback. Destructive schema cleanup happens after the new version is stable.

## Design-time DbContext Creation

The EF CLI needs to create your `DbContext` at design time.

For simple apps, EF can often discover it from `Program.cs`. For more complex apps, use a design-time factory:

```csharp
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=localhost;Database=OrdersDb;Trusted_Connection=True;TrustServerCertificate=True")
            .Options;

        return new AppDbContext(options);
    }
}
```

Use a design-time factory when:

- the app has complex startup dependencies;
- configuration is difficult to load from the CLI;
- migrations live in a separate project;
- design-time creation should be explicit and predictable.

## Migration Bundle

EF Core can create an executable migration bundle for deployment.

```bash
dotnet ef migrations bundle --self-contained -r win-x64
```

Run the generated executable with a connection string:

```bash
efbundle.exe --connection "Server=prod;Database=OrdersDb;..."
```

Why this can be useful:

- deployment machines do not need the .NET SDK;
- migration execution is separated from app startup;
- the bundle can be reviewed, stored, and executed by a deployment pipeline.

## Review Questions

### What are EF Core migrations?

Migrations are versioned schema changes generated from EF Core model changes. They let teams evolve database structure consistently over time.

### Should applications run migrations automatically on startup?

It can be acceptable for small internal apps, but for production systems I prefer reviewed scripts in CI/CD to reduce risk and control timing.

### How do you handle zero-downtime schema changes?

Use expand-contract: add new schema in a backward-compatible way, deploy app changes gradually, backfill data, switch reads, then remove old schema later.

### What is an idempotent migration script?

An idempotent script checks migration history and applies only migrations that have not already been applied. It is useful when environments may be at different migration versions.

### Why review generated migrations?

Because EF may generate destructive operations, expensive table changes, or drop/add instead of rename. Database schema changes can cause data loss or downtime.

## Common Mistakes

### Mistake: Deleting migration files manually after deployment

Why it is wrong:

> Other environments and developers may still depend on the migration history.

Better answer:

> Keep applied migrations. If cleanup is needed, plan a baseline strategy carefully.

### Mistake: Running destructive migrations without backup

Why it is wrong:

> Dropped data may not be recoverable.

Better answer:

> Back up first and separate destructive cleanup from initial deployment.

### Mistake: Renaming columns without checking generated SQL

Why it is wrong:

> EF may interpret rename as drop/add, causing data loss.

Better answer:

> Review and use `RenameColumn` when appropriate.

### Mistake: Large data updates in one transaction

Why it is wrong:

> It can lock tables, grow transaction logs, and block production traffic.

Better answer:

> Use batching or background backfill.

### Mistake: Startup migrations across multiple app instances

Why it is wrong:

> Multiple instances may compete to modify schema at startup.

Better answer:

> Apply migrations through a controlled deployment pipeline.

### Mistake: No rollback plan

Why it is wrong:

> Failed database deployments are high-risk and often harder to undo than app deployments.

Better answer:

> Prefer backward-compatible changes and define rollback/forward-fix strategy before deployment.

## Practice Task

Create migrations for:

1. initial order table;
2. add status column;
3. add index;
4. backfill data;
5. generate idempotent script;
6. design expand-contract rename;
7. identify whether the generated SQL has any destructive operation.
