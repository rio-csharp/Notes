# Browser Attacks, Request Forgery, And Injection Surfaces

## Core Idea

Some of the most important web security failures occur at input and rendering boundaries: untrusted data becomes executable script, the browser sends authenticated requests the user did not intend, or application input alters backend command meaning. XSS, CSRF, and injection are classic examples because they expose how thin the line can be between data and behavior.

## Cross-Site Scripting

Cross-site scripting occurs when attacker-controlled content is interpreted as executable script in the victim's browser.

Modern frontend frameworks reduce some XSS risk by escaping ordinary text output by default, but they do not eliminate the problem. Rich HTML rendering, unsafe third-party content, URL handling, and compromised dependencies can still reintroduce executable content.

This is why "we use React" is not a sufficient XSS strategy. Framework escaping helps, but dangerous rendering paths still need explicit control and sanitization.

## XSS And Token Theft

XSS matters especially in token-based applications because malicious script can often read browser-accessible storage, manipulate the DOM, exfiltrate data, and act as the user within the origin.

That is one reason token-storage decisions and XSS defense are tightly connected. A storage choice that is acceptable under strong output safety may become much riskier when rich HTML or third-party script exposure increases.

## Content Security Policy

Content Security Policy is valuable as defense in depth. It does not replace output encoding or HTML sanitization, but it can meaningfully constrain which scripts may run and where content may be loaded from.

This is characteristic of mature security controls: the main defense should be correct rendering and sanitization, while CSP reduces the blast radius when something else goes wrong.

## Cross-Site Request Forgery

CSRF occurs when the browser sends an authenticated request that the user did not intentionally make, typically because cookies are sent automatically with cross-site requests.

This is why CSRF risk depends strongly on the authentication model. Cookie-based sessions or refresh flows require deliberate CSRF thinking. Token-in-header APIs are less exposed to classic CSRF, but they often carry stronger XSS concerns instead.

The SameSite cookie attribute directly addresses this. `SameSite=Strict` prevents the cookie from being sent on any cross-site request, but breaks legitimate cross-site navigation flows such as OAuth callbacks or embedded widgets. `SameSite=Lax` (the modern browser default) permits cookies on top-level navigations using safe HTTP methods, which covers most legitimate use cases while blocking malicious cross-site requests from POST forms, images, or scripts. Choosing between Lax and Strict is a judgment call based on whether the application needs to support cross-site redirect flows.

No session model has zero risks. Different strategies shift where the primary browser-side danger lies.

## CSRF Defenses

Common defenses include:

- same-site cookie settings;
- antiforgery tokens;
- origin or referer checking;
- avoiding unsafe state-changing `GET` requests;
- using custom headers in controlled API clients.

In ASP.NET Core, the antiforgery system uses the synchronizer token pattern. The server embeds a token in rendered forms, and the client sends it back on state-changing requests. The `AutoValidateAntiforgeryToken` attribute applies validation to unsafe HTTP methods (POST, PUT, PATCH, DELETE) while skipping GET and HEAD requests. The stricter `ValidateAntiForgeryToken` requires a token on every request. Razor Pages and MVC with `AddControllersWithViews` include this by default, but `AddControllers` (used for Web API projects without views) does not -- a common oversight.

Starting with .NET 8, the `IAntiforgery` service is also available for minimal APIs through `AddAntiforgery` and `UseAntiforgery` middleware, with support for selectively disabling validation on specific endpoints using `.DisableAntiforgery()`.

These controls are strongest when they are treated as part of the session design rather than bolted on at the end.

## SQL Injection And Interpreter Boundaries

SQL injection happens when untrusted input changes the meaning of a database query rather than remaining a data value inside it.

The defense is conceptually simple: data should remain data. Parameterization, query abstraction, input structure validation, and least-privilege database accounts all support that rule.

This is also why dynamic identifiers such as column names require separate care. SQL parameters protect values, not arbitrary structural fragments of a query.

## Whitelists And Structured Variation

Some variability is legitimate, such as letting the client choose a sort field. The safe way to support that is through explicit whitelisting and mapping rather than direct string concatenation.

This principle applies broadly beyond SQL. If user input must influence structure, the structure should come from a constrained set of known options rather than from free-form text.

## Design Consequences

XSS, CSRF, and SQL injection all teach the same lesson: a secure web system must preserve the boundary between untrusted data and executable behavior. Safe rendering, session-aware request protection, parameterized queries, and explicit structural whitelists are all expressions of that same discipline.

Once that discipline becomes habitual, many vulnerability classes become easier to prevent before they reach code review or penetration testing.
