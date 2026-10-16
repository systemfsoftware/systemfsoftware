---
title: Drop strict-effect-provide from the Effect presets - Plan
type: fix
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Drop strict-effect-provide from the Effect presets - Plan

## Goal Capsule

- **Objective:** A package that extends `@systemfsoftware/oxlint-config-recommended` or `@systemfsoftware/tsconfig/effect` lints and typechecks its correct `Effect.provide(<Layer>)` call sites without per-file overrides or `@effect-diagnostics` directives.
- **Means:** remove the rule from both preset channels so it sits at its upstream default `off` (KTD1), and delete the in-repo opt-outs it forced (R5).
- **Authority:** issue #487 (Product Contract below), then the Key Technical Decisions, then the units.
- **Stop conditions:** stop and report if removing the rule leaves any `effecttsgo/strict-effect-provide` or `strictEffectProvide` report in `pnpm lint`, `pnpm typecheck`, or `effect-tsgo diagnostics`, or if satisfying a gate would require disabling any other rule or editing an `Effect.provide` call site.
- **Execution profile:** configuration and documentation only; proof is the lint, typecheck, and grep gates, not new tests.
- **Finish and ship:** one PR against `main` that closes #487, watched to green CI.

---

## Product Contract

### Summary

Both Effect presets stop enabling `strict-effect-provide`, leaving it at its upstream default, and the three packages that opted out of it drop those opt-outs with their `Effect.provide` call sites untouched. Each preset ships a patch release note saying consumer overrides for the rule can be deleted.

### Problem Frame

`effecttsgo/strict-effect-provide` (`strictEffectProvide` in the language service) reports every `Effect.provide` whose argument is a `Layer`. It never looks at the file's role, `runMain`, `Layer.launch`, or who owns the scope, and upstream ships it at severity `off` (Effect-TS/tsgo `internal/rules/strict_effect_provide.go` at `d6758e71e59ef0ec1eac3111392480b23f5b527f`, lines 10-16 and 60-70). It also passes the equivalent `Layer.build` then `Effect.provide(ctx)` shape, so it catches the spelling rather than the lifetime bug.

Version 2.0 of both presets promotes it to `error` in `src/`. Every consumer with a legitimate composition point must either carry an override or rewrite correct code into a shape the matcher cannot see. This repository already carries three such overrides, each commented "Providing the caller's Layer is this module's public API."

### Requirements

**Preset policy**

- R1. The rules produced by `@systemfsoftware/oxlint-config-recommended` leave `effecttsgo/strict-effect-provide` at its upstream default in every file role: source, tests, type tests, and examples.
- R2. The `@systemfsoftware/tsconfig/effect` and `@systemfsoftware/tsconfig/effect/entrypoint` presets leave `strictEffectProvide` at its upstream default.
- R3. No other rule in either preset changes severity.

**Documentation**

- R4. `packages/toolchain/tsconfig/README.md` and the `effect-entrypoint.json` header describe the `effect` / `effect/entrypoint` difference as `nodeBuiltinImport` only.

**In-repo consumers**

- R5. `packages/trace-spec`, `packages/effect-gherkin-spec` and `packages/effect-spec-runtime` carry no override or directive for the rule, and the `Effect.provide` call sites in `src/Prop.ts`, `src/CaseLayers.ts`, `src/extensions/Pairwise.ts` and `src/Suite.ts` are unchanged.
- R6. `git grep -nE "strict-effect-provide|strictEffectProvide" -- packages ':!**/CHANGELOG.md' ':!**/changelogs/**'` prints nothing.
- R7. `pnpm lint` and `pnpm typecheck` exit 0 on the workspace.

**Release**

- R8. `.changeset/` holds an intent covering `@systemfsoftware/oxlint-config-recommended` and `@systemfsoftware/tsconfig`, stating that the presets no longer enable `strict-effect-provide` and that consumer overrides for it can be deleted.

### Key Decisions

