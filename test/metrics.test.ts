import { describe, expect, it, mock } from 'bun:test';
import { ConsoleMetricsCollector, InMemoryMetricsCollector, RequestMetrics } from '../lib/metrics';

describe('Metrics', () => {
  describe('InMemoryMetricsCollector', () => {
    it('should collect and retrieve metrics', () => {
      const collector = new InMemoryMetricsCollector();
      const metric: RequestMetrics = {
        method: 'GET',
        path: '/test',
        durationMs: 100,
        timestamp: new Date().toISOString(),
        success: true,
      };
      collector.collect(metric);
      expect(collector.getMetrics()).toEqual([metric]);
    });

    it('should clear metrics', () => {
      const collector = new InMemoryMetricsCollector();
      collector.collect({
        method: 'GET',
        path: '/test',
        durationMs: 100,
        timestamp: new Date().toISOString(),
        success: true,
      });
      collector.clear();
      expect(collector.getMetrics()).toEqual([]);
    });

    it('should respect maxEntries limit', () => {
      const collector = new InMemoryMetricsCollector(2);
      collector.collect({ method: 'GET', path: '/1', durationMs: 1, timestamp: '', success: true });
      collector.collect({ method: 'GET', path: '/2', durationMs: 1, timestamp: '', success: true });
      collector.collect({ method: 'GET', path: '/3', durationMs: 1, timestamp: '', success: true });
      const metrics = collector.getMetrics();
      expect(metrics.length).toBe(2);
      expect(metrics[0].path).toBe('/2');
      expect(metrics[1].path).toBe('/3');
    });

    describe('getSummary', () => {
      it('should return zero summary for no metrics', () => {
        const collector = new InMemoryMetricsCollector();
        const summary = collector.getSummary();
        expect(summary).toEqual({
          total: 0,
          successful: 0,
          failed: 0,
          avgDurationMs: 0,
          minDurationMs: 0,
          maxDurationMs: 0,
        });
      });

      it('should calculate summary correctly', () => {
        const collector = new InMemoryMetricsCollector();
        collector.collect({
          method: 'GET',
          path: '/',
          durationMs: 100,
          timestamp: '',
          success: true,
        });
        collector.collect({
          method: 'GET',
          path: '/',
          durationMs: 200,
          timestamp: '',
          success: true,
        });
        collector.collect({
          method: 'GET',
          path: '/',
          durationMs: 300,
          timestamp: '',
          success: false,
        });
        const summary = collector.getSummary();
        expect(summary.total).toBe(3);
        expect(summary.successful).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.avgDurationMs).toBe(200);
        expect(summary.minDurationMs).toBe(100);
        expect(summary.maxDurationMs).toBe(300);
      });
    });
  });

  describe('ConsoleMetricsCollector', () => {
    it('should log metrics to console', () => {
      const logSpy = mock(() => {});
      console.log = logSpy;
      const collector = new ConsoleMetricsCollector();
      const metric: RequestMetrics = {
        method: 'POST',
        path: '/data',
        durationMs: 50,
        timestamp: 'ts',
        success: false,
        error: 'failure',
        status: 500,
      };
      collector.collect(metric);
      expect(logSpy).toHaveBeenCalledWith('[METRICS]', JSON.stringify(metric));
    });
  });
});
