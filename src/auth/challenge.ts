import { createApiHttpClient } from '../utils/http';
import type { ApiRetryConfig } from '../utils/http';
import type { HttpInterceptors } from '../utils/interceptors';
import { TrustFlowError } from '../errors';
import { logger } from '../utils/logger';

export interface AuthChallenge {
  challenge: string;
  expiresAt: number;
  address: string;
}

export interface AuthRequestOptions {
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Retry budget for the auth call. Defaults to 3 retries with a 250ms base
   * delay and a 2s cap.
   *
   * `requestChallenge` is a `GET` and is retried on `429`/`5xx`/transport
   * errors. `verifyAndGetToken` is a `POST` and is **not** retried by default:
   * the backend may have issued a token before the response was lost, and a
   * replay would mint a second session. Signature-verification `4xx` always
   * fails fast — retrying a bad signature only wastes rate limit.
   */
  retry?: ApiRetryConfig;
  /** Request/response interceptor hooks applied to auth API calls. */
  interceptors?: HttpInterceptors;
}

/**
 * Requests a signing challenge from the TrustFlow backend.
 *
 * **Retry behaviour:** a `GET`, so transient failures (network error, timeout,
 * `429`, `5xx`) are retried with capped, jittered backoff, honouring
 * `Retry-After`. A `4xx` — unknown address, rate-limit-rejected signature —
 * fails immediately.
 */
export async function requestChallenge(
  apiUrl: string,
  address: string,
  options: AuthRequestOptions = {},
): Promise<AuthChallenge> {
  logger.debug('Requesting auth challenge', { address });
  const http = createApiHttpClient({
    baseURL: apiUrl,
    timeoutMs: options.timeoutMs,
    retry: options.retry,
    interceptors: options.interceptors,
  });
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
 * **Retry behaviour:** a `POST`, so `429`/`5xx` and transport errors are not
 * replayed by default (a lost response may still have produced a token). Set
 * `trustflowRetry` on the underlying call, or rely on the client's idempotency
 * key, when replaying is safe. A rejected signature (`4xx`) always fails fast.
 */
export async function verifyAndGetToken(
  apiUrl: string,
  address: string,
  signature: string,
  options: AuthRequestOptions = {},
): Promise<string> {
  logger.debug('Verifying auth signature', { address });
  const http = createApiHttpClient({
    baseURL: apiUrl,
    timeoutMs: options.timeoutMs,
    retry: options.retry,
    interceptors: options.interceptors,
  });
  try {
    const response = await http.post<{ token: string }>('/auth/verify', { address, signature });
    logger.debug('Auth verification succeeded', { address });
    return response.data.token;
  } catch (error) {
    logger.error('Auth verification failed', { address, error });
    throw new TrustFlowError('Signature verification failed', 'UNAUTHORIZED', error);
  }
}