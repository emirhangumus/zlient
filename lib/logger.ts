/**
 * Log levels for structured logging.
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

/**
 * Structured log entry with metadata.
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
    error?: Error;
}

/**
 * Logger interface for custom logger implementations.
 * Implement this to integrate with your logging infrastructure.
 * 
 * @example
 * ```ts
 * class ConsoleLogger implements Logger {
 *   log(entry: LogEntry) {
 *     console.log(JSON.stringify(entry));
 *   }
 * }
 * ```
 */
export interface Logger {
    log(entry: LogEntry): void;
}

/**
 * Default console logger implementation.
 * Formats log entries as JSON for easy parsing.
 */
export class ConsoleLogger implements Logger {
    constructor(private minLevel: LogLevel = LogLevel.INFO) { }

    log(entry: LogEntry): void {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const entryLevelIndex = levels.indexOf(entry.level);
        const minLevelIndex = levels.indexOf(this.minLevel);

        if (entryLevelIndex < minLevelIndex) return;

        const output = {
            ...entry,
            error: entry.error
                ? {
                    message: entry.error.message,
                    stack: entry.error.stack,
                    name: entry.error.name,
                }
                : undefined,
        };

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(JSON.stringify(output));
                break;
            case LogLevel.INFO:
                console.info(JSON.stringify(output));
                break;
            case LogLevel.WARN:
                console.warn(JSON.stringify(output));
                break;
            case LogLevel.ERROR:
                console.error(JSON.stringify(output));
                break;
        }
    }
}

/**
 * No-op logger that discards all log entries.
 * Use this in production if you don't want any logging.
 */
export class NoOpLogger implements Logger {
    log(_entry: LogEntry): void {
        // no-op
    }
}

/**
 * Utility class for creating structured log entries.
 */
export class LoggerUtil {
    constructor(private logger: Logger) { }

    debug(message: string, context?: Record<string, unknown>): void {
        this.logger.log({
            level: LogLevel.DEBUG,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.logger.log({
            level: LogLevel.INFO,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.logger.log({
            level: LogLevel.WARN,
            message,
            timestamp: new Date().toISOString(),
            context,
        });
    }

    error(message: string, error?: Error, context?: Record<string, unknown>): void {
        this.logger.log({
            level: LogLevel.ERROR,
            message,
            timestamp: new Date().toISOString(),
            context,
            error,
        });
    }
}
