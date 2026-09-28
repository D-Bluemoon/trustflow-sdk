import {
  rpc,
  Contract,
  Account,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
} from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import type { AccountOptions } from '../accounts/types';
import { TrustFlowError } from '../errors';
import { withTransientRetry } from '../utils/node-retry';
import { logger } from '../utils/logger';

export interface ReadContractStateOptions extends AccountOptions {
  /**
   * Overrides the client's retry budget for this call — `attempts` counts the
   * total tries (so `attempts: 1` disables retries), and `maxDelayMs` caps each
   * delay. See {@link import('../utils/retry').cappedExponentialBackoff}.
   */
  retry?: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
}

/**
 * Reads a contract method's return value by simulating it against a dummy
 * source account.
 *
 * ### Retry behaviour
 *
 * The `simulateTransaction` transport is retried on transient failures only
 * (connection reset, timeout, `429`, `5xx`) with capped, jittered backoff. A
 * simulation *error* response — `Error(Contract, #n)` and friends — is a
 * deterministic answer from the node, so it is never retried and is thrown
 * immediately as `SIMULATION_ERROR`.
 *
 * @param client - Configured client, for the contract ID, network and retry budget
 * @param method - Contract method name
 * @param args - Positional arguments, encoded to `ScVal` by the contract spec
 * @param options - Per-call account and retry overrides
 * @returns The method's decoded return value
 * @throws {TrustFlowError} `SIMULATION_ERROR` when the node rejects the simulation
 *
 * @example
 * ```typescript
 * const escrow = await readContractState(client, 'get_escrow', [id]);
 * ```
 */
export async function readContractState(
  client: TrustFlowClient,
  method: string,
  args: unknown[] = [],
  options: ReadContractStateOptions = {},
): Promise<unknown> {
  client.resolveAccount(options.account);
  const server = client.getSorobanServer();
  const contract = new Contract(client.contractId);
  const operation = contract.call(method, ...(args as any[]));

  // Use a dummy account for simulation
  const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');

  const tx = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: client.getNetworkPassphrase(),
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  try {
    const result = await withTransientRetry(
      () => server.simulateTransaction(tx),
      options.retry,
      client.retryConfig,
      'rpc.simulateTransaction',
    );

    if (rpc.Api.isSimulationError(result as any)) {
      throw new TrustFlowError(
        `Read simulation failed: ${(result as any).error ?? 'unknown error'}`,
        'SIMULATION_ERROR',
      );
    }

    const retval = (result as any).result?.retval;
    logger.debug('Contract read succeeded', { method });
    return retval ? scValToNative(retval) : undefined;
  } catch (e) {
    if (e instanceof TrustFlowError) throw e;
    logger.error('Contract read failed', { method, error: e });
    throw new TrustFlowError('Read simulation failed', 'SIMULATION_ERROR', e);
  }
}