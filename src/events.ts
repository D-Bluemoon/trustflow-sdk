/**
 * Event parsing utilities for TrustFlow contract events (#40).
 * Parse raw Soroban contract events into typed structures.
 *
 * This module is the **single source of truth** for TrustFlow's event
 * vocabulary and payload shapes (#108). `src/types/events.ts` re-exports these
 * types and adds the `EscrowMonitor`-facing aliases; the parser output
 * (`ParsedTrustFlowEvent`) is what `EscrowMonitor` handlers receive, so there
 * is no adapter step between the two.
 *
 * The canonical event-name convention is underscore-separated
 * (`escrow_created`), matching the Soroban `Symbol` topic the contract emits
 * and what `decodeScVal` reads off `topic[0]`.
 */

export type TrustFlowEventType =
  | 'escrow_created'
  | 'escrow_released'
  | 'escrow_cancelled'
  | 'dispute_raised'
  | 'dispute_resolved'
  | 'milestone_completed';

export interface RawContractEvent {
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  topic: string[];
  value: string;
}

/** Fields common to every parsed event, regardless of `type`. */
export interface ParsedEventBase {
  contractId: string;
  ledger: number;
  timestamp: string;
  id: string;
}

/**
 * A parsed event with an unspecified payload. Kept for callers that iterate
 * events generically; use {@link ParsedTrustFlowEvent} (or `parseEvent`'s
 * return type directly) when you want `data` narrowed by `type`.
 */
export interface ParsedEvent<T = Record<string, unknown>> extends ParsedEventBase {
  type: TrustFlowEventType;
  data: T;
}

export interface EscrowCreatedData {
  escrowId: string;
  sender: string;
  recipient: string;
  amount: bigint;
}

export interface EscrowReleasedData {
  escrowId: string;
  recipient: string;
  amount: bigint;
}

export interface DisputeRaisedData {
  escrowId: string;
  raisedBy: string;
  reason: string;
}

/**
 * Discriminated union over `type` (#112). `parseEvent` returns this, so a
 * `switch`/`if` on `.type` narrows `.data` to the right shape with no cast —
 * the three typed branches previously failed `tsc` because
 * `EscrowCreatedData` etc. have no index signature and so did not match the
 * `ParsedEvent<Record<string, unknown>>` default.
 */
export type ParsedTrustFlowEvent =
  | (ParsedEventBase & { type: 'escrow_created'; data: EscrowCreatedData })
  | (ParsedEventBase & { type: 'escrow_released'; data: EscrowReleasedData })
  | (ParsedEventBase & { type: 'dispute_raised'; data: DisputeRaisedData })
  | (ParsedEventBase & {
      type: Exclude<TrustFlowEventType, 'escrow_created' | 'escrow_released' | 'dispute_raised'>;
      data: Record<string, unknown>;
    });

/** Decode a Soroban XDR value string to a plain JS string */
function decodeScVal(xdr: string): string {
  // In production, use @stellar/stellar-sdk ScVal.fromXDR().value()
  // This is a lightweight stand-in that handles the common string case.
  try {
    const buf = Buffer.from(xdr, 'base64');
    // ScVal string prefix is 0x0e (ScValType.SCV_STRING)
    if (buf[0] === 0x0e) {
      return buf.slice(5).toString('utf8');
    }
    return xdr;
  } catch {
    return xdr;
  }
}

/** Check whether a raw event belongs to TrustFlow */
export function isTrustFlowEvent(event: RawContractEvent, contractId: string): boolean {
  return event.contractId === contractId && event.type === 'contract';
}

/** Parse a raw Soroban contract event into a typed TrustFlow event */
export function parseEvent(event: RawContractEvent): ParsedTrustFlowEvent | null {
  if (!event.topic || event.topic.length === 0) {
    return null;
  }

  const eventType = decodeScVal(event.topic[0]) as TrustFlowEventType;

  const base: ParsedEventBase = {
    contractId: event.contractId,
    ledger: event.ledger,
    timestamp: event.ledgerClosedAt,
    id: event.id,
  };

  switch (eventType) {
    case 'escrow_created':
      return {
        ...base,
        type: 'escrow_created',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          sender: decodeScVal(event.topic[2] ?? ''),
          recipient: decodeScVal(event.topic[3] ?? ''),
          amount: BigInt(decodeScVal(event.value) || '0'),
        },
      };

    case 'escrow_released':
      return {
        ...base,
        type: 'escrow_released',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          recipient: decodeScVal(event.topic[2] ?? ''),
          amount: BigInt(decodeScVal(event.value) || '0'),
        },
      };

    case 'dispute_raised':
      return {
        ...base,
        type: 'dispute_raised',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          raisedBy: decodeScVal(event.topic[2] ?? ''),
          reason: decodeScVal(event.value),
        },
      };

    default:
      // `eventType` is narrowed here to the event types not handled above.
      return { ...base, type: eventType, data: {} };
  }
}

/** Parse an array of raw events, filtering nulls and non-TrustFlow events */
export function parseEvents(
  events: RawContractEvent[],
  contractId: string,
): ParsedTrustFlowEvent[] {
  return events
    .filter((e) => isTrustFlowEvent(e, contractId))
    .map(parseEvent)
    .filter((e): e is ParsedTrustFlowEvent => e !== null);
}
