# CI/CD For .NET And React

## Core Idea

CI/CD turns a code change into a verified, repeatable release.

Chinese notes:

- `CI`: Continuous Integration, 持续集成.
- `CD`: Continuous Delivery or Continuous Deployment, 持续交付或持续部署.
- `pipeline`: 流水线.
- `artifact`: 构建产物.
- `promotion`: 环境晋级, for example from test to staging to production.
- `smoke test`: 冒烟测试, a small set of checks that confirms the deployed system basically works.

The most important principle is:

> Build once, test the same artifact, deploy the same artifact.

If each environment builds from source separately, production may not run the same code that was tested.

## CI vs CD

CI answers:

```text
Does this change compile?
Do tests pass?
Is formatting/linting acceptable?
Are obvious security or dependency issues detected?
Can we produce a deployable artifact?
```

CD answers:

```text
Can we deploy the artifact safely?
Can we apply configuration for the target environment?
Can we migrate the database safely?
Can we verify the deployed app?
Can we roll forward or roll back if something goes wrong?
```

## A Practical Pipeline Shape

For a .NET API and React frontend:

```text
Pull request
  -> restore dependencies
  -> format/lint
  -> build
  -> unit tests
  -> integration tests
  -> frontend tests
  -> security/dependency checks

Main branch
  -> repeat verification
  -> publish .NET artifact
  -> build React static assets
  -> build Docker image
  -> push image to registry
  -> generate database migration script
  -> deploy to staging
  -> smoke tests
  -> promote to production
  -> monitor
```

## Repository Layout Example

```text
repo/
  src/
    Api/
      Api.csproj
      Dockerfile
    Web/
      package.json
      vite.config.ts
  tests/
    Api.UnitTests/
    Api.IntegrationTests/
  deploy/
    k8s/
    scripts/
  .github/
    workflows/
      ci.yml
      deploy.yml
```

The exact layout can vary, but the pipeline should make ownership clear:

- backend build and tests;
- frontend build and tests;
- integration tests;
- deployable package or container image;
- deployment manifests/scripts.

## GitHub Actions CI Example

This workflow verifies pull requests and pushes to `main`.

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  backend:
    name: Backend
    runs-on: ubuntu-latest

    services:
      sql:
        image: mcr.microsoft.com/mssql/server:2022-latest
        env:
          ACCEPT_EULA: "Y"
          SA_PASSWORD: "Your_strong_password123"
        ports:
          - 1433:1433
        options: >-
          --health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P Your_strong_password123 -C -Q 'SELECT 1'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: "8.0.x"

      - name: Restore
        run: dotnet restore

      - name: Format check
        run: dotnet format --verify-no-changes --verbosity minimal

      - name: Build
        run: dotnet build --configuration Release --no-restore

      - name: Unit tests
        run: dotnet test tests/Api.UnitTests/Api.UnitTests.csproj --configuration Release --no-build

      - name: Integration tests
        env:
          ConnectionStrings__Default: "Server=localhost,1433;Database=AppTests;User Id=sa;Password=Your_strong_password123;TrustServerCertificate=True"
        run: dotnet test tests/Api.IntegrationTests/Api.IntegrationTests.csproj --configuration Release --no-build

  frontend:
    name: Frontend
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: src/Web/package-lock.json

      - name: Install
        working-directory: src/Web
        run: npm ci

      - name: Type check
        working-directory: src/Web
        run: npm run typecheck

      - name: Lint
        working-directory: src/Web
        run: npm run lint

      - name: Test
        working-directory: src/Web
        run: npm test -- --run

      - name: Build
        working-directory: src/Web
        run: npm run build
```

## Why Use `npm ci` Instead Of `npm install` In CI?

`npm ci` installs exactly from `package-lock.json`.

That matters because CI should be reproducible. `npm install` may update the lock file or resolve dependencies differently.

## Docker Build And Push

For container-based deployment, build and push an image after verification passes.

```yaml
name: build-image

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/my-org/orders-api

jobs:
  image:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: src/Api/Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.IMAGE_NAME }}:main
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Prefer immutable image tags such as Git commit SHA for deployment.