- KD1. **Remove the rule, do not downgrade it.** (session-settled: user-directed — chosen over setting it to `warn`: the preset runs `promoteWarnToError`, so a warning is still an error every consumer must triage.) Governs R1, R2.
- KD2. **Change both channels together.** (session-settled: user-directed — chosen over turning it off in the oxlint preset only: `@systemfsoftware/tsconfig/effect` would keep failing the same call sites in the editor and `effect-tsgo diagnostics`.) Governs R1, R2.
- KD3. **Delete the opt-outs and keep the call sites.** (session-settled: user-directed — chosen over keeping the overrides, widening `entryFilePatterns`, or rewriting the `Effect.provide` calls: leftover overrides are dead config that claims the rule still applies, and rewriting correct code to dodge a matcher is the harm this issue removes.) Governs R5.

### Scope Boundaries

- No other rule is disabled or loosened in either preset (R3).
- Replacing the rule with a lifetime-aware check is a separate design question and is not built here.
- The composition-root rule "No Mid-Pipeline Binding" stays a review-level rule (pack: cell-architecture, service-and-layer-boundaries.md); this change removes only a syntactic proxy for it.

#### Deferred to Follow-Up Work

- A mechanical check that tells a scope-lifetime bug from a composition point, if one is wanted. Raise it as its own issue.
- Whether composition packages still belong on `effect/entrypoint` now that the only difference is `nodeBuiltinImport`. Moving them to `effect` would tighten `src/` lint, which R3 keeps out of this change.

### Sources

- Issue #487.
- `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` (`libraryRules`, `entryRules`, and the `**/src/**` and entry overrides that apply them).
- `packages/toolchain/tsconfig/effect.json` (diagnostic map), `packages/toolchain/tsconfig/effect-entrypoint.json` (header), `packages/toolchain/tsconfig/README.md` (Effect presets section).
- `@effect/tsgo/oxlint-presets` `correctness` and `recommended` rule sets: neither lists `strict-effect-provide`, checked by importing the installed preset module, so removing the explicit entry leaves no source that re-enables it.
- `.changeset/README.md`: a shared `@systemfsoftware/tsconfig` file edit re-hashes every package build and demands an intent per package.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Omit the key; never write `off`.** Instantiates KD1 and KD2 (R1, R2). Upstream's default is `off` and neither upstream oxlint preset lists the rule, so deleting the entry is enough. An explicit `off` would break the gatekeeper grep (R6) and the tsconfig README's own convention that a rule a role does not carry is omitted.
- KTD2. **`entryRules` keeps only the `node-builtin-import` subtraction.** With the rule gone from `libraryRules`, the entry override has nothing of it to subtract. `entryRules` stays as `libraryRules` minus `node-builtin-import`, which keeps R3.
- KTD3. **Rewrite the README's exhaustiveness claim, not just the role list.** The README says both presets list every diagnostic explicitly so nothing inherits an upstream default. After this change one diagnostic deliberately does inherit its default. The claim is reworded to cover the diagnostics each preset enforces, without naming the removed rule (R4, R6).
- KTD4. **Both presets take a `patch` bump.** No export is added or removed, and every existing consumer config keeps working. The only observable change is that a report stops firing, which the bump table classes as a behavior fix. The shared entry names both packages, tells consumers they may delete their overrides, and tells a consumer who wants the check to set it to `error` in their own config (R8).
- KTD5. **Every other publishable package whose build hash moves gets a `none` intent in this PR.** `packages/toolchain/tsconfig/*.json` is a `build` input of every package in `turbo.json`, so editing `effect.json` re-hashes every package. Their shipped output does not change, so each gets `none`. The changeset guard counts only intents this PR adds or modifies, so a package with an intent already pending on `main` still needs naming here. The set is whatever the guard reports against the base commit, not a hand-built list.

### Assumptions

