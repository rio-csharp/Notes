# ASP.NET Core Request Pipeline

## Core Idea

The ASP.NET Core request pipeline is the execution model through which every HTTP request passes. It is built from middleware components that can inspect the request, alter the request or response, invoke the next component, or end the request early by producing the response themselves.

This pipeline model is one of the most important ideas in ASP.NET Core because many framework behaviors that appear separate at first glance are actually consequences of ordered pipeline execution. Error handling, static files, routing, CORS, authentication, authorization, and endpoint execution all depend on where they sit in that chain.

## Building The Pipeline

At startup, middleware is registered in sequence:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

That code does not process a request immediately. It builds a request delegate graph that will later run for each incoming request. Conceptually, the pipeline behaves like nested delegates:

```text
MiddlewareA(
  MiddlewareB(
    MiddlewareC(
      Endpoint)))
```

This explains why each middleware can run code both before and after the next component.

## The Request And Response Flow

The easiest way to picture the pipeline is as a forward request path and a returning response path.

```text
Request
  -> exception handling
  -> HTTPS redirection
  -> static files
  -> routing
  -> CORS
  -> authentication
  -> authorization
  -> endpoint execution
Response
  <- back through the same middleware chain
```

Middleware can therefore wrap downstream work:

```csharp
app.Use(async (context, next) =>
{
    var start = DateTimeOffset.UtcNow;

    await next();

    var elapsed = DateTimeOffset.UtcNow - start;
    app.Logger.LogInformation(
        "Request {Method} {Path} completed with {StatusCode} in {Elapsed}ms",
        context.Request.Method,
        context.Request.Path,
        context.Response.StatusCode,
        elapsed.TotalMilliseconds);
});
```

Code before `await next()` runs on the request path. Code after it runs on the response path. That wrapper model is why timing, correlation, scoped logging, and response header enrichment fit so naturally into middleware.

## Ordering Is Behavior

Pipeline order is not cosmetic. It determines what state later components can rely on.

A production-oriented ordering often looks like this:

```csharp
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapControllers();
```

Each placement carries a reason:

- exception handling should wrap most downstream work;
- HTTPS redirection should happen before ordinary processing;
- routing must run before endpoint-aware components;
- authentication must build the user before authorization evaluates it;
- endpoint execution belongs near the end.

Because the request pipeline is ordered execution rather than declarative configuration, misplaced middleware often causes subtle bugs that look like security, routing, or framework problems when the real issue is ordering.

## Short-Circuiting

Middleware is allowed to stop the pipeline early by not calling the next delegate.

```csharp
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Client-Version"))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Missing X-Client-Version header"
        });
        return;
    }

    await next();
});
```

This is called short-circuiting. It is not an edge case. Many important framework behaviors rely on it:

- static file middleware can serve a file directly;
- authentication middleware can challenge;
- authorization middleware can forbid;
- health-check endpoints can return immediately;
- maintenance or rate-limiting middleware can reject early.

Understanding short-circuiting helps explain why not every request reaches controllers or Minimal API handlers.

## `HttpContext` As Request State

Kestrel accepts the HTTP request and ASP.NET Core creates an `HttpContext` to represent that request inside the application.

`HttpContext` exposes the high-level state that middleware and endpoints interact with:

- `Request`
- `Response`
- `User`
- `Items`
- `RequestServices`
- `Connection`
- `TraceIdentifier`
- selected `Endpoint` after routing

```csharp
app.Use(async (context, next) =>
{
    context.Items["StartTime"] = TimeProvider.System.GetUtcNow();
    await next();
});
```

`HttpContext.Items` is especially useful for per-request data that should flow through the pipeline without resorting to static state or global caches. Because the context is request-scoped, it is the natural place for transient request metadata.

## Routing And Endpoint Selection

Modern ASP.NET Core separates endpoint matching from endpoint execution.

```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

At a high level, the process looks like this:

```text
UseRouting:
  match request to an endpoint
  attach endpoint metadata to HttpContext

UseAuthentication:
  build HttpContext.User

UseAuthorization:
  evaluate endpoint metadata and user identity

Endpoint execution:
  invoke controller or Minimal API handler
```

This separation is important because authorization often depends on metadata attached to the selected endpoint, such as `[Authorize]`, required policies, or other routing-attached behavior. If routing has not yet selected an endpoint, that metadata does not exist. If authentication has not yet built the user principal, authorization cannot evaluate it correctly.

## Dependency Injection Scope Per Request

ASP.NET Core creates a dependency injection scope for each HTTP request. Scoped services therefore live for the duration of that request and are reused within it.

```text
Request 1
  AppDbContext instance A
  OrderService instance A

Request 2
  AppDbContext instance B
  OrderService instance B
```

This request scope connects the pipeline to the dependency system. Controllers are created inside it. Minimal API parameters can resolve services from it. Middleware can also access scoped services, but the lifetime model matters.

```csharp
public sealed class GoodMiddleware
{
    private readonly RequestDelegate _next;

    public GoodMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
    {
        await _next(context);
    }
}
```

This pattern is preferable to capturing scoped services in the middleware constructor, because middleware instances are generally long-lived while scoped services are request-specific.

## Exception Handling In The Pipeline

Exception middleware only catches exceptions thrown by components that run after it.

```csharp
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();

app.UseExceptionHandler();
```

That placement is one reason exception handling belongs early in the pipeline. If the exception-handling middleware is registered too late, failures in earlier middleware or startup-path behavior may bypass it entirely.

This also helps explain why global exception middleware and MVC exception filters are not interchangeable. Middleware protects a broad slice of the HTTP pipeline. Filters only operate once MVC execution has already begun.

## The Pipeline As The Platform Spine

Most of the rest of ASP.NET Core can be understood as specialized behavior layered into this request pipeline. Middleware controls the broad HTTP flow. Routing chooses an endpoint. Authentication and authorization shape who may continue. Model binding and controller or Minimal API execution happen later as endpoint-specific behavior.

For that reason, the request pipeline is not just one feature among many. It is the platform spine on which the other HTTP-facing features depend.
