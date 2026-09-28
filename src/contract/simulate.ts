import { rpc, scValToNative } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { withTransientRetry } from '../utils/node-retry';
import type { ReadContractStateOptions } from './read';

export interface SimulationResult {
  success: boolean;
  cost: { cpuInsns: string; memBytes: string };
  returnValue?: unknown;
  error?: string;
}

/** Per-call account and retry overrides for {@link simulateContractCall}. */
export type SimulateContractCallOptions = ReadContractStateOptions;

interface FakeEnvelope {
  toXDR(): string;
}

/**
 * Simulates an already-assembled transaction envelope without submitting it.
 *
 * ### Retry behaviour
 *
 * A failing `simulateTransaction` transport is retried on transient failures
 * only (connection reset, timeout, `429`, `5xx`) with capped, jittered backoff.
 * A simulation *error* response is the node's verdict on the envelope, so it is
 * returned as `{ success: false, error }` on the first attempt and never
 * retried — replaying it would produce the same contract error.
 *
 * @param client - Configured client, for the RPC URL and retry budget
 * @param xdr - Base64 transaction envelope to simulate
 * @param options - Per-call account and retry overrides
 * @returns `{ success: true, cost, returnValue }` or `{ success: false, error }`
 * @throws {TrustFlowError} `SIMULATION_ERROR` only when the RPC request itself
 *   fails after the retry budget is spent
 *
 * @example
 * ```typescript
 * const dry = await simulateContractCall(client, envelopeXdr);
 * if (!dry.success) console.warn(dry.error);
 * ```
 */
export async function simulateContractCall(
  client: TrustFlowClient,
  xdr: string,
  options: SimulateContractCallOptions = {},
): Promise<SimulationResult> {
  client.resolveAccount(options.account);
  const server = client.getSorobanServer();
  try {
    const result = await withTransientRetry(
      () =>
        server.simulateTransaction({
          toEnvelope: () => ({ toXDR: () => xdr }) as FakeEnvelope,
        } as any),
      options.retry,
      client.retryConfig,
      'rpc.simulateTransaction',
    );
    if (rpc.Api.isSimulationError(result)) {
      return { success: false, cost: { cpuInsns: '0', memBytes: '0' }, error: result.error };
    }
    // Decode the simulated return value the same way readContractState does,
    // so callers get a native JS value rather than a raw ScVal.
    const retval = (result as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    return {
      success: true,
      cost: {
        cpuInsns: '0',
        memBytes: '0',
      },
      returnValue: retval ? scValToNative(retval) : undefined,
    };
  } catch (e) {
    throw new TrustFlowError('Simulation failed', 'SIMULATION_ERROR', e);
  }
}
