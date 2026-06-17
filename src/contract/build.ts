import { nativeToScVal } from '@stellar/stellar-sdk';
import type { CreateEscrowParams } from '../types';

export function buildCreateEscrowArgs(params: CreateEscrowParams): unknown[] {
  return [
    new Address(params.sender).toScVal(),
    new Address(params.recipient).toScVal(),
    nativeToScVal(params.amountStroops, { type: 'i128' }),
    nativeToScVal(params.durationBlocks ?? 0, { type: 'u32' }),
  ];
}

export function buildReleaseArgs(escrowId: string, caller: string): unknown[] {
  return [nativeToScVal(escrowId, { type: 'string' }), new Address(caller).toScVal()];
}

export function buildDisputeArgs(escrowId: string, reason: string): unknown[] {
  return [nativeToScVal(escrowId, { type: 'string' }), nativeToScVal(reason, { type: 'string' })];
}
