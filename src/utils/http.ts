import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger';
import { attachInterceptors, HttpInterceptors } from './interceptors';
import { SDK_VERSION, DEFAULT_API_VERSION } from '../constants';

/**
 * Retry tuning for backend API requests.
 */
export interface ApiRetryConfig {
  /** Total retry attempts after the first request. Defaults to 3. */
  retries?: number;
  /** Base retry delay in milliseconds. Defaults to 250ms. */
  retryDelayMs?: number;
  /** Maximum retry delay in milliseconds. Defaults to 2000ms. */
  maxRetryDelayMs?: number;
}

export interface ApiHttpClientOptions {
  baseURL: string;
  apiKey?: string;
  apiVersion?: string;
  timeoutMs?: number;
  retry?: ApiRetryConfig;
  additionalHeaders?: Record<string, string>;
  /** Request/response interceptor hooks applied to every call made by this client. */
  interceptors?: HttpInterceptors;
}

const DEFAULT_RETRY_CONFIG: Required<ApiRetryConfig> = {
  retries: 3,
  retryDelayMs: 250,
  maxRetryDelayMs: 2000,
};

const httpLogger = logger;

/**
 * Creates an Axios instance configured with safe automatic retries for transient failures.
 *
 * Retries are applied to network failures, `429`, and `5xx` responses.
 */
export function createApiHttpClient(options: ApiHttpClientOptions): AxiosInstance {
  const retryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.retry,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-SDK-Version': SDK_VERSION,
    'X-API-Version': options.apiVersion ?? DEFAULT_API_VERSION,
    ...options.additionalHeaders,
  };

  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    headers,
  });

  // Attached before axios-retry so every attempt (including retries) passes
  // through the interceptor chain exactly once.
  if (options.interceptors) {
    attachInterceptors(instance, options.interceptors);
  }

  axiosRetry(instance, {
    retries: retryConfig.retries,
    retryCondition: (error) => {
      const status = error.response?.status;
      if (status === 429) {
        httpLogger.debug('Rate limited (429), will retry', { url: error.config?.url });
        return true;
      }
      if (typeof status === 'number' && status >= 500 && status < 600) {
        httpLogger.debug('Server error, will retry', { url: error.config?.url, status });
        return true;
      }
      return axiosRetry.isNetworkOrIdempotentRequestError(error);
    },
    retryDelay: (retryCount) => {
      const delay = retryConfig.retryDelayMs * 2 ** (retryCount - 1);
      const finalDelay = Math.min(delay, retryConfig.maxRetryDelayMs);
      httpLogger.debug('Retrying request', { retryCount, delay: finalDelay });
      return finalDelay;
    },
  });

  // Request/response logging interceptors (optional-chained so unit tests
  // that mock `axios.create` without interceptors keep working).
  instance.interceptors?.request?.use(
    (config) => {
      httpLogger.debug('HTTP request', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
      });
      return config;
    },
    (error) => {
      httpLogger.error('HTTP request error', { error: error.message });
      return Promise.reject(error);
    }
  );

  instance.interceptors?.response?.use(
    (response) => {
      httpLogger.debug('HTTP response', {
        status: response.status,
        url: response.config.url,
        baseURL: response.config.baseURL,
      });
      return response;
    },
    (error) => {
      const status = error.response?.status;
      httpLogger.warn('HTTP error response', {
        status,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );

  return instance;
}

/**
 * Maps unknown transport errors into stable SDK error strings.
 */
export function toApiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    if (typeof status === 'number') {
      return statusText ? `HTTP ${status}: ${statusText}` : `HTTP ${status}`;
    }
    return `Network error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Network error: ${error.message}`;
  }
  return `Network error: ${String(error)}`;
}