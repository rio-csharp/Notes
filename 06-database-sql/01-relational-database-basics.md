# Relational Database Basics

## Core Idea

A relational database stores data in tables and uses relationships, constraints, and SQL to manage and query data.

Chinese notes:

- `relational database`: 关系型数据库.
- `table`: 表.
- `row`: 行.
- `column`: 列.
- `constraint`: 约束.

## Table, Row, Column

Table:

```text
Orders
```

Columns:

```text
Id, CustomerId, Status, Total, CreatedAt
```

Rows:

```text
1, 100, Paid, 99.99, 2026-04-28
```

## Primary Key

Primary key uniquely identifies each row.

```sql
CREATE TABLE Customers
(
    Id INT IDENTITY PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL
);
```

## Foreign Key

Foreign key links one table to another.

```sql
CREATE TABLE Orders
(
    Id INT IDENTITY PRIMARY KEY,
    CustomerId INT NOT NULL,
    CONSTRAINT FK_Orders_Customers
        FOREIGN KEY (CustomerId) REFERENCES Customers(Id)
);
```

## Constraints

Common constraints:

- primary key;
- foreign key;
- unique;
- check;
- default;
- not null.

Example:

```sql
CREATE TABLE Products
(
    Id INT IDENTITY PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Price DECIMAL(18, 2) NOT NULL,
    CONSTRAINT CK_Products_Price_Positive CHECK (Price >= 0)
);
```

## Complete Mini Schema

The following schema is small enough to learn from, but realistic enough to practice relationships and constraints.

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

Seed data:

```sql
INSERT INTO Customers (Email, Name)
VALUES
    ('alice@example.com', 'Alice'),
    ('bob@example.com', 'Bob');

INSERT INTO Products (Sku, Name, Price)
VALUES
    ('KB-001', 'Keyboard', 50.00),
    ('MS-001', 'Mouse', 25.00);

INSERT INTO Orders (CustomerId, Status, Total)
VALUES
    (1, 'Paid', 100.00),
    (1, 'Draft', 25.00);

INSERT INTO OrderItems (OrderId, ProductId, ProductNameSnapshot, UnitPriceSnapshot, Quantity)
VALUES
    (1, 1, 'Keyboard', 50.00, 2),
    (2, 2, 'Mouse', 25.00, 1);
```

Basic query:

```sql
SELECT
    o.Id AS OrderId,
    c.Email,
    o.Status,
    o.Total,
    o.CreatedAt
FROM Orders o
INNER JOIN Customers c ON c.Id = o.CustomerId
ORDER BY o.CreatedAt DESC;
```

What this schema demonstrates:

- primary keys identify rows;
- foreign keys protect relationships;
- unique constraints protect natural uniqueness;
- check constraints reject invalid values;
- default constraints give consistent values when callers omit fields;
- snapshot columns preserve order history even if product names or prices change later.

## Views

A view is a saved query.

```sql
CREATE VIEW ActiveCustomers AS
SELECT Id, Name
FROM Customers
WHERE IsActive = 1;
```

Use views for:

- simplifying complex queries;
- reporting;
- security boundaries.

## Stored Procedures

Stored procedure is database-side executable SQL.

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

## Review Questions

### What is a relational database?

> A relational database stores data in tables and uses keys, constraints, and SQL to model relationships and query data.

### Primary key vs foreign key?

> Primary key uniquely identifies a row in its table. Foreign key references a primary or unique key in another table and enforces relationship integrity.

### Why use constraints?

> Constraints protect data integrity at the database level, even if application code has bugs.

## Common Mistakes

- No foreign keys in relational design.
- Using strings as primary keys without reason.
- Allowing invalid data that only application code prevents.
- No unique constraint for natural unique values like email.
- Treating database as just a file store.
