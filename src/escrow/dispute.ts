import { DisputeParams, SDKResult } from '../types/index';

export class DisputeClient {
  constructor(
    private apiUrl: string,
    private token: string,
  ) {}

  async raiseDispute(params: DisputeParams): Promise<SDKResult<{ disputeId: string }>> {
    try {
      const res = await fetch(`${this.apiUrl}/disputes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data: { disputeId: data.id } };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async getDispute(escrowId: string): Promise<SDKResult<unknown>> {
    try {
      const res = await fetch(`${this.apiUrl}/disputes/${escrowId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
