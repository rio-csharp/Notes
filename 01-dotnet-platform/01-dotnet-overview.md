# .NET Platform Overview

The .NET platform is a modern, cross-platform development stack that spans web APIs, desktop applications, cloud services, background workers, mobile apps, games, and command-line tools. This chapter establishes the platform map: what each major component does, how they relate, and why the boundaries between them matter for both development and production operation.

## Platform Layers

The .NET platform is organized in three primary layers, and the terminology around them is precise even though everyday conversation often blurs the lines:

```text
.NET platform
  SDK ── build, test, publish tooling
  Runtime ── execution environment
      CLR ── execution engine (GC, JIT, exception handling, type safety, thread pool, assembly loading)
      Runtime libraries ── implementations of BCL APIs
  BCL ── the public API surface (collections, I/O, networking, JSON, diagnostics)
```

These layer boundaries have direct operational consequences. When documentation says "the .NET runtime does X" or "this requires the SDK," identifying the layer determines whether the fix belongs in a project file, a framework installation, or application code. A build failure is an SDK concern; a startup crash is typically a host or runtime concern; a JSON parsing bug is a library concern.

### Runtime

The runtime is the execution package that starts and runs .NET applications. It includes the native host, the CLR execution engine, and the runtime library implementations that back the BCL APIs application code depends on.

The CLR itself provides the core execution services: garbage collection, JIT compilation, exception handling, type safety enforcement, thread pool scheduling, and assembly loading. These services are not optional layers — every .NET application depends on them during execution.

The runtime libraries are the concrete implementations of types in the `System.*` namespace. When application code calls `List<T>.Add` or `JsonSerializer.Serialize`, it invokes library APIs whose implementations live inside the runtime libraries shipped with the execution package. In everyday language, "the .NET runtime" typically means this entire execution bundle.

Every line in a typical request handler crosses platform-layer boundaries:

```csharp
using var client = new HttpClient();
var response = await client.GetStringAsync("https://api.example.com/data");
var items = JsonSerializer.Deserialize<List<Item>>(response);
```

The C# compiler and `dotnet build` come from the SDK. `HttpClient`, `JsonSerializer`, and `List<T>` are BCL APIs. At execution time, the host loads the application, the CLR JIT-compiles the methods, the runtime libraries provide the networking and JSON implementations, and the GC manages the memory for `response`, `items`, and the internal buffers `HttpClient` allocates. None of these layers is optional.

### SDK

The SDK is the build-side tooling layer. It provides the commands and infrastructure for creating, restoring dependencies, compiling, testing, and publishing applications. The SDK is not part of the application at runtime — it operates entirely at development and CI time.

```bash
dotnet new webapi     # scaffold a project
dotnet build          # restore packages and compile
dotnet test           # run tests
dotnet publish -c Release  # produce deployment artifacts
```

The SDK's presence determines what a machine can do. A development workstation or CI agent needs the SDK to build and publish. A production server, when using framework-dependent deployment, needs only the runtime. This separation is the foundation of the deployment models discussed later in this chapter.

SDK versions install side-by-side, and by default the `dotnet` CLI uses the latest installed SDK regardless of the project's target framework. To pin a specific SDK version across a team or CI environment, place a `global.json` file in the repository root:

```json
{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestFeature"
  }
}
```

The CLI searches upward from the working directory for the first `global.json` and uses the SDK version it specifies. The `rollForward` property inside `global.json` controls SDK version matching independently of the runtime roll-forward policy.

### BCL

The Base Class Library is the API contract. It defines the types, methods, and namespaces that application code programs against: collections, file I/O, networking, JSON serialization, reflection, threading primitives, cryptography, and diagnostics.

The BCL is the API surface; the runtime contains the implementation that executes those APIs. In practice this distinction matters most when reasoning about platform compatibility. The BCL surface grows and changes across .NET versions — APIs added in .NET 8 are unavailable when targeting .NET 6. The runtime implementation, meanwhile, can be optimized, patched, or replaced (for example, switching between CoreCLR and Mono) while the BCL contract remains stable. Keeping these concepts separate clarifies what belongs to library design decisions, what belongs to runtime execution, and what belongs to tooling.

