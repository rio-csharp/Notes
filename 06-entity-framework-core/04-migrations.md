# Migrations And Schema Evolution

## Core Idea

EF Core migrations are versioned schema changes generated from model evolution. In small projects they can feel like a development convenience. In serious systems they are deployment artifacts that carry operational risk. The difference matters. A migration is not only a piece of source code. It is a database change that may lock tables, rewrite large amounts of data, invalidate application assumptions, or break rolling deployments. Migrations must be treated as part of production engineering rather than as a local developer tool.

## The Migration Model

At a basic level, EF Core compares the current model with the model snapshot and generates a migration describing the difference.

```bash
dotnet ef migrations add InitialCreate
dotnet ef migrations list
dotnet ef migrations remove
dotnet ef database update
dotnet ef database update LastGoodMigration
dotnet ef migrations script
dotnet ef migrations script --idempotent
```

`migrations list` shows which migrations exist in the project and which have been applied to the target database. `migrations remove` deletes the most recent migration before it has been applied, which is useful during development when the migration has not yet been deployed. `database update` with a specific migration name rolls the database back to that migration, applying `Down` for any later migrations that had been applied.

A migration contains two directions:

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

`Up` moves the schema forward. `Down` attempts to reverse that change. In practice, the existence of a `Down` method should not be mistaken for a guaranteed safe rollback story. Some schema and data changes are not reversibly safe in operational reality.

## Migration History Table

EF Core records applied migrations in a history table, typically named `__EFMigrationsHistory`. The table name and schema can be configured:

```csharp
optionsBuilder.UseSqlServer(connectionString, options =>
{
    options.MigrationsHistoryTable("__MyMigrationsHistory", "admin");
});
```

This is relevant when multiple `DbContext` types share the same database and each needs its own migration history, or when organizational conventions require a specific schema for infrastructure tables.

## Development-Time Schema Creation

For local development and testing, `EnsureCreated` creates the database schema from the model without using migrations:

```csharp
await _dbContext.Database.EnsureCreatedAsync(ct);
```

This is faster than running migrations during rapid prototyping. However, `EnsureCreated` does not produce migration files or a migration history table, so it cannot evolve the schema later. Once the model stabilizes, the team should generate an initial migration and switch to the migration workflow.

## Model Snapshot And Migration History

EF Core keeps a model snapshot in source control and records applied migrations in the database, usually through `__EFMigrationsHistory`.

Those two mechanisms serve different purposes:

- the snapshot helps EF compute the next schema delta;
- the history table tells EF which migrations a database has already applied.

That history is what makes idempotent scripts possible and what keeps multiple environments from blindly replaying the same schema change.

## Migration Transaction Behavior

By default, EF Core wraps each migration in its own transaction. This means that if a migration fails partway through, its DDL statements are rolled back, but already-applied earlier migrations remain committed. This is usually the correct behavior: partial application of a single migration is not recoverable, but the overall migration history advances only when a migration completes successfully.

Each migration already executes inside one transaction, so manually adding `BEGIN TRANSACTION` and `COMMIT` inside a migration method is unnecessary. All DDL statements within a single migration already succeed or fail together.

For migrations that mix schema changes with large data updates, transaction log growth is a real concern. Providers may offer batching or online DDL options (such as `ONLINE = ON` in SQL Server Enterprise) that affect how migration commands interact with user traffic.

## Generated Migrations Still Require Review

The generated migration is a starting point, not a final authority. EF Core can infer many schema changes correctly, but it cannot understand operational intent the way an experienced engineer or database reviewer can.

Generated output should be reviewed especially for:

- destructive drops;
- drop-and-add sequences that should really be renames;
- type narrowing;
- nullable-to-non-nullable transitions without backfill;
- expensive index rebuilds;
- unexpected cascade changes.

For example, a rename can be misdetected as drop plus add:

```text
Rename FullName -> DisplayName
EF generates DropColumn FullName + AddColumn DisplayName
```

That would lose data. The migration should be corrected:

```csharp
migrationBuilder.RenameColumn(
    name: "FullName",
    table: "Users",
    newName: "DisplayName");
```

The broader principle is simple: migrations represent database intent, not only model differences.

## Production Execution Strategy

Automatically applying migrations on application startup may be acceptable in local development, prototypes, or small internal systems. It is often the wrong default for production.

