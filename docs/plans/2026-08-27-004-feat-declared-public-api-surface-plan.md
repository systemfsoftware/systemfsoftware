---
title: Declared Public API Surface - Plan
type: feat
date: 2026-08-27
topic: declared-public-api-surface
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Declared Public API Surface - Plan

## Goal Capsule

- **Objective:** every package's public API is declared or the build breaks — an untagged export fails the package build, `@public` publishes, `@internal` stays workspace-only; the `tests/` lane narrows to snapshot tests; the lint-disable escape hatch closes.
- **Product authority:** this plan owns the surface-enforcement work. Adjacent areas — legacy surface slimming, a type-level surface pin, surface-change ceremony — are context, not scope (see Scope Boundaries).
- **Open blockers:** none blocking planning.

---

## Product Contract

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

- R1. An exported declaration without a release tag fails that package's build, naming the symbol. Gate: `ae-missing-release-tag` at `logLevel: "error"` in every `packages/**/api-extractor.json` (25 today); tags inherit from containers, so the outermost declaration carries the tag. `packages/core/effect/atom/atom` and `atom-react` carry no api-extractor config — the rollup there measured 154 and 51 declaration errors against tsdown's 0 (`packages/core/effect/atom/AGENTS.md`) — so R6 is their enforced lane, not this gate.
- R2. Every package's `build` task runs its API check. Gate: the build script chains `api:check` — today 23 of 25 do; `packages/testing/mutation/stryker-js/html-reporter/package.json` and `**/platform-node/package.json` gain the chain.
- R3. Before R1 turns red, every currently-exported outermost declaration carries a tag — today's surface, including existing deep subpaths, becomes the declared baseline unchanged. The sweep covers every exports-map key of every multi-entry package, not only the root entry.
- R4. Existing `oxlint-disable` suppressions of `tests-import-public-api` are removed, since R7 makes them guard failures. The surviving instance — `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts` — is deleted, not migrated: its subjects are package-private wiring, delete-only by the prior plan's R12.

**Test lanes**

- R5. `tests/` accepts snapshot tests only; a hand-assertive integration test is deleted, not written. Gate: a test-placement rule fails a non-snapshot test file under `tests/`.
- R6. Each package pins its runtime public surface with one small generated snapshot per exports-map key — every entry (`.` and each subpath) gets its own snapshot, never one blob. A changed export set fails `pnpm test` until the snapshot updates, and an update that adds or removes exports pairs with a changeset body naming each symbol; a bare regeneration with no named-symbol intent is rejected. The generator lands in the same milestone as the first snapshots.

**Guard and ceremony**

- R7. `tests-import-public-api` joins the protected rule ids. Gate: `scripts/guards/check-forbidden-lines.ts` `PROTECTED_RULE_IDS` includes it; a named or blanket suppression exits the guard non-zero.
- R8. Gate-defining changes — the 25 configs, the protected list, the placement rule — land as their own commit(s), each observed red on a known-bad fixture before and green after, per the Evaluator-surface rule in `AGENTS.md`.
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

### Outstanding Questions

- Deferred to Planning: the sanctioned filename for the surface snapshot test and the host package for its generator (extend `effect-schema-vite` versus a sibling under `packages/core/effect/schema/`).
- Deferred to Planning: whether the baseline sweep is a scripted tagger or manual annotation.
- Deferred to Planning: the snapshot-form definition for R5 — which matchers count as snapshot-shaped.
- Open: `atom` and `atom-react` sit outside the house oxlint config (`packages/core/effect/atom/AGENTS.md`), so R5's placement rule and R7's suppression guard may not run there; Planning decides how their `tests/` lane is enforced.

### Sources

- Representative silenced config: `packages/core/effect/daemon-spec/api-extractor.json:34-36`; the same block recurs in all 25 configs.
- Build chain: `packages/core/effect/daemon-spec/package.json:42` (`"build": "tsdown && pnpm api:check"`).
- Guard list: `scripts/guards/check-forbidden-lines.ts:3`.
- Test-placement rule and taxonomy: `packages/lint/oxlint/plugins/testing/test-placement/src/rules/tests-import-public-api.ts` and its config; plugin recommended config enables it at `error`.
- Generated-file precedent: `packages/core/effect/schema/vite/src/mod.ts:17,34-55,80-97`.
- Prior doctrine: `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` (internal folder, `@internal` trim, R12 delete-only).
- Surviving cheat instances: `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts:7-14`; `packages/core/effect/atom/atom/package.json` exports map.
