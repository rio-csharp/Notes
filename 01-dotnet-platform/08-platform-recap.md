# Chapter Recap

The .NET platform is a layered execution environment in which each layer has a distinct responsibility, activation mechanism, and failure mode. This chapter established the platform map; the following chapters examine each component at engineering depth.

## Platform Architecture

The platform has three layers: the SDK (build-time tooling), the runtime (execution package: host + CLR + runtime libraries), and the BCL (the public API surface). The SDK produces assemblies containing IL and metadata. The runtime loads those assemblies and executes them. The BCL is the API contract application code programs against. Conflating these layers leads to misdiagnosed failures — a build failure is an SDK problem, a startup crash is a host or runtime problem, and a library bug is a BCL implementation problem.

The host resolution chain is the critical path between `dotnet MyApp.dll` and the first line of managed code. `hostfxr` reads `runtimeconfig.json`, resolves the framework version using roll-forward policy, and `hostpolicy` prepares dependency loading from `deps.json`. Framework-dependent deployment relies on this chain finding a compatible runtime on the machine or in the container image. Self-contained deployment bundles the runtime, shortening the chain and making startup behavior more predictable at the cost of larger artifacts and manual patching. Container deployments add cgroup-aware resource detection — GC heap sizing, thread pool defaults, and processor count are all influenced by container limits, not host machine capacity.

## Compilation And Execution

C# compiles to IL and metadata, not to native code. The JIT translates IL on first invocation; tiered compilation generates quick Tier 0 code for startup and recompiles hot methods at Tier 1 for throughput. The cold-start versus warm-process gap is measurable — hundreds of milliseconds for a typical ASP.NET Core service — and it is a per-process, per-lifetime cost, not a one-time machine-wide event.

ReadyToRun precompiles IL at publish time, reducing cold-start JIT cost while preserving full runtime dynamism. Native AOT compiles to native code entirely, eliminating the JIT but restricting reflection, dynamic loading, and runtime code generation. Trimming removes unreachable code and complements both strategies. The choice among JIT, ReadyToRun, and Native AOT depends on the application's startup sensitivity, dynamism requirements, and operational constraints — measured against the actual workload, not a synthetic benchmark.

## Runtime Services

The CLR provides the managed execution contract: JIT compilation, GC, type safety, exception handling, thread pool scheduling, assembly loading, reflection, and interop. These are not independent features; they form a single execution substrate. Every ASP.NET Core request crosses all of them — JIT compiles the path, the GC manages allocations, the thread pool schedules continuations, and exception handling propagates failures.

GC is generational because most objects die young. Gen 0 collections are frequent and cheap; Gen 2 collections are infrequent and scan the entire heap. The LOH stores objects at or above approximately 85 KB and is collected with Gen 2. Pinned objects create fragmentation hazards and should be freed promptly in allocation-heavy paths. Server GC favors throughput with parallel collection and, starting in .NET 9, DATAS can adapt heap count and heap size to the workload. Workstation GC uses a simpler lower-overhead model. Container memory limits directly affect GC triggering thresholds and heap sizing — a 512 MB container triggers collections earlier than a 16 GB VM.

`IDisposable` releases unmanaged or external resources deterministically; the GC eventually reclaims managed memory. Managed memory leaks are retention-policy bugs — objects remain reachable through static collections, event handlers, timers, or `AsyncLocal` values long after the application logically needs them.

Assembly loading resolves and loads compiled assemblies through `AssemblyLoadContext`. The default context handles project references and NuGet packages. Custom contexts enable plugin isolation, dependency version separation, and unloadable extensions. Unloading requires explicit reference discipline — any lingering reference (a delegate, a static field, an event subscription) anchors the context.

Reflection reads assembly metadata at runtime, enabling frameworks to inspect types, create instances, and consume attributes. Its cost is real: uncached `PropertyInfo.GetValue` can be orders of magnitude slower than direct access in tight loops. Source generators shift work to build time, producing code that is easier to trim, friendlier to Native AOT, and close to hand-written accessors when the generated path is used.

## Deployment And Operations

Deployment mode is both an engineering and operational decision. Framework-dependent deployment centralizes runtime patching. Self-contained deployment eliminates runtime prerequisites. Single-file deployment simplifies distribution. The right choice depends on the operational context: who patches the runtime, how containers are built, what cold-start budgets exist, and whether multiple applications share a host.

The .NET platform is portable, observable, and productive because these layers are well-defined and independently configurable. A platform feature is fully understood only when its execution boundary, configuration point, and at least one realistic verification path are clear. The chapters that follow examine each component at the mechanism level, with concrete examples, trade-off analysis, and verification steps.
