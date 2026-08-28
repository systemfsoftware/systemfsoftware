---
title: Declared Public API Surface - Plan
type: feat
date: 2026-08-27
topic: declared-public-api-surface
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
deepened: 2026-08-28
product_contract_source: ce-brainstorm
execution: code
---

# Declared Public API Surface - Plan

## Goal Capsule

- **Objective:** every package's public API is declared or the build breaks — an untagged export fails the package build, `@public` publishes, `@internal` stays workspace-only; the `tests/` lane narrows to snapshot tests; the lint-disable escape hatch closes.
- **Product authority:** this plan owns the surface-enforcement work. Adjacent areas — legacy surface slimming, a type-level surface pin, surface-change ceremony — are context, not scope (see Scope Boundaries).
- **Open blockers:** none.
- **Execution profile:** units run in dependency order U1 → U2 → U3/U4/U5 (parallelizable) → U6. Implementation via ce-work; the shipping tail (commit, push, PR, CI watch) returns to the lfg caller.
- **Stop conditions:** stop and surface a blocker if research or implementation shows api-extractor at error level cannot go green on any package after a good-faith tag audit, or if the generated snapshot lane cannot import a declared entry at runtime.

---

## Product Contract

*Product Contract unchanged from the review-hardened requirements version; requirement and acceptance IDs R1–R9, AE1–AE5 preserved. The four planning-deferred Outstanding Questions are resolved into KTD1–KTD5 and the section is removed.*

### Summary

Every exported declaration must carry a release tag at write time: untagged fails the package build via the existing api-extractor gate, `@public` publishes immediately, `@internal` stays workspace-only. A generated surface snapshot per exports-map key pins that entry's runtime export set inside `pnpm test`, and suppressing the test-placement rule becomes a guard failure.

### Problem Frame

The repo forces integration tests onto the public API (`tests-import-public-api`, oxlint `error`), so an agent whose test subject is an internal module takes the cheapest compliant route: export it. Nothing forces the classification decision — `publicness` is the default. Code lands in `src/` with no internal folder, compiles straight into the published rollup, and the first `.api.md` snapshot blesses whatever the agent exported. At api-extractor 7.58.9 the report labels an untagged declaration `@public` silently, and all 25 `packages/**/api-extractor.json` configs disable the one message (`ae-missing-release-tag`: `logLevel: "none"`) that would refuse it. The result is leaky abstractions published to npm with every gate green: the surviving `oxlint-disable` reach-ins under `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts:7-14` and the eight deep subpaths in `packages/core/effect/atom/atom/package.json` are instances of the class. Existing gates police consistency (report matches source) — none polices deliberateness (should this be public at all).

### Key Decisions

- Binary tags, no staging — `@public` or `@internal` at write time; `@alpha`/`@beta` carry no promotion process and stay unused (session-settled: user-directed — chosen over `@beta` staging: nobody spends time on promotions). Governs R1, R3.
- The declared exports map is the enforcement unit — Node's `exports` field is the encapsulation boundary an installed package actually enforces, so the runtime snapshot lane iterates its keys and packages the type-rollup gate cannot reach (`atom`, `atom-react`) are enforced per-key, not exempted. Governs R1, R3, R6.
- The untagged default flips at the existing gate, not a new gate class — one config key per package plus the build chain already in place (session-settled: user-approved). Governs R1, R2.
- Internals stay delete-only — no private test import route; an internal needing integration coverage loses the test, per `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` R12 (session-settled: user-directed — chosen over a sanctioned internal-test path: the default is deleting slop tests, not adding routes). Governs R5.
- `tests/` narrows to snapshot tests only — the one sanctioned lock-the-output form becomes the enforcement instrument (session-settled: user-directed). Governs R5.
- The surface snapshot rides the generated-file-with-real-import-edges pattern, not a virtual module — precedent: `packages/core/effect/schema/vite/src/mod.ts` rewrites the one filename the placement taxonomy whitelists, so mutation related-file walks reach the generated imports. Governs R6.
- Mass-`@public` tagging stays mechanically green — the accepted backstop is the `.api.md` diff plus the changeset intent the turbo build hash already forces; no red gate for it (session-settled: user-approved).

