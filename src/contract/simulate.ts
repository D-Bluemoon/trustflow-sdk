import { rpc, scValToNative } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { logger } from '../utils/logger';

export interface SimulationResult {
  success: boolean;
  cost: { cpuInsns: string; memBytes: string };
  returnValue?: unknown;
  error?: string;
}

interface FakeEnvelope {
  toXDR(): string;
}

export async function simulateContractCall(
  client: TrustFlowClient,
  xdr: string,
): Promise<SimulationResult> {
  logger.debug('Simulating contract call', { contractId: client.contractId, xdrLength: xdr.length });
  const server = client.getSorobanServer();
  try {
    const result = await server.simulateTransaction({
      toEnvelope: () => ({ toXDR: () => xdr }) as FakeEnvelope,
    } as any);
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
    logger.error('Contract simulation failed', { error: e });
    throw new TrustFlowError('Simulation failed', 'SIMULATION_ERROR', e);
  }
}