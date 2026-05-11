# Nginx, IIS, And Kestrel

## Core Idea

ASP.NET Core applications run on Kestrel. In production, Kestrel is often placed behind a reverse proxy such as Nginx, IIS, a cloud load balancer, or an ingress controller.

Typical request flow:

```text
Browser
  -> DNS
  -> load balancer / reverse proxy
  -> Kestrel
  -> ASP.NET Core middleware pipeline
  -> endpoint
```

## Kestrel

Kestrel is cross-platform and high-performance.

It can:

- accept HTTP requests;
- support HTTP/1.1, HTTP/2, and HTTP/3 depending on configuration;
- serve ASP.NET Core endpoints;
- run directly in containers;
- run behind IIS, Nginx, YARP, cloud gateways, or Kubernetes ingress.

Simple configuration:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 10 * 1024 * 1024;
    options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(30);
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(2);
});

var app = builder.Build();

app.MapGet("/health/live", () => Results.Ok(new { status = "live" }));

app.Run();
```

In many deployments, port binding is configured through environment variables:

```text
ASPNETCORE_HTTP_PORTS=8080
```

For .NET 8+ container images, `8080` is the default ASP.NET Core port and `ASPNETCORE_HTTP_PORTS` is the simpler port setting. `ASPNETCORE_URLS` still works when the application needs URL-level control over scheme, host, and port.

## Reverse Proxy Responsibilities

A reverse proxy commonly handles:

- TLS certificates;
- HTTP to HTTPS redirect;
- request routing;
- load balancing;
- compression;
- static files;
- request body size limits;
- security headers;
- WebSocket upgrades;
- connection timeouts;
- access logs;
- forwarding headers.

Kestrel can serve internet traffic directly in some setups, but a reverse proxy often gives better operational control.

## Forwarded Headers

Behind a proxy, Kestrel may see:

```text
Remote IP: proxy IP
Scheme: http
Host: internal service name
```

But the original client request may have been:

```text
Client IP: 203.0.113.10
Scheme: https
Host: api.example.com
```

Forwarded headers preserve that information:

```text
X-Forwarded-For: 203.0.113.10
X-Forwarded-Proto: https
X-Forwarded-Host: api.example.com
```

ASP.NET Core configuration:

```csharp
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedProto |
        ForwardedHeaders.XForwardedHost;

    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();

app.UseHttpsRedirection();

app.MapGet("/", (HttpContext http) => new
{
    scheme = http.Request.Scheme,
    host = http.Request.Host.ToString(),
    remoteIp = http.Connection.RemoteIpAddress?.ToString()
});

app.Run();
```

Only trust forwarded headers from trusted proxies. If the app accepts these headers directly from the public internet, clients can spoof IP addresses and schemes.

In a locked-down deployment, configure known proxy IP ranges instead of clearing them.

## Nginx Reverse Proxy

Basic Nginx configuration:

```nginx
server {
    listen 80;
    server_name api.example.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Common Nginx checks:

```powershell
nginx -t
systemctl reload nginx
journalctl -u nginx --no-pager -n 100
```

## Serving A React SPA With Nginx

React apps using client-side routing need fallback to `index.html`.

```nginx
server {
    listen 80;
    server_name app.example.com;

    root /usr/share/nginx/html;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

Without fallback, refreshing `/orders/123` may return 404 because Nginx looks for a real file at that path.

## Proxying API And SPA Together

One domain can serve both frontend and API:

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://orders-api:8080/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

This can simplify browser CORS because the frontend and API share the same origin.

## WebSocket Proxying

WebSockets require connection upgrade headers.

Nginx:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl http2;
    server_name realtime.example.com;

    location /hub/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
    }
}
```

ASP.NET Core SignalR endpoint:

```csharp
builder.Services.AddSignalR();

var app = builder.Build();

app.MapHub<NotificationsHub>("/hub/notifications");

app.Run();
```

Common symptom:

```text
Normal API requests work, but SignalR/WebSocket disconnects quickly.
```

Possible causes:

- missing upgrade headers;
- proxy read timeout too low;
- load balancer idle timeout;
- sticky sessions needed for some scaling modes;
- WebSockets disabled in the hosting platform.

## IIS Hosting

On Windows, IIS hosts ASP.NET Core through the ASP.NET Core Module.

Flow:

```text
IIS
  -> ASP.NET Core Module
  -> starts or forwards to Kestrel
  -> ASP.NET Core app
```

Common `web.config` generated by publish:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="aspNetCore"
           path="*"
           verb="*"
           modules="AspNetCoreModuleV2"
           resourceType="Unspecified" />
    </handlers>
    <aspNetCore processPath="dotnet"
                arguments=".\Api.dll"
                stdoutLogEnabled="false"
                stdoutLogFile=".\logs\stdout"
                hostingModel="inprocess" />
  </system.webServer>
</configuration>
```

IIS is useful when:

- the organization already uses Windows Server;
- Windows authentication is required;
- existing operational tooling expects IIS;
- apps are deployed through IIS-based processes.

## Request Size Limits

Limits may exist in multiple layers:

```text
Browser/client
  -> CDN/load balancer
  -> Nginx/IIS
  -> Kestrel
  -> ASP.NET Core middleware/model binding
  -> application code
```

Kestrel:

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 25 * 1024 * 1024;
});
```

Minimal API endpoint-specific limit:

```csharp
app.MapPost("/files", async (IFormFile file) =>
{
    return Results.Ok(new { file.FileName, file.Length });
})
.RequireAuthorization()
.DisableAntiforgery();
```

Nginx:

```nginx
client_max_body_size 25m;
```

IIS `web.config`:

```xml
<system.webServer>
  <security>
    <requestFiltering>
      <requestLimits maxAllowedContentLength="26214400" />
    </requestFiltering>
  </security>
</system.webServer>
```

If upload fails, check every layer.

## Security Headers

A reverse proxy can add baseline security headers.

Nginx:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

Content Security Policy is powerful but should be tested carefully:

```nginx
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; object-src 'none'; frame-ancestors 'none';" always;
```

ASP.NET Core can also add headers:

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    context.Response.Headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});
```

Avoid duplicating conflicting headers across proxy and app.

## Health Checks Through A Proxy

ASP.NET Core:

```csharp
builder.Services.AddHealthChecks();

var app = builder.Build();

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");
```

Nginx can expose or route health checks:

```nginx
location /health/ {
    proxy_pass http://127.0.0.1:8080;
    access_log off;
}
```

Health endpoints should not expose secrets, stack traces, or internal dependency details to public users.

## Common Proxy Problems

| Symptom | Likely Cause |
| --- | --- |
| Infinite HTTPS redirect | `X-Forwarded-Proto` missing or not trusted |
| Generated callback URL uses `http` | forwarded headers not configured |
| Client IP is proxy IP | `X-Forwarded-For` missing or not trusted |
| Upload fails with 413 | body size limit too small in proxy or app |
| Random 502/503 | app not running, wrong upstream, timeout, no ready backend |
| WebSocket disconnects | missing upgrade headers or idle timeout |
| SPA route refresh returns 404 | no `try_files` fallback to `index.html` |
| Auth callback fails | wrong host/scheme behind proxy |
