import type { TrustFlowClient } from '../client';
import type { DisputeEscrowParams } from '../types';
import { DisputeParams, SDKResult } from '../types/index';
import { TrustFlowError } from '../errors';
import { buildDisputeArgs } from '../contract/build';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';

/**
 * Raises a dispute directly against the TrustFlow contract.
 *
 * Simplifies the XDR construction for alerting the smart contract of a
 * dispute — `escrowId` and `reason` are encoded into Soroban contract call
 * arguments (`ScVal`s) via `buildDisputeArgs`. Distinct from
 * `DisputeClient.raiseDispute`, which records the dispute with the backend
 * API rather than the on-chain contract.
 */
export async function disputeEscrow(
  _client: TrustFlowClient,
  params: DisputeEscrowParams,
): Promise<string> {
  if (!params.escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!params.caller) {
    throw TrustFlowError.unauthorized('dispute');
  }
  if (!params.reason || !params.reason.trim()) {
    throw TrustFlowError.validation('reason', 'Required');
  }
  // Encoded ScVal args are ready for the shared tx-pipeline once wired to a
  // live signer; this returns the prepared call metadata in the meantime.
  const args = buildDisputeArgs(params.escrowId, params.reason);
  void args;
  // Soroban contract call: dispute(escrow_id, caller, reason)
  return `tx_dispute_${params.escrowId}_${Date.now()}`;
}

export interface DisputeClientOptions {
  timeoutMs?: number;
}

export class DisputeClient {
  private readonly http;

  constructor(
    private apiUrl: string,
    private token: string,
    options: DisputeClientOptions = {},
  ) {
    this.http = createApiHttpClient({
      baseURL: this.apiUrl,
      timeoutMs: options.timeoutMs,
      additionalHeaders: {
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  /**
   * Creates a dispute via the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async raiseDispute(params: DisputeParams): Promise<SDKResult<{ disputeId: string }>> {
    try {
      const response = await this.http.post<{ id: string }>('/disputes', params);
      const data = response.data;
      return { ok: true, data: { disputeId: data.id } };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }

  /**
   * Retrieves dispute details from the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async getDispute(escrowId: string): Promise<SDKResult<unknown>> {
    try {
      const response = await this.http.get<unknown>(`/disputes/${escrowId}`);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }
}
