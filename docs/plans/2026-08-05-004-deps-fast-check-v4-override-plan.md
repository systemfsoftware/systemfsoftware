---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
created: 2026-08-05
base: main @ 8e0b869065
---

# deps: Override fast-check to v4 and delete the RNG-pinning test kind

> **Base commit.** Every file reference, line number, and count in this plan was
> derived from a clean `main` worktree, not from an uncommitted tree. It was written
> against `957eb9853a`; `main` has since advanced to `8e0b869065` by merging
> `feat/stryker-config-extends`. That merge changed only two
> `stryker.config.json` files (`property-testing`, `test-placement`) and touched **none**
> of this plan's targets, so every claim below still holds. Re-verify if `main` moves
> again.
>
> **The stryker generator is being retired — expect it gone.** All 24
> `stryker.config.json` files now carry
> `extends: "@systemfsoftware/stryker-js-core/config/base"`, while
> `scripts/stryker-config.source.mjs` and `scripts/check-stryker-config.mjs` have no
> `extends` awareness at `8e0b869065`. Running the checker against the current tree
> yields **381 drift errors** and exit 1, so `pnpm check` is already red independent of
> anything in this plan. The two regimes are mutually exclusive: a config is either
> generated from a JS source or it inherits from a base preset. The extends regime wins,
> and the generator plus its drift-checker are deleted with it (this is already staged in
> the working tree alongside the `package.json` and `AGENTS.md` edits that drop
> `check:stryker-config` from the `pre-push` / `check` / `check:ci` chains).
>
> The mutation bar is not weakened by that removal — it is centralized and strengthened.
> `packages/stryker-js/core/src/config/base-preset.ts:29` sets
> `thresholds: { high: 100, low: 80, break: 100 }` for every package by inheritance; only
> 4 of the 24 configs override `thresholds` at all, each at `break: 100`. Under the old
> regime the generator source still carried `break: 0` for `effect-daemon-spec`, so the
> checker was enforcing a relaxation rather than preventing one.
>
> **Consequence for U6.** The full gate cannot go green until that deletion is committed.
> Land it first, then run U6.

## Goal Capsule

Move the workspace to fast-check `^4.9.0` via a two-line change to
`pnpm-workspace.yaml`, and remove the two anti-patterns that the move exposes:
a hand-built arbitrary that rebuilds what its schema already declares, and an
entire test kind whose purpose is pinning the random number generator.

Done when `pnpm check` exits 0, exactly one `fast-check` major resolves, mutation
holds at 100 on the affected packages, and no test in the repo depends on a fixed
PRNG seed.

---

## Problem Frame

The catalog pins `fast-check: ^3` (`pnpm-workspace.yaml:16`). That pin is not ours to
relax by itself: `effect@3.22.0` declares `fast-check: ^3.23.1` as a hard
**dependency**, and every property test reaches fast-check through `effect/FastCheck`
(enforced by the `require-effect-fastcheck` rule). Effect's pin is the binding
constraint, so a `pnpm` `overrides` entry is the only cheap lever.

Forking `@effect/vitest` — the original proposal — cannot work. It ships
`dependencies: {}` and reaches fast-check solely through `effect/FastCheck.js`, which
is literally `export * from "fast-check"`. Forking it changes no version by
construction.

### What actually breaks (verified on `main`, not assumed)

