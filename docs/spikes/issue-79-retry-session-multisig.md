# Spike: retry/resilience policy, auth/session lifecycle, multisig state coordination

Tracking issue: [#79](https://github.com/trustflow-protocol/trustflow-sdk/issues/79)

## 1. Current-state audit

The issue was filed against an earlier snapshot of the code. Since then `TransactionPipeline`
(`src/tx-pipeline/pipeline.ts`) and `createApiHttpClient` (`src/utils/http.ts`) landed and already
cover a meaningful slice of the retry gap. This spike re-audits what's actually missing before
proposing changes.

| Call site | Retry today | Notes |
|---|---|---|
| `auth/challenge.ts` (`requestChallenge`, `verifyAndGetToken`) | Yes — via `createApiHttpClient`'s `axios-retry` config | Retries network errors, `429`, `5xx`. Does **not** retry `4xx` auth failures, which is correct. |
| `TransactionPipeline.prepare` (Soroban `simulateTransaction`) | Yes — local `withRetry`, exponential backoff | Simulation is read-only, safe to retry. |
| `TransactionPipeline.submit` (Soroban `sendTransaction` + poll) | Yes — local `withRetry`, escalates to fee-bump on fee-related errors | Distinguishes `TRY_AGAIN_LATER` (safe to retry) from on-chain `FAILED` (not retried, surfaced immediately). |
| `stellar/rpc.ts` (`simulateAndAssemble`) | **No** | Confirmed dead: not imported by any module, not re-exported from `src/stellar/index.ts` or `src/index.ts`, no test references it. Fully superseded by `TransactionPipeline.prepare`. |
| `src/utils/retry.ts` (`retry()`) | N/A — generic helper | Exported from `src/utils/index.ts` (public API surface) but never called from within `src/`. Has its own unit tests (`tests/retry.test.ts`), so it is a documented public utility, not dead code — just unused internally. |

**Conclusion:** the "dead retry code" gap described in the issue was mostly closed by the tx-pipeline
work. What's left is cleanup (remove the genuinely dead, unretried `simulateAndAssemble`) and a
documented idempotency policy so future call sites are wired correctly instead of by accident.

## 2. Retry / resilience policy (recommendation)

Idempotency rules per call type:

| Call type | Safe to blindly retry? | Why |
|---|---|---|
| `simulateTransaction` / `simulateAndAssemble` | Yes, always | Read-only, no state mutation on-chain or on the backend. |
| `prepare` (simulate + assemble resource fee) | Yes | Same as above — no submission happens in this step. |
| `sendTransaction` returning `TRY_AGAIN_LATER` | Yes | Node explicitly signals the tx was not accepted into its queue; nothing was broadcast. |
| `sendTransaction` returning `ERROR` / on-chain `FAILED` | **No** | The tx may already be included; blind resubmission risks confusing double-submit semantics. `TransactionPipeline` already does the right thing: it does not retry these, it surfaces them so the caller can decide (e.g. escalate to fee-bump). |
| Backend REST calls (`/auth/challenge`, `/auth/verify`) | Yes for network/`429`/`5xx` only | `4xx` (bad signature, unknown address) is a client error, not transient — retrying wastes time and can trip rate limits. `axios-retry`'s condition already encodes this correctly. |

Actions taken in this PR:
- Removed `src/stellar/rpc.ts` — dead code, zero retry/timeout handling, fully superseded by
  `TransactionPipeline`.
- Kept `src/utils/retry.ts` as-is: it's a legitimate public generic-purpose utility with its own
  tests: removing it would be a breaking change for consumers who may already depend on it.

**Removal-safety verification for `src/stellar/rpc.ts`** (re-confirmed per review request):
repo-wide search (`grep -rn "stellar/rpc\|simulateAndAssemble"` across `src/`, `tests/`,
`examples/`, `README.md`, `docs/`) turns up zero hits outside this spike's own doc/PR. It was
never re-exported from `src/stellar/index.ts` or `src/index.ts` (both barrels list their exports
explicitly and never named `rpc`), never had a test file, and — checking its git history
(`2858c1c feat(sdk): add Soroban RPC simulate helper`) — was never mentioned in `README.md` or
`docs/API.md`. There is no public API surface or documentation to deprecate; the removal has no
external footprint.

Follow-up (not done in this spike, filed as a separate issue): `TransactionPipeline`'s internal
`withRetry` duplicates the backoff loop in `utils/retry.ts` with a different signature (attempt
callback, policy object). Worth consolidating so there is one retry primitive, but that's a
refactor of tested, shipped code and deserves its own review rather than riding along on a spike.

## 3. Session storage & token lifecycle (recommendation)

Problems in `auth/session.ts` today:
- `localStorage`-only; every call is a silent no-op under Node (CLI/backend integrators), which
  looks like it "works" (no exception) but never persists anything.
- No expiry metadata is stored alongside the token, so nothing can tell the SDK the session is
  stale until the backend itself returns a `401`.

**Recommendation, implemented as a prototype in this PR:**
- Introduce a `SessionStorageAdapter` interface (`get`/`set`/`remove`) and make storage pluggable
  via `configureSessionStorage()`.
- Auto-select a sane default per environment: `localStorage` in the browser (unchanged behavior),
  an in-memory adapter under Node instead of a silent no-op — at least the token now survives for
  the lifetime of the process instead of vanishing immediately. Node/CLI/backend integrators who
  need durability across process restarts (e.g. a long-running server) should inject their own
  adapter (file-backed, Redis, keytar, etc.) via `configureSessionStorage()` — that dependency
  doesn't belong in the SDK itself.
- Add optional `expiresAt` to the persisted session and an `isSessionExpired()` helper so callers
  can proactively re-run the challenge flow instead of waiting for a `401`.

**Blocking unknown:** the backend's `/auth/verify` response currently only returns `{ token }`
with no TTL. Without a backend-supplied expiry, the SDK cannot know the *real* token lifetime — it
can only apply a conservative client-side default (implemented here as 15 minutes, configurable)
and treat that as a lower bound, not a guarantee. **Needs backend coordination**: add
`expiresIn`/`expiresAt` to the `/auth/verify` response. Flagged as follow-up issue
[#82](https://github.com/trustflow-protocol/trustflow-sdk/issues/82).

**Compatibility note (client-side `expiresAt` is best-effort, not a merge blocker):** this PR does
not wait on #82 to land. `isSessionExpired()` and the persisted `expiresAt` are documented — in
the `Session` interface's JSDoc, in `saveSession`'s JSDoc, and in the README's "Session Storage"
section — as a best-effort client-side signal only, not a guarantee of the token's real
server-side lifetime. Callers must still be prepared to handle a `401` from the backend even when
`isSessionExpired()` reports `false`. Once #82 lands, `verifyAndGetToken` can pass a real
`expiresAt` through to `saveSession` and the guessed default stops being used — no shape change
required on the SDK side.

## 4. Multisig operation-state coordination (recommendation)

`MultiSigEscrowClient` keeps operation state in an in-memory `Map`, scoped to one process. Per the
README, signers are expected to submit their signed XDR independently — which requires state
visible across processes.

Options considered:
1. **Backend-persisted store (recommended).** The SDK already talks to a TrustFlow backend for
   auth; extending it with multisig-operation endpoints (create / add-signature / get-status) is
   the natural home. All signer processes read/write through the same backend, which already has
   the auth/session machinery to authorize who can contribute a signature.
2. **On-chain.** Not applicable here — this is off-chain signature collection over an assembled
   Soroban transaction, not a native multisig account primitive. Storing partial signature sets
   on-chain isn't possible before the transaction is submitted.
3. **Dedicated relay/pub-sub service.** Would work but is extra infrastructure the project doesn't
   have today, solving a problem the existing backend can already solve.

**Decision: option 1.** This spike does **not** implement a backend-backed store — that requires
new backend endpoints that don't exist yet, which is real implementation work, not a spike
prototype. Instead, this PR:
- Defines the target abstraction, `MultiSigStateStore` (see `src/types/multisig.ts`), documenting
  the interface a future backend-backed implementation must satisfy, with the current in-memory
  map as the reference default/local-testing implementation.
- Adds `exportState()` / `importState()` to `MultiSigEscrowClient` as a stopgap: it lets an
  integrator serialize an operation's state out of one process and rehydrate it in another (e.g.
  by round-tripping it through their own backend today) without waiting for the SDK to grow native
  async storage. This is deliberately additive — it does not change any existing method's
  signature or behavior, so it doesn't destabilize the tested sync API multisig consumers already
  depend on. `importState` validates the snapshot's shape and returns an `SDKResult` (matching the
  rest of the class's error convention) rather than throwing on malformed input.
  Conflict semantics — deliberately simple for a stopgap: `importState` is last-write-wins:
  concurrent writers who diverge from the same exported snapshot and both re-export will have one
  overwrite the other's signatures rather than merge. Serializing concurrent writes is the
  caller's responsibility until the native store lands. Usage example and this caveat are also in
  the README's "Multisig Cross-Process Coordination" section.
- Full async, pluggable `MultiSigStateStore` wiring into `MultiSigEscrowClient` (which is a
  breaking API change, since every method would become `Promise`-returning) is left to the
  follow-up implementation issue, once the backend endpoints exist to back it.

## 5. Follow-up implementation issues filed

- [#82](https://github.com/trustflow-protocol/trustflow-sdk/issues/82) — Backend: add
  `expiresIn`/`expiresAt` to the `/auth/verify` response so the SDK can trust a real token TTL
  instead of a client-side default.
- [#83](https://github.com/trustflow-protocol/trustflow-sdk/issues/83) — SDK: implement a
  backend-backed `MultiSigStateStore` and wire it into `MultiSigEscrowClient` (async API —
  breaking change, needs a major version bump) once the corresponding backend endpoints exist.
- [#84](https://github.com/trustflow-protocol/trustflow-sdk/issues/84) — SDK: consolidate
  `TransactionPipeline`'s internal `withRetry` on top of `src/utils/retry.ts` to remove the
  duplicated backoff implementation.

## 6. Blocking unknowns

- Real token TTL is unknown until the backend team confirms whether/when `/auth/verify` will
  return an expiry. Client-side default (15 min) is a guess, not a guarantee.
- Whether multisig coordination should be a new set of REST endpoints on the existing TrustFlow
  backend, or a separate service, is a product/infra decision outside this SDK repo's scope —
  recommendation above assumes reusing the existing backend, but that needs sign-off from whoever
  owns it.
