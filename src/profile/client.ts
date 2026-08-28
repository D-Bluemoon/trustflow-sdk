import type { SDKResult } from '../types/index';
import type { Profile, UpdateProfileParams } from '../types/profile';
import { isValidStellarAddress } from '../utils/validation';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';

export interface ProfileClientOptions {
  timeoutMs?: number;
}

/**
 * Type-safe Axios wrapper for the TrustFlow backend's `/profiles` endpoints.
 *
 * @example
 * ```typescript
 * const profiles = new ProfileClient('https://api.trustflow.dev', token);
 * const result = await profiles.getProfile(wallet.publicKey);
 * if (result.ok) console.log(result.data.displayName);
 * ```
 */
export class ProfileClient {
  private readonly http;

  constructor(
    private apiUrl: string,
    private token: string,
    options: ProfileClientOptions = {},
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
   * Fetches a user's profile from the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async getProfile(address: string): Promise<SDKResult<Profile>> {
    if (!isValidStellarAddress(address)) {
      return { ok: false, error: `Invalid Stellar address for "address": ${address}` };
    }
    try {
      const response = await this.http.get<Profile>(`/profiles/${address}`);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }

  /**
   * Updates a user's profile via the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async updateProfile(address: string, params: UpdateProfileParams): Promise<SDKResult<Profile>> {
    if (!isValidStellarAddress(address)) {
      return { ok: false, error: `Invalid Stellar address for "address": ${address}` };
    }
    try {
      const response = await this.http.put<Profile>(`/profiles/${address}`, params);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }
}
