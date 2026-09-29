/**
 * TrustFlow event types (#108).
 *
 * The single source of truth is `src/events.ts` — it owns the parser that
 * decodes Soroban XDR topics into these shapes. This module re-exports them
 * (the package root re-exports this file) and adds the `EscrowMonitor`-facing
 * aliases.
 *
 * The `escrow.created` dot-notation and the `{ escrowId, payload, blockNumber,
 * txHash }` shape that used to live here are gone: they duplicated — and
 * conflicted with — the parser's `escrow_created` / `ParsedEvent` output, so
 * `parseEvent`'s result could not be fed into an `EscrowMonitor` handler
 * without a translation step that never existed.
 */

export type {
  TrustFlowEventType,
  RawContractEvent,
  ParsedEventBase,
  ParsedEvent,
  ParsedTrustFlowEvent,
  EscrowCreatedData,
  EscrowReleasedData,
  DisputeRaisedData,
} from '../events';

import type { ParsedTrustFlowEvent } from '../events';

/**
 * The event object an `EscrowMonitor` handler receives — now an alias of the
 * parser's discriminated union, so `parseEvents(...)` output flows straight
 * into `EscrowMonitor.deliver` / `startPolling`'s `fetchFn` with no adapter
 * (#108). Narrow on `event.type` to get a typed `event.data`.
 */
export type TrustFlowEvent = ParsedTrustFlowEvent;

export type EventHandler = (event: ParsedTrustFlowEvent) => void | Promise<void>;
