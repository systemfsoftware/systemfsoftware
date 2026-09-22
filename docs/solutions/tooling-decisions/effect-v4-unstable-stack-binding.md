---
title: Binding an Example Backend to the effect v4 unstable Line
date: "2026-09-20"
module: systemfsoftware
problem_type: tooling_decision
component: example-inventory-fulfillment
severity: high
applies_when:
  - Choosing RPC, persistence, and auth packages for an effect 4.0.0-rc workspace
  - Pairing npm libraries that peer against effect beta lines with an rc-pinned repo
  - Deciding whether an unstable-namespaced framework surface may enter a dependency tree
root_cause: design_gap
resolution_type: design_change
related_components:
  - effect/unstable/rpc
  - drizzle-orm effect integrations
  - better-auth drizzle adapter
  - "@effect/sql-pglite / @effect/sql-pg"
  - workspace catalog pins
tags:
  - effect-v4
  - unstable-surface
  - drizzle
  - better-auth
  - pglite
  - supply-chain
---

# Binding an Example Backend to the effect v4 unstable Line

## Problem

The inventory-fulfillment example needed a real backend — RPC transport, PostgreSQL persistence, session auth — while the workspace pins the whole effect line at `4.0.0-rc.116`. Three package decisions looked like registry lookups and were actually compatibility verdicts, because every candidate's peer range was looser than its runtime truth:

- The npm `@effect/rpc@0.76.2` publishes under the effect brand but is the v3 line (peers `effect ^3.22.1`); v4 ships RPC in-tree under `effect/unstable/rpc`, an unstable namespace with no cross-release commitment.
- `drizzle-orm@1.0.0-rc.4` declares the optional peer `effect >=4.0.0-beta.83` and installs cleanly against rc.116, but its effect integrations call `Schema.TaggedErrorClass` — an API removed from the effect line after `4.0.0-beta.105` (rc.116 exposes `Schema.TaggedError`). The break is at module-evaluation time (`class ... extends Schema.TaggedErrorClass<...>` throws), so a clean install and a passing typecheck both precede the crash.
- better-auth's official drizzle adapter is promise-based: it awaits drizzle query builders. Drizzle's effect integration returns Effects with no thenable bridge, so an adapter bound to the Effect-native session fails not at the database but at the await — every query "returns" a builder object, and the adapter reports `FAILED_TO_CREATE_USER` while the database never saw a statement.

Each failure surfaced only through a compatibility spike that composed the real stack end to end before any product code existed.

## Mechanism

**The spike is the version court.** Version selection for anything touching the rc line runs a four-leg script — PGlite session roundtrip, transactional compare-and-set with affected-row counts, an `RpcGroup` + `RpcMiddleware` behind `layerHttp` on the platform-node server driven by a real in-process `RpcClient`, and a better-auth signup/`getSession` roundtrip — before any unit that consumes the stack. Exit 0 with all legs printed is the only version evidence accepted; a registry peer-range match is not.

**One database, two dialect views.** better-auth keeps its promise-mode drizzle instance (`drizzle-orm/pglite` for tests, the node-postgres driver for production) constructed over the same raw client the Effect stack owns — `PgliteClient.pglite` on the test path, the shared pool on production — while domain ports keep the Effect-native session. The adapter is confined to the auth tables; no domain row ever crosses the promise view. This beats patching the adapter or wrapping Effects in fake promises: both create a second source of truth for query execution.

**Unstable namespaces are frozen at the catalog, not followed.** The whole transport/persistence surface (`unstable/rpc`, `unstable/sql`, `unstable/http`) rides the workspace's existing effect pin. The example package cannot bump it unilaterally; any effect-line bump re-runs the spike before the catalog change lands. The unstable namespace's absence of compatibility commitment is treated as a property of every release, not a one-time admission.

**Pin exact, verify age.** Catalog entries take exact versions (no `@rc`/`@next` aliases) and the repo's `minimumReleaseAge` cutoff is checked per pin — a same-day release fails the supply-chain policy even when it is the advertised latest.

## Architectural Invariants

**A peer range is a claim, not a proof.** Peer metadata is written by the depended-on package about a moving target and is falsified by rc-line API renames. Runtime composition is the only admissible evidence for entering the dependency set.

**Module-evaluation breaks hide behind clean installs.** `class X extends Schema.TaggedErrorClass(...)` throws at import time — after `pnpm install` succeeded and after `tsc` passed against the depended-on package's own shipped types (which target the beta API). Compatibility spikes must import and construct, not just resolve and compile.

**Awaitability is a contract.** An integration surface that `await`s library results requires thenable results. Effect-native builders are not thenables, and awaiting one silently yields the builder object — the failure is one layer above the actual defect and masquerades as application logic (`FAILED_TO_CREATE_USER`). When a promise-based package must meet an Effect-native one, give the promise side its own driver view over the same connection; never teach Effects to impersonate promises.

**Driver option-shape silent fallbacks construct resources.** drizzle's monodriver `drizzle(x)` destructures `x` for `{ client, connection }`; a bare client instance matches neither and the function builds `new PGlite(undefined)` — a second, empty, in-memory database with no error. Resource-constructing functions with unioned option shapes must be called with the explicit variant (`drizzle({ client })`), and any spike that proves persistence must prove visibility of its own writes through the same path production will use.

**Embedded single-connection engines serialize by design.** PGlite's Effect client wraps statement execution in a single-permit semaphore: concurrent fibers queue, and optimistic-concurrency races cannot be observed through real concurrent submissions. Conflict paths are exercised deterministically by a seam that bumps the row version through real SQL between the sandwich's read and write phases — the engine's serialization is a testing constraint, not a reason to mock the store.

## Failure Modes Prevented

1. **Brand-name dependency capture** — installing `@effect/rpc` because the name matches the framework (it is the previous major's line).
2. **Peer-range false admission** — accepting `>=4.0.0-beta.83` as rc.116 compatibility (rc.4 drizzle installs, typechecks, and dies at import).
3. **Symptom-level adapter debugging** — chasing `FAILED_TO_CREATE_USER` through auth internals when the defect is a non-thenable builder one layer down.
4. **Split-brain persistence** — letting the auth path and the domain path drift onto different databases (the spike's raw-client visibility probe catches a misconstructed driver view immediately: tables created through one view are invisible to the other).
5. **Unstable-surface drift** — an example bumping the effect line independently of the workspace and stranding the contract it demonstrates.

## Verification Patterns

- **Four-leg spike** (session, CAS hit+stale, RPC-with-auth roundtrip, auth signup/`getSession`), asserting observable facts: affected-row counts, cookie presence, echoed identity equal to the session identity. Rerun required for any effect-line catalog change.
- **Cross-view visibility probe**: create through the Effect view, read through the promise view; a probe that sees nothing names the driver-construction defect in one step.
- **Exact-pin registry audit**: catalog value, lockfile resolution, and `minimumReleaseAge` age checked per new dependency; caret ranges are rejected at review.

## Related

- `docs/plans/2026-09-20-2240-feat-cell-architecture-stress-test-plan.md` (U0 spike, Backend Stack Contract)
- `compound-packs/cell-architecture/service-and-layer-boundaries.md`
- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`