| Surface                                         | Verdict                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removed-in-v4 APIs in `packages/`               | **NONE.** Used: `array, assert, asyncProperty, boolean, check, configureGlobal, constant, constantFrom, integer, oneof, pre, property, record, sample, string, stringMatching, tuple`                          |
| Removed-in-v4 APIs in `effect@3.22.0` internals | **NONE.** Used: `anything, array, bigInt, boolean, constant, constantFrom, date, float, integer, js, letrec, maxSafeNat, object, oneof, record, string, stringMatching, tuple, uint8Array, ulid, uuid, webUrl` |
| fast-check types referenced by `effect` `.d.ts` | 6 (`Arbitrary`, `ArrayConstraints`, `BigIntConstraints`, `DateConstraints`, `FloatConstraints`, `StringSharedConstraints`) — **all present in 4.9.0**                                                          |
| `fc.date()` yields `Invalid Date`               | **Unreachable** — no `Schema.Date`/`DateFromSelf` in the repo                                                                                                                                                  |
| `fc.uuid()` yields v6/7/8                       | **Unreachable** — no `Schema.UUID`/`ULID` in the repo                                                                                                                                                          |
| `fc.record()` yields null-prototype objects     | **Reachable, one site** — a hand-written `arbitrary:` annotation in `packages/effect-daemon-spec/src/internal/restart-decision.schema.ts:20`. U3 deletes it                                                    |
| Fixed-seed sampling                             | **Breaks deterministically.** `pure-rand` goes `^6` -> `^8`, so a given seed yields a different value stream. U4/U5 delete the only dependency on this                                                         |
| `fast-check@4.9.0` vs `minimumReleaseAge: 1440` | **Passes** — published 2026-07-08, ~668h old                                                                                                                                                                   |

The only other delta is an improvement: `fc.constant`/`fc.constantFrom` infer literal
types in v4, making the `as const` casts at
`restart-decision.schema.ts:22-24` redundant.

### The two anti-patterns

**A1 — A hand-built arbitrary that rebuilds its own schema.**
`restart-decision.schema.ts:17-32` annotates `DecideInput` with a `fc.record(...)`
subtree that re-declares every field the schema above it already declares, and
re-enumerates all three `RestartStrategy` literals by hand. A fourth strategy added
to the schema would silently never generate — the tests would stay green while
covering nothing. It also builds a `.chain()` pyramid where a leaf-level bound would
do, and carries three `as const` casts that exist only to recover literal types v3
widens away.

**A2 — A test kind whose contract is "pin the RNG".**
`packages/effect-schema-law/__tests__/bounded-union.snapshot.test.ts` runs three
`toMatchSnapshot()` assertions over `fc.sample(..., { seed: 1 })` output — including
one that snapshots a **500-element array of observed depths**. What these pin is the
generator's value stream, not `boundedUnion`'s contract; the file's own docstring
concedes that "any change to boundedUnion, the schema definitions, or the fixed seed
moves this."

That single file is the **only** subject of an entire institutionalized kind:

