import { rpc, Contract, Account, TransactionBuilder, BASE_FEE, scValToNative } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { logger } from '../utils/logger';

export async function readContractState(
  client: TrustFlowClient,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  logger.debug('Reading contract state', { method, contractId: client.contractId, argsCount: args.length });
  const server = client.getSorobanServer();
  const contract = new Contract(client.contractId);
  const operation = contract.call(method, ...(args as any[]));

  // Use a dummy account for simulation
  const dummyAccount = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0'
  );

  const tx = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: client.getNetworkPassphrase(),
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  try {
    const result = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(result as any)) {
      logger.warn('Read simulation returned error', { method });
      throw new TrustFlowError('Read simulation failed', 'SIMULATION_ERROR');
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