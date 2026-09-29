import { EscrowMonitor } from '../src/escrow/monitor';
import type { ParsedTrustFlowEvent } from '../src/events';

function createdEvent(escrowId: string): ParsedTrustFlowEvent {
  return {
    type: 'escrow_created',
    contractId: 'CABC',
    ledger: 1,
    timestamp: '2024-01-01T00:00:00Z',
    id: `ev-${escrowId}`,
    data: { escrowId, sender: 'GS', recipient: 'GR', amount: 1n },
  };
}

describe('EscrowMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers and fires event handlers', async () => {
    const monitor = new EscrowMonitor();
    let received: ParsedTrustFlowEvent | null = null;
    monitor.on('escrow_created', async (e) => {
      received = e;
    });

    monitor.deliver([createdEvent('1')]);
    await Promise.resolve();

    expect(received).not.toBeNull();
    expect(received!.type).toBe('escrow_created');
    if (received!.type === 'escrow_created') {
      expect(received!.data.escrowId).toBe('1');
    }
  });

  it('fires wildcard handlers too', async () => {
    const monitor = new EscrowMonitor();
    const seen: string[] = [];
    monitor.on('*', (e) => {
      seen.push(e.type);
    });

    monitor.deliver([createdEvent('1'), createdEvent('2')]);
    await Promise.resolve();

    expect(seen).toEqual(['escrow_created', 'escrow_created']);
  });

  it('removes handler with off()', () => {
    const monitor = new EscrowMonitor();
    const h = (): void => {};
    monitor.on('escrow_created', h);
    monitor.off('escrow_created', h);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((monitor as any).handlers.get('escrow_created')?.size).toBe(0);
  });

  describe('onError', () => {
    const event = {
      type: 'escrow.created' as const,
      escrowId: '1',
      payload: {},
      blockNumber: 1,
      txHash: 'abc',
      timestamp: Date.now(),
    };

    it('invokes onError when fetchFn rejects', async () => {
      const monitor = new EscrowMonitor();
      const onError = jest.fn();
      monitor.onError(onError);
      const fetchFn = jest.fn().mockRejectedValue(new Error('network down'));
      monitor.startPolling(1000, fetchFn);

      await jest.advanceTimersByTimeAsync(1000);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toEqual(new Error('network down'));
      expect(onError.mock.calls[0][1].phase).toBe('fetch');
      expect(fetchFn).toHaveBeenCalled();

      monitor.stopPolling();
    });

    it('invokes onError when an event handler rejects', async () => {
      const monitor = new EscrowMonitor();
      const onError = jest.fn();
      monitor.onError(onError);
      const boom = jest.fn().mockRejectedValue(new Error('handler boom'));
      monitor.on('escrow.created', boom);
      const fetchFn = jest.fn().mockResolvedValue([event]);
      monitor.startPolling(1000, fetchFn);

      await jest.advanceTimersByTimeAsync(1000);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toEqual(new Error('handler boom'));
      expect(onError.mock.calls[0][1].phase).toBe('handler');

      monitor.stopPolling();
    });
  });
});
