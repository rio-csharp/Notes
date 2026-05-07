# Docker For .NET And React

## Core Idea

Docker packages an application and its runtime dependencies into an image that can run consistently across environments. Two fundamental mechanisms make this possible: image layering for efficient storage and distribution, and Linux kernel isolation features (namespaces and cgroups) for running containers securely on a shared host.

Docker is not virtualization in the traditional sense. Unlike a virtual machine, a container shares the host operating system kernel and does not require a separate guest OS. This reduces overhead but means that Windows containers require a Windows host, and Linux containers require a Linux host.

## Image vs Container

Image:

```text
Immutable template composed of read-only layers.
```

Container:

```text
A running instance of an image with a writable layer added on top.
```

Useful commands:

```bash
docker build -t myapp-api .
docker run --rm -p 8080:8080 myapp-api
docker ps
docker logs <container-id>
docker exec -it <container-id> sh
```

## Image Layers And Layer Caching

Every Dockerfile instruction that modifies the filesystem creates a new layer. Layers are stacked using overlay2 (Linux) or similar union filesystem technologies to present a single unified view.

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app               # layer 1: set working directory
COPY package*.json ./      # layer 2: add dependency manifest
RUN npm ci                 # layer 3: install dependencies
COPY . .                   # layer 4: add source code
RUN npm run build          # layer 5: build
```

Layer caching is the reason Docker builds are fast when only source code changes. Docker checks each instruction against its build cache: if the instruction and the input files have not changed, Docker reuses the corresponding layer from a previous build. This is why Dockerfiles should order instructions from least frequently changing to most frequently changing:

- Copy dependency manifests first (e.g., `package*.json`, `*.csproj`)
- Install dependencies
- Copy source code last

When only source code changes, all layers up to `COPY . .` are reused from cache. Breaking this order (for example, copying all source before running `npm ci`) invalidates the dependency install cache on every source change.

```bash
# Inspect layers of an image
docker history myapp-api
```

To verify that layers are shared between images built from the same base:

```bash
docker images --digests
```

Images using the same base image (e.g., `mcr.microsoft.com/dotnet/aspnet:8.0`) share those base layers on disk without duplication.

## Container Isolation

Containers rely on Linux kernel features for isolation:

- **Namespaces**: Provide process-level isolation. Each container gets its own process tree (PID namespace), network stack (NET namespace), mount table (MNT namespace), and hostname (UTS namespace). A process in a container cannot see processes in other containers or on the host.
- **Control groups (cgroups)**: Limit and account for resource usage. Cgroups constrain CPU, memory, disk I/O, and network bandwidth that a container can consume. This prevents a single container from starving other processes on the host.

Docker does not provide the same level of isolation as a hypervisor. Kernel vulnerabilities can potentially affect the host. Production deployments should use additional security measures such as:

- Running containers as a non-root user
- Using read-only root filesystems
- Dropping unnecessary Linux capabilities
- Using seccomp profiles to limit system calls

## .NET Multi-stage Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY *.sln .
COPY src/MyApp.Api/*.csproj src/MyApp.Api/
RUN dotnet restore

COPY . .
RUN dotnet publish src/MyApp.Api/MyApp.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "MyApp.Api.dll"]
```

Multi-stage builds provide several benefits:

- SDK is used only during build;
- runtime image is smaller;
- fewer tools exist in production image;
- build and runtime concerns are separated.

With BuildKit (the default builder in modern Docker), cache mounts can speed up package restoration across builds:

```dockerfile
# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY *.sln .
COPY src/MyApp.Api/*.csproj src/MyApp.Api/
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
    dotnet restore

COPY . .
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
    dotnet publish src/MyApp.Api/MyApp.Api.csproj \
    -c Release -o /app/publish --no-restore
```

The `--mount=type=cache` directive preserves the NuGet package cache between builds, avoiding repeated downloads of the same packages for each CI run. The cache is shared across builds on the same machine and can be configured to use a registry-backed cache in CI environments.

## Non-root Container

Avoid running as root when possible.

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

RUN adduser --disabled-password --home /app appuser
USER appuser

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "MyApp.Api.dll"]
```

## React Dockerfile

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

Nginx SPA fallback:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }
}
```

## `.dockerignore`

```text
bin/
obj/
.git/
.vs/
node_modules/
dist/
coverage/
*.user
*.suo
.env
```

This keeps build context smaller and prevents accidental secret copying.

## Docker Compose Example

```yaml
services:
  api:
    build: ./backend
    ports:
      - "5000:8080"
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__Default: "Server=db;Database=app;User Id=sa;Password=Your_password123;TrustServerCertificate=True"
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "Your_password123"
    ports:
      - "1433:1433"
    healthcheck:
      test: ["CMD-SHELL", "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P Your_password123 -C -Q 'SELECT 1'"]
      interval: 10s
      timeout: 5s
      retries: 10
```

## Health Checks

ASP.NET Core:

```csharp
builder.Services.AddHealthChecks();

app.MapHealthChecks("/health");
```

Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8080/health || exit 1
```

## Configuration

Use environment variables:

```text
ConnectionStrings__Default=...
Jwt__Authority=...
Redis__ConnectionString=...
```

Do not bake environment-specific config or secrets into images.

## Image Tagging

Use immutable tags for deployments:

```bash
docker build -t myregistry/orders-api:1.4.2 .
docker build -t myregistry/orders-api:git-abc1234 .
```

Avoid deploying `latest` to production because it is ambiguous.
