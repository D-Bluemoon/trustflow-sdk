# TrustFlow SDK API Reference

## TrustFlowEscrowClient
- `createEscrow(params)` — create a new escrow
- `releaseEscrow(id, signer)` — release funds to beneficiary
- `getEscrow(id)` — read escrow state from contract
- `getGigs(params)` — fetch paginated gigs via backend API with automatic retries for transient failures (`429`, `5xx`, network)

## EscrowBuilder
Fluent builder: `.setDepositor().setBeneficiary().setAmount().build()`

## EscrowMonitor
- `.on(event, handler)` — subscribe to escrow events
- `.startPolling(intervalMs, fetchFn)` — begin polling

## DisputeClient
- `.raiseDispute(params)` — raise a dispute (automatic retry on transient backend failures)
- `.getDispute(escrowId)` — get dispute status (automatic retry on transient backend failures)

## Auth
- `requestChallenge(apiUrl, address, options?)` — get signing challenge with retry-aware backend transport
- `verifyAndGetToken(apiUrl, address, signature, options?)` — exchange signature for JWT with retry-aware backend transport

## Backend API Retry Behavior
- Backend API endpoints now use a shared Axios transport configured with `axios-retry`.
- Default retry policy: 3 retries, exponential backoff (250ms base, 2000ms max cap).
- Retry conditions: network errors, HTTP `429`, and HTTP `5xx` responses.
- Non-transient `4xx` responses are returned without retry.

## TransactionPipeline
Unified pipeline for assembling, simulating, fee-adjusting, fee-bumping, and retrying
Soroban transactions against RPC. Every method returns a `PipelineResult<T>`
(`{ ok: true; data: T } | { ok: false; error: TrustFlowError }`) instead of throwing, so
callers get a typed, actionable `error.code` (e.g. `ASSEMBLY_ERROR`, `SIMULATION_ERROR`,
`FEE_BUMP_ERROR`, `SUBMISSION_ERROR`, `RETRY_EXHAUSTED`) without try/catch.

- `new TransactionPipeline(client: TrustFlowClient)`
- `.assemble(params)` — builds an unsigned transaction from a source account and operations
- `.simulate(tx)` — simulates a transaction against Soroban RPC without mutating it
- `.prepare(tx, options?)` — simulates and folds the footprint/auth/resource fee back onto
  the transaction, applying a configurable safety multiplier (`resourceFeeMultiplier`,
  default 1.1) on top of the RPC-reported `minResourceFee`; retries transient RPC failures
  with exponential backoff
- `.buildFeeBump(innerTx, { feeSource, baseFee? })` — wraps a transaction in a fee-bump
  envelope
- `.submit(tx, options?)` — broadcasts a signed transaction and polls for confirmation,
  retrying transient submission failures with exponential backoff
- `.run(params)` — convenience method chaining assemble → prepare → sign → submit; when
  submission fails for a fee-related reason (`TRY_AGAIN_LATER`, insufficient fee) and
  `submit.feeBump` is configured, automatically builds, signs, and resubmits a fee-bump
  transaction before giving up

```typescript
import { TransactionPipeline, TrustFlowClient } from '@trustflow/sdk';

const client = new TrustFlowClient({ contractId, network: 'TESTNET' });
const pipeline = new TransactionPipeline(client);

const result = await pipeline.run({
  sourceAccount: sender.publicKey(),
  operations: [contract.call('release', ...args)],
  signers: [sender],
  submit: { feeBump: { feeSource: sponsor } },
});

if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  console.log('confirmed:', result.data.hash, 'feeBumped:', result.data.feeBumped);
}
```
