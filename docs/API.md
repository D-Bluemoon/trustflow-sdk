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
