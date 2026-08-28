import { disputeEscrow } from '../src/escrow/dispute';
import { TrustFlowClient } from '../src/client';
import { Keypair } from '@stellar/stellar-sdk';

const CALLER = Keypair.random().publicKey();

describe('disputeEscrow', () => {
  const client = new TrustFlowClient({ contractId: 'CONTRACT123', network: 'TESTNET' });

  it('raises a dispute for valid params', async () => {
    const txHash = await disputeEscrow(client, {
      escrowId: 'esc-1',
      caller: CALLER,
      reason: 'Goods not delivered as described.',
    });

    expect(txHash).toMatch(/^tx_dispute_esc-1_/);
  });

  it('throws when escrowId is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: '', caller: CALLER, reason: 'reason' }),
    ).rejects.toThrow(/escrowId/);
  });

  it('throws when caller is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: '', reason: 'reason' }),
    ).rejects.toThrow(/dispute/);
  });

  it('throws when reason is missing', async () => {
    await expect(
      disputeEscrow(client, { escrowId: 'esc-1', caller: CALLER, reason: '  ' }),
    ).rejects.toThrow(/reason/);
  });
});