### Requirements
**Surface gate**

- R1. An exported declaration without a release tag fails that package's build, naming the symbol. Gate: `ae-missing-release-tag` at `logLevel: "error"` in every `packages/**/api-extractor.json` (29 entry configs across 25 gated packages — `stryker-plugins` carries four entry configs, `effect/schema` two); tags inherit from containers, so the outermost declaration carries the tag. `packages/core/effect/atom/atom` and `atom-react` carry no api-extractor config — the rollup there measured 154 and 51 declaration errors against tsdown's 0 (`packages/core/effect/atom/AGENTS.md`) — so R6 is their enforced lane, not this gate.
- R2. Every gated package's `build` task runs its API check. Gate: the build script chains `api:check` — today 23 of the 25 gated packages do; `packages/testing/mutation/stryker-js/html-reporter/package.json` and `packages/testing/mutation/stryker-js/platform-node/package.json` gain the script and the chain.

- R3. Before R1 turns red, every currently-exported outermost declaration carries a tag — today's surface, including existing deep subpaths, becomes the declared baseline unchanged. The sweep covers every exports-map key of every multi-entry package, not only the root entry.
- R4. Existing `oxlint-disable` suppressions of `tests-import-public-api` are removed, since R7 makes them guard failures. The surviving instance — `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts` — is deleted, not migrated: its subjects are package-private wiring, delete-only by the prior plan's R12.

**Test lanes**

- R5. `tests/` accepts snapshot tests only; a hand-assertive integration test is deleted, not written. Gate: a test-placement rule fails a non-snapshot test file under `tests/`.
- R6. Each package pins its runtime public surface with one small generated snapshot per exports-map key — every entry (`.` and each subpath) gets its own snapshot, never one blob. A changed export set fails `pnpm test` until the snapshot updates, and an update that adds or removes exports pairs with a changeset body naming each symbol; a bare regeneration with no named-symbol intent is rejected. The generator lands in the same milestone as the first snapshots.

**Guard and ceremony**

- R7. `tests-import-public-api` joins the protected rule ids. Gate: `scripts/guards/check-forbidden-lines.ts` `PROTECTED_RULE_IDS` includes it; a named or blanket suppression exits the guard non-zero.
- R8. Gate-defining changes — the 29 entry configs, the protected list, the placement rule — land as their own commit(s), each observed red on a known-bad fixture before and green after, per the Evaluator-surface rule in `AGENTS.md`.
- R9. The baseline sweep (R3) lands per package before that package's config flip (R1), and the flip is its own commit observed red on a known-bad fixture before and green after — the same Evaluator-surface observation R8 names; a repo-wide simultaneous flip is out of scope.

### Acceptance Examples

- AE1. **Covers R1.** Given a package with a tagged surface, when an agent adds an exported declaration with no release tag, then that package's `build` fails naming the declaration.
- AE2. **Covers R2.** Given `html-reporter` with the chain added, when its build runs, then `api-extractor` executes as part of the build task, not only in CI.
- AE3. **Covers R6.** Given a package with a committed surface snapshot, when an agent adds an export to the entry, then `pnpm test` fails until the snapshot updates; the snapshot diff is what review reads.
- AE4. **Covers R7.** Given any file, when it carries `// oxlint-disable tests-import-public-api`, then `check-forbidden-lines` exits non-zero naming the suppression.
- AE5. **Covers R5.** Given a test file under `tests/` asserting expectations by hand, when lint runs, then the placement rule fails it as a non-snapshot test.

### Success Criteria

- For every package the gates reach, an agent widening or leaving untagged an export sees red inside its own loop — at `build` or `test` — without waiting for CI or review.
- Every new or changed export carries a release tag the build enforces, and published rollup types contain only `@public`-tagged declarations — at 7.58.9 the public trim excludes `@alpha`, `@beta`, and `@internal`. The broad-`@public` baseline is the accepted residual, not a success signal.
- The residual cheat — tagging everything `@public` — is visible, not silent: the `.api.md` diff, the forced changeset intent, and the per-key snapshot diffs. Near-term effect is protective; corrective slimming is separate work (Scope Boundaries).

