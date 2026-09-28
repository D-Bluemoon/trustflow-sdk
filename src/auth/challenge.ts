import { createApiHttpClient } from '../utils/http';
import { TrustFlowError } from '../errors';
import { logger } from '../utils/logger';

export interface AuthChallenge {
  challenge: string;
  expiresAt: number;
  address: string;
}

export interface AuthRequestOptions {
  timeoutMs?: number;
}

/**
 * Requests a signing challenge from the TrustFlow backend.
 *
 * Transient backend failures are automatically retried with exponential backoff.
 */
export async function requestChallenge(
  apiUrl: string,
  address: string,
  options: AuthRequestOptions = {},
): Promise<AuthChallenge> {
  logger.debug('Requesting auth challenge', { address });
  const http = createApiHttpClient({ baseURL: apiUrl, timeoutMs: options.timeoutMs });
  try {
    const response = await http.get<{ challenge: string }>('/auth/challenge', {
      params: { address },
    });
    logger.debug('Auth challenge received', { address });
    return { challenge: response.data.challenge, expiresAt: Date.now() + 60_000, address };
  } catch (error) {
    logger.error('Failed to get auth challenge', { address, error });
    throw new TrustFlowError('Failed to get challenge', 'CONNECTION_ERROR', error);
  }
}

/**
 * Verifies a signature and exchanges it for a backend session token.
 *
 * Transient backend failures are automatically retried with exponential backoff.
 */
export async function verifyAndGetToken(
  apiUrl: string,
  address: string,
  signature: string,
  options: AuthRequestOptions = {},
): Promise<string> {
  logger.debug('Verifying auth signature', { address });
  const http = createApiHttpClient({ baseURL: apiUrl, timeoutMs: options.timeoutMs });
  try {
    const response = await http.post<{ token: string }>('/auth/verify', { address, signature });
    logger.debug('Auth verification succeeded', { address });
    return response.data.token;
  } catch (error) {
    logger.error('Auth verification failed', { address, error });
    throw new TrustFlowError('Signature verification failed', 'UNAUTHORIZED', error);
  }
}