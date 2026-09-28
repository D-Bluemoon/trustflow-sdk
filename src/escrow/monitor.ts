import type { ParsedTrustFlowEvent, EventHandler } from '../types/events';
import { logger } from '../utils/logger';

/**
 * The phase in which a polling error occurred.
 */
export type EscrowMonitorErrorPhase = 'fetch' | 'handler';

/**
 * Context passed to the {@link EscrowMonitor.onError} callback describing where
 * the error originated and, for handler failures, the event and handler involved.
 */
export interface EscrowMonitorErrorContext {
  /** The phase of polling in which the error occurred. */
  phase: EscrowMonitorErrorPhase;
  /** The event that triggered the failing handler, when `phase === 'handler'`. */
  event?: ParsedTrustFlowEvent;
  /** The handler that threw, when `phase === 'handler'`. */
  handler?: EventHandler;
}

/**
 * Callback invoked by {@link EscrowMonitor} when a poll (fetchFn) or an event
 * handler fails. Consumers that register this callback can react to otherwise
 * silently-discarded errors.
 */
export type EscrowMonitorOnError = (error: unknown, context: EscrowMonitorErrorContext) => void;

/**
 * Subscribes handlers to parsed TrustFlow events and dispatches them.
 *
 * Events come in as {@link ParsedTrustFlowEvent} — exactly what
 * `parseEvents(rawEvents, contractId)` (`src/events.ts`) produces — so a
 * caller can wire the SDK's own parser straight into this without any
 * translation step (#108). Handlers narrow `event.data` by switching on
 * `event.type`.
 *
 * Register {@link EscrowMonitor.onError} to observe fetch/handler failures
 * that are otherwise only surfaced through the SDK logger (#112).
 */
export class EscrowMonitor {
  private handlers = new Map<string, Set<EventHandler>>();
  private pollingInterval?: ReturnType<typeof setInterval>;
  private errorCallback?: EscrowMonitorOnError;

  on(type: string, handler: EventHandler): this {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return this;
  }

  off(type: string, handler: EventHandler): this {
    this.handlers.get(type)?.delete(handler);
    return this;
  }

  /**
   * Register an optional error callback that is invoked whenever a poll
   * (`fetchFn`) or an event handler fails. Without it, failures are only
   * surfaced through the SDK's logger and existing polling behavior is
   * unchanged.
   *
   * @param callback - Called with the thrown error and context describing
   *   whether it originated from fetching events or handling an event.
   * @returns `this` for chaining.
   */
  onError(callback: EscrowMonitorOnError): this {
    this.errorCallback = callback;
    return this;
  }

  /**
   * Dispatch a batch of already-parsed events to their registered handlers
   * (plus any `'*'` wildcard handlers). Handler rejections are logged and
   * forwarded to {@link EscrowMonitor.onError}, not thrown, so one bad handler
   * can't stop the rest.
   */
  deliver(events: ParsedTrustFlowEvent[]): void {
    for (const event of events) {
      const handlers = this.handlers.get(event.type) ?? new Set<EventHandler>();
      const wildcards = this.handlers.get('*') ?? new Set<EventHandler>();
      [...handlers, ...wildcards].forEach((h) => {
        Promise.resolve(h(event)).catch((error: unknown) => {
          logger.error('Event handler failed', { error, event });
          this.errorCallback?.(error, { phase: 'handler', event, handler: h });
        });
      });
    }
  }

  startPolling(intervalMs = 5000, fetchFn: () => Promise<ParsedTrustFlowEvent[]>): void {
    this.pollingInterval = setInterval(async () => {
      let events: ParsedTrustFlowEvent[];
      try {
        events = await fetchFn();
      } catch (error) {
        logger.error('Failed to fetch events during polling', error);
        this.errorCallback?.(error, { phase: 'fetch' });
        return;
      }
      this.deliver(events);
    }, intervalMs);
  }

  stopPolling(): void {
    clearInterval(this.pollingInterval);
  }
}