### Scope Boundaries

- Private internal-test import paths — rejected; internals stay delete-only.
- Surface ceremony — commit-class rules beyond R8 and changeset bump grading; rejected as ritual.
- tstyche type-level surface pin — deferred; the build gate carries the same force one lane earlier.
- Legacy surface slimming — the baseline accepts today's surface (including `atom`'s eight subpaths); narrowing it is separate work.
- Runtime trimming of unpublished re-exports — out; the published type surface is the contract, runtime bytes are accepted.
- In-src property-test placement — unchanged by this work.

### Dependencies / Assumptions

- api-extractor 7.58.9 message semantics as measured in a fixture and as vendor-documented: untagged defaults to `@public` silently unless `ae-missing-release-tag` is raised; tags inherit from containers; the public trim excludes non-`@public` tags.
- A recorded workspace posit notes a namespace-re-export rollup blind spot at 7.58.9; the tag gate reads the analysis model and the surface snapshot reads runtime keys, so neither depends on rollup fidelity for namespace-partitioned entries.
- The `@systemfsoftware/source` condition keeps workspace typecheck tag-agnostic — tagging changes nothing for in-workspace consumers.

### Sources

- Representative silenced config: `packages/core/effect/daemon-spec/api-extractor.json:34-36`; the same block recurs in all 29 entry configs across the 25 gated packages.
- Build chain: `packages/core/effect/daemon-spec/package.json:42` (`"build": "tsdown && pnpm api:check"`).
- Guard list: `scripts/guards/check-forbidden-lines.ts:3`.
- Test-placement rule and taxonomy: `packages/lint/oxlint/plugins/testing/test-placement/src/rules/tests-import-public-api.ts` and its config; plugin recommended config enables it at `error`.
- Generated-file precedent: `packages/core/effect/schema/vite/src/mod.ts:17,34-55,80-97`.
- Prior doctrine: `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` (internal folder, `@internal` trim, R12 delete-only).
- Surviving cheat instances: `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts:7-14`; `packages/core/effect/atom/atom/package.json` exports map.

---

## Planning Contract

*Research grounding: this run dispatched two read-only researchers whose findings are cited per KTD; external wiki/literature grounding for the snapshot doctrine and the exports-map authority already lives in Product Contract Key Decisions and Sources (wiki rulings `declared-entry-points-only` and `snapshot-testing`; doi:10.1016/j.jss.2023.111797). External findings shaped R6's rejection criterion, so the confidence check's load-bearing-research override applies.*

### Key Technical Decisions

- KTD1. The surface-snapshot generator is a new workspace-private package, `packages/toolchain/api-surface/`, exposing the generator function and a CLI; packages consume it as a devDependency and run it through a package script. Chosen over extending `effect-schema-vite`, which is schema-scoped; `packages/toolchain/` is the repo's established home for shared dev tooling (`tsconfig`, `vitest-config`, `tsdown-config` live there). Governs U3.
- KTD2. The sanctioned generated test is one file per package, `tests/surface.snapshot.test.ts`, carrying one test per exports-map key. The placement rule whitelists the exact basename — the mechanism `no-test-file-in-src.ts` already uses for `schema-laws.test.ts` — and the file also passes on snapshot shape alone, since every test it emits calls a snapshot matcher. The generator iterates the dev `exports` map's keys — the map workspace resolution enforces and the in-loop purpose requires; `publishConfig.exports` divergence is a release-time concern outside this lane. Governs U3, U4.
- KTD3. The baseline sweep is a gate-driven audit, not a scripted mass-tagger: per package, run api-extractor locally at error level, tag exactly the exports the red names, regenerate the report with `api:update`, commit. Reports in the tree already carry tags in places (daemon-spec), so a blind tagger would rewrite files the gate does not object to. Governs U1.
- KTD4. "Snapshot-shaped" for R5 means the file's AST contains a call to `toMatchSnapshot`, `toMatchInlineSnapshot`, or `toMatchFileSnapshot` — mechanically decidable by the placement rule, and the same matcher family the repo already commits (`arethetypeswrong` holds 14 `toMatchFileSnapshot` fixtures). Governs U4.
- KTD5. `atom` and `atom-react` get the snapshot-only placement rule by adding the test-placement plugin to their own minimal `oxlint.config.ts` — not by adopting the shared config their AGENTS.md deliberately declines. Registration is not enablement: their `rules` blocks set the new rule (and `tests-import-public-api`) to `error` explicitly, or the gate never fires there. Their R6 snapshots run under `pnpm test` regardless of lint wiring. Governs U4.
- KTD6. The 29 config flips across the 25 gated packages land as one commit, observed red on a known-bad fixture before and green after; U1's sweep lands before it, which satisfies R9's per-package ordering globally (every package is swept before any flip). One commit covers 29 identical edits; 29 separate observation rituals would be ceremony. Governs U2.

