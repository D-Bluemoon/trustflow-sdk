import type { IPFSConfig } from './storage';
import type { LogLevel, Logger } from './utils/logger';

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
  /** Logging configuration */
  logging?: LoggingConfig;
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