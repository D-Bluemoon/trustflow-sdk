export { useWallet } from './useWallet';
export { useBalance } from './useBalance';
export { useTransaction } from './useTransaction';

// `useEscrow` is intentionally NOT exported here (#81). It imports
// `createEscrow`/`releaseEscrow` as free functions from '../escrow' that
// don't exist there — that module only exports classes (including
// `TrustFlowEscrowClient`, which *does* have `createEscrow`/`releaseEscrow`
// methods, but isn't what this hook's `client: TrustFlowClient` parameter
// accepts; `TrustFlowClient` itself exposes no escrow methods at all). This
// was invisible until now because no build entry point ever pulled in
// `src/hooks/`, so the mismatch never got type-checked. Re-wiring
// `useEscrow` against the real API is a separate, non-trivial fix (which
// class/instance the hook should actually take, or whether `TrustFlowClient`
// should grow an `escrow` accessor) and is left for a follow-up rather than
// guessed at here.