| File                                                                                                   | Role                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/oxlint-plugins/test-placement/src/rules/snapshot-test-requires-snapshot.ts` (+ `.config.ts`) | A whole rule enforcing that a `.snapshot.test.ts` contains a snapshot assertion                                                                           |
| `packages/oxlint-plugins/test-placement/src/rules/path.config.ts:16,28`                                | `SNAPSHOT_SUFFIX`, plus its entry in `SANCTIONED_OUTSIDE_SRC_SUFFIXES`                                                                                    |
| `packages/oxlint-plugins/test-placement/src/rules/test-suffix-outside-src.config.ts:3`                 | Admits the suffix outside `src/`                                                                                                                          |
| `packages/oxlint-plugins/test-placement/src/index.ts:6,21,37`                                          | Rule import, `error` severity entry, rules-record registration                                                                                            |
| `packages/oxlint-plugins/test-placement/etc/oxlint-plugin-test-placement.api.md:20`                    | Generated API report naming the rule                                                                                                                      |
| `packages/oxlint-plugins/effect-dmmf/etc/oxlint-plugin-effect-dmmf.api.md:97`                          | **A second published package's** report. `effect-dmmf/src/index.ts:52` spreads `...testPlacement.rules`, so the generated report expands the rule by name |
| `packages/oxlint-plugins/property-testing/src/rules/property-file-purity.{ts,config.ts}`               | `SNAPSHOT_TEST_SUFFIX` + `createSnapshotFileVisitors`, exempting the kind from the FastCheck-import ban                                                   |
| Both plugin `README.md`s, plus 3 rule test suites                                                      | Documentation and fixtures for the kind                                                                                                                   |

Re-recording the `.snap` under v4 would be the expedient fix and the wrong one: it
patches the symptom, leaves the root violation standing, and re-breaks on the next
generator change (Constitution §V.1, §V.7). The kind goes.

---

## Requirements

- **R1** — `fast-check` resolves to `4.x` for `effect`'s internal `Arbitrary` module,
  not only for our direct devDependencies.
- **R2** — Exactly one `fast-check` major exists in the resolved graph. Two instances
  would silently split `Arbitrary.make` from `it.prop`.
- **R3** — No test in the repo asserts against output drawn from a fixed PRNG seed.
- **R4** — `DecideInput`'s generation is derived from its schema; adding a fourth
  `RestartStrategy` literal generates automatically.
- **R5** — `pnpm check` exits 0, with `api:check` reports regenerated for any package
  whose public surface changes.
- **R6** — Mutation stays at 100 on `effect-schema-law`, `effect-daemon-spec`, and the
  two touched oxlint plugins.
- **R7** — `minimumReleaseAgeExclude` is neither introduced nor modified (REPO-S2).

---

## Key Technical Decisions

### KTD-1 — `overrides:`, not the catalog alone

The catalog governs only workspace packages' declared ranges; it does nothing to
`effect`'s transitive `fast-check: ^3.23.1`. Bumping the catalog alone produces the
worst outcome — our devDeps at v4, effect still at v3, **two instances**, every
arbitrary silently flowing through the v3 copy (violating R2). `overrides:` already
exists at `pnpm-workspace.yaml:47` carrying `vite: ^7`, so this follows an established
in-repo pattern. Both keys are set: `overrides` satisfies R1/R2, the catalog bump keeps
the six declared ranges honest.

### KTD-2 — Quantify over the seed instead of fixing it

The replacement for the tag-distribution snapshot is not a new golden value. It is a
property **universally quantified over the seed**: for any seed, a sample of N draws
covers all six tags. This is strictly stronger than one recorded seed, immune to a
PRNG change by construction, and it fails exactly when a base/recur mis-split makes a
variant unreachable — the thing the snapshot was trying to protect.

### KTD-3 — Delete the kind, don't repair it

`snapshot-test-requires-snapshot` is a rule whose entire subject population is one
file that should not exist. Keeping the rule after deleting its only subject leaves a
gate guarding nothing and a suffix inviting the pattern back. This is a breaking
change to two published plugins; per REPO-R1 that is expected and is recorded with the
`api!` marker.

### KTD-4 — `^4`, not a pin

Matches neighbouring catalog style (`vitest: ^4`, `vite: ^7`, `typescript: ^7`).
`minimumReleaseAge: 1440` already guards against a too-fresh release.

---

## Implementation Units

### U1 [Bump fast-check to v4 in the workspace manifest]

- **Goal:** fast-check resolves to `4.x` everywhere, including inside `effect`.
- **Requirements:** R1, R7
- **Dependencies:** none
- **Files:** `pnpm-workspace.yaml` (modify), `pnpm-lock.yaml` (regenerate, never hand-edit)
- **Approach:** line 16 `fast-check: ^3` -> `^4`; add `fast-check: ^4` to the existing
  `overrides:` block at line 47. Refresh the lockfile with a normal install — not
  `--frozen-lockfile`, which `pnpm check` runs later as the gate. Do not touch the six
  consuming `package.json` files; they declare `"fast-check": "catalog:"` and follow
  automatically.
- **Execution note:** dependency/config change — prefer install + runtime smoke
  verification over new unit coverage.
- **Test scenarios:** none — no behavior authored here.
  _(Test expectation: none — proof is U2 and U6.)_

### U2 [Prove single-instance resolution]

- **Goal:** exactly one `fast-check` major is reachable, and it is the one `effect` loads.
- **Requirements:** R1, R2
- **Dependencies:** U1
- **Files:** none — verification step.
- **Approach:** resolve `fast-check` from `packages/effect-daemon-spec` and read the
  resolved `package.json#version`; then confirm `effect`'s `FastCheck.js` re-export
  target is that same copy, and that no `fast-check@3` remains linked into any
  workspace package.
- **Test scenarios:**
  - Resolving `fast-check` from `packages/effect-daemon-spec` reports `4.x`.
  - No `fast-check@3` directory is linked by any workspace package.
  - `effect`'s `FastCheck.js` resolves to that same 4.x copy — this is the check that
    catches the dual-instance failure, which every other gate would pass silently.

