import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { ConsoleLogger, LogLevel, LoggerUtil } from '../lib/logger';

describe('Logger', () => {
  describe('ConsoleLogger', () => {
    it('should log messages at or above the minimum level', () => {
      const logSpy = mock(() => {});
      console.info = logSpy;
      console.warn = logSpy;
      console.error = logSpy;

      const logger = new ConsoleLogger(LogLevel.INFO);
      logger.log({ level: LogLevel.INFO, message: 'Info message', timestamp: '' });
      logger.log({ level: LogLevel.WARN, message: 'Warn message', timestamp: '' });
      logger.log({ level: LogLevel.ERROR, message: 'Error message', timestamp: '' });

      expect(logSpy).toHaveBeenCalledTimes(3);
    });

    it('should not log messages below the minimum level', () => {
      const logSpy = mock(() => {});
      console.debug = logSpy;

      const logger = new ConsoleLogger(LogLevel.INFO);
      logger.log({ level: LogLevel.DEBUG, message: 'Debug message', timestamp: '' });

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('LoggerUtil', () => {
    const mockLogger = {
      log: mock(() => {}),
    };

    beforeEach(() => {
      mockLogger.log.mockClear();
    });

    it('should call logger.log with correct level for debug', () => {
      const loggerUtil = new LoggerUtil(mockLogger);
      loggerUtil.debug('Debug message', { key: 'value' });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.DEBUG,
          message: 'Debug message',
          context: { key: 'value' },
        })
      );
    });

    it('should call logger.log with correct level for info', () => {
      const loggerUtil = new LoggerUtil(mockLogger);
      loggerUtil.info('Info message');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'Info message',
        })
      );
    });

    it('should call logger.log with correct level for warn', () => {
      const loggerUtil = new LoggerUtil(mockLogger);
      loggerUtil.warn('Warn message');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.WARN,
          message: 'Warn message',
        })
      );
    });

    it('should call logger.log with correct level for error', () => {
      const loggerUtil = new LoggerUtil(mockLogger);
      const error = new Error('test');
      loggerUtil.error('Error message', error, { traceId: '123' });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: 'Error message',
          error: error,
          context: { traceId: '123' },
        })
      );
    });
  });
});
