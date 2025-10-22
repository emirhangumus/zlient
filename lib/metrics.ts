/**
 * Metrics data for HTTP requests.
 */
export interface RequestMetrics {
    method: string;
    path: string;
    status?: number;
    durationMs: number;
    timestamp: string;
    success: boolean;
    error?: string;
}

/**
 * Interface for metrics collectors.
 * Implement this to integrate with your monitoring infrastructure (DataDog, Prometheus, etc.).
 * 
 * @example
 * ```ts
 * class DataDogMetrics implements MetricsCollector {
 *   collect(metrics: RequestMetrics) {
 *     dogstatsd.histogram('http.request.duration', metrics.durationMs, {
 *       method: metrics.method,
 *       status: String(metrics.status)
 *     });
 *   }
 * }
 * ```
 */
export interface MetricsCollector {
    collect(metrics: RequestMetrics): void;
}

/**
 * No-op metrics collector that discards all metrics.
 */
export class NoOpMetricsCollector implements MetricsCollector {
    collect(_metrics: RequestMetrics): void {
        // no-op
    }
}

/**
 * In-memory metrics collector for testing and development.
 * Stores metrics in memory with configurable retention.
 */
export class InMemoryMetricsCollector implements MetricsCollector {
    private metrics: RequestMetrics[] = [];
    private readonly maxEntries: number;

    constructor(maxEntries = 1000) {
        this.maxEntries = maxEntries;
    }

    collect(metrics: RequestMetrics): void {
        this.metrics.push(metrics);
        if (this.metrics.length > this.maxEntries) {
            this.metrics.shift();
        }
    }

    /**
     * Get all collected metrics.
     */
    getMetrics(): RequestMetrics[] {
        return [...this.metrics];
    }

    /**
     * Get metrics summary statistics.
     */
    getSummary(): {
        total: number;
        successful: number;
        failed: number;
        avgDurationMs: number;
        minDurationMs: number;
        maxDurationMs: number;
    } {
        if (this.metrics.length === 0) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                avgDurationMs: 0,
                minDurationMs: 0,
                maxDurationMs: 0,
            };
        }

        const successful = this.metrics.filter((m) => m.success).length;
        const durations = this.metrics.map((m) => m.durationMs);
        const sum = durations.reduce((a, b) => a + b, 0);

        return {
            total: this.metrics.length,
            successful,
            failed: this.metrics.length - successful,
            avgDurationMs: sum / this.metrics.length,
            minDurationMs: Math.min(...durations),
            maxDurationMs: Math.max(...durations),
        };
    }

    /**
     * Clear all collected metrics.
     */
    clear(): void {
        this.metrics = [];
    }
}

/**
 * Console-based metrics collector for debugging.
 */
export class ConsoleMetricsCollector implements MetricsCollector {
    collect(metrics: RequestMetrics): void {
        console.log('[METRICS]', JSON.stringify(metrics));
    }
}