### U3 [Derive `DecideInput` generation from its schema]

- **Goal:** delete the hand-built arbitrary; generation follows the schema.
- **Requirements:** R4; removes the last live `fc.record` site
- **Dependencies:** none (independent of U1; verified together in U6)
- **Files:**
  - `packages/effect-daemon-spec/src/internal/restart-decision.schema.ts` — modify
  - `packages/effect-daemon-spec/src/internal/__tests__/restart-decision.schema.property.test.ts` — extend
- **Approach:** remove the `arbitrary:` annotation at lines 17-32 in favour of
  schema-level bounds, so the struct and the three literals are generated from the
  declarations that already exist. The cross-field constraint
  (`failedIndex < totalChildren`) is the one dimension the schema cannot express
  structurally; annotate **only** that dimension rather than rebuilding the whole
  subtree. Drop the now-redundant `as const` casts.
  Note `restart-decision.schema.ts` is a `.schema.ts` cell and the
  `schema-exports-only-schemas` rule forbids exporting a bare constant from it — if the
  bound needs a name, it belongs in a non-schema cell.
- **Test scenarios:**
  - Generated `DecideInput` values always satisfy `failedIndex < totalChildren` (the
    refinement never rejects, so no silent generation collapse).
  - `totalChildren` spans its full declared range across a sample, not a single value.
  - All three `RestartStrategy` literals appear in a sample — and the mechanism is
    schema-derived, so a fourth added literal would appear without touching the test.
  - Decoding rejects `failedIndex === totalChildren` and `failedIndex > totalChildren`
    with the declared message.

### U4 [Replace the RNG snapshots with seed-independent properties]

- **Goal:** pin `boundedUnion`'s contract instead of the generator's value stream.
- **Requirements:** R3
- **Dependencies:** none (must land before U5)
- **Files:**
  - `packages/effect-schema-law/__tests__/bounded-union.snapshot.test.ts` — delete
  - `packages/effect-schema-law/__tests__/__snapshots__/bounded-union.snapshot.test.ts.snap` — delete (the only `.snap` under `packages/`; the two others in the tree are inside the vendored `repos/tsdown` subtree, which is read-only per REPO-S3)
  - `packages/effect-schema-law/src/bounded-union.property.test.ts` — create
- **Approach:** two properties replace three snapshots. Placement in `src/` beside the
  kernel is what `test-suffix-outside-src`'s own fix text prescribes for a property
  test. Keep the `nestingDepth` helper — it is the real measuring instrument; only the
  assertions were wrong.
  1. **Depth cap** — `∀e. nestingDepth(e) ≤ 3`, universally quantified over generated
     `Expr` values. Catches a `maxDepth` default regression and a missing
     `depthIdentifier` alike, without naming a seed.
  2. **Composition coverage** — `∀seed. tags(sample(seed, N))` covers all six tags
     (KTD-2). Subsumes the old "recursion actually occurs" evidence, because four of
     the six tags are the recursive variants.
     The old structure snapshot is **not** replaced: generating via `Arbitrary.make(Expr)`
     and then asserting the result is an `Expr` is tautological, and a test that cannot
     fail is worse than no test (USER-V5).
- **Test scenarios:**
  - Every generated `Expr` has nesting depth ≤ 3 under the default `maxDepth`.
  - Depth 3 is actually reached — the cap binds rather than the generator simply never
    recursing (guards the mutant where recursion is disabled entirely).
  - For any seed, a sample covers all six `_tag` values.
  - Raising `boundedUnion`'s `maxDepth` makes the depth property fail; removing a
    recur variant makes the coverage property fail. Verify by hand-mutating the kernel
    and observing red, then reverting (USER-V5 — a test file whose deletion changes
    nothing is not kept).

### U5 [Delete the `.snapshot.test.ts` kind]

