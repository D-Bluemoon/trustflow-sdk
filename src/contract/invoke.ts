import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import type { ContractCallResult } from '../types/contract';
import { TrustFlowError } from '../errors';
import { logger } from '../utils/logger';

export type SignAndSubmitFn = (xdr: string) => Promise<string>;

const invokeLogger = logger;

/**
 * Invokes a Soroban contract method and optionally signs/submits the transaction.
 *
 * @param client - TrustFlow client instance
 * @param method - Contract method name
 * @param args - Method arguments
 * @param caller - Caller's Stellar address
 * @param signAndSubmit - Optional function to sign and submit the transaction XDR
 * @returns Contract call result with success status, return value, and optional tx hash
 */
export async function invokeContract(
  client: TrustFlowClient,
  method: string,
  args: unknown[],
  caller: string,
  signAndSubmit?: SignAndSubmitFn,
): Promise<ContractCallResult> {
  const server = client.getSorobanServer();
  const contract = new Contract(client.contractId);

  invokeLogger.debug('Invoking contract method', { method, caller, contractId: client.contractId, argsCount: args.length });

  try {
    const account = await server.getAccount(caller);
    const operation = contract.call(method, ...(args as any[]));

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.getNetworkPassphrase(),
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    invokeLogger.debug('Simulating contract call', { method });
    const simulation = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulation)) {
      invokeLogger.warn('Contract simulation failed', { method, error: simulation.error });
      return {
        success: false,
        errorCode: undefined,
      };
    }

    invokeLogger.debug('Contract simulation successful', { method, gasUsed: simulation.minResourceFee });

    if (!signAndSubmit) {
      return {
        success: true,
        returnValue: simulation.result?.retval,
        gasUsed: 0,
      };
    }

    const prepared = rpc.assembleTransaction(tx, simulation).build();
    const xdr = prepared.toXDR();
    invokeLogger.debug('Signing and submitting transaction', { method, xdrLength: xdr.length });
    const txHash = await signAndSubmit(xdr);

    invokeLogger.info('Contract call submitted', { method, txHash });
    return {
      success: true,
      txHash,
      returnValue: simulation.result?.retval,
      gasUsed: 0,
    };
  } catch (e) {
    invokeLogger.error('Contract invocation failed', { method, caller, error: e });
    if (e instanceof TrustFlowError) {
      return { success: false, errorCode: undefined };
    }
    return { success: false, errorCode: undefined };
  }
}