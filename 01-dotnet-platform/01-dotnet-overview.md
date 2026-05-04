# .NET Platform Overview

## Core Idea

.NET is a modern, cross-platform development platform for building web APIs, desktop apps, cloud services, background workers, mobile apps, games, and command-line tools.

Chinese notes:

- `runtime`: 运行时.
- `SDK`: software development kit, 开发工具包.
- `BCL`: Base Class Library, 基础类库.
- `assembly`: 程序集.

## .NET Components

Think of .NET in layers:

```text
.NET platform
  -> SDK: build, test, publish tools
  -> Runtime: runs compiled apps
      -> CLR: execution engine
          -> GC, JIT, exception handling, type safety, thread pool, assembly loading
      -> runtime libraries / BCL implementation
  -> BCL APIs: collections, IO, networking, JSON, diagnostics
```

This layering matters because documentation, tooling, and daily engineering conversations often use these terms loosely. A precise mental model helps you understand the boundary between tools, runtime execution, and libraries.

### Runtime

The runtime executes .NET applications.

At a high level, the runtime includes the host components that start the application, the CLR execution engine, and runtime library implementations required by the application.

It includes:

- CLR;
- native hosting components;
- runtime configuration handling;
- runtime library implementations.

The CLR provides services such as:

- garbage collection;
- JIT compilation;
- exception handling;
- type safety;
- thread pool;
- assembly loading.

The runtime libraries implement many `System.*` APIs used by applications. In everyday language, people often say ".NET runtime" to mean this whole execution package.

Example:

```csharp
var names = new List<string> { "Alice", "Bob" };
var json = JsonSerializer.Serialize(names);
```

In this tiny example:

- the compiler comes from the SDK when you build;
- `List<T>` and `JsonSerializer` come from base libraries;
- the runtime loads the app;
- the CLR executes code, JIT-compiles methods, manages memory, and handles exceptions.

### SDK

The SDK includes tools to build and publish apps.

Examples:

```bash
dotnet new webapi
dotnet build
dotnet test
dotnet publish
```

### BCL

The Base Class Library provides common APIs:

- collections;
- file I/O;
- networking;
- JSON;
- reflection;
- threading;
- cryptography;
- diagnostics.

Important nuance:

> The BCL is the set of common APIs you program against. The runtime includes the implementation needed to run those APIs. In everyday conversation people often say "BCL" for both the API surface and its runtime implementation, but in engineering practice you can simply say that .NET includes rich base libraries plus the runtime that executes them.

## How The Pieces Fit Together In A Web API

For an ASP.NET Core API, the pieces show up like this:

```text
Developer machine / CI
  -> SDK restores packages and builds projects
  -> C# compiler produces assemblies

Production runtime
  -> dotnet host starts the app
  -> runtime reads runtimeconfig/deps files
  -> CLR loads assemblies
  -> JIT compiles methods as needed
  -> BCL/runtime libraries provide APIs such as networking, JSON, logging, and diagnostics
```

This separation explains why a build server needs the SDK, while a production server may need only the runtime for a framework-dependent deployment.

## Build Time vs Run Time

Many beginner answers mix build-time and run-time responsibilities.

Build time:

```text
dotnet build
  -> restore NuGet packages
  -> compile C# to IL
  -> produce assemblies
```

Run time:

```text
dotnet MyApp.dll
  -> host starts app
  -> runtime loads assemblies
  -> CLR JIT-compiles methods
  -> GC manages heap memory
```

Example:

```powershell
dotnet new console -n PlatformDemo
cd PlatformDemo
dotnet build
dotnet run
```

What to notice:

- `dotnet build` needs the SDK;
- `dotnet run` builds and then runs;
- running a published app only needs a compatible runtime if it is framework-dependent;
- self-contained deployment includes the runtime with the app.

## .NET vs .NET Framework vs .NET Core

`.NET Framework`:

- Windows-only;
- legacy enterprise apps;
- older ASP.NET MVC/Web Forms/WCF scenarios.

`.NET Core`:

- cross-platform rewrite;
- high-performance;
- predecessor of modern `.NET`.