## Platform Flow: A Web API From Source To Production

Consider an ASP.NET Core Web API moving from source code to production:

```text
Developer machine / CI
  SDK restores NuGet packages and compiles projects
  C# compiler produces assemblies (IL)

Production machine
  dotnet host starts the application
  host reads runtimeconfig.json and deps.json
  CLR loads assemblies
  JIT compiler compiles methods on first invocation
  BCL/runtime libraries provide networking, JSON serialization, logging, and diagnostics
```

This split directly shapes the build-versus-run boundary. The build server needs the SDK, while a production server running framework-dependent deployments needs only the runtime. After `dotnet publish -c Release`, a framework-dependent publish contains:

```text
MyApp.dll
MyApp.deps.json
MyApp.runtimeconfig.json
appsettings.json
```

A self-contained publish adds the runtime files or a platform-specific host executable, because the target machine is not expected to provide a shared runtime.

Container deployments add their own layer of concern. In a Dockerfile, the choice between `mcr.microsoft.com/dotnet/sdk` and `mcr.microsoft.com/dotnet/aspnet` images mirrors the SDK-versus-runtime split: the SDK image builds, the runtime image hosts. Multi-stage Docker builds formalize this:

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

The runtime base image (`aspnet:9.0`) provides the shared framework — it is framework-dependent deployment packaged as a container layer. Self-contained publish in containers eliminates the runtime image dependency but increases the final image size and couples the image rebuild cycle to runtime patches. Choosing between `aspnet` and `runtime-deps` base images (for self-contained) is the container equivalent of the framework-dependent versus self-contained decision. Containers also interact with the host layer: .NET reads cgroup limits for GC heap sizing, thread pool defaults, and processor count — a container with 512 MB of memory and 1 CPU behaves differently from a VM with 16 GB and 8 CPUs, even running the same application bits.

## Host And Runtime Resolution

Between `dotnet MyApp.dll` and the first line of managed code, a host layer resolves the runtime environment. Understanding this layer matters because deployment failures, framework version conflicts, and startup errors often occur here — before any C# code executes.

The startup sequence follows a specific resolution chain:

```text
dotnet MyApp.dll
  native host starts (dotnet.exe or apphost)
  hostfxr reads runtime configuration (runtimeconfig.json)
  framework resolution selects shared frameworks and runtime version
  hostpolicy prepares dependency loading rules (deps.json)
  CoreCLR is loaded
  managed entry point (Main / Program.cs) begins execution
```

The host resolution chain is not a single-pass lookup. `hostfxr` first checks `runtimeconfig.json` for the `frameworks` section and the `runtimeOptions.framework.name`/`version` properties. For framework-dependent applications, it searches well-known install locations — the `DOTNET_ROOT` environment variable, the `dotnet` install directory, and (on Windows) the registry — for a compatible runtime version. Roll-forward policies (specified via `rollForward` in `runtimeconfig.json`) control whether the host accepts a newer patch, minor, or major version when the exact requested version is absent. The default policy is `Minor`: if the requested minor version is installed, the highest patch within that minor is used; if the requested minor is absent, the host rolls forward to the next higher minor version. Other policies include `LatestPatch` (no minor roll-forward), `LatestMinor` (highest available minor, even if the requested one is present), `Major` (roll forward to next higher major if requested major is absent), `LatestMajor` (highest available major), and `Disable` (exact match only — recommended only for testing). For self-contained deployments, roll-forward is not a runtime concern because the runtime version is locked at publish time. Common startup failures — `It was not possible to find any compatible framework version` — are hostfxr errors that occur before CoreCLR initializes, and they are resolved by adjusting runtime installation, container base images, or roll-forward policy, not by changing application code.

Beyond framework selection, the .NET runtime exposes configuration knobs through three mechanisms, with a defined precedence order (higher overrides lower):

