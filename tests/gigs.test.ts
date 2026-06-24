import { TrustFlowEscrowClient } from '../src/escrow/client';
import type { GigsPage } from '../src/types/index';

const BASE_CONTRACT_CONFIG = {
  contractId: 'C' + 'A'.repeat(55),
  network: 'TESTNET' as const,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

const API_BASE = 'https://api.trustflow.xyz';
const API_KEY = 'test-api-key';

const makePage = (overrides: Partial<GigsPage> = {}): GigsPage => ({
  data: [],
  nextCursor: null,
  hasMore: false,
  ...overrides,
});

describe('TrustFlowEscrowClient.getGigs', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns an error when apiBaseUrl is not configured', async () => {
    const client = new TrustFlowEscrowClient(BASE_CONTRACT_CONFIG);
    const result = await client.getGigs();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/apiBaseUrl/);
    }
  });

  it('returns an empty first page when no gigs exist', async () => {
    const page = makePage();
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE, apiKey: API_KEY });
    const result = await client.getGigs({ limit: 20 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toHaveLength(0);
      expect(result.data.nextCursor).toBeNull();
      expect(result.data.hasMore).toBe(false);
    }
  });

  it('sends cursor, limit, status, depositor and beneficiary as query params', async () => {
    const page = makePage();
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE });
    await client.getGigs({
      cursor: 'abc123',
      limit: 10,
      status: 'active',
      depositor: 'G' + 'A'.repeat(55),
      beneficiary: 'G' + 'B'.repeat(55),
    });

    const calledUrl = new URL((fetchSpy.mock.calls[0][0] as string));
    expect(calledUrl.searchParams.get('cursor')).toBe('abc123');
    expect(calledUrl.searchParams.get('limit')).toBe('10');
    expect(calledUrl.searchParams.get('status')).toBe('active');
    expect(calledUrl.searchParams.get('depositor')).toBe('G' + 'A'.repeat(55));
    expect(calledUrl.searchParams.get('beneficiary')).toBe('G' + 'B'.repeat(55));
  });

  it('caps limit at 100 regardless of what the caller passes', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(makePage()), { status: 200 }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE });
    await client.getGigs({ limit: 500 });

    const calledUrl = new URL((fetchSpy.mock.calls[0][0] as string));
    expect(calledUrl.searchParams.get('limit')).toBe('100');
  });

  it('sends Authorization header when apiKey is configured', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(makePage()), { status: 200 }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE, apiKey: API_KEY });
    await client.getGigs();

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
  });

  it('traverses multiple pages using nextCursor', async () => {
    const ADDR_A = 'G' + 'A'.repeat(55);
    const page1: GigsPage = {
      data: [{ id: 'esc-1', params: { depositor: ADDR_A, beneficiary: ADDR_A, amountXLM: '10' }, status: 'active', createdAt: 1 }],
      nextCursor: 'cursor-page-2',
      hasMore: true,
    };
    const page2: GigsPage = {
      data: [{ id: 'esc-2', params: { depositor: ADDR_A, beneficiary: ADDR_A, amountXLM: '20' }, status: 'pending', createdAt: 2 }],
      nextCursor: null,
      hasMore: false,
    };

    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE });

    const result1 = await client.getGigs();
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;
    expect(result1.data.nextCursor).toBe('cursor-page-2');

    const result2 = await client.getGigs({ cursor: result1.data.nextCursor! });
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.data.nextCursor).toBeNull();
    expect(result2.data.hasMore).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns an error on non-2xx HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE });
    const result = await client.getGigs();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/401/);
    }
  });

  it('returns a network error when fetch throws', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const client = new TrustFlowEscrowClient({ ...BASE_CONTRACT_CONFIG, apiBaseUrl: API_BASE });
    const result = await client.getGigs();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Network error/);
    }
  });
});
