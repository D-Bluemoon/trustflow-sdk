# 📦 TrustFlow SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

> **Type-safe TypeScript SDK for building gig-economy applications on the TrustFlow Protocol (Stellar/Soroban).**

The TrustFlow SDK provides a developer-friendly interface for interacting with TrustFlow smart contracts on the Stellar network. Build escrow systems, dispute resolution platforms, and decentralized freelance marketplaces with clean, type-safe APIs.

---

## ⚡ Quick Start

### Installation

```bash
npm install @trustflow/sdk
# or
yarn add @trustflow/sdk
```

### 1 — Connect to the Network

```typescript
import { TrustFlowClient } from '@trustflow/sdk';

const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET', // or 'MAINNET'
});

await client.connect();
console.log('Connected to', client.network);
```

### 2 — Create an Escrow

```typescript
import { TrustFlowEscrowClient, EscrowBuilder } from '@trustflow/sdk';

const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});

const params = new EscrowBuilder()
  .setDepositor('GDEPOSITOR...')
  .setBeneficiary('GBENEFICIARY...')
  .setAmount('50') // XLM
  .setDeadline(17280) // ~1 day in ledgers
  .build();

const result = await escrowClient.createEscrow(params);
if (result.ok) {
  console.log('Escrow ID:', result.data.escrowId);
  console.log('Tx Hash:', result.data.txHash);
}
```

### 3 — Fund & Release an Escrow

```typescript
import { TrustFlowClient } from '@trustflow/sdk';
import { createEscrow, releaseEscrow } from '@trustflow/sdk/escrow';
import { connectWallet } from '@trustflow/sdk/wallet';
import { xlmToStroops } from '@trustflow/sdk/utils';

const wallet = await connectWallet('freighter');
const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
});
await client.connect();

// Create
const escrow = await createEscrow(client, {
  sender: wallet.publicKey,
  recipient: 'GRECIPIENT...',
  amountStroops: xlmToStroops('50'),
  durationBlocks: 17280,
  metadata: { orderId: 'ORD-001' },
});
console.log('Escrow created:', escrow.id);

// Release
const txHash = await releaseEscrow(client, {
  escrowId: escrow.id,
  caller: wallet.publicKey,
});
console.log('Released! Transaction:', txHash);
```

See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for the full walkthrough including disputes, multi-sig, and pagination.

### Multi-Sig Escrow (M-of-N)

Collect signatures from multiple approvers before a release is broadcast:

```typescript
import { MultiSigEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const client = new MultiSigEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

// Register a 2-of-2 release operation
const { data: { operationId } } = client.initMultiSigOperation({
  escrowId: 'esc-42',
  signers: [APPROVER_A, APPROVER_B],
  threshold: 2,
  operationType: 'release',
  unsignedXdr: UNSIGNED_RELEASE_XDR,
  networkPassphrase: Networks.TESTNET,
});

// Each approver submits their signed XDR independently
client.addSignature({ operationId, signerAddress: APPROVER_A, signedXdr: SIGNED_XDR_A });
client.addSignature({ operationId, signerAddress: APPROVER_B, signedXdr: SIGNED_XDR_B });

// Broadcast once threshold is met
const result = await client.submitWhenReady(operationId, 'https://horizon-testnet.stellar.org');
console.log('Released! tx:', result.data?.txHash);
```

See [examples/multisig-escrow.ts](./examples/multisig-escrow.ts) for the full walkthrough.

---

## ✨ Features

### Current Capabilities

- **🔐 Escrow Management**: Create, fund, release, and monitor escrows
- **✍️ Multi-Sig Escrows**: M-of-N signature collection for shared backend Escrows via `MultiSigEscrowClient`
- **⚖️ Dispute Resolution**: Raise and track disputes with on-chain governance
- **🔁 Backend API Auto-Retries**: Resilient backend calls via `axios-retry` for transient failures
- **🔑 Wallet Integration**: Built-in support for Freighter wallet
- **📊 Event Monitoring**: Real-time escrow state change tracking
- **🛡️ Type Safety**: Full TypeScript support with Zod validation schemas
- **🧪 Test Coverage**: Comprehensive Jest test suite

### Architecture Highlights

- **Result Types**: No thrown exceptions in public APIs — all errors returned as `SDKResult<T>`
- **Immutable Builders**: Fluent APIs like `EscrowBuilder` for parameter construction
- **Network Agnostic**: Easily switch between Testnet and Mainnet
- **Pure Utilities**: Side-effect-free helper functions for formatting and validation

Read more in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## 📚 Documentation

- **[Quick Start Guide](./docs/QUICKSTART.md)** — Get up and running in 5 minutes
- **[API Reference](./docs/API.md)** — Complete API documentation
- **[Architecture](./docs/ARCHITECTURE.md)** — Design principles and module structure
- **[Examples](./examples/)** — Working code examples for common use cases

---

## 🗺️ Roadmap

The SDK is under active development. Here's what's coming:

### In Progress
- [x] Tsup bundler configuration for ESM/CJS exports
- [ ] NPM publishing pipeline with provenance
- [ ] Simulation wrappers for transaction cost estimation
- [x] Auto-retry logic for backend API endpoints (`axios-retry`)

### Planned Features
- [x] Multi-signature support for corporate escrows
- [ ] IPFS storage helpers for file uploads
- [ ] Pagination support for high-volume queries
- [ ] Event parsing utilities for XDR decoding
- [ ] Juror voting system integration

See our [GitHub Issues](https://github.com/trustflow-protocol/trustflow-sdk/issues) for detailed progress tracking.

---

## 🤝 Contributing

We welcome contributions! To get started:

1. Fork the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Submit a PR

Please ensure:
- Tests pass (`npm test`)
- Linting passes (`npm run lint`)
- Code is formatted (`npm run format`)

Check [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 🔒 Security

- **Strict Linting**: ESLint strict mode enforced across the codebase
- **Input Validation**: All parameters validated with Zod schemas
- **Type Safety**: TypeScript strict mode prevents runtime errors
- **Test Coverage**: Critical paths covered by Jest integration tests

Report security issues to: security@trustflow.xyz

---

## 📜 License

MIT License - Copyright (c) 2026 TrustFlow Protocol

See [LICENSE](./LICENSE) for details.

---

## 🌟 Community

- **Issues**: [Report bugs or request features](https://github.com/trustflow-protocol/trustflow-sdk/issues)
- **Contributors**: See [CONTRIBUTORS.md](./CONTRIBUTORS.md)
- **Changelog**: See [CHANGELOG.md](./CHANGELOG.md)

---

*Securing the future of work, one transaction at a time.*