Modern `.NET`:

- unified platform;
- cross-platform;
- used for ASP.NET Core, worker services, console apps, cloud-native apps.

Practical explanation:

> Modern .NET is the unified successor to .NET Core. It is cross-platform and high-performance. .NET Framework is older and Windows-focused, still used in legacy systems.

## Project, Solution, Assembly

Solution:

```text
MyApp.sln
```

Projects:

```text
MyApp.Api.csproj
MyApp.Application.csproj
MyApp.Domain.csproj
MyApp.Infrastructure.csproj
```

Assembly:

```text
MyApp.Api.dll
```

A project usually compiles into an assembly.

## NuGet

NuGet is the package manager for .NET.

Example:

```bash
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
```

Dependency hygiene:

- check package maintenance;
- check license;
- check vulnerabilities;
- avoid unnecessary dependencies.

## Target Framework

Example:

```xml
<TargetFramework>net8.0</TargetFramework>
```

This tells the compiler/runtime which .NET version and APIs the project targets.

Example:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

If a project targets `net8.0`, it can use .NET 8 APIs. If a server only has an older runtime installed, a framework-dependent `net8.0` app will not run correctly.

## Deployment Models

### Framework-dependent

The target machine needs .NET runtime installed.

Pros:

- smaller deployment;
- runtime can be shared.

Cons:

- runtime must exist on server.

### Self-contained

Application includes the .NET runtime.

Pros:

- no runtime installation required;
- predictable runtime version.

Cons:

- larger deployment size.

### Single-file

Publish app as one executable.

Useful for:

- CLI tools;
- simple services;
- deployment simplicity.

## Review Questions

### What is .NET?

> .NET is a cross-platform development platform with a runtime, SDK, compilers, libraries, and tools for building different types of applications, including web APIs and cloud services.

### SDK vs Runtime?

> Runtime runs applications. SDK includes runtime plus tools to build, test, and publish applications.

### Is GC part of the runtime or part of the CLR?

> The precise answer is that GC is part of the CLR. The runtime includes the CLR, and the CLR provides garbage collection as one of its core services. In casual conversation, people may say "the .NET runtime provides GC," which is not completely wrong, but the more accurate layering is runtime -> CLR -> GC/JIT/exception handling and other services.

### What is an assembly?

> An assembly is a compiled .NET unit, usually a `.dll` or `.exe`, containing IL, metadata, and resources.

### What happens when I run `dotnet run`?

> `dotnet run` is an SDK command. It builds the project if needed, then starts the application. The runtime loads the produced assembly, the CLR executes it, methods are JIT-compiled as needed, and GC manages managed heap memory.

### Framework-dependent vs self-contained deployment?

> Framework-dependent deployment relies on a compatible .NET runtime already installed on the target machine. Self-contained deployment includes the runtime with the application, which makes deployment more predictable but larger.

## Common Mistakes

### Mistake: Confusing .NET Framework with modern .NET.

Why it is wrong:

> .NET Framework is the older Windows-only platform. Modern .NET is cross-platform and is the main platform for new ASP.NET Core, worker service, and cloud-native development.

Better answer:

> .NET Framework is mostly legacy Windows enterprise technology; modern .NET is the unified successor to .NET Core.

### Mistake: Installing runtime only and expecting to build apps.

Why it is wrong:

> The runtime can run compiled apps, but it does not include all build tools. The SDK includes the compiler, CLI templates, build tools, and publish support.

Better answer:

> Use the SDK for development and build pipelines. Use the runtime when a server only needs to run an already-built app.

### Mistake: Not understanding target framework.

Why it is wrong:

> The target framework controls which APIs and runtime version the app expects. A library targeting a newer framework may not run in an older application.

Better answer:

> `net8.0`, for example, means the project targets .NET 8 APIs and runtime behavior.

### Mistake: Adding packages without checking security or maintenance.

Why it is wrong:

> Dependencies become part of your production risk. Unmaintained or vulnerable packages can create security issues, upgrade problems, or supply-chain risk.

Better answer:

> Check package maintenance, license, vulnerabilities, compatibility, and whether the dependency is really needed.
