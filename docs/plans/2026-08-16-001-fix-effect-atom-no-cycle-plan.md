---
title: Break the import(no-cycle) cycle in @systemfsoftware/effect-atom
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Break the import(no-cycle) cycle in @systemfsoftware/effect-atom

## Problem

`pnpm --filter @systemfsoftware/effect-atom lint` reports exactly two warnings,
both flagged by `import/no-cycle`:

- `packages/effect-atom/atom/src/internal/result-schema.ts:9` —
  `import { failure, initial, isResult, success } from '../Result.js'`
- `packages/effect-atom/atom/src/Result.ts:943` —
  `export { Schema } from './internal/result-schema.js'`

The cycle is a 2-node arc: `Result.ts` re-exports `Schema` from
`internal/result-schema.ts`, and `result-schema.ts` imports four value
constructors plus the `Result` type from `Result.ts`. `oxlint`'s
`import/no-cycle` flags type-only imports too, so the cycle cannot be broken by
turning the type import into a comment.

The warnings pre-date this branch and were not introduced by the prior
"dirname fix" PR. They need to ship fixed in this same PR.

## Surface that must NOT change

The `Schema` aggregator is reachable through the public namespace
(`packages/effect-atom/atom/src/index.ts` line 34:
`export * as Result from './Result.js'`). Consumers call it as
`Result.Schema({...})` or, through `atom-react`,
`AsyncResult.Schema({...})`. Live call sites in the repo:

- `packages/effect-atom/atom/test/Hydration.feature.test.ts` (3 sites)
- `packages/effect-atom/atom/test/Result.property.test.ts` (3 sites)
- `packages/effect-atom/atom-react/test/ssr.test.tsx` (2 sites)

The four constructors (`failure`, `initial`, `isResult`, `success`) and the
`Result` type are also part of the public surface; consumers reach them as
`Result.failure(...)`, `Result.success(...)`, etc. The dts emission must keep
these names reachable from `import { Result } from '@systemfsoftware/effect-atom'`.

The package's own `internal/result-schema.ts` ALSO exports `schemaCodec`,
consumed by:

- `packages/effect-atom/atom/src/AtomHttpApi.ts:30` —
  `import { schemaCodec } from './internal/result-schema.js'`
- `packages/effect-atom/atom/src/AtomRpc.ts:30` —
  `import { schemaCodec } from './internal/result-schema.js'`

Both call sites must keep working without change.

## Approach (selected)

**Lift the value-side types and constructors into a new
`packages/effect-atom/atom/src/internal/result-values.ts`, then have both
`Result.ts` and `internal/result-schema.ts` import from it.** Result: the
dependency graph becomes

```
internal/result-values.ts          (leaf — no internal deps)
   ├──> Result.ts                  (public surface, re-exports Schema)
   │       └──> internal/result-schema.ts
   └──> internal/result-schema.ts  (private, exports schemaCodec)
```

The cycle is gone.

### Why this approach (REPO-A2 / REPO-A3 cost ledger)

Three structurally distinct approaches were considered. The lift wins because
the other two either mint a second projection (REPO-A3 violation) or move
`Schema` into the wrong file.

