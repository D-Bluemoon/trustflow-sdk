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
  /**
   * Opaque paging token from Soroban RPC `getEvents`, carried through so
   * parsed events can be used to resume polling without re-delivery.
   * Always present when parsed via {@link parseEvent}; optional only to
   * keep hand-constructed test fixtures compiling.
   */
  pagingToken: string;
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

/**
 * The {@link ParsedTrustFlowEvent} member(s) that can carry `T` as their
 * `type` (#287).
 *
 * `Extract<ParsedTrustFlowEvent, { type: T }>` is not enough on its own: the
 * untyped branch declares `type` as a *union* of the remaining names, and a
 * wide union is not assignable to a single literal, so `Extract` would resolve
 * to `never` for `escrow_cancelled`, `dispute_resolved` and
 * `milestone_completed`. Matching the other way round — "is `T` assignable to
 * this member's `type`?" — distributes over the union and keeps the member
 * whose name list contains `T`.
 */
export type ParsedEventForType<T extends TrustFlowEventType> = ParsedTrustFlowEvent extends infer E
  ? E extends { type: infer K }
    ? T extends K
      ? E
      : never
    : never
  : never;

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
    pagingToken: event.pagingToken,
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

// ── Resilient subscription primitives ────────────────────────────────────────
// Soroban RPC serves contract events through `getEvents` (cursor /
// `startLedger` based polling) rather than a push WebSocket, so
// "reconnection" here means resuming polling from the last saved position.
// The helpers below are transport-agnostic: they work with any object
// exposing a `getEvents` method shaped like `rpc.Server#getEvents`.

/**
 * Pluggable cursor store behind which the last processed position is
 * persisted. The in-memory default ({@link InMemoryCursorStore}) lasts for
 * the process lifetime; pass a file-/DB-backed implementation for durability
 * across restarts.
 */
export interface CursorStore {
  get(): Promise<string | undefined> | string | undefined;
  set(cursor: string): Promise<void> | void;
}

/** Process-lifetime {@link CursorStore} used when no durable store is supplied. */
export class InMemoryCursorStore implements CursorStore {
  private cursor?: string;
  constructor(initialCursor?: string) {
    this.cursor = initialCursor;
  }
  get(): string | undefined {
    return this.cursor;
  }
  set(cursor: string): void {
    this.cursor = cursor;
  }
}

/** Options for {@link fetchContractEvents}. */
export interface FetchContractEventsOptions {
  /** TrustFlow contract ID to filter on. */
  contractId: string;
  /** Ledger to start from when no cursor is available. */
  startLedger?: number;
  /** Opaque cursor to resume from (takes precedence over `startLedger`). */
  cursor?: string;
  /** Max events per page. Defaults to 100. */
  limit?: number;
}

/** One page of contract events plus the cursor for the next page. */
export interface ContractEventsPage {
  events: RawContractEvent[];
  /** Cursor to pass as `cursor` for the next page (last event's paging token). */
  nextCursor?: string;
  /** Latest ledger known by the RPC node. */
  latestLedger?: number;
}

/**
 * Minimal shape of a Soroban RPC server needed by {@link fetchContractEvents}.
 * Mirrors `rpc.Server#getEvents` loosely so tests can pass a mock.
 */
export interface GetEventsRpc {
  getEvents(
    request: Record<string, unknown>,
  ): Promise<{
    events?: Array<Record<string, unknown>>;
    latestLedger?: number;
    cursor?: string;
  }>;
}

/**
 * `getEvents`-backed fetch helper with contract-ID filter, `startLedger` /
 * cursor resumption and pagination.
 *
 * If the RPC node prunes history, a cursor older than the retention window
 * cannot be backfilled — the node answers with an error, which this helper
 * rethrows so the caller (e.g. `EscrowMonitor`) can surface it as a gap
 * instead of silently resuming from the wrong position.
 *
 * @param server - Soroban RPC server (or mock with a `getEvents` method)
 * @param options - Contract filter, start position and page size
 * @returns Raw contract events plus the cursor for the next page
 *
 * @example
 * ```ts
 * const client = new TrustFlowClient({ contractId });
 * const page = await fetchContractEvents(client.getSorobanServer(), {
 *   contractId,
 *   cursor: await store.get(),
 * });
 * const parsed = parseEvents(page.events, contractId);
 * if (page.nextCursor) await store.set(page.nextCursor);
 * ```
 */
export async function fetchContractEvents(
  server: GetEventsRpc,
  options: FetchContractEventsOptions,
): Promise<ContractEventsPage> {
  const { contractId, startLedger, cursor, limit = 100 } = options;
  const request: Record<string, unknown> = {
    filters: [{ type: 'contract', contractIds: [contractId] }],
    limit,
    ...(cursor ? { cursor } : startLedger !== undefined ? { startLedger } : {}),
  };
  const response = await server.getEvents(request);
  const rawEvents = (response.events ?? []) as unknown as RawContractEvent[];
  const nextCursor =
    response.cursor ?? (rawEvents.length > 0 ? rawEvents[rawEvents.length - 1].pagingToken : cursor);
  return { events: rawEvents, nextCursor, latestLedger: response.latestLedger };
}

/**
 * Build a cursor-aware raw fetcher from an RPC server, ready to hand to
 * `EscrowMonitor#startResilientPolling`.
 */
export function createRpcEventFetcher(
  server: GetEventsRpc,
  options: Omit<FetchContractEventsOptions, 'cursor'>,
): (cursor?: string) => Promise<RawContractEvent[]> {
  return async (cursor?: string) => {
    const page = await fetchContractEvents(server, { ...options, cursor });
    return page.events;
  };
}
