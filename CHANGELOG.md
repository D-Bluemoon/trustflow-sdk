# Changelog

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
