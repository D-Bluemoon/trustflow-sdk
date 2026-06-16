/**
 * Zod runtime validation schemas for TrustFlow SDK (#45).
 * Import these to validate inputs at runtime and get typed results.
 */
import { z } from 'zod';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

// ── Primitives ────────────────────────────────────────────────────────────────

export const StellarAddressSchema = z
  .string()
  .regex(STELLAR_ADDRESS_RE, 'Invalid Stellar address (must start with G and be 56 chars)');

export const ContractIdSchema = z
  .string()
  .regex(CONTRACT_ID_RE, 'Invalid contract ID (must start with C and be 56 chars)');

export const StroopsSchema = z.bigint().positive('Amount must be positive');

export const NetworkSchema = z.enum(['MAINNET', 'TESTNET', 'FUTURENET']);

// ── Escrow ────────────────────────────────────────────────────────────────────

export const CreateEscrowSchema = z.object({
  sender: StellarAddressSchema,
  recipient: StellarAddressSchema,
  amount: StroopsSchema,
  network: NetworkSchema.default('TESTNET'),
  memo: z.string().max(28).optional(),
});

export const ReleaseEscrowSchema = z.object({
  escrowId: z.string().min(1),
  recipient: StellarAddressSchema,
  network: NetworkSchema.default('TESTNET'),
});

export const DisputeEscrowSchema = z.object({
  escrowId: z.string().min(1),
  reason: z.string().min(10, 'Dispute reason must be at least 10 characters'),
  evidence: z.string().url('Evidence must be a valid URL').optional(),
  network: NetworkSchema.default('TESTNET'),
});

// ── Client config ─────────────────────────────────────────────────────────────

export const ClientConfigSchema = z.object({
  network: NetworkSchema.default('TESTNET'),
  contractId: ContractIdSchema,
  rpcUrl: z.string().url('RPC URL must be a valid URL').optional(),
  horizonUrl: z.string().url('Horizon URL must be a valid URL').optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type CreateEscrowInput = z.infer<typeof CreateEscrowSchema>;
export type ReleaseEscrowInput = z.infer<typeof ReleaseEscrowSchema>;
export type DisputeEscrowInput = z.infer<typeof DisputeEscrowSchema>;
export type ClientConfig = z.infer<typeof ClientConfigSchema>;
export type StellarAddress = z.infer<typeof StellarAddressSchema>;
export type ContractId = z.infer<typeof ContractIdSchema>;
export type Network = z.infer<typeof NetworkSchema>;