- **Goal:** remove the rules, suffix, and docs that institutionalize seed-pinning.
- **Requirements:** R3, R5
- **Dependencies:** U4 (remove the last subject first)
- **Files:**
  - `packages/oxlint-plugins/test-placement/src/rules/snapshot-test-requires-snapshot.ts` — delete
  - `packages/oxlint-plugins/test-placement/src/rules/snapshot-test-requires-snapshot.config.ts` — delete
  - `packages/oxlint-plugins/test-placement/src/rules/__tests__/snapshot-test-requires-snapshot.test.ts` — delete
  - `packages/oxlint-plugins/test-placement/src/rules/path.config.ts` — remove `SNAPSHOT_SUFFIX` (line 16) **and** its entry in `SANCTIONED_OUTSIDE_SRC_SUFFIXES` (line 28)
  - `packages/oxlint-plugins/test-placement/src/rules/test-suffix-outside-src.config.ts` — admit only `.integration.test.ts`
  - `packages/oxlint-plugins/test-placement/src/rules/__tests__/test-suffix-outside-src.test.ts` — update fixtures
  - `packages/oxlint-plugins/test-placement/src/index.ts` — drop the import (line 6), the `error` severity entry (line 21), and the rules-record entry (line 37)
  - `packages/oxlint-plugins/test-placement/etc/oxlint-plugin-test-placement.api.md` — regenerate
  - `packages/oxlint-plugins/effect-dmmf/etc/oxlint-plugin-effect-dmmf.api.md` — regenerate as well. `effect-dmmf/src/index.ts:52` spreads `...testPlacement.rules`, so deleting the rule silently changes a **second published package's** surface. This is the one omission that reliably reds `api:check` at U6, and it is invisible to a grep of `effect-dmmf`'s source because the spread only expands in the generated report
  - `packages/oxlint-plugins/property-testing/src/rules/property-file-purity.config.ts` — remove `SNAPSHOT_TEST_SUFFIX`, rewrite the description
  - `packages/oxlint-plugins/property-testing/src/rules/property-file-purity.ts` — remove `createSnapshotFileVisitors` and its dispatch branch (line 134)
  - `packages/oxlint-plugins/property-testing/src/rules/__tests__/property-file-purity.test.ts` — drop the `SNAPSHOT_FILE` fixtures
  - Both plugin `README.md` files — remove the rule rows and the suffix row
- **Approach:** with the branch gone, `property-file-purity` routes every non-property
  test file to the scenario visitors, so the FastCheck-import ban becomes uniform —
  which is precisely the invariant R3 wants. `test-suffix-outside-src` then admits one
  suffix outside `src/`.
- **Execution note:** this breaks two published plugins' rule sets. Record it with the
  `api!` marker or a `BREAKING CHANGE:` footer (REPO-R1, REPO-C1).
- **Test scenarios:**
  - A `*.snapshot.test.ts` importing FastCheck is now reported by
    `property-file-purity` (the exemption is genuinely gone, not merely unused).
  - A test file outside `src/` not ending `.integration.test.ts` is reported by
    `test-suffix-outside-src`.
  - The removed rule is absent from the plugin's exported rule record, and
    `pnpm api:check` passes against the regenerated report.
  - `pnpm check:lint-coverage` passes — deregistering a rule must not orphan a
    package's opt-in list.

### U6 [Full gate + mutation]

- **Goal:** prove the override and the removals are behaviour-neutral where intended
  and behaviour-correcting where not.
- **Requirements:** R5, R6
- **Dependencies:** U2, U3, U4, U5
- **Files:** none expected; a genuine incompatibility is repaired in the owning package
  and recorded here.
- **Approach:** run the root gate, then mutation for each package touched or generating
  data: `effect-schema-law`, `effect-daemon-spec`, `hex-schema`, `stryker-plugins`, and
  the two oxlint plugins.
- **Test scenarios:**
  - `pnpm check` exits 0 — typecheck is the real detector for fast-check v4 type-shape
    drift inside effect's `.d.ts`.
  - Mutation is 100 for each package named above.
  - The test-contribution gate passes — every `*.property.test.ts`, including the new
    `bounded-union.property.test.ts`, kills a mutant nothing else kills.
  - `git status --porcelain` shows no stray `.snap` and no surviving `__snapshots__`
    directory.