`latest` or `main` can be convenient for humans, but production deployment should know the exact image digest or version.

## Artifact-Based Deployment

Not every system needs containers. App Service and IIS deployments often use published artifacts.

```yaml
- name: Publish API
  run: dotnet publish src/Api/Api.csproj --configuration Release --output ./artifacts/api

- name: Upload API artifact
  uses: actions/upload-artifact@v4
  with:
    name: api
    path: ./artifacts/api

- name: Build React app
  working-directory: src/Web
  run: |
    npm ci
    npm run build

- name: Upload web artifact
  uses: actions/upload-artifact@v4
  with:
    name: web
    path: src/Web/dist
```

Artifacts make deployment auditable:

- which commit produced it;
- which tests ran before it;
- which environment received it;
- who approved the promotion.

## Environment Configuration

Application configuration should be injected by environment.

```text
Development
  -> local user secrets

CI
  -> short-lived test credentials

Staging
  -> staging secret store

Production
  -> production secret store
```

For .NET:

```text
ConnectionStrings__Default
Redis__ConnectionString
Jwt__Authority
Logging__LogLevel__Default
FeatureFlags__UseNewCheckout
```

For React:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_AUTHORITY=https://login.example.com
```

Important:

> Frontend environment variables are usually embedded into static JavaScript during build. They are not secrets.

## Database Migrations

Database deployment is often riskier than application deployment.

A practical approach with EF Core:

```powershell
dotnet ef migrations script `
  --project src/Api/Api.csproj `
  --startup-project src/Api/Api.csproj `
  --idempotent `
  --output artifacts/sql/migrate.sql
```

`--idempotent` creates a script that checks which migrations have already been applied.

Better production habits:

- generate SQL scripts in CI;
- store the script as an artifact;
- review the script for destructive operations;
- apply during deployment with controlled permissions;
- back up important databases before risky migrations;
- monitor errors and performance after migration.

## Expand-Contract Migration Pattern

Breaking schema changes should often be split across releases.

Example: renaming `FullName` to `DisplayName`.

Bad single-step change:

```text
1. Drop FullName.
2. Add DisplayName.
3. Deploy app expecting DisplayName.
```

This can break old app instances during rolling deployment.

Safer expand-contract flow:

```text
Release 1:
  - Add DisplayName nullable.
  - App writes both FullName and DisplayName.
  - Backfill old rows.

Release 2:
  - App reads DisplayName.
  - Keep FullName for compatibility.

Release 3:
  - Remove FullName after all old app versions are gone.
```

Chinese note:

- `expand-contract`: 先扩展再收缩, 用多次发布降低数据库变更风险.

## Deployment Strategies

### Rolling Deployment

Replace instances gradually.

Good for:

- stateless APIs;
- normal releases;
- Kubernetes deployments;
- systems where old and new versions can run together.

Needs:

- backward-compatible database changes;
- readiness checks;
- graceful shutdown;
- idempotent operations.

### Blue-Green Deployment

Run two environments:

```text
blue  = current production
green = new version
```

Validate green, then switch traffic.

Good for:

- quick rollback by switching traffic back;
- large releases;
- reducing deployment downtime.

Cost:

- duplicate infrastructure;
- data compatibility still matters;
- long-running background jobs need careful handling.

### Canary Deployment

Send a small percentage of traffic to the new version first.

```text
1% traffic -> 5% -> 25% -> 50% -> 100%
```

Good for:

- high-traffic services;
- risky changes;
- performance-sensitive releases.

Needs:

- metrics;
- alerting;
- version-aware logs/traces;
- automatic or manual rollback rules.

## Smoke Tests

Smoke tests should be small and reliable.

Example script:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"

curl --fail "$BASE_URL/health/ready"
curl --fail "$BASE_URL/api/version"

TOKEN=$(curl --fail --silent \
  --request POST "$BASE_URL/api/test-auth/token" \
  --header "Content-Type: application/json" \
  --data '{"scope":"orders.read"}' | jq -r ".accessToken")

curl --fail "$BASE_URL/api/orders?page=1&pageSize=1" \
  --header "Authorization: Bearer $TOKEN"
```