- The `effect-entrypoint.json` diagnostic map needs no key change: it already omits the rule, and only its header comment names it.
- Once the preset no longer enables the rule, the three packages whose overrides are removed lint clean. Their `Effect.provide` sites were the only reason for the overrides.
- `effect-tsgo diagnostics` on the three composition packages reports no `strictEffectProvide`, because their app projects attach `effect/entrypoint`, which never carried it.

### Risks

- **Lost mechanical signal for mid-pipeline binding.** A real `Effect.provide` inside a cell or workflow no longer fails lint. Mitigation: the pack rule stays enforced in review (see Scope Boundaries), and the rule was not tracking lifetime anyway, as shown in the Problem Frame.
- **Intent sprawl.** KTD5 adds a `none` intent across many packages. Mitigation: one intent file names them all, following the shape of the release intents recorded for the role split.

---

## Implementation Units

### U1. Remove the rule from the oxlint preset and its in-repo opt-outs

- **Goal:** the recommended oxlint preset no longer produces `effecttsgo/strict-effect-provide` for any file role, and the three composition packages extend it with no override for the rule.
- **Requirements:** R1, R3, R5, R6, R7; KD1, KD2 through KTD1, KTD2; KD3.
- **Dependencies:** none.
- **Files:** `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`, `packages/trace-spec/oxlint.config.ts`, `packages/effect-gherkin-spec/oxlint.config.ts`, `packages/effect-spec-runtime/oxlint.config.ts`.
- **Approach:**
  1. Delete the `strict-effect-provide` entry from `libraryRules`.
  2. Delete the `strict-effect-provide` entry from `entryRules`, keeping its `node-builtin-import` subtraction (KTD2).
  3. Remove the `overrides` entry, with its comment, from each of the three package configs. Each becomes a plain `extends` of the recommended preset.
  4. Do not touch `src/Prop.ts`, `src/CaseLayers.ts`, `src/extensions/Pairwise.ts` or `src/Suite.ts`.
- **Execution note:** land the preset edit and the override removals in one commit. Removing the overrides first turns lint red, and changing the preset alone leaves dead overrides behind.
- **Patterns to follow:** the existing `libraryRules` / `entryRules` shape; the plain `defineConfig({ extends: [recommended] })` configs of sibling packages.
- **Test scenarios:** Test expectation: none -- declarative preset and lint configuration; the Verification Contract's print-config smoke and the package lint tasks exercise it.
- **Verification:** printing the resolved config for a `src/` file and a `tests/` file of `packages/trace-spec` shows no `effecttsgo/strict-effect-provide` key, while `effecttsgo/node-builtin-import` stays `error` in `src/` and `off` in tests. Each of the three packages' `lint` exits 0, and `git diff` shows no change under their `src/`.

### U2. Remove the rule from the tsconfig presets and their docs

- **Goal:** the Effect tsconfig presets leave `strictEffectProvide` at its default, and their docs name `nodeBuiltinImport` as the only role difference.
- **Requirements:** R2, R3, R4; KD1, KD2 through KTD1, KTD3.
- **Dependencies:** none.
- **Files:** `packages/toolchain/tsconfig/effect.json`, `packages/toolchain/tsconfig/effect-entrypoint.json`, `packages/toolchain/tsconfig/README.md`.
- **Approach:**
  1. Delete the `strictEffectProvide` entry and its comment line from `effect.json`.
  2. Rewrite the `effect-entrypoint.json` header so `nodeBuiltinImport` is the one rule absent, with the platform-choice reason kept.
  3. Rewrite the README's Effect presets section: the entrypoint preset is `effect` minus `nodeBuiltinImport`, and it still serves composition packages because they choose the runtime's platform. The library bullet drops the "never provides a Layer" rationale, the closing line says the maps differ by that one rule, and the exhaustiveness claim follows KTD3.
- **Patterns to follow:** the per-group comment blocks already in `effect.json`.
- **Test scenarios:** Test expectation: none -- declarative presets and prose; `effect-tsgo diagnostics`, `pnpm typecheck` and the grep gate exercise them.
- **Verification:** the two diagnostic maps differ by exactly `nodeBuiltinImport`. Neither file nor the README mentions the removed rule.