---

## Risks

**Risk-1 — Type-shape drift in the six referenced fast-check types.** All six names
exist in 4.9.0, but presence is not shape compatibility; `FloatConstraints` and
`StringSharedConstraints` both changed defaults across the major. _Detector:_ `pnpm check`
typecheck. _Fallback:_ the `overrides` line is a one-line revert.

**Risk-2 — Mutation drops after U3/U4.** Replacing hand-built generation and snapshots
changes which mutants die. A drop is real signal, not noise — it means the old test was
passing on recorded luck. _Mitigation:_ U6 runs mutation on every touched package;
repair by sharpening the property, never by lowering a threshold (REPO-S5, §III.3).

**Risk-3 — Coverage-property flake. Quantified, then dismissed.** `boundedUnion` hands
`fc.oneof` five top-level branches — `fc.oneof(Lit, Id)` counts as one, plus the four
recur variants — so at the root the two base tags sit at ~1/10 each and the four recur
tags at ~1/5. The rarest is ~1/10, which at an inner sample of 200 puts the chance of
missing any given tag near 7e-10. Size the inner sample at 200 and this is not a live
risk. It becomes one below roughly 50, so the sample size is the thing to hold, not the
seed.

**Risk-4 — Literal-inference tightening surfaces new type errors.** `fc.constantFrom`
now yields a literal union. _Detector:_ U6 typecheck. Low likelihood — U3 deletes the
main call site.

---

## Deferred to Follow-Up Work

- **Reassess the `effect@4.0.0-beta` line.** Upstream already ships fast-check 4 and
  vitest-4 peers at `4.0.0-beta.103`. That resolves this category permanently but is a
  pre-release major across 43 packages.

---

## Verification Contract

Run in order. Any failure blocks done (REPO-A3).

1. `pnpm check` — exits 0.
2. U2's single-instance probe — one `4.x`, zero `3.x`, effect loading the same copy.
3. `pnpm --filter <pkg> mutation` at 100 for `effect-schema-law`,
   `effect-daemon-spec`, `hex-schema`, `stryker-plugins`,
   `oxlint-plugin-test-placement`, `oxlint-plugin-property-testing`.
4. Under `packages/`: no `.snap` file, no `__snapshots__` directory, and no fixed-seed
   `fc.sample` outside RuleTester string fixtures. (`repos/` is vendored and read-only.)

Evidence must come from the implementing session, after the last edit (REPO-A2, USER-V1).

## Definition of Done

- [ ] `pnpm-workspace.yaml` carries `fast-check: ^4` in **both** `catalog` and
      `overrides`; `minimumReleaseAgeExclude` untouched.
- [ ] Exactly one `fast-check` major resolves, and `effect` loads it.
- [ ] `restart-decision.schema.ts` has no hand-built `fc.record` arbitrary and no
      `as const` casts.
- [ ] Under `packages/`: no `.snap` file, no `__snapshots__` directory, and no
      `.snapshot.test.ts` file or rule.
- [ ] `pnpm check` exits 0 from the implementing session after the last edit.
- [ ] Mutation is 100 on all six packages listed in the Verification Contract.
- [ ] Plugin API reports regenerated; the rule removal is committed with `api!` or a
      `BREAKING CHANGE:` footer, typed `deps(...)` or `refactor(...)` per REPO-C2 —
      not `feat`/`fix`.

## Sources & Research

- fast-check v3->v4 migration guide, read in full; removal set diffed against every
  `fc.*` call site on `main` and against `effect@3.22.0`'s compiled internals.
- npm registry: `effect@3.22.1` deps `fast-check ^3.23.1`; `@effect/vitest@0.30.0` deps
  `{}`, peers `vitest ^3.2.0`; `effect@4.0.0-beta.103` already on fast-check 4;
  `fast-check@4.9.0` deps `pure-rand ^8` (v3 used `^6` — the source of seed drift).
- `fast-check@4.9.0` `lib/fast-check.d.ts`: all six effect-referenced types present.
- `pnpm-workspace.yaml:47-48` — pre-existing `overrides:` precedent (`vite: ^7`).
