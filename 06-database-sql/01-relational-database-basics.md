# Relational Databases And Data Integrity

## Core Idea

A relational database stores data in tables, but its real value is not table storage by itself. Its value lies in how keys, constraints, and declarative queries allow data to remain consistent while multiple applications and users read and modify it over time. A relational system is therefore not just a persistence container. It is an integrity system.

This opening chapter establishes the relational model at the level needed for the rest of the database section. The focus is not on memorizing terminology. It is on understanding why primary keys, foreign keys, uniqueness rules, defaults, and checks matter even when an application already contains validation logic.

## Tables, Rows, And Columns

Relational databases organize data into tables composed of rows and columns.

```text
Orders
  Id
  CustomerId
  Status
  Total
  CreatedAt
```

That representation looks simple, but its engineering strength comes from the fact that rows of one table can be connected to rows of another through keys and constraints rather than through ad hoc application conventions.

## Primary Keys

A primary key uniquely identifies a row within its table.

```sql
CREATE TABLE Customers
(
    Id INT IDENTITY PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL
);
```

This sounds elementary, but key choice has consequences. The key becomes part of how other tables reference the row, how indexes are built, how updates are targeted, and how application code reasons about identity. A primary key is therefore both a relational constraint and a design decision.

## Foreign Keys

A foreign key expresses that rows in one table must correspond to rows in another.

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    CustomerId INT NOT NULL,
    CONSTRAINT FK_Orders_Customers
        FOREIGN KEY (CustomerId) REFERENCES Customers(Id)
);
```

This constraint does more than support joins. It prevents the database from accepting an order that refers to a customer row that does not exist. That is one of the fundamental advantages of relational design: referential integrity does not depend entirely on application correctness.

## Constraints As Database-Level Invariants

Relational databases use constraints to protect data invariants at the storage boundary.

Common constraint types include:

- primary key;
- foreign key;
- unique;
- check;
- default;
- not null.

```sql
CREATE TABLE Products
(
    Id INT IDENTITY PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Price DECIMAL(18, 2) NOT NULL,
    CONSTRAINT CK_Products_Price_Positive CHECK (Price >= 0)
);
```

This matters because application validation is not enough on its own. Services change, background jobs appear, bulk scripts get written, and bugs happen. Constraints provide a final line of defense when invalid data attempts to cross the database boundary.

## A Small Relational Schema

The following example is small enough to study directly, but rich enough to show how keys and constraints work together:

```sql
CREATE TABLE Customers
(
    Id INT IDENTITY(1,1) NOT NULL,
    Email NVARCHAR(320) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Customers_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Customers PRIMARY KEY (Id),
    CONSTRAINT UQ_Customers_Email UNIQUE (Email)
);

CREATE TABLE Products
(
    Id INT IDENTITY(1,1) NOT NULL,
    Sku NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Price DECIMAL(18, 2) NOT NULL,
    CONSTRAINT PK_Products PRIMARY KEY (Id),
    CONSTRAINT UQ_Products_Sku UNIQUE (Sku),
    CONSTRAINT CK_Products_Price CHECK (Price >= 0)
);

CREATE TABLE Orders
(
    Id INT IDENTITY(1,1) NOT NULL,
    CustomerId INT NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    Total DECIMAL(18, 2) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Orders PRIMARY KEY (Id),
    CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId) REFERENCES Customers(Id),
    CONSTRAINT CK_Orders_Total CHECK (Total >= 0)
);

CREATE TABLE OrderItems
(
    Id INT IDENTITY(1,1) NOT NULL,
    OrderId INT NOT NULL,
    ProductId INT NOT NULL,
    ProductNameSnapshot NVARCHAR(200) NOT NULL,
    UnitPriceSnapshot DECIMAL(18, 2) NOT NULL,
    Quantity INT NOT NULL,
    CONSTRAINT PK_OrderItems PRIMARY KEY (Id),
    CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (OrderId) REFERENCES Orders(Id),
    CONSTRAINT FK_OrderItems_Products FOREIGN KEY (ProductId) REFERENCES Products(Id),
    CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_OrderItems_UnitPrice CHECK (UnitPriceSnapshot >= 0)
);
```

This schema already demonstrates several design principles:

- surrogate keys identify rows efficiently;
- unique constraints protect natural identifiers such as email and SKU;
- check constraints reject invalid numeric values;
- foreign keys keep relationships valid;
- snapshot columns preserve business history instead of blindly mirroring current product state.

That last point is especially important. Relational modeling is not only about removing duplication. It is also about preserving the right historical meaning.

## Nullability And Required Data

Nullability is one of the simplest but most important schema decisions. A `NOT NULL` column states that the database must always receive a value. A nullable column states that the absence of a value is meaningful or unavoidable.

Those choices should reflect business truth rather than developer convenience. Allowing `NULL` too freely weakens invariants. Forcing `NOT NULL` everywhere can create fake placeholder values that are even more misleading than nulls.

## Defaults And Consistent Writes

Default constraints make the database responsible for supplying values when callers omit them.

```sql
CreatedAt DATETIME2 NOT NULL
    CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME()
```

Defaults are useful because they reduce drift between different write paths. If multiple services, jobs, or migration scripts insert rows, a database-level default produces more consistent behavior than requiring every caller to remember the same rule.

The trade-off is that defaults should remain understandable. Too much hidden write behavior in the database can make application behavior harder to reason about.

## Views And Stored Procedures

Relational systems also expose programmable boundaries such as views and stored procedures.

A view is a saved query:

```sql
CREATE VIEW ActiveCustomers AS
SELECT Id, Name
FROM Customers
WHERE IsActive = 1;
```

A stored procedure is executable database-side logic:

```sql
CREATE PROCEDURE GetOrdersByCustomer
    @CustomerId INT
AS
BEGIN
    SELECT Id, Total, CreatedAt
    FROM Orders
    WHERE CustomerId = @CustomerId;
END
```

These constructs are useful, but they should be understood as optional relational tools rather than as the center of the relational model. The foundation remains keys, constraints, and queryable tables.

## Design Consequences

Relational databases are strongest when integrity is enforced in the schema instead of being treated as an application hope. Primary keys define identity, foreign keys protect relationships, unique constraints guard natural business rules, and checks reject invalid states at the storage boundary.

Once that mindset is in place, later topics such as joins, indexing, transactions, and query tuning become easier to reason about because they are all operating on a model whose structure already expresses real constraints rather than loosely organized data.
