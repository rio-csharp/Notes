# Logging System Design

## Problem

Design a centralized logging system for applications and services.

## Requirements

Functional:

- collect logs from services;
- search logs;
- filter by service, level, trace ID, tenant;
- alert on errors;
- retain logs for a period.

Non-functional:

- high write throughput;
- durable enough;
- searchable;
- cost-controlled;
- secure.

## Architecture

```text
Applications
  -> Log Agent / SDK
  -> Queue / Stream
  -> Log Processor
  -> Elasticsearch / OpenSearch
  -> Dashboard / Alerting
```

## Log Format

Use structured JSON:

```json
{
  "timestamp": "2026-04-28T12:00:00Z",
  "level": "Error",
  "service": "orders-api",
  "message": "Failed to create order",
  "traceId": "abc",
  "tenantId": "t1",
  "exception": "..."
}
```

## Ingestion

Options:

- app sends directly;
- sidecar/agent collects stdout;
- log forwarder;
- Kafka pipeline.

Avoid blocking app on log storage.

Typical reliable path:

```text
Application stdout
  -> node/sidecar agent
  -> queue or stream
  -> processor
  -> search index and cold storage
```

Applications should not synchronously write logs to a remote search cluster inside the request path.

## Indexing

Index fields:

- timestamp;
- service;
- level;
- traceId;
- tenantId;
- eventId.

## Retention

Different retention by log type:

- debug logs: short;
- error logs: longer;
- audit logs: compliance-based;
- security logs: longer and protected.

Use tiered storage:

```text
hot searchable logs: 7-14 days
warm logs: 30-90 days
cold archive: policy-based
```

## Cost Controls

Use:

- log levels;
- sampling for noisy info logs;
- retention policies;
- dropping low-value fields;
- separating audit/security logs;
- avoiding high-cardinality indexes when unnecessary.

High-cardinality fields such as full user input, unique request URLs, or raw exception messages can increase index cost.

## Query Examples

```text
traceId = "abc123"
service = "orders-api" AND level = "Error"
tenantId = "t1" AND timestamp >= now-15m
```

## Alerting

Alert on meaningful signals:

```text
error count for checkout increased
payment callback signature failures
security login failures
log ingestion lag
processor dead-letter count
```

## Security

Do not log:

- passwords;
- tokens;
- credit card data;
- secrets;
- sensitive personal data unless required and protected.
