# Resolved review — cell-architecture stress-test plan (2026-09-20)

Reviewed document: `docs/plans/2026-09-20-2131-feat-cell-architecture-stress-test-plan.md` (unified-plan, non-interactive round 1)

## Coverage

| Reviewer         | Findings | Disposition                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| coherence        | 4        | 1 applied, 2 merged into canonical-vocabulary fix, 1 proposed |
| feasibility      | 1        | applied                                                       |
| security-lens    | 4        | 4 proposed                                                    |
| scope-guardian   | 0        | clean                                                         |
| adversarial      | 5        | 3 proposed, 2 FYI                                             |
| cross-model pass | —        | not run: no different-provider route installed on this host   |

Dropped: 0. Restated/suppressed as duplicates: 8 (coherence residual, security AuthContext residual, security audit residual, adversarial adapter-drift residual, canonical-family deferred question, graceful-shutdown deferred question, engines deferred question, seam-vs-mock deferred question).

## Applied (edit authority: implementation-section corrections at anchor 100, verified against source)

1. U7 — `RpcServer.toHttpHandler` does not exist in `effect@4.0.0-rc.116`; replaced with `RpcServer.layerHttp({ group, path: '/rpc' })` (verified at `repos/effect/packages/effect/src/unstable/rpc/RpcServer.ts:866`). (feasibility, P1, 100)
2. U8 — Sandwich phases-tuple citation corrected `Sandwich.ts:50` → `:49` (line 49 holds the tuple; 50 is the interface's closing brace). (coherence, P3, 100)

## Proposed fixes (returned unapplied; awaiting grouped confirmation)

1. **Canonical decision vocabulary (P0, coherence, 100)** — three name sets across R5 / mermaid / acceptance examples; U2 names the authoritative family. Lead derivation: core family = `AllocatedSplit | AllocatedWithOverdraft | Backordered | CreditHold` (U2 + acceptance); `ConflictRollback` = shell-emitted outcome in the same family module (R14: retry never enters the core); `ReservationRolledBack` = compensation event, not a decision; R5's `InsufficientStock`/`CreditLimitExceeded` stay as error-channel examples, `InventoryConflict` dropped as redundant.
2. **Caller scoping (P0, security-lens, 100)** — R13 gates on session presence only; IDOR via `getReservation`, arbitrary `customerId` via `submitOrder`. Fix: `Forbidden` TaggedError + userId scoping + `submitOrder` overrides customerId from session.
3. **CAS-miss test seam (P1, adversarial, 75)** — PGlite `Semaphore.makeUnsafe(1)` serializes all statements, so real races never produce stale versions; Scenario 7's conflict path unreachable without a deterministic version-bump injection between read and write. Not a mock: it mutates real state through real SQL.
4. **U0 spike expansion (P1, adversarial, 75)** — add transactional CAS roundtrip (`BEGIN → UPDATE ... WHERE version → COMMIT` + affected rows) and RPC+middleware+drizzle composition; three roundtrips, not one.
5. **Secrets fail-closed (P1, security-lens, 75)** — `DATABASE_URL` / `BETTER_AUTH_SECRET` from env, layer dies when unset, `.env.example`, no credential literals.
6. **Scope Amendment R8 parenthetical (P2, coherence, 75)** — references an in-memory prior state absent from the document; drop it.
7. **better-auth catalog-exact pin (P2, security-lens, 75)** — "latest stable at install time" contradicts the Version Pinning key decision; pin the spike-validated version.
8. **Test credential ephemerality (P2, security-lens, 75)** — per-run generated emails/passwords; PGlite data dir gitignored and torn down.
9. __unstable/_ maintenance contract (P2, adversarial, 75)_* — one paragraph under Backend Stack Contract: effect RC bumps must re-run the U0 spike; example cannot bump the effect pin unilaterally.

## FYI observations (anchor 50)

- better-auth `getSession` import path must yield the server-side async variant; assert Promise-returning shape in the spike (adversarial).
- Postgres-native `xmin` / `pg_advisory_xact_lock` CAS alternatives unrecorded; application-version column is defensible for engine-agnosticism — record the rejection in the U10 matrix (adversarial).

## Residual concerns

- RpcClient session cookies must be cleared between scenarios or state leaks across acceptance examples (security-lens).
- The CAS-miss seam must be exercised automatically in CI, not left to manual triggering, or the ConflictRollback branch ships untested (adversarial).

## Deferred questions

- `audit_events` writer policy: which events must persist audit rows and minimum row schema (security-lens).
- `listStock` scoping: whole-catalog vs caller-shipping-region-filtered (security-lens).