Smoke tests should avoid:

- depending on random external services;
- modifying important production data without cleanup;
- testing every business rule;
- running too slowly.

## Rollback And Roll Forward

Rollback means returning to a previous version.

Roll forward means deploying a new fix.

In many production systems, roll forward is safer when:

- database schema has changed;
- data has already been transformed;
- external events/messages were emitted;
- users already interacted with the new behavior.

Rollback checklist:

```text
Can the old app run against the current database?
Were any destructive migrations applied?
Are feature flags available to disable the new path?
Were background jobs changed?
Were messages/events changed?
Were client-side assets cached by browsers/CDNs?
```

## Secrets In CI/CD

Secrets should be stored in the CI platform secret store or cloud secret manager.

Rules:

- never print secrets;
- do not pass secrets as command-line arguments when logs may capture them;
- scope secrets by environment;
- prefer short-lived tokens and OpenID Connect federation;
- rotate leaked credentials immediately;
- avoid giving pull requests from forks access to production secrets.

GitHub Actions can use environment approvals:

```yaml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: echo "Deploying after environment approval"
```

## OpenID Connect For Cloud Deployment

Instead of storing long-lived cloud credentials in GitHub secrets, a workflow can request a short-lived identity token.

Concept:

```text
GitHub Actions job
  -> requests OIDC token
  -> cloud provider validates repository/branch/environment claims
  -> cloud provider issues short-lived access token
  -> deployment uses temporary token
```

Chinese note:

- `OIDC`: OpenID Connect, 常用于 CI/CD 到云平台的短期身份认证.

This reduces the risk of leaked permanent credentials.

## Common Pipeline Failures

| Symptom | Likely Cause | Better Practice |
| --- | --- | --- |
| Works locally, fails in CI | Missing dependency, different SDK/Node version | Pin versions in pipeline |
| Tests are flaky | Shared state, timing assumptions, external dependency | Isolate data and use deterministic tests |
| Deploy succeeds but app fails | Missing config, bad secret, wrong DB schema | Smoke tests and health checks |
| Rollback fails | Database changed incompatibly | Expand-contract migrations |
| Production uses untested code | Rebuilt during deploy | Build once, promote artifact |
| Secrets appear in logs | Echoing env vars or verbose tools | Mask secrets and reduce logging |

## Knowledge Checks

### What should a good CI pipeline verify?

It should restore dependencies, build the backend and frontend, run unit/integration/frontend tests, check formatting or linting, scan dependencies when possible, and produce a deployable artifact or image.

### Why is "build once, deploy many times" important?

Because the artifact tested in CI should be the same artifact deployed to staging and production. If each environment rebuilds separately, dependency resolution or build-time configuration can change the output.

### Why are database rollbacks hard?

Schema and data changes may not be reversible. Dropping a column, transforming data, or changing message formats can make an old application version incompatible. Safer systems use backward-compatible migrations and feature flags.

### What makes a smoke test useful?

It is fast, stable, and checks the most important deployed paths: health endpoint, version endpoint, authentication basics, and one or two core API calls.

### When would canary deployment be useful?

Canary deployment is useful when a change has performance or correctness risk and the system has enough traffic and observability to compare the new version against the old version.

## Common Mistakes

- Deploying artifacts that were not tested.
- Rebuilding separately for each environment.
- Treating frontend build variables as secrets.
- Running destructive migrations automatically with no review.
- No smoke tests after deployment.
- No clear rollback or roll-forward plan.
- Giving CI production credentials for all branches.
- Ignoring cached static assets and CDN behavior.
- Not recording which version is running in each environment.
- No monitoring after deployment.

## Practice Task

Design a pipeline for:

1. .NET API build and tests.
2. React type check, lint, tests, and build.
3. Integration tests with SQL Server.
4. Docker image build and push.
5. EF Core migration script generation.
6. Staging deployment.
7. Smoke tests.
8. Production promotion.
9. Rollback or roll-forward plan.

Write down:

```text
What triggers the pipeline?
What artifacts are produced?
Which secrets are needed?
Which steps block deployment?
How is the deployed version verified?
What happens if deployment fails?
```