### U4. Record the release intents

- **Goal:** the changeset gate passes and the published changelog tells consumers they can delete their overrides.
- **Requirements:** R8; KTD4, KTD5.
- **Dependencies:** U1, U2 (the build hashes must be final).
- **Files:** two new intent files under `.changeset/`.
- **Approach:**
  1. Author a `patch` intent for `@systemfsoftware/oxlint-config-recommended` and `@systemfsoftware/tsconfig`, written for a consumer: the presets no longer enable `strict-effect-provide`, and an override or directive that turns it off can be deleted.
  2. Run the changeset guard against the base commit and author one `none` intent naming every other package it reports.
- **Patterns to follow:** `pnpm change --bump <level> --summary …` per `.changeset/README.md`; the single multi-package `none` intent recorded for the role split.
- **Test scenarios:** Test expectation: none -- release metadata; the changeset guard is the proof.
- **Verification:** the changeset guard exits 0 against the base commit, and the consumer-facing intent passes the changeset content checker.

---

## Verification Contract

| Gate                         | Command                                                                                                                                                                                                                                                                  | Proves         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Gatekeeper grep              | `git grep -nE "strict-effect-provide\|strictEffectProvide" -- packages ':!**/CHANGELOG.md' ':!**/changelogs/**'` prints nothing                                                                                                                                          | R1, R2, R5, R6 |
| Resolved oxlint config       | `oxlint --print-config` on a `src/` and a `tests/` file of `packages/trace-spec`, run as throwaway commands                                                                                                                                                              | R1, R3 (U1)    |
| Workspace lint               | `pnpm lint` exits 0                                                                                                                                                                                                                                                      | R7             |
| Workspace typecheck          | `pnpm typecheck` exits 0                                                                                                                                                                                                                                                 | R7             |
| Language-service diagnostics | `effect-tsgo diagnostics --project <tsconfig.app.json and tsconfig.test.json>` for `trace-spec`, `effect-gherkin-spec`, `effect-spec-runtime` and one library package that extends `effect`, run as throwaway commands (these three packages have no `lint:tsgo` script) | R2, R5         |
| Call sites unchanged         | `git diff --stat origin/main -- packages/trace-spec/src packages/effect-gherkin-spec/src packages/effect-spec-runtime/src` is empty                                                                                                                                      | R5             |
| Changeset gate               | `scripts/guards/check-changeset.ts <base-sha>` exits 0                                                                                                                                                                                                                   | R8             |
| Local delivery gate          | `pnpm check:local` exits 0                                                                                                                                                                                                                                               | REPO-D1        |
| CI                           | `gh pr checks --watch --fail-fast` exits 0                                                                                                                                                                                                                               | REPO-D1        |

---

## Definition of Done

- Every row of the Verification Contract holds on the final tree.
- U1, U2 and U4 are each satisfied by their Verification line.
- R3 holds: `git diff` of the two presets removes only the `strict-effect-provide` / `strictEffectProvide` entries plus the rewritten comments and prose.
- No experimental or abandoned config remains in the diff.
- A PR that closes #487 is open and its checks are green.

---

## Appendix

### Destructive review (Edge-First lens)

Assumptions challenged:

1. Deleting the explicit entries leaves the rule off in every channel. Held: neither upstream oxlint preset lists it, the upstream rule doc gives default severity `off`, and no in-repo tsconfig sets it outside `effect.json`.
2. A `patch` bump is enough for both presets. Held: no export changes and existing consumer configs keep working (KTD4).
3. A pending intent on `main` covers a re-hashed package. Refuted: `scripts/guards/check-changeset.ts` reads only intents the PR adds or modifies, so KTD5 names every re-hashed package in this PR.

Edge cases this added: consumers who want to keep the check (KTD4), composition packages whose `effect/entrypoint` rationale shrinks (U2, Deferred to Follow-Up Work), and one atomic commit for the preset and the opt-outs so every commit stays green (U1).