### Assumptions
- No completeness guard (asserting every future publishable package has an enforcement lane) ships in this run — that scope addition was surfaced in scoping but never confirmed; it is recorded here as a labeled bet and left out of the unit map.
- The two straggler packages already carry api-extractor configs (`dist/index.d.mts` entries) but build with bare `tsdown` and no extractor script — U2 adds the `api:check` script (`api-extractor run`, mirroring `packages/core/effect/daemon-spec`) plus the build chain.

### Sequencing

U1 (sweep) precedes U2 (flip) per R9. U3, U4, U5 are independent of each other and parallelize after U2 — U3's generated tests satisfy U4's rule by construction, so no ordering constraint exists between them. U6 closes: changeset intents ride each hash-moving unit, and U6 verifies the intent set is complete.

---

## Implementation Units

### U1. Baseline tag sweep across the 25 gated packages

- **Goal:** every currently-exported outermost declaration in the 25 api-extractor-gated packages carries a release tag; every `etc/*.api.md` report is regenerated against the tagged source.
- **Requirements:** R3, R9 (first half).
- **Dependencies:** none.
- **Files:** `packages/**/src/**/*.ts` (tag-only additions) and `packages/**/etc/*.api.md` across the 25 gated packages.
- **Approach:** per package, run api-extractor locally with `ae-missing-release-tag` at error level, tag exactly the declarations the red names `@public`, regenerate the report (`api:update`), and move to the next package. The 25 gated packages carry 29 entry configs — `stryker-plugins` (four) and `effect/schema` (two) get one pass per config, so every exports-map key's surface is swept.
- **Test scenarios:**
  - Dry-run each package at error level after tagging: zero `ae-missing-release-tag` findings.
  - Diff audit: sweep commits touch only TSDoc tag lines and regenerated reports — no signature, body, or export-list changes.
  - `atom`/`atom-react` are absent from the sweep (no configs to sweep).
- **Verification:** all 25 packages' `api:check` green at error level against the tagged source; `git diff` shows tag-only source deltas.

### U2. Flip the tag gate and complete the build chain