1. **runtimeconfig.json** — per-application settings in the `configProperties` section. A `runtimeconfig.template.json` file in the project directory is merged into the output `runtimeconfig.json` at build time, providing a source-controlled configuration source that survives rebuilds.
2. **MSBuild properties** — set in the project file (e.g., `<ConcurrentGarbageCollection>false</ConcurrentGarbageCollection>`) or via the `RuntimeHostConfigurationOption` item. These take precedence over `runtimeconfig.json` settings.
3. **Environment variables** — prefixed with `DOTNET_` (e.g., `DOTNET_GCRetainVM=1`). Starting in .NET 9, environment variables take precedence over both MSBuild properties and `runtimeconfig.json`. In earlier versions, `runtimeconfig.json` had the highest precedence.

This three-tier system means the same GC, threading, or diagnostics behavior can be set globally on a machine via environment variables, baked into the project file for all consumers, or adjusted per-deployment via the JSON configuration file.

## Build Time And Run Time

Build-time and run-time responsibilities are distinct, and conflating them leads to misdiagnosed failures.

**Build time** involves the SDK: restoring packages, compiling C# to IL, and producing assemblies. The application itself is not started, even though the SDK, MSBuild tasks, analyzers, and source generators may execute managed code as part of the build process.

```text
dotnet build
  restore NuGet packages
  compile C# to IL
  produce assemblies (.dll / .exe)
```

**Run time** involves the host and runtime: loading the application, resolving dependencies, JIT-compiling methods, and executing managed code.

```text
dotnet MyApp.dll
  host starts the application
  runtime loads assemblies
  CLR JIT-compiles methods on demand
  GC manages heap memory
```

`dotnet build` requires an SDK. `dotnet run` both builds and runs, using the SDK for the build phase and the runtime for execution. Running a pre-published application requires only a compatible runtime — no SDK — when using framework-dependent deployment. Self-contained deployment eliminates even that requirement by bundling the runtime into the application.

## .NET, .NET Framework, And .NET Core

The .NET platform has gone through three major eras, and the naming still causes confusion.

**.NET Framework** (2002–2019) is the original Windows-only implementation. It is installed machine-wide, uses the Global Assembly Cache for shared strong-named assemblies, and is tightly coupled to Windows. Its application models include ASP.NET Web Forms, WCF, Windows Forms, and WPF. Microsoft ceased active feature development on .NET Framework after version 4.8.1, though it remains supported on Windows for existing enterprise applications.

**.NET Core** (2016–2020) was a ground-up rewrite designed for cross-platform execution, higher performance, and modular deployment. It introduced side-by-side runtime installation (no GAC dependency), a redesigned ASP.NET stack (ASP.NET Core), and a significantly faster execution pipeline. .NET Core 3.1 was the last release under the "Core" branding.

**Modern .NET** (.NET 5 onward) unified the Core and Framework lineages under a single platform name. The "Core" suffix was dropped, and the version jumped from Core 3.1 to .NET 5 to signal the unification. Modern .NET is the active development track: it is cross-platform, open-source, and supports all modern application models including ASP.NET Core, Blazor, MAUI, and cloud-native services.

The engineering differences between these generations are substantial:

| Concern | .NET Framework | Modern .NET |
|---|---|---|
| **Platform** | Windows only | Windows, Linux, macOS |
| **Runtime installation** | Machine-wide GAC | Side-by-side, per-application possible |
| **Performance** | Older GC, older JIT | Tiered compilation, improved GC, Span<T>, hardware intrinsics |
| **ASP.NET** | ASP.NET MVC / Web Forms / WCF | ASP.NET Core (unified, high-performance pipeline) |
| **Deployment model** | Framework on machine required | Framework-dependent or self-contained |
| **Active development** | Security patches only | Full feature development |

Modern .NET is the target for all new development. .NET Framework survives in enterprises with large Windows-only codebases that have not been migrated. The rest of this book assumes modern .NET unless .NET Framework is explicitly discussed.

