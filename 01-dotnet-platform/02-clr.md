# Common Language Runtime

## Core Idea

The Common Language Runtime (CLR) is the managed execution engine for .NET applications.

Chinese notes:

- `CLR`: Common Language Runtime, 公共语言运行时.
- `type safety`: 类型安全.
- `managed code`: 托管代码.

The CLR provides runtime services so developers do not have to manually handle everything.

In modern .NET, people often use "CLR" to refer to CoreCLR, the runtime engine used by normal server, desktop, console, and worker applications. Other .NET runtimes exist for specialized scenarios, but CoreCLR is the main mental model for ASP.NET Core and most backend work.

Mental model:

```text
Your C# code
  -> compiled IL + metadata
  -> CLR loads and verifies it
  -> JIT compiles IL to native code
  -> CLR services keep execution safe and observable
```

The CLR is not a library you call directly most of the time. It is the managed execution environment your code runs inside.

## CLR Responsibilities

The CLR provides:

- JIT compilation;
- garbage collection;
- type safety;
- exception handling;
- thread management;
- assembly loading;
- security checks;
- reflection metadata access;
- interoperability with unmanaged code.

## How These Responsibilities Work Together

Example:

```csharp
public static int Divide(int left, int right)
{
    return left / right;
}

try
{
    Console.WriteLine(Divide(10, 0));
}
catch (DivideByZeroException ex)
{
    Console.WriteLine(ex.Message);
}
```

Several CLR services are involved:

- JIT compiles `Divide` before or when it runs;
- type safety ensures `int` operations are valid;
- exception handling creates and propagates `DivideByZeroException`;
- stack information helps the runtime unwind to the `catch` block;
- GC eventually collects the exception object when it is unreachable.

This is why "CLR" is broader than "memory management."

## Managed Code

Managed code runs under CLR control.

Benefits:

- memory managed by GC;
- type safety;
- exception handling;
- runtime diagnostics;
- cross-language support.

Unmanaged code runs outside CLR memory safety guarantees. Examples include native C/C++ libraries and operating system APIs.

Interop example:

```csharp
using System.Runtime.InteropServices;

public static partial class NativeMethods
{
    [LibraryImport("kernel32.dll")]
    public static partial uint GetCurrentThreadId();
}
```

In normal ASP.NET Core work, you rarely need interop, but it is useful to understand that managed code can call unmanaged code and that this affects memory/resource responsibility.

## Type Safety

The CLR ensures code uses types consistently.

Example:

```csharp
object value = "hello";

if (value is string text)
{
    Console.WriteLine(text.Length);
}
```

The runtime knows the actual type of the object.

Why this matters:

```csharp
object value = "hello";

// InvalidCastException at runtime because the actual object is string, not int.
var number = (int)value;
```

The compiler cannot always know the runtime type behind `object`, but the CLR checks it at runtime and prevents unsafe memory interpretation.

## Exception Handling

The CLR manages exception propagation.

```csharp
try
{
    ProcessOrder();
}
catch (DomainException ex)
{
    Console.WriteLine(ex.Message);
}
```

Exceptions travel up the call stack until handled.

## Reflection And Metadata

Assemblies contain metadata.

Reflection can inspect metadata:

```csharp
var type = typeof(Order);

foreach (var property in type.GetProperties())
{
    Console.WriteLine(property.Name);
}
```

Frameworks use reflection for:

- dependency injection;
- model binding;
- serialization;
- validation attributes;
- testing frameworks.

## AppDomain And AssemblyLoadContext

.NET Framework used AppDomains heavily for isolation.

Modern .NET uses `AssemblyLoadContext` for assembly loading scenarios like plugins.

Modern .NET note:

> In modern .NET, `AssemblyLoadContext` is the main mechanism for custom assembly loading and unloading.

## Review Questions

### What does CLR do?

> CLR executes .NET applications and provides services such as JIT compilation, garbage collection, type safety, exception handling, thread management, and assembly loading.

### What is managed code?

> Managed code is code executed under CLR control, with runtime services like memory management and type safety.

### Why is metadata important?

> Metadata describes types, methods, attributes, and references. It enables reflection, runtime discovery, serialization, dependency injection, and tooling.

### CLR vs runtime?

> The CLR is the core execution engine inside the .NET runtime. The broader runtime also includes runtime libraries and hosting components needed to start and run the application.

### CLR vs SDK?

> The SDK is used to create, build, test, and publish applications. The CLR is used when the compiled application runs.

## Common Mistakes

### Mistake: Thinking CLR only does garbage collection.

Why it is wrong:

> GC is important, but the CLR also handles JIT compilation, type safety, exception handling, assembly loading, thread management, metadata access, and interop.

Better answer:

> CLR is the execution engine for .NET, not just the garbage collector.

### Mistake: Confusing CLR with C# compiler.

Why it is wrong:

> The C# compiler turns source code into IL and metadata. The CLR runs the compiled assembly and provides runtime services.

Better answer:

> Roslyn compiles C#; CLR executes .NET code.

### Mistake: Forgetting JIT and metadata.

Why it is wrong:

> IL is not directly executed by the CPU. The runtime JIT-compiles IL to native code, and metadata enables reflection, type loading, DI, serialization, and tooling.

Better answer:

> A complete CLR explanation should mention IL, metadata, JIT, GC, exceptions, and type safety.

### Mistake: Assuming reflection has no runtime cost.

Why it is wrong:

> Reflection often resolves metadata and members dynamically, which is slower than normal compiled member access. Dynamic invocation can also cause boxing and extra checks.

Better answer:

> Reflection is powerful for frameworks, but in hot paths it should be cached or replaced with compiled delegates/source generation when needed.
