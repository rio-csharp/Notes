# Versioning And Contract Evolution

## Core Idea

API versioning exists because contracts outlive server deployments. Some clients cannot upgrade immediately, some are outside the team's operational control, and some depend on response shapes or behavior that would break if changed casually. Versioning is therefore not a badge of maturity by itself. It is a response to real contract longevity.

The deeper goal is not to create versions eagerly. It is to evolve the contract carefully enough that new versions are introduced only when compatibility can no longer be preserved.

## Conditions That Create Versioning Pressure

Versioning pressure usually rises when:

- the API is public or externally consumed;
- mobile or installed clients update slowly;
- multiple client versions coexist for long periods;
- independent deployment schedules prevent coordinated upgrades;
- breaking changes are unavoidable.

Internal APIs may also need versioning if teams deploy independently and consumer coordination is weak.

## Backward Compatibility First

The best versioning strategy is often to avoid versioning pressure through careful backward-compatible change.

Usually safe:

- add an optional response field;
- add an optional request field;
- add a new endpoint;
- expand behavior in a way old clients can ignore.

Usually breaking:

- remove or rename a field;
- change a field type;
- change semantic meaning;
- change requiredness;
- remove an endpoint;
- change status-code behavior in a way clients depend on.

This distinction matters because versioning should not become an excuse for careless contract change. It should be reserved for cases where compatibility has truly run out.

## Common Versioning Strategies

Several strategies are common:

URL versioning:

```http
GET /api/v1/orders
GET /api/v2/orders
```

Query-string versioning:

```http
GET /api/orders?api-version=1.0
```

Header versioning:

```http
GET /api/orders
X-API-Version: 1.0
```

Media-type versioning:

```http
Accept: application/vnd.company.orders.v1+json
```

Each is valid in the right environment. The choice depends less on ideology than on visibility, tooling support, caching implications, and how explicit the team wants version selection to be for clients.

## Versioning As Contract Narrative

A version is not just a routing token. It is a statement that the contract has diverged meaningfully.

For example, changing:

- `status` to `state`;
- `total` from a number to an object containing amount and currency;
- validation or state-transition behavior in incompatible ways

may justify a new version because the client must now reason about a materially different representation.

The important point is that version boundaries should correspond to real contract differences, not to arbitrary release numbers.

## Deprecation And Sunset

Versioning without deprecation discipline produces API sprawl. Once a new version exists, the old one needs a managed retirement path:

1. announce deprecation;
2. publish a migration guide;
3. measure client usage;
4. support both versions for a defined period;
5. retire the old version on a communicated sunset date.

Headers such as `Deprecation`, `Sunset`, and documentation links can make that lifecycle visible to clients rather than leaving the transition entirely to out-of-band communication.

## Migration Guidance As Part Of The Contract

When an API changes meaningfully, clients need more than a version number. They need a narrative:

- what changed;
- what remains compatible;
- what client code must do differently;
- what the sunset date is;
- whether old and new versions can coexist temporarily.

This is one reason versioning is partly a documentation problem and not only a routing problem. A technically correct multi-version API can still fail in practice if clients cannot understand how to migrate safely.

## Tooling In ASP.NET Core

ASP.NET Core supports structured versioning approaches through packages such as `Asp.Versioning.Mvc` and `Asp.Versioning.Mvc.ApiExplorer`. Those tools are useful because they keep version selection, routing, and documentation aligned.

The tooling matters, but the architectural lesson matters more: versioning should be explicit, observable, and tied to documentation generation so that each supported contract surface remains understandable.

## Design Consequences

Versioning is a consequence of contract longevity. The healthier the API is at backward-compatible evolution, the less often a new version is needed. When a new version is necessary, it should represent a clear contract divergence, come with a migration path, and fit into a managed deprecation lifecycle rather than becoming a permanent parallel universe.
