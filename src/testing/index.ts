import { xdr } from "@stellar/stellar-sdk";
import type { Escrow, EscrowState, EscrowStatus } from "../types/index";

/**
 * Validates whether a value is a structurally valid Stellar `ScVal` (round-trips through XDR).
 *
 * @param val - The value to test
 * @returns `true` if structurally valid ScVal, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isValidScVal } from "@trustflow/sdk/testing";
 *
 * const scval = nativeToScVal(100n, { type: "i128" });
 * expect(isValidScVal(scval)).toBe(true);
 * ```
 */
export function isValidScVal(val: unknown): boolean {
  try {
    const encoded = (val as xdr.ScVal).toXDR();
    xdr.ScVal.fromXDR(encoded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Custom Jest matcher result for `toBeValidScVal`.
 *
 * @param received - Value to validate against ScVal XDR structure
 * @returns CustomMatcherResult object
 */
export function toBeValidScVal(received: unknown) {
  const pass = isValidScVal(received);
  return {
    pass,
    message: () =>
      pass
        ? "expected value not to be a structurally valid Stellar ScVal"
        : "expected value to be a structurally valid Stellar ScVal (XDR round-trip failed)",
  };
}

/** Configuration options for `createMockHorizonServer`. */
export interface MockHorizonServerOptions {
  balanceXLM?: string;
  sequenceNumber?: string;
  txHash?: string;
  baseFee?: number;
}

/**
 * Creates a mock Horizon server instance for offline testing.
 *
 * @param options - Custom configuration overrides for responses
 * @returns A mock `Horizon.Server` compatible instance
 *
 * @example
 * ```typescript
 * import { TrustFlowClient } from "@trustflow/sdk";
 * import { createMockHorizonServer } from "@trustflow/sdk/testing";
 *
 * const horizonServer = createMockHorizonServer({ balanceXLM: "500" });
 * const client = new TrustFlowClient({ contractId: "C...", horizonServer: horizonServer as any });
 * const balance = await client.getBalance("G...");
 * ```
 */
export function createMockHorizonServer(options: MockHorizonServerOptions = {}) {
  const balanceXLM = options.balanceXLM ?? "1000";
  const sequenceNumber = options.sequenceNumber ?? "1";
  const txHash = options.txHash ?? "mock-horizon-tx-hash-1234567890";
  const baseFee = options.baseFee ?? 100;

  return {
    serverURL: new URL("https://mock-horizon.stellar.org"),
    loadAccount: async (accountId: string) => ({
      id: accountId,
      accountId: () => accountId,
      sequenceNumber: () => sequenceNumber,
      sequence: sequenceNumber,
      balances: [
        {
          asset_type: "native",
          balance: balanceXLM,
        },
      ],
      incrementSequenceNumber: () => {},
    }),
    submitTransaction: async () => ({
      hash: txHash,
      successful: true,
      ledger: 12345,
    }),
    fetchBaseFee: async () => baseFee,
  };
}

/** Configuration options for `createMockSorobanServer`. */
export interface MockSorobanServerOptions {
  minResourceFee?: string;
  cpuInsns?: string;
  memBytes?: string;
  txStatus?: "SUCCESS" | "PENDING" | "FAILED";
  returnValueScVal?: xdr.ScVal;
}

/**
 * Creates a mock Soroban RPC server instance for offline simulation and invocation tests.
 *
 * @param options - Simulation and transaction response configurations
 * @returns A mock `rpc.Server` compatible instance
 *
 * @example
 * ```typescript
 * import { TrustFlowClient } from "@trustflow/sdk";
 * import { createMockSorobanServer } from "@trustflow/sdk/testing";
 *
 * const rpcServer = createMockSorobanServer({ minResourceFee: "15000" });
 * const client = new TrustFlowClient({ contractId: "C...", rpcServer: rpcServer as any });
 * ```
 */
export function createMockSorobanServer(options: MockSorobanServerOptions = {}) {
  const minResourceFee = options.minResourceFee ?? "10000";
  const cpuInsns = options.cpuInsns ?? "50000";
  const memBytes = options.memBytes ?? "20000";
  const txStatus = options.txStatus ?? "SUCCESS";
  const returnValueScVal = options.returnValueScVal ?? xdr.ScVal.scvVoid();

  return {
    serverURL: new URL("https://mock-soroban-rpc.stellar.org"),
    simulateTransaction: async () => ({
      minResourceFee,
      cost: {
        cpuInsns,
        memBytes,
      },
      result: {
        retval: returnValueScVal,
      },
    }),
    sendTransaction: async () => ({
      hash: "mock-soroban-tx-hash-1234567890",
      status: "PENDING",
    }),
    getTransaction: async () => ({
      status: txStatus,
      resultXdr: returnValueScVal.toXDR("base64"),
      resultMetaXdr: "AAAA",
      latestLedger: 1000,
    }),
    getEvents: async () => ({
      events: [],
      latestLedger: 1000,
    }),
    getLatestLedger: async () => ({
      sequence: 1000,
      protocolVersion: 20,
    }),
    getAccount: async (accountId: string) => ({
      accountId: () => accountId,
      sequenceNumber: () => "1",
      incrementSequenceNumber: () => {},
    }),
  };
}

/**
 * Mock wallet adapter simulating browser wallet extensions (Freighter, Albedo).
 */
export class MockWalletAdapter {
  publicKey: string;
  connected: boolean = true;

  constructor(publicKey = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF") {
    this.publicKey = publicKey;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getPublicKey(): Promise<string> {
    return this.publicKey;
  }

  async connect(): Promise<string> {
    this.connected = true;
    return this.publicKey;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async signTransaction(xdrString: string): Promise<string> {
    return xdrString;
  }

  async signAuthEntry(entryXdr: string): Promise<string> {
    return entryXdr;
  }
}

/**
 * Factory builder creating a mock `Escrow` entity with defaults.
 *
 * @param overrides - Optional property overrides
 * @returns Complete Escrow mock object
 */
export function buildMockEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "mock-escrow-1",
    sender: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    recipient: "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
    amount: 10_000_000n,
    status: "ACTIVE" as EscrowStatus,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Factory builder creating a mock `EscrowState` object.
 *
 * @param overrides - Optional property overrides
 * @returns Complete EscrowState mock object
 */
export function buildMockEscrowState(overrides: Partial<EscrowState> = {}): EscrowState {
  return {
    id: "esc-mock-123",
    params: {
      depositor: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      beneficiary: "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
      amountXLM: "1.0",
    },
    status: "active",
    contractEscrowId: 1,
    txHash: "mock-tx-hash-abcdef",
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Factory builder creating a mock contract event payload.
 *
 * @param overrides - Optional property overrides
 * @returns Complete mock event payload object
 */
export function buildMockContractEvent(overrides: Record<string, any> = {}) {
  return {
    type: "escrow.created",
    escrowId: "1",
    payload: {
      depositor: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      beneficiary: "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
      amount: "10000000",
    },
    blockNumber: 100,
    txHash: "mock-event-tx-hash",
    timestamp: Date.now(),
    ...overrides,
  };
}
