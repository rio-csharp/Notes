# Docker For .NET And React

## Core Idea

Docker packages an application and its runtime dependencies into an image that can run consistently across environments.

Chinese notes:

- `image`: 镜像.
- `container`: 容器.
- `multi-stage build`: 多阶段构建.
- `layer`: 镜像层.
- `volume`: 卷.

## Image vs Container

Image:

```text
Immutable template containing app files and runtime dependencies.
```

Container:

```text
Running instance of an image.
```

Useful commands:

```bash
docker build -t myapp-api .
docker run --rm -p 8080:8080 myapp-api
docker ps
docker logs <container-id>
docker exec -it <container-id> sh
```

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

Why multi-stage:

- SDK is used only during build;
- runtime image is smaller;
- fewer tools exist in production image;
- build and runtime concerns are separated.

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

## Common Mistakes

- Putting secrets into images.
- Running as root unnecessarily.
- Huge images.
- No health checks.
- Not using `.dockerignore`.
- Different config between local and production.
- Using `latest` as the production deployment tag.
- Assuming `depends_on` means the dependency is ready without health checks.

## Knowledge Checks

### Why use multi-stage builds?

Multi-stage builds keep the final image smaller and safer by using SDK/build tools only during build, then copying published output into a runtime image.

### Container vs virtual machine?

Containers share the host OS kernel and package application dependencies. VMs include a full guest OS. Containers are usually lighter and faster to start.

### Why avoid secrets in images?

Images are stored, copied, scanned, and cached. A secret baked into an image can leak even if later removed from a container environment.
