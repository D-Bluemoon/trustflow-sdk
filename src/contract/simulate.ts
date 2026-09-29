import { rpc, scValToNative } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { withTransientRetry } from '../utils/node-retry';
import { logger } from '../utils/logger';
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
 * Each attempt is bounded by `options.timeoutMs`, falling back to the
 * client-wide {@link ClientConfig.timeoutMs}; once every attempt has timed out
 * and the retry budget is spent, the call throws `TIMEOUT`.
 *
 * @param client - Configured client, for the RPC URL and retry budget
 * @param xdr - Base64 transaction envelope to simulate
 * @param options - Per-call account, retry and timeout overrides
 * @returns `{ success: true, cost, returnValue }` or `{ success: false, error }`
 * @throws {TrustFlowError} `SIMULATION_ERROR` only when the RPC request itself
 *   fails after the retry budget is spent, `TIMEOUT` when every attempt
 *   exceeded the timeout budget
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
      { ...options.retry, timeoutMs: options.timeoutMs ?? client.timeoutMs },
      client.retryConfig,
      'rpc.simulateTransaction',
    );
    if (rpc.Api.isSimulationError(result)) {
      logger.warn('Contract simulation returned error', { error: result.error });
      return { success: false, cost: { cpuInsns: '0', memBytes: '0' }, error: result.error };
    }
    // Decode the simulated return value the same way readContractState does,
    // so callers get a native JS value rather than a raw ScVal.
    const retval = (result as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    logger.debug('Contract simulation succeeded');
    return {
      success: true,
      cost: {
        cpuInsns: '0',
        memBytes: '0',
      },
      returnValue: retval ? scValToNative(retval) : undefined,
    };
  } catch (e) {
    // A `TIMEOUT` (or any typed SDK error) keeps its code rather than being
    // re-wrapped as a generic simulation failure.
    if (e instanceof TrustFlowError) throw e;
    logger.error('Contract simulation failed', { error: e });
    throw new TrustFlowError('Simulation failed', 'SIMULATION_ERROR', e);
  }
}