- **Approach A (lift, chosen):** introduce one new internal module.
  REPO-A2 licit because `internal/result-schema.ts` is a real second value
  consumer (it constructs `failure(...)`, `initial(...)`, `success(...)`
  in the codec's `encode`/`decode` paths), not merely a type observer.
  REPO-A3 honoured — the public aggregator `Result.Schema` is preserved
  via a re-export; no second projection is exported.
- **Approach B (inline `Schema` into `Result.ts`):** drops the file but
  re-creates a cycle unless `schemaCodec` is also moved into `Result.ts`.
  Moving `schemaCodec` into `Result.ts` mixes the public surface with a
  helper that exists only for `AtomHttpApi` and `AtomRpc`, and `Schema`
  depends on `schemaCodec` only loosely. Either `Schema` stays in
  `internal/result-schema.ts` and imports from `Result.ts` (back to the
  cycle), or `schemaCodec` moves into `Result.ts` (now `Result.ts`
  imports from `internal/result-schema.ts`, but it only needs
  `schemaCodec` to re-export — still a cycle if `result-schema.ts` keeps
  `Schema`; if `Schema` moves too, the file grows by ~180 lines and
  loses the `internal/` separation).
- **Approach C (export `ResultSchema` as a sibling namespace from
  `src/index.ts`):** keeps the cycle by introducing a second public
  aggregator `Result.SchemaSchema` / `ResultSchema.Schema`. Three
  existing call sites in `atom-react/test/ssr.test.tsx` and
  `atom/test/Hydration.feature.test.ts` change shape, and an external
  consumer of `@systemfsoftware/effect-atom` breaks. REPO-A3 forbids.

The chosen approach is the only one that breaks the cycle without moving
the schema implementation and without minting a second public aggregator.

## Repo-relative files in scope

- `packages/effect-atom/atom/src/internal/result-values.ts` — **new**.
- `packages/effect-atom/atom/src/Result.ts` — edit imports; lift the
  declarations.
- `packages/effect-atom/atom/src/internal/result-schema.ts` — edit
  imports; switch from `../Result.js` to `./result-values.js`.

No test files change. `atom-react` is unchanged. `package.json`,
`tsdown.config.ts`, `tsconfig.build.json`, `tsconfig.dts.json`,
`oxlint.config.ts`, and `AGENTS.md` are unchanged.

## Implementation units

### U-1 — Create `internal/result-values.ts` and break the cycle

**Files touched:**

- NEW: `packages/effect-atom/atom/src/internal/result-values.ts`
- EDIT: `packages/effect-atom/atom/src/Result.ts`
- EDIT: `packages/effect-atom/atom/src/internal/result-schema.ts`

**Direction (not code):**

1. **New file `internal/result-values.ts`** holds:

   - The `TypeId` literal and `export const TypeId` declaration (currently
     on lines 33–41 of `Result.ts`). The string `'~effect-atom/atom/Result'`
     is the wire-format TypeId noted by `packages/effect-atom/AGENTS.md` —
     the value stays identical, the declaration moves.
   - The `Result` type alias (`export type Result<A, E = never> = Initial<A, E>
     | Success<A, E> | Failure<A, E>`).
   - The three interface declarations `Initial<A, E>`, `Success<A, E>`,
     `Failure<A, E>` (currently lines 153, 227, 265 of `Result.ts`),
     including their `extends Result.Proto<A, E>` clause.
   - The `export declare namespace Result { ... }` block (lines 66–96)
     containing `Result.Proto`, `Result.Success<R>`, `Result.Failure<R>`.
     The `namespace Result` declaration must live where the type alias
     lives because it references `Result<...>` in its type-parameter
     constraints.
   - The `ResultProto` const (lines 109–137). The four constructors need
     it; the public combinators in `Result.ts` also need it.
   - The four value constructors: `isResult` (line 57) and its
     `isAsyncResult` alias (line 59), `initial` (line 214), `success`
     (line 247), `failure` (line 294).

2. **`Result.ts`** becomes an importer of the lifted module, not the
   declarer. Concretely:

   - Remove the `TypeId`/`Result` type/`Result` namespace/
     `ResultProto`/`Initial`/`Success`/`Failure`/`isResult`/`initial`/
     `success`/`failure` declarations.
   - Replace them with a single re-export from the lifted module:
     `export { failure, initial, isResult, success, TypeId } from
     './internal/result-values.js'` (so existing `import * as Result
     from './Result.js'` consumers see the names unchanged), plus
     `export type { Initial, Result, Success, Failure } from
     './internal/result-values.js'`.
   - The remaining body of `Result.ts` (the `fromExit`, `waiting`,
     `fail`, `flatMap`, `all`, combinators, `Builder`, `match`, etc.)
     stays in place and references the lifted names through the
     re-exports; no body change is needed beyond removing the original
     declarations.
   - The trailing `export { Schema } from './internal/result-schema.js'`
     on line 943 stays as-is.

3. **`internal/result-schema.ts`** changes its imports:

   - Replace
     `import { failure, initial, isResult, success } from '../Result.js'`
     and
     `import type { Result } from '../Result.js'`
     with a single line
     `import { failure, initial, isResult, success, type Result } from
     './result-values.js'`.
   - The rest of `result-schema.ts` is unchanged. It still exports
     `Schema` and `schemaCodec`. The `Schema` declaration still uses
     `Result<A['Type'], E['Type']>` and the same `Result<A['Encoded'],
     E['Encoded']>` encoded type; those types now resolve via the
     lifted module.

**Why this breaks the cycle:** `Result.ts` imports `Schema` from
`internal/result-schema.ts`, and `result-schema.ts` imports `failure,
initial, isResult, success, Result` from `internal/result-values.ts`.
Neither file imports from the other, so the dependency graph becomes
`Result.ts → result-schema.ts → result-values.ts` plus
`Result.ts → result-values.ts` — a DAG.

**Verification gate (must all pass):**

1. `pnpm --filter @systemfsoftware/effect-atom lint` —
   `Found 0 warnings and 0 errors`. The `import/no-cycle` cycle on
   `internal/result-schema.ts:9` and `Result.ts:943` is gone.
2. `pnpm --filter @systemfsoftware/effect-atom typecheck` — exit 0.
   Confirms the type-only imports of `Initial`/`Success`/`Failure`/
   `Result` resolve through the lifted module.
3. `pnpm --filter @systemfsoftware/effect-atom test` — full suite
   green. Specifically:
   - `Result.property.test.ts` exercises `Result.Schema(...)` round-trip
     codec on every constructor (initial/success/failure with success
     payload, error payload, and remembered-success payload) and
     continues to find zero round-trip failures.
   - `Hydration.feature.test.ts` exercises `Result.Schema(...)` through
     the hydration `Registry` API on Initial, Success, Failure, and
     pending variants; the `Result` namespace surface is preserved.
4. `pnpm --filter @systemfsoftware/effect-atom build &&
   pnpm --filter @systemfsoftware/effect-atom dts:check` — exit 0.
   Confirms the published dts still re-exports `Result` (including
   `Result.Schema`, `Result.failure`, `Result.success`, `Result.initial`,
   `Result.isResult`) under the same names; the tsdown per-entry
   chunked rollup still resolves the public surface.
5. `pnpm --filter @systemfsoftware/effect-atom attw` — exit 0. Confirms
   `AreTheTypesWrong` finds no resolution drift in the published dts.
6. `pnpm --filter @systemfsoftware/effect-atom-react typecheck &&
   pnpm --filter @systemfsoftware/effect-atom-react lint &&
   pnpm --filter @systemfsoftware/effect-atom-react test` — exit 0.
   Specifically `ssr.test.tsx` exercises `AsyncResult.Schema({...})`
   through the hydration SSR flow; that path goes through the same
   `Schema` factory and must round-trip identically.

**Test scenarios the implementation must satisfy (no new tests — the
existing suite covers them; this is a refactor):**

- A. The `Result` namespace export of `Schema`, `failure`, `initial`,
  `success`, `isResult`, and the type `Result`/`Initial`/`Success`/
  `Failure` continues to be reachable through
  `import { Result } from '@systemfsoftware/effect-atom'` (covered by
  every `Result.Schema` / `AsyncResult.Schema` call site in the test
  files listed above).
- B. `schemaCodec` continues to be reachable as a value import from
  `internal/result-schema.ts` to `AtomHttpApi.ts` and `AtomRpc.ts`
  (covered by the runtime paths that build an HttpApi/RPC client).
- C. The `TypeId` literal `'~effect-atom/atom/Result'` is unchanged
  (covered by `Result.property.test.ts`'s `isResult` guard checks via
  `hasProperty(value, TypeId)` — the symbol value must remain a
  string of exactly that shape).

### U-2 — Verify no second cycle was introduced

**Files touched:** none. Read-only check.

**Direction:** after U-1 lands, run the lint gate a second time to
confirm no other `import/no-cycle` warnings appear. The known offenders
were the two warnings above; the new module must not produce a new
cycle of its own.

**Verification gate:** `pnpm --filter @systemfsoftware/effect-atom lint`
reports `Found 0 warnings and 0 errors`. If a new cycle appears, the
implementation has introduced a regression and must be re-thought
before merge.

## Decisions (KTDs)

- **KTD-1 (session-settled):** lift the value-side declarations into a
  new `internal/result-values.ts`. Chosen over inlining `Schema` into
  `Result.ts` (would mix public surface with internal helper, would
  re-create a cycle unless `schemaCodec` is also moved, would grow
  `Result.ts` by ~180 lines) and over exporting a second public
  aggregator (REPO-A3 violation, breaks the three test call sites).
  No alternative selected — see approach ledger above.
- **KTD-2:** the `TypeId` literal value stays identical
  (`'~effect-atom/atom/Result'`). `packages/effect-atom/AGENTS.md`
  marks these strings as wire format — renaming is a breaking change
  for `Hydration` payloads. The declaration site moves; the value
  does not.
- **KTD-3:** the new file lives at `internal/result-values.ts`, not
  `internal/result.ts` or `internal/result-model.ts`. The
  `internal/` directory already exists; the leaf is purely a value
  carrier, so a descriptive name avoids colliding with the public
  `Result` type name.

## Risks

- **Risk-1 (low):** the lifted module re-exports names that `Result.ts`
  also previously declared. If any re-export collides with an in-file
  binding, TypeScript will complain. The implementation must delete
  the original declaration before adding the re-export (or use a
  single `export * from` for the value-side namespace). Mitigation:
  run `typecheck` immediately after the edit; a duplicate export is a
  hard error.
- **Risk-2 (low):** tsdown's per-entry dts chunking (per `AGENTS.md`)
  emits a separate dts per `./Atom`, `./Result`, etc. subpath. The
  re-export chain `Result.ts → result-values.ts` must still resolve
  from each entry's perspective. Mitigation: `pnpm --filter
  @systemfsoftware/effect-atom dts:check` is part of the verification
  gate; tsdown's own build precedes it.
- **Risk-3 (low):** `atom-react` may import from `effect-atom` via the
  published dts (`@systemfsoftware/effect-atom`), which means the
  re-export chain must be visible through the package boundary.
  Mitigation: `pnpm --filter @systemfsoftware/effect-atom-react
  typecheck` is part of the verification gate.

## Open questions

None.

## Sequencing

1. U-1: create the lifted module, edit the two existing files.
2. U-1 verification gate (lint, typecheck, test, build, dts:check, attw,
   atom-react gates) — must all pass before any commit.
3. U-2: re-run lint, confirm no new cycle.
4. Ship as a single PR commit on `effect-atom-cycle`, body references
   this plan.
