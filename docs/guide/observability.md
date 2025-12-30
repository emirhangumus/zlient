# Observability

Zlient is "Enterprise Ready" out of the box with structured logging and metrics collection hooks.

## Logging

You can bring your own logger or use the built-in `ConsoleLogger`.

```typescript
import { ConsoleLogger, LogLevel } from 'zlient';

const client = new HttpClient({
  // ...
  logger: new ConsoleLogger(LogLevel.INFO)
});
```

### Custom Logger
Implement the `Logger` interface to send logs to Datadog, Sentry, or CloudWatch.

```typescript
import { Logger, LogEntry } from 'zlient';

class RemoteLogger implements Logger {
  log(entry: LogEntry) {
    // entry contains: output level, message, timestamp, context, error
    myTelemetryService.emit(entry);
  }
}
```

## Metrics

Track latencies, success rates, and status codes.

```typescript
import { InMemoryMetricsCollector } from 'zlient';

const metrics = new InMemoryMetricsCollector();
const client = new HttpClient({
  // ...
  metrics
});

// Later...
const stats = metrics.getSummary();
console.log(stats.avgDurationMs);
```

### Custom Collector
Implement `MetricsCollector` to feed Prometheus or StatsD.

```typescript
import { MetricsCollector, RequestMetrics } from 'zlient';

class PrometheusCollector implements MetricsCollector {
  collect(m: RequestMetrics) {
    // m contains: method, path, status, durationMs, success
    histogram.observe(m.durationMs, { path: m.path, status: m.status });
  }
}
```