- **Goal:** an untagged export fails its package's build naming the symbol; every gated package's build runs its API check.
- **Requirements:** R1, R2, R8, R9 (second half).
- **Dependencies:** U1.
- **Files:** the 29 `packages/**/api-extractor*.json` entry configs across the 25 gated packages; `packages/testing/mutation/stryker-js/html-reporter/package.json` and `packages/testing/mutation/stryker-js/platform-node/package.json` (gain the `@microsoft/api-extractor` devDependency — pnpm's strict layout resolves no undeclared binary — plus the `api:check` script and build chain); committed `etc/*.api.md` baselines for the two stragglers, generated during the flip (`api-extractor run` is a report-diff gate that errors without one).
- **Approach:** one commit (KTD6). Before committing, observe the gate red: add a scratch untagged export to one package, run its build, capture the `ae-missing-release-tag` error naming file, line, and symbol, then revert the scratch and observe green. The two stragglers gain the `api:check` script (`api-extractor run`, mirroring `packages/core/effect/daemon-spec`) plus the build chain in the same commit; their builds then exercise the flipped gate like the other 23.
- **Test scenarios:**
  - Covers AE1. Scratch untagged export in a gated package → `build` exits non-zero naming the declaration; revert → green.
  - Covers AE2. `html-reporter` build runs `api:check` as part of the task, not only in CI.
  - Every gated package builds green post-flip against U1's tagged baseline.
- **Verification:** the red/green observation is recorded in the commit message body; all 25 builds green.

### U3. Surface snapshot generator and per-key snapshots

- **Goal:** every publishable package pins each exports-map key's runtime export set with a committed per-key snapshot test, generated by a shared tool.
- **Requirements:** R6.
- **Dependencies:** U2 (tag gate green first, so surface changes in flight have settled).
- **Files:** new `packages/toolchain/api-surface/` (generator module, CLI entry, own tests, package.json, tsdown config); generated `tests/surface.snapshot.test.ts` plus snapshot files across publishable packages; devDependency + script entries per package.
- **Approach:** generator reads the package's `exports` map, emits one test per key that dynamically imports the public name + key and pins `Object.keys()` of the resolved module with `toMatchFileSnapshot` — real import edges, real file on disk (schema-laws precedent). Namespace-barrel keys (atom's `export * as Atom`) snapshot the namespace object's keys, which is exactly the subpath's public value surface. Initial snapshots are committed in the same milestone as the generator (R6). Non-module keys are skipped — every package's exports map carries `./package.json`, and a JSON-metadata snapshot would drift on every version bump; a generator test asserts the skip. Each package's vitest config carries the `@systemfsoftware/source` resolve condition (atom, atom-react, and platform-node already do) so the snapshot pins `src`, not stale `dist` — an src-only edit trips `pnpm test` without a rebuild.
- **Test scenarios:**
  - Generator given a package with N exports keys emits N tests importing the public names.
  - Covers AE3. Adding an export to an entry makes that package's `pnpm test` fail until the snapshot updates; the diff names the added symbol's key.
  - Removing an export fails the matching key's test.
  - atom's `/Registry` key pins the namespace's exported names; a new name inside a barrel module fails its key's test.
  - Regeneration is idempotent: two runs produce byte-identical output.
  - Generator's own suite asserts emitted code exactly (spec-of-intended-output, `toBe`/`toEqual` — no `.snap` capture).
  - A package whose exports map carries only `./package.json` beyond the root gets no subpath tests; the generator's suite covers the skip.
- **Verification:** every publishable package's `pnpm test` green with committed snapshots; deleting a snapshot file makes `pnpm test` fail in a CI-like run; editing an export in `src` alone (no rebuild) fails `pnpm test`.

### U4. Snapshot-only placement rule, wired everywhere

- **Goal:** a hand-assertive test file under `tests/` fails lint; snapshot-shaped tests and the sanctioned generated basename pass.
- **Dependencies:** none (parallel with U3).
- **Files:** `packages/lint/oxlint/plugins/testing/test-placement/` (new rule module, `path.config.ts` additions, index/config registration, RuleTester suite); `packages/core/effect/atom/atom/oxlint.config.ts`; `packages/core/effect/atom/atom-react/oxlint.config.ts`.
- **Approach:** new rule in the test-placement plugin: a test file under `SANCTIONED_TEST_DIRS` fails when its AST contains no `toMatchSnapshot`/`toMatchInlineSnapshot`/`toMatchFileSnapshot` call and its basename is not the sanctioned `surface.snapshot.test.ts` (exact-basename allowance copied from `no-test-file-in-src.ts`). Register it beside the plugin's existing rules, which `src/index.ts` lists at `error` in `recommended`; the rule also ships through the effect-dmmf meta-plugin re-export, so suppressions of it can name either namespace. Atom's local configs add the plugin and set the rule to `error` in their own `rules` blocks (KTD5). Before at-error wiring, run the rule repo-wide in warn-only mode and itemize every finding — hand-assertive suites exist today in `atom`/`atom-react` (zero snapshot matchers) and in gated packages — then delete or snapshot-convert each per the delete-only doctrine; the at-error flip lands per R8's observation discipline.
- **Test scenarios:**
  - Covers AE5. A `tests/foo.test.ts` asserting with `expect(x).toBe(y)` and no snapshot matcher fails, naming the rule.
  - A `tests/foo.test.ts` using `toMatchFileSnapshot` passes.
  - `tests/surface.snapshot.test.ts` passes on the exact-basename allowance even before matchers are considered.
  - In-src files and `__tests__/` directories are untouched by the rule.
  - Atom's config produces a finding for a hand-assertive file under its `tests/`.
