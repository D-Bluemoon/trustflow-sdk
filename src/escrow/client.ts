import { ContractConfig } from '../types/contract';
import { EscrowParams, EscrowState, SDKResult, GetGigsParams, GigsPage } from '../types/index';
import { assertStellarAddress, xlmToStroops } from '../utils/validation';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';

export class TrustFlowEscrowClient {
  protected readonly contractConfig: ContractConfig;

  constructor(config: ContractConfig) {
    this.contractConfig = config;
  }

  async createEscrow(
    params: EscrowParams,
  ): Promise<SDKResult<{ escrowId: string; txHash: string }>> {
    assertStellarAddress(params.depositor, 'depositor');
    assertStellarAddress(params.beneficiary, 'beneficiary');
    const amountStroops = xlmToStroops(params.amountXLM);
    if (amountStroops <= 0n) {
      return { ok: false, error: 'Amount must be positive' };
    }
    // Build and submit Soroban invocation (placeholder)
    const txHash = `mock-${Date.now()}`;
    return { ok: true, data: { escrowId: `esc-${Date.now()}`, txHash } };
  }

  async releaseEscrow(
    escrowId: string,
    releaserAddress: string,
  ): Promise<SDKResult<{ txHash: string }>> {
    assertStellarAddress(releaserAddress, 'releaserAddress');
    return { ok: true, data: { txHash: `release-${escrowId}-${Date.now()}` } };
  }

  async getEscrow(_escrowId: string): Promise<SDKResult<EscrowState | null>> {
    return { ok: true, data: null }; // Fetch from contract storage
  }

  /**
   * Returns a paginated list of gigs (escrows) from the TrustFlow backend.
   *
   * Pagination is cursor-based: each page includes a `nextCursor` value that
   * you pass back as `cursor` on the next call to advance through results.
   * When `nextCursor` is `null` (or `hasMore` is `false`) you have reached
   * the last page.
  *
  * Network calls automatically retry transient backend failures (`429`, `5xx`,
  * and short-lived network errors) using exponential backoff.
   *
   * @param params - Optional filter and pagination parameters
   * @param params.cursor - Opaque cursor from a previous response; omit to start from the first page
   * @param params.limit - Records per page (default 20, max 100)
   * @param params.status - Filter by escrow status
  * @param params.depositor - Filter by depositor address
   * @param params.beneficiary - Filter by beneficiary address
   *
   * @returns `{ ok: true, data: GigsPage }` on success, `{ ok: false, error }` on failure
   *
   * @example
   * ```typescript
   * let cursor: string | undefined;
   * do {
   *   const result = await client.getGigs({ cursor, limit: 20, status: 'active' });
   *   if (!result.ok) { console.error(result.error); break; }
   *   console.log(result.data.data);
   *   cursor = result.data.nextCursor ?? undefined;
   * } while (cursor);
   * ```
   */
  async getGigs(params: GetGigsParams = {}): Promise<SDKResult<GigsPage>> {
    if (!this.contractConfig.apiBaseUrl) {
      return { ok: false, error: 'apiBaseUrl is required to call getGigs' };
    }

    const query = new URLSearchParams();
    if (params.cursor) {
      query.set('cursor', params.cursor);
    }
    if (params.limit) {
      query.set('limit', String(Math.min(params.limit, 100)));
    }
    if (params.status) {
      query.set('status', params.status);
    }
    if (params.depositor) {
      query.set('depositor', params.depositor);
    }
    if (params.beneficiary) {
      query.set('beneficiary', params.beneficiary);
    }

    const http = createApiHttpClient({
      baseURL: this.contractConfig.apiBaseUrl,
      apiKey: this.contractConfig.apiKey,
    });

    try {
      const response = await http.get<GigsPage>('/gigs', {
        params: Object.fromEntries(query.entries()),
      });
      return { ok: true, data: response.data };
    } catch (err: unknown) {
      return { ok: false, error: toApiErrorMessage(err) };
    }
  }
}
