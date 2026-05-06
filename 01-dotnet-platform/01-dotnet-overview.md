# .NET Platform Overview

## Core Idea

.NET is a modern, cross-platform development platform for building web APIs, desktop apps, cloud services, background workers, mobile apps, games, and command-line tools.

This opening chapter is not trying to explain every part of .NET at full depth. Its job is to establish the platform map that the rest of the chapter will refine: what the SDK does, what the runtime does, where the CLR fits, and why deployment choices affect how an application starts and runs.

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

A small example makes the layering concrete:

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

The SDK belongs to the build side of the platform. It provides the tools that create, restore, test, and publish applications.

Examples:

```bash
dotnet new webapi
dotnet build
dotnet test
dotnet publish
```

### BCL

The Base Class Library provides the common APIs that application code uses for collections, file I/O, networking, JSON, reflection, threading, cryptography, and diagnostics.

The useful distinction is this: the BCL is the API surface you program against, while the runtime contains the implementation that executes those APIs. In everyday conversation those ideas are often blurred together, but keeping them separate helps clarify what belongs to tooling, what belongs to execution, and what belongs to library design.

## Platform Flow In A Web API

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

You can also see the build-side versus run-side split directly in publish output.

After:

```bash
dotnet publish -c Release
```

a framework-dependent publish commonly contains artifacts such as:

```text
MyApp.dll
MyApp.deps.json
MyApp.runtimeconfig.json
appsettings.json
```

If the publish is self-contained, the output also includes runtime files or a platform-specific host executable, because the target machine is no longer expected to provide the runtime separately.

## Host And Runtime Resolution

Between `dotnet MyApp.dll` and "CLR starts executing code", there is an important host layer.

At a high level, startup looks like this:

```text
dotnet MyApp.dll
  -> native host starts
  -> hostfxr reads runtime configuration
  -> framework resolution chooses shared frameworks and runtime version
  -> hostpolicy prepares dependency loading rules
  -> CoreCLR is loaded
  -> managed entry point starts
```

Important runtime artifacts:

- `runtimeconfig.json`: describes the target runtime and framework requirements;
- `deps.json`: describes dependency assets and assembly resolution metadata;
- app host: optional native executable created for the application;
- shared frameworks: centrally installed framework packs such as `Microsoft.NETCore.App` and `Microsoft.AspNetCore.App`.

This host layer matters because deployment, framework resolution, runtime roll-forward, and startup failures often happen before the CLR begins executing managed code.

For example, if the application targets a framework that is not installed, or if the runtime selection rules do not find a compatible framework version, startup can fail before any of your C# code runs.

Framework-dependent deployment relies heavily on this resolution process. Self-contained deployment packages the runtime with the application, so framework resolution becomes more predictable because fewer external runtime dependencies remain.

A concrete startup failure helps make this boundary real. If a machine has only .NET 7 installed and the application requires `net8.0`, a framework-dependent app may fail during host resolution with a message about a missing compatible framework. That failure happens before your `Program.cs` entry point runs. Operationally, this is a host/runtime packaging problem, not an application-logic bug.

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

For example:

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

In practice, modern .NET is the unified successor to .NET Core. It is cross-platform and high-performance. .NET Framework is older and Windows-focused, and it mainly remains in legacy enterprise systems.

## Target Framework

The target framework tells the compiler and runtime which .NET version and API set the project expects.

For example:

```xml
<TargetFramework>net8.0</TargetFramework>
```

In a project file that may look like this:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

If a project targets `net8.0`, it can use .NET 8 APIs. If a framework-dependent deployment runs on a machine that only has an older or otherwise incompatible runtime, startup will fail before the application can run normally.

## Deployment Models

### Framework-dependent

The target machine needs .NET runtime installed.

Operational advantages:

- smaller deployment;
- runtime can be shared.

Operational limitations:

- runtime must exist on server.

### Self-contained

Application includes the .NET runtime.

Operational advantages:

- no runtime installation required;
- predictable runtime version.

Operational limitations:

- larger deployment size.

### Single-file

Publish app as one executable.

Useful for:

- CLI tools;
- simple services;
- deployment simplicity.

Concrete publish commands make the distinction easier to remember:

```bash
dotnet publish -c Release
dotnet publish -c Release -r win-x64 --self-contained true
dotnet publish -c Release -r linux-x64 -p:PublishSingleFile=true --self-contained true
```

These commands are not the main point of the chapter, but they make the deployment model less theoretical. The publish shape changes because the execution boundary changes.

Framework-dependent deployment assumes a compatible .NET runtime already exists on the target machine. Self-contained deployment packages the runtime with the application, which increases size but makes runtime behavior more predictable.

## Deployment Trade-offs In Practice

Deployment mode affects more than file size.

| Mode | Runtime Source | Operational Strength | Operational Cost |
| --- | --- | --- | --- |
| Framework-dependent | machine-provided shared runtime | smaller deployment, central runtime servicing | runtime availability and compatibility must be managed |
| Self-contained | packaged with the app | predictable runtime behavior, simpler machine requirements | larger deployment, duplicate runtime bits across apps |
| Single-file | packaged as one distribution unit | simpler delivery and handling | extraction, diagnostics, and packaging behavior may be less transparent |

Publishing choices also affect patching and diagnostics. Framework-dependent apps can benefit from centrally patched runtimes, while self-contained apps require republishing if the bundled runtime must change. This is one reason deployment mode is both an engineering decision and an operational one.

At this stage, the important outcome is a stable mental map. The SDK creates and publishes the application. The host selects and starts the runtime. The CLR participates once managed execution begins. Libraries provide the API surface the application uses. Deployment choices determine how much of that execution environment is expected to exist on the machine already and how much travels with the application itself.