**.NET Standard** was an intermediate compatibility layer that defined a shared API surface across .NET implementations. A library targeting .NET Standard 2.0 can run on both .NET Framework 4.6.1+ and modern .NET. .NET Standard 2.1 is supported by .NET Core 3.0+, modern .NET, and Mono, but **not** by .NET Framework. With the unification under .NET 5 and later, .NET Standard has become less relevant for new work: use `netstandard2.0` only when a library must still support .NET Framework, and target `net8.0` or later directly when all consumers are on modern .NET.

## Target Framework

The target framework moniker (TFM) tells the compiler and runtime which .NET version and API surface the project expects. It appears in the project file:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

A project targeting `net8.0` can use any API available in .NET 8. If a framework-dependent deployment runs on a machine with only an older or incompatible runtime, startup fails during host resolution — before managed code executes.

Library projects sometimes target multiple frameworks to support consumers on different runtime versions:

```xml
<TargetFrameworks>net8.0;net9.0</TargetFrameworks>
```

Multi-targeting causes the build to produce a separate assembly for each TFM, with conditional compilation (`#if NET8_0`, `#if NET9_0`) available for framework-specific code paths. Application projects typically target a single framework, since they deploy to a known runtime environment.

**OS-specific TFMs** extend the base TFM with a platform suffix: `net8.0-windows`, `net8.0-android`, `net8.0-ios`. These make operating-system-specific APIs available — Windows Forms and WPF require `net8.0-windows`, while mobile bindings require the corresponding Android or iOS TFM. Cross-platform libraries and ASP.NET Core applications target the base TFM (`net8.0`) without a platform suffix. OS-specific TFMs can also include an optional OS version (for example, `net8.0-ios17.2`) to select a specific API surface at compile time without controlling the minimum runtime OS version — that is set separately via `SupportedOSPlatformVersion`.

## Deployment Models

.NET supports several deployment modes, each with different trade-offs in size, predictability, and operational complexity.

### Framework-dependent Deployment

The application relies on a shared .NET runtime installed on the target machine. The deployment artifact is small — only the application assemblies and configuration files. Central runtime patching benefits all framework-dependent applications without re-publishing. The operational cost is that the runtime must be present and compatible.

```bash
dotnet publish -c Release
```

### Self-contained Deployment

The application bundles its own copy of the .NET runtime. No runtime installation is required on the target machine, and the runtime version is locked at publish time — eliminating compatibility surprises. The cost is larger deployment size and manual re-publishing when the bundled runtime needs patching.

```bash
dotnet publish -c Release -r linux-x64 --self-contained true
```

### Single-file Deployment

The entire application and its dependencies are packaged into a single executable. This simplifies distribution and handling — useful for CLI tools, simple services, and deployment environments where managing multiple files is inconvenient. Single-file publishing can be combined with either framework-dependent or self-contained mode, though it is most common with self-contained. In either case, it requires a runtime identifier because the single-file bundle is platform-specific.

```bash
dotnet publish -c Release -r linux-x64 -p:PublishSingleFile=true --self-contained true
```

The project file can capture these as publishing defaults:

```xml
<PropertyGroup>
  <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  <SelfContained>true</SelfContained>
  <PublishSingleFile>true</PublishSingleFile>
</PropertyGroup>
```

In .NET 5 and later, bundled managed assemblies are loaded from memory rather than extracted as individual files. Native libraries and compatibility modes can still require extraction, controlled by settings such as `IncludeNativeLibrariesForSelfExtract` and `IncludeAllContentForSelfExtract`. The practical caveat is that APIs depending on assembly file paths change behavior: for bundled assemblies, `Assembly.Location` returns an empty string, so code should use `AppContext.BaseDirectory` for files deployed next to the executable.

Self-contained and single-file publishing require a runtime identifier (`win-x64`, `linux-x64`, `osx-arm64`) because the output includes platform-specific runtime binaries. This is a common point of confusion: framework-dependent publish output (without single-file) is platform-neutral IL assemblies, while self-contained and single-file output is inherently platform-specific.

### Native AOT Deployment

Native AOT compiles the application directly to native machine code at publish time, eliminating JIT compilation at runtime. The output is a self-contained native executable — no .NET runtime installation is required on the target machine. This produces faster startup, lower memory usage, and smaller deployment size than a traditional self-contained deployment that bundles the full runtime and JIT.