The risk comes from several directions:

- multiple instances may attempt migration concurrently;
- schema changes may require elevated permissions the app should not normally hold;
- a failed migration can block startup of the application;
- long-running DDL can interfere with user traffic;
- operational teams may need review and coordination before schema changes execute.

For production systems, reviewed SQL scripts, migration bundles, or pipeline-driven deployment steps are usually safer because they separate schema rollout from application boot.

## Idempotent Scripts And Controlled Deployment

An idempotent script applies only the migrations that a target database has not yet recorded in migration history:

```bash
dotnet ef migrations script --idempotent
```

This is especially useful when environments are not guaranteed to be on the exact same version at deployment time. It also fits CI/CD pipelines well because the script can be reviewed, archived, and executed with a controlled operator workflow.

Idempotence does not remove the need for review. It only makes the execution path more adaptable across environments.

## Expand-Contract For Backward Compatibility

The most important migration pattern for modern deployment is expand-contract.

Suppose `Name` is being replaced by `FullName`. A direct rename may break rolling deployment because old code and new code may coexist during rollout. The safer path is:

1. add the new column;
2. deploy code that can write both;
3. backfill existing data;
4. switch reads to the new column;
5. remove the old column only after the old version is gone.

The first migration expands the schema:

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
}
```

The application temporarily writes both:

```csharp
user.Name = request.FullName;
user.FullName = request.FullName;
```

Then a backfill step can populate the new column:

```csharp
migrationBuilder.Sql("""
    UPDATE Users
    SET FullName = Name
    WHERE FullName IS NULL
""");
```

Only after the new application version is fully stable should the cleanup migration remove the old column. Delaying cleanup is not wasted ceremony. It is what makes rollback and mixed-version deployment survivable.

## Data Migrations And Table Scale

Migrations may also include data updates:

```csharp
migrationBuilder.Sql("""
    UPDATE Orders
    SET Status = 'Submitted'
    WHERE Status IS NULL
""");
```

This is where migration work becomes operationally sensitive. Large updates can:

- lock tables;
- fill transaction logs;
- trigger long-running replication or CDC side effects;
- exceed maintenance windows.

For large datasets, a one-shot data migration may be the wrong mechanism. Batching, online backfill jobs, or staged rollout logic may be safer than placing the entire transformation inside one deployment-time transaction.

## Index Changes And Operational Cost

Index creation and rebuilds are often among the most expensive migration operations on large tables.

```csharp
migrationBuilder.CreateIndex(
    name: "IX_Orders_Status_CreatedAt",
    table: "Orders",
    columns: new[] { "Status", "CreatedAt" });
```

Even when the generated migration is correct, the operational question remains:

- how long will it run;
- will it lock writes or reads;
- does the provider support online options;
- is the table large enough that rollout must be staged?

Provider-specific SQL is sometimes justified when the generic migration API cannot express the exact operational requirement.

## Rollback, Forward Fixes, And Reality

Database rollback is not always "run `Down` and continue." If the new schema has already accepted new writes, or if a migration removed or transformed data, the cleanest recovery path may be a forward fix rather than a literal rollback.

That is why backward-compatible schema evolution is so valuable. If new application code can tolerate the old schema for a while, and old code can tolerate the expanded schema, the team gains room to roll back binaries or pause rollout without immediate database surgery.

The best migration strategy is often the one that makes emergency rollback unnecessary.

## Design-Time Context Creation

The EF CLI needs a way to construct the `DbContext` at design time. In simple applications it can often infer that from the startup project. In more complex solutions, a design-time factory is clearer:

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

This keeps migration generation predictable even when the application startup path has complex runtime dependencies.

## Migration Bundles

EF Core can also produce a migration bundle:

```bash
dotnet ef migrations bundle --self-contained -r win-x64
```

That executable can then be run against a target database with a supplied connection string. Bundles are useful because they separate migration execution from application startup and avoid requiring the full SDK on the target machine.

## Design Consequences

Good migration discipline comes from treating schema evolution as part of release engineering. Review the generated change, understand its operational cost, prefer backward-compatible rollout patterns, and avoid conflating "the migration compiles" with "the migration is safe to run in production."

That mindset turns migrations from a fragile ORM convenience into a reliable part of system change management.
