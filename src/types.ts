import type { IPFSConfig } from './storage';
import type { ApiRetryConfig } from './utils/http';
import type { AddAccountInput } from './accounts/types';

export type Network = 'TESTNET' | 'MAINNET';

/** Options for opt-in caching of Horizon balance lookups. */
export interface BalanceCacheConfig {
  /** Cache lifetime in milliseconds. Defaults to 5 seconds when caching is enabled. */
  ttlMs?: number;
}

/** Logging configuration for the SDK client */
export interface LoggingConfig {
  /** Minimum log level (default: 'error'). Use 'silent' to disable all logging. */
  level?: LogLevel;
  /** Custom logger instance (pino, winston, console, etc.). Overrides `level` if provided. */
  logger?: Logger;
  /** Enable JSON structured output (default: false) */
  json?: boolean;
}

export interface ClientConfig {
  network?: Network;
  contractId: string;
  rpcUrl?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  /**
   * Enables short-lived caching for `getBalance` calls. Omit this option to
   * preserve the default behavior of fetching every balance from Horizon.
   */
  balanceCache?: BalanceCacheConfig;
  /** Optional configuration for the built-in `storage.upload()` IPFS helper. */
  ipfs?: IPFSConfig;
  /**
   * Retry budget for every network call the client makes — Horizon reads
   * (`connect`, `getBalance`), Soroban RPC reads (`readContractState`,
   * `simulateContractCall`, `invokeContract`), `TransactionPipeline` stages,
   * and the backend/IPFS HTTP helpers.
   *
   * Only transient failures are retried (transport errors, timeouts, `429`,
   * `5xx`, Soroban `TRY_AGAIN_LATER`); `4xx`, simulation errors, node `ERROR`
   * rejections and on-chain `FAILED` results fail fast. Delays are
   * exponential, jittered, capped by `maxRetryDelayMs`, and a `Retry-After`
   * header wins over the schedule when the server sends one.
   *
   * Defaults: 2 retries (3 attempts total), 300ms base delay, 5s cap.
   *
   * @example
   * ```typescript
   * const client = new TrustFlowClient({
   *   contractId,
   *   retry: { retries: 4, retryDelayMs: 500, maxRetryDelayMs: 10_000 },
   * });
   * ```
   */
  retry?: ApiRetryConfig;
  /**
   * Account contexts to register on construction. The first entry becomes the
   * active account; the rest are available immediately for per-call targeting
   * via `{ account }` or {@link TrustFlowClient.useAccount}.
   *
   * Omit this to keep the original single-account behaviour: no account context
   * exists, and every method that can target an account simply has none to
   * target.
   *
   * @example
   * ```typescript
   * const client = new TrustFlowClient({
   *   contractId,
   *   accounts: [
   *     { address: alice, label: 'Alice', roles: ['depositor'] },
   *     { address: bob, label: 'Bob', roles: ['beneficiary'] },
   *   ],
   * });
   * ```
   */
  accounts?: AddAccountInput[];
}

export enum EscrowStatus {
  Pending = 'PENDING',
  Active = 'ACTIVE',
  Released = 'RELEASED',
  Disputed = 'DISPUTED',
  Cancelled = 'CANCELLED',
}

export interface Escrow {
  id: string;
  sender: string;
  recipient: string;
  amount: bigint;
  status: EscrowStatus;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, string>;
}

export interface CreateEscrowParams {
  sender: string;
  recipient: string;
  amountStroops: bigint;
  durationBlocks?: number;
  metadata?: Record<string, string>;
}

export interface ReleaseEscrowParams {
  escrowId: string;
  caller: string;
}

export interface DisputeEscrowParams {
  escrowId: string;
  caller: string;
  reason: string;
}