```bash
dotnet publish -c Release -r linux-x64 -p:PublishAot=true
```

The trade-offs are substantial. Build times are longer because the compiler performs whole-program analysis and cross-module optimization. Not all .NET libraries are compatible — reflection-heavy code, assembly loading, and dynamic type creation require source-generated alternatives or explicit configuration. The debugging experience differs from standard .NET applications since the compiled output is native code.

Native AOT is particularly suited to workloads where cold-start latency and memory footprint dominate: serverless functions, CLI tools, and microservices with aggressive scale-to-zero requirements. It is less suited to applications that depend on runtime code generation, unconstrained reflection, or dynamically loaded plugins.

### ReadyToRun Deployment

ReadyToRun (R2R) is a form of ahead-of-time compilation that pre-compiles IL to native code at publish time while still including the original IL as a fallback. At runtime, the JIT can skip re-compiling methods that already have native versions, reducing startup and first-request latency. Unlike Native AOT, ReadyToRun preserves full JIT and reflection compatibility.

```bash
dotnet publish -c Release -r linux-x64 -p:PublishReadyToRun=true
```

ReadyToRun increases assembly size (both IL and native code are stored) and build time, but the startup improvement is measurable for most applications. It can be combined with both framework-dependent and self-contained deployment modes.

### Deployment Trade-offs

Beyond file size, deployment mode affects patching strategy, diagnostics, and startup behavior:

| Mode | Runtime Source | Strength | Cost |
|---|---|---|---|
| Framework-dependent | Machine-installed shared runtime | Small artifacts, centralized patching | Runtime must be present and compatible |
| Self-contained | Bundled with application | Predictable runtime, no machine prerequisites | Larger artifacts, manual re-publish for patches |
| Single-file | Bundled as one executable | Simple distribution | Platform-specific output, assembly path APIs behave differently, possible native-file extraction |
| Native AOT | Compiled to native code | Fastest startup, lowest memory, no runtime dependency | Limited reflection, longer builds, platform-specific |
| ReadyToRun | Pre-compiled IL + native code | Faster startup, full JIT compatibility | Larger assemblies, longer builds |

Framework-dependent applications benefit from centrally patched runtimes — a security update to the shared runtime protects all applications without re-publishing. Self-contained applications must be republished to update the bundled runtime. Single-file applications simplify distribution, but they change file-location assumptions and may extract native dependencies depending on publish settings.

These trade-offs mean deployment mode is both an engineering decision and an operational one. Consider three representative scenarios:

**Kubernetes microservice with horizontal pod autoscaling.** Cold-start latency directly affects scaling responsiveness. A framework-dependent publish using ReadyToRun (covered in Chapter 4) balances startup speed with image-layer reuse — the runtime base image is shared across service images, reducing registry storage and pull time. Self-contained publish eliminates the runtime dependency but increases per-service image size and requires republishing each service for runtime patches, which can multiply CI minutes across dozens of repositories.

**Windows server hosting multiple applications.** A shared runtime installed on the server centralizes patching across all framework-dependent applications. Self-contained deployment here increases the operational burden of tracking which applications bundle which runtime versions, and a critical CVE requires auditing every deployed application rather than a single runtime update.

**Serverless function on a cloud platform.** Package size and cold-start latency are primary constraints. Self-contained Native AOT produces a small, fast-starting executable without requiring the platform to pre-install a .NET runtime — useful on platforms with limited runtime support or when rapid scale-to-zero is expected. The trade-off is that reflection-heavy libraries commonly used in larger services may need source-generated alternatives.

None of these choices is universally correct. The right deployment mode depends on the operational context: who patches the runtime, how containers are built and deployed, what cold-start budgets exist, and whether multiple applications share a single host.

---

The SDK builds and publishes the application. The host locates and starts the runtime. The CLR takes over once managed execution begins. The BCL provides the API surface. Deployment choices determine how much of that execution environment travels with the application and how much is expected to already exist on the target machine.