- **Verification:** plugin suite green; the pre-wiring audit's itemized findings each resolved (deleted or converted); lint at `error` exits clean on the tree; the flip's red/green observation recorded per R8.

### U5. Close the suppression hatch

- **Goal:** disabling `tests-import-public-api` anywhere is a guard failure, and the one surviving suppression is gone.
- **Requirements:** R4, R7.
- **Dependencies:** none (parallel with U3/U4).
- **Files:** `scripts/guards/check-forbidden-lines.ts`; deletion of `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts`.
- **Approach:** add `'tests-import-public-api'` to `PROTECTED_RULE_IDS`. Delete the adapters test outright — its subjects (`packages/testing/type-testing/arethetypeswrong/analysis` internals) are package-private wiring; delete-only by the prior plan's R12. The surviving suppressions there name the rule under the effect-dmmf plugin namespace; the guard matches the bare rule id as a substring, so any namespace spelling is caught. Run the guard's selftest, then observe AE4 red on a scratch suppression before the real green.
- **Test scenarios:**
  - Covers AE4. A scratch file carrying `// oxlint-disable tests-import-public-api` makes the guard exit non-zero naming the file; blanket `// oxlint-disable` also fails it.
  - Guard selftest passes (red on its known-bad fixtures, green on clean inputs).
  - Repo-wide scan after deletion: zero suppressions of the rule remain.
- **Verification:** guard green on the tree with the rule protected; the four adapter contracts the deleted test bound are accepted as uncovered — the reach-in was their only runtime binding and delete-only doctrine removes it rather than relocating it; no coverage claim is made.

### U6. Changeset intents and final verification

- **Goal:** every build-hash-moving change carries its release intent, and the tree passes the full local gate.
- **Requirements:** REPO-R2 discipline applied to this work; R8.
- **Dependencies:** U1–U5.
- **Files:** `.changeset/*` intents; no source changes.
- **Approach:** intents grade on consumer observability: the `api-surface` generator is workspace-private (KTD1) and takes no intent — the same class as the toolchain config packages; the test-placement plugin gains a rule at `error` in recommended (minor); the gated packages change build config and tags with no exported name, type, or behavior change (`none`); the guard and scripts are unpublishable (no intent). Run the full local gate.
- **Test scenarios:**
  - `pnpm change` list shows an intent for every publishable package whose build hash moved; `none` intents name no consumer-visible change.
  - The changeset guard passes against the PR base.
- **Verification:** `pnpm check:local` exits 0 after the last edit; the changeset workflow passes in CI.

---

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Package build + tag gate | `pnpm --filter <pkg> build` | R1, R2 — build runs `tsdown && api:check`; untagged export fails naming the symbol |
| Surface snapshots | `pnpm --filter <pkg> test` | R6 — per-key committed snapshots; changed keys fail |
| Placement rule | `pnpm --filter <pkg> lint` | R5 — non-snapshot tests under `tests/` fail |
| Guard | `pnpm check:ci` (runs `check:forbidden-lines`) | R7 — protected-rule suppressions fail; selftest covers red/green |
| Full local gate | `pnpm check:local` | REPO-D1 — run after the last edit, exit 0 |
| Changesets | changeset workflow vs base SHA | REPO-R2 — every hash-moved publishable package carries an intent |

Evidence discipline: the U2 and U5 red/green observations are captured (command + exit code) in the implementing session and referenced in the commit bodies — a claimed observation without a recorded exit code did not happen.

---

## Definition of Done

- All six units landed in dependency order; every unit's verification evidence exists in the implementing transcript.
- `pnpm check:local` exits 0 after the final edit (REPO-D1).
- The PR is open and CI is watched to decided (lfg tail; REPO-D2). Mutation runs are never started by the implementing agent (REPO-D3) — the Mutation workflow's merged report is advisory and human-read.
- Cleanup: scratch fixtures used for red/green observations are reverted, not committed; no abandoned generator variants remain in the diff.
