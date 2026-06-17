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

### Basic Usage

```typescript
import { TrustFlowClient } from '@trustflow/sdk';
import { createEscrow } from '@trustflow/sdk/escrow';

// Initialize client
const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
});

await client.connect();

// Create an escrow
const escrow = await createEscrow(client, {
  sender: 'GDEPOSITOR...',
  recipient: 'GBENEFICIARY...',
  amountStroops: '1000000',
  durationBlocks: 17280,
  metadata: { orderId: 'ORD-001' },
});

console.log('Escrow created:', escrow.id);
```

See [examples/](./examples/) for more complete examples.

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
- **🔑 Wallet Integration**: Built-in support for Freighter and Albedo wallets
- **📊 Event Monitoring**: Real-time escrow state change tracking
- **🛡️ Type Safety**: Full TypeScript support with Zod validation schemas
- **🧪 Test Coverage**: Comprehensive Jest test suite

### Architecture Highlights

- **Result Types**: No thrown exceptions in public APIs - all errors returned as `SDKResult<T>`
- **Immutable Builders**: Fluent APIs like `EscrowBuilder` for parameter construction
- **Network Agnostic**: Easily switch between Testnet and Mainnet
- **Pure Utilities**: Side-effect-free helper functions for formatting and validation

Read more in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## 📚 Documentation

- **[Quick Start Guide](./docs/QUICKSTART.md)** - Get up and running in 5 minutes
- **[API Reference](./docs/API.md)** - Complete API documentation
- **[Architecture](./docs/ARCHITECTURE.md)** - Design principles and module structure
- **[Examples](./examples/)** - Working code examples for common use cases

---

## 🗺️ Roadmap

The SDK is under active development. Here's what's coming:

### In Progress
- [ ] Tsup bundler configuration for ESM/CJS exports
- [ ] NPM publishing pipeline with provenance
- [ ] Simulation wrappers for transaction cost estimation
- [ ] Auto-retry logic for RPC endpoints

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
