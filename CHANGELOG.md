# Changelog

## [Unreleased]
- Session storage (`auth/session.ts`) is now pluggable via a `SessionStorageAdapter` and
  `configureSessionStorage()`. Node/CLI/backend usage now defaults to an in-memory adapter
  instead of silently no-op'ing; browser usage is unchanged (`localStorage`).
- Sessions now carry an `expiresAt`, checked via the new `isSessionExpired()`. Best-effort only —
  the backend does not yet return a token TTL (tracked in #82) — see the README's "Session
  Storage" section.
- Removed `src/stellar/rpc.ts` (`simulateAndAssemble`): dead code, never referenced or exported,
  fully superseded by `TransactionPipeline.prepare`. Not part of any documented public API.
- Added `MultiSigStateStore` (target abstraction for a future backend-backed store, #83) and
  `MultiSigEscrowClient.exportState`/`importState` (non-breaking stopgap for coordinating signers
  across processes today) to `src/types/multisig.ts` / `src/escrow/multisig.ts`.
- See `docs/spikes/issue-79-retry-session-multisig.md` for the full retry/session/multisig design
  writeup this release is based on.

## [0.2.1] - 2026-06-29
- Add shared backend API transport in `src/utils/http.ts` using `axios` + `axios-retry`
- Add automatic retries for transient backend failures (`429`, `5xx`, network errors)
- Migrate backend SDK endpoints from `fetch` to shared retry-aware transport:
	- `TrustFlowEscrowClient.getGigs`
	- `DisputeClient.raiseDispute` / `DisputeClient.getDispute`
	- `requestChallenge` / `verifyAndGetToken`
- Add Jest coverage for retry policy and backend transport behavior
- Add Jest tests validating contract argument XDR payload encoding
- Architectural decision: centralize backend HTTP behavior to avoid endpoint-specific retry drift

## [0.2.0] - 2026-04-28
- Add DisputeClient for dispute management
- Add EscrowMonitor for real-time event polling
- Add typed error classes and logger
- Add comprehensive test suite (10 files, 40+ tests)

## [0.1.0] - 2026-03-01
- Initial SDK release
- EscrowClient, EscrowBuilder, AuthSession
- Stellar network helpers and validators
