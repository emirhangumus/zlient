import type { EventHandler } from './realtime-utils';

/**
 * Minimal typed event emitter used internally by SSEConnectionImpl and WSConnectionImpl.
 * Not part of the public API.
 */
export class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (set) {
      set.forEach((handler) => handler(...args));
    }
  }
}
