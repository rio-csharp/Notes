# Admin Dashboard Scenario

## Core Idea

An admin dashboard is an internal operational interface for managing users, permissions, records, workflows, settings, audit logs, imports, exports, and support actions.

Admin dashboards should be efficient, safe, and traceable. They are often used by internal teams repeatedly throughout the day.

## Common Features

- login;
- user management;
- role and permission management;
- searchable data tables;
- create/edit forms;
- detail pages;
- bulk actions;
- import/export;
- audit logs;
- dashboard metrics;
- file upload;
- system settings;
- tenant switch or tenant support tools;
- background job status;
- notification templates.

## Design Goals

Admin dashboards should optimize for:

- fast scanning;
- predictable navigation;
- strong permission boundaries;
- safe destructive actions;
- clear loading/error/empty states;
- auditability;
- useful filters;
- reliable exports;
- accessibility.

This kind of UI should usually be quiet and work-focused, not marketing-style.

## Backend API Design

Users:

```http
GET /api/admin/users?page=1&pageSize=20&search=alice&status=active&sort=-createdAt
POST /api/admin/users
GET /api/admin/users/123
PUT /api/admin/users/123
POST /api/admin/users/123/disable
POST /api/admin/users/123/enable
```

Roles:

```http
GET /api/admin/roles
POST /api/admin/roles
PUT /api/admin/roles/1
PUT /api/admin/roles/1/permissions
```

Audit logs:

```http
GET /api/admin/audit-logs?actorUserId=123&action=user.disabled&from=2026-01-01&to=2026-02-01
```

Exports:

```http
POST /api/admin/exports/users
GET /api/admin/exports/exp_123
GET /api/admin/exports/exp_123/download
```

## Frontend Page Structure

```text
AdminLayout
  Sidebar
  Header
  Breadcrumb
  PageContent

Pages:
  UsersPage
  UserDetailPage
  RolesPage
  AuditLogsPage
  SettingsPage
  ExportJobsPage
```

URL state is useful for shareable filters:

```text
/admin/users?page=2&search=alice&status=active&sort=-createdAt
```

## Data Table Requirements

A production admin table usually needs:

- server-side pagination;
- sorting;
- filtering;
- search;
- column formatting;
- row actions;
- loading state;
- empty state;
- error state;
- permission-based actions;
- export;
- persisted filters in URL;
- keyboard-accessible controls;
- stable column widths;
- clear total count or approximate count.

Avoid loading all data into the browser for large tables.

## Search Request Model

```csharp
public sealed record UserSearchRequest(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    string? Status = null,
    string Sort = "-createdAt");
```

Validate paging:

```csharp
public static class Paging
{
    public static int NormalizePage(int page)
    {
        return page < 1 ? 1 : page;
    }

    public static int NormalizePageSize(int pageSize)
    {
        return Math.Clamp(pageSize, 1, 200);
    }
}
```

## Backend Query Example

```csharp
public async Task<PagedResult<UserListItemDto>> SearchUsersAsync(
    UserSearchRequest request,
    CancellationToken ct)
{
    var page = Paging.NormalizePage(request.Page);
    var pageSize = Paging.NormalizePageSize(request.PageSize);

    var query = _db.Users.AsNoTracking();

    if (!string.IsNullOrWhiteSpace(request.Search))
    {
        var search = request.Search.Trim();
        query = query.Where(u =>
            u.Email.Contains(search) ||
            u.DisplayName.Contains(search));
    }

    if (!string.IsNullOrWhiteSpace(request.Status))
    {
        query = query.Where(u => u.Status == request.Status);
    }

    query = request.Sort switch
    {
        "createdAt" => query.OrderBy(u => u.CreatedAt),
        "-createdAt" => query.OrderByDescending(u => u.CreatedAt),
        "email" => query.OrderBy(u => u.Email),
        "-email" => query.OrderByDescending(u => u.Email),
        _ => query.OrderByDescending(u => u.CreatedAt)
    };

    var total = await query.CountAsync(ct);

    var items = await query
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(u => new UserListItemDto
        {
            Id = u.Id,
            Email = u.Email,
            DisplayName = u.DisplayName,
            Status = u.Status,
            CreatedAt = u.CreatedAt
        })
        .ToListAsync(ct);

    return new PagedResult<UserListItemDto>(items, total, page, pageSize);
}
```

For very deep pages, keyset pagination may be better than offset pagination.

## Indexes For Admin Search

Example:

```sql
CREATE INDEX IX_Users_Status_CreatedAt
ON Users (Status, CreatedAt DESC)
INCLUDE (Email, DisplayName);

CREATE INDEX IX_Users_Email
ON Users (Email);
```

For flexible text search, SQL `LIKE '%term%'` may not scale well. Consider full-text search or a search engine when search requirements grow.

## Typed Frontend API Layer

```ts
export type UserStatus = "Active" | "Disabled" | "Invited";

export type UserListItem = {
  id: number;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: string;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserSearchParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: UserStatus;
  sort?: string;
};

export async function fetchUsers(
  params: UserSearchParams
): Promise<PagedResult<UserListItem>> {
  const response = await apiClient.get("/admin/users", { params });
  return response.data;
}
```

