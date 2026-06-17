import { DisputeClient } from '../src/escrow/dispute';

describe('DisputeClient', () => {
  it('initialises with api url and token', () => {
    const client = new DisputeClient('http://api', 'tok');
    expect(client).toBeDefined();
  });

  it('returns error result on network failure', async () => {
    const client = new DisputeClient('http://invalid-host-xyz', 'tok');
    const result = await client.raiseDispute({ escrowId: 'esc-1', reason: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});