## React Query Example

```tsx
function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? 1);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") as UserStatus | null;
  const sort = searchParams.get("sort") ?? "-createdAt";

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ["admin", "users", { page, search: debouncedSearch, status, sort }],
    queryFn: () =>
      fetchUsers({
        page,
        pageSize: 20,
        search: debouncedSearch,
        status: status ?? undefined,
        sort,
      }),
    placeholderData: (previous) => previous,
  });

  function updateSearch(value: string) {
    setSearchParams((current) => {
      current.set("search", value);
      current.set("page", "1");
      return current;
    });
  }

  return (
    <UsersTable
      users={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      isLoading={query.isLoading}
      isError={query.isError}
      page={page}
      search={search}
      onSearchChange={updateSearch}
    />
  );
}
```

## Reusable Table Design

The reusable table should not know API details.

```tsx
export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
};

type DataTableProps<T> = {
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
};

export function DataTable<T>({
  rows,
  columns,
  isLoading,
  isError,
  emptyMessage,
}: DataTableProps<T>) {
  if (isLoading) {
    return <div role="status">Loading...</div>;
  }

  if (isError) {
    return <div role="alert">Could not load data.</div>;
  }

  if (rows.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} style={{ width: column.width }}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column.key}>{column.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

In real apps, prefer a stable row key instead of array index when possible.

## Authorization

Example permissions:

```text
users.read
users.create
users.update
users.disable
roles.manage
audit.read
settings.manage
exports.create
```

Backend policy:

```csharp
[Authorize(Policy = "users.update")]
[HttpPut("users/{id:int}")]
public async Task<IActionResult> UpdateUser(
    int id,
    UpdateUserRequest request,
    CancellationToken ct)
{
    await _userService.UpdateAsync(id, request, ct);
    return NoContent();
}
```

Frontend permission check:

```tsx
function UserActions({ user, permissions }: UserActionsProps) {
  if (!permissions.includes("users.disable")) {
    return null;
  }

  return <button type="button">Disable user</button>;
}
```

Frontend checks improve user experience. Backend policies are the security boundary.

## Safe Destructive Actions

For destructive or sensitive actions:

- require explicit confirmation;
- show the affected resource;
- require a reason for high-risk actions;
- audit the action;
- prefer disable/archive over hard delete;
- make repeated clicks safe.

Example request:

```csharp
public sealed record DisableUserRequest(string Reason);
```

## Audit Log

Audit sensitive operations:

- user created;
- user disabled;
- role changed;
- permission changed;
- settings changed;
- export performed;
- support user accessed tenant data.

Table:

```sql
CREATE TABLE AuditLogs
(
    Id BIGINT IDENTITY PRIMARY KEY,
    TenantId UNIQUEIDENTIFIER NULL,
    ActorUserId INT NOT NULL,
    Action NVARCHAR(100) NOT NULL,
    ResourceType NVARCHAR(100) NOT NULL,
    ResourceId NVARCHAR(100) NULL,
    Details NVARCHAR(MAX) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL
);

CREATE INDEX IX_AuditLogs_Tenant_CreatedAt
ON AuditLogs (TenantId, CreatedAt DESC);
```

Write audit log:

```csharp
public async Task DisableUserAsync(
    int userId,
    string reason,
    CancellationToken ct)
{
    var user = await _db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct)
        ?? throw new NotFoundException("User not found.");

    user.Disable();

    _db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = _currentUser.UserId,
        Action = "user.disabled",
        ResourceType = "User",
        ResourceId = userId.ToString(CultureInfo.InvariantCulture),
        Details = JsonSerializer.Serialize(new { reason }),
        CreatedAt = DateTimeOffset.UtcNow
    });

    await _db.SaveChangesAsync(ct);
}
```

## Export Design

Small exports can sometimes be synchronous.

Large exports should be asynchronous:

```text
POST /api/admin/exports/users
  -> create export job
  -> background worker generates CSV
  -> upload file to object storage
  -> user downloads when ready
```

Export job table:

```sql
CREATE TABLE ExportJobs
(
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    RequestedByUserId INT NOT NULL,
    Type NVARCHAR(100) NOT NULL,
    Status NVARCHAR(40) NOT NULL,
    FilterJson NVARCHAR(MAX) NOT NULL,
    BlobName NVARCHAR(500) NULL,
    CreatedAt DATETIMEOFFSET NOT NULL,
    CompletedAt DATETIMEOFFSET NULL
);
```

Large exports should use streaming and permission checks.

## Performance Considerations

- server-side pagination;
- indexes for common filters;
- no unbounded exports in request thread;
- background jobs for large exports;
- cache stable lookup data;
- avoid loading huge permission graphs repeatedly;
- debounce search;
- avoid unnecessary frontend re-renders;
- use virtualization only when truly needed.

## Practice Task

Design an admin users page with:

1. server-side pagination.
2. search and status filter.
3. URL-persisted filters.
4. permission-based row actions.
5. backend authorization policies.
6. audit log for disable user.
7. async export job.
8. loading, error, and empty states.
