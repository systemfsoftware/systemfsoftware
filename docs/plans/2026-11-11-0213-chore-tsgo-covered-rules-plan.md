---
title: Delete custom oxlint rules covered by @effect/tsgo - Plan
type: chore
date: 2026-11-11
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Delete custom oxlint rules covered by @effect/tsgo - Plan

## Goal Capsule

- **Objective:** no mistake in this repository is graded twice by two tools that can drift apart, and `@effect/tsgo` is current.
- **Means:** bump `@effect/tsgo` to the latest release in its own PR, then delete the one rule whose invalid fixtures another instrument already refuses in full, in a second PR apart from the bump (KTD3, U2).
- **Authority:** Linear SYS-1284, "When a rule is deleted" and "Done when"; the owner ruling that the deletion bar is "another instrument already refuses every invalid case"; `compound-packs/lint-hygiene/a-lint-rule-enforces-a-decision-it-never-makes-one.md`; `packages/oxlint-plugin/AGENTS.md`.
- **Stop conditions:** PR1 (the bump) and PR2 (deleting `no-context-generic-tag`) are green and merged by a human, PR1 first. PR1 deletes nothing; the other nine tsgo-paired rules stay whole.
- **Execution profile:** dependency bump plus config; scoped local checks, CI for the rest (root `AGENTS.md` OP28).
- **Finishes and ships:** the executor opens PR1 and PR2; a human merges PR1 first.

## Product Contract

### Summary

`@effect/tsgo` 0.67.7 (2026-11-10, still the registry's `latest`) adds one diagnostic over 0.64.1 and changes no default severity. Fed the invalid fixtures of all 76 plugin rules through the patched oxlint with this repository's recommended preset, tsgo reports every case of none of them. Ten rules have a tsgo counterpart; it reports some of their cases or none, never all. The other 66 concern things tsgo has no diagnostic for. By owner ruling the bar is that another instrument already refuses every invalid case, and stock `tsc` refuses all 10 invalid fixtures of `no-context-generic-tag` (Effect 4.1.2 removed `Context.GenericTag`), so that rule is deleted in its own PR. The nine other paired rules stay whole. The bump needs oxlint `~1.93.0` and one new line in each of two tsconfig presets, and leaves the tree clean.

### Problem Frame

The workspace pins `@effect/tsgo` at `^0.64.1`, and the issue asks for every custom rule the latest release fully covers to go. A rule is deleted only when tsgo reports every invalid case in the rule's own fixtures, at error, under the recommended preset. A rule that survives stays whole: no narrowing, no option, no flag. The evidence therefore has to be a fixture run, not a reading of diagnostic descriptions: four dmmf rules look covered under a naive count because tsgo fires on every fixture body, and it fires on a different mistake.

### Requirements

**Bump**

- R1. `@effect/tsgo` is at 0.67.7 in the `pnpm-workspace.yaml` catalog, in its own PR, merged first.
- R2. Every dependency the bump forces moves in that PR: oxlint and `@oxlint/plugins` to `~1.93.0`.
- R3. Every new diagnostic is at error with a clean tree, or off; none at warn. This covers both severity channels: the oxlint preset and `packages/toolchain/tsconfig`.
- R4. Changesets in the bump PR follow `.changeset/README.md`: catalog flips and shared tsconfig edits both demand intents.

**Report**

- R5. Every one of the 76 registered rules is classified delete, keep or unrelated; a delete names its replacing diagnostic and fixture run, a keep names the cases tsgo misses.
- R6. The fixture run is reproducible from a command that feeds each rule's invalid fixtures to tsgo configured as `packages/oxlint-presets/oxlint-config-recommended` configures it (Appendix C).
- R7. Every diagnostic tsgo ships is listed with its default severity (Appendix B).

**Deletions**

- R8. A deletion PR removes the rule, its tests, its docs and its preset entry together, lands apart from the bump, and ships a changeset at the bump its public surface needs. `no-context-generic-tag` is the one rule that qualifies (KTD3).

### Scope Boundaries

- No new tests; the proof is the existing invalid fixtures. No flag, alias or shim for a kept or deleted rule. No `--no-verify`, no grader weakening, no agent merge.
- A rule that closes a hole the compiler leaves in a type stays unless tsgo closes the same hole (pack: lint-hygiene, a-lint-rule-enforces-a-decision-it-never-makes-one.md). `ban-unknown` is the one kept rule of that kind.
- Considered and not built: enabling `globalConsole`, `globalRandom`, `cryptoRandomUUID`, `asyncFunction`, `extendsNativeError`, `preferSchemaTaggedError` or any other off diagnostic in the oxlint preset to widen coverage. Adding or loosening a rule is the owner's call and lands apart (pack: lint-hygiene, a-lint-rule-enforces-a-decision-it-never-makes-one.md); the ceiling run shows it would not delete any rule anyway.
- Considered and not built: narrowing a kept rule to the cases tsgo misses. The issue forbids it.
- Outside this plan: the 282 and 349 `unstableApiUsage` warnings `lint:tsgo` prints for `@systemfsoftware/effect-atom`. They are identical at 0.64.1 and 0.67.7, so they are not new diagnostics.

## Planning Contract

### Key Technical Decisions

- KTD1. **The oxlint recommended preset is the bar; the ceiling run is the proof it cannot be beaten.** The preset (`promoteWarnToError` over tsgo's correctness and recommended sets, plus eleven explicit `error` entries) leaves many diagnostics off. The ceiling config turns all 147 on at error. A rule that no paired diagnostic covers even at ceiling cannot be covered by any configuration, including the `packages/toolchain/tsconfig` channel. Governs R5.
- KTD2. **Pairing is by mistake, then measured.** A pair needs a tsgo diagnostic whose description names the same construct. Raw "any tsgo diagnostic fired on the fixture" is recorded but never counts: `schemaClassMissingBrand` fires on 44/44 `make-body-purity` bodies and on every `dmmf-workflow` fixture that extends `Schema.Class`, and none of that is the rule's mistake. Governs R5.
- KTD3. **One deletion, on the owner's bar.** Under the issue's literal bar (a tsgo diagnostic reports every invalid case) nothing qualifies: the best pair, `no-io-module-in-source-test` against `nodeBuiltinImport`, covers 4 of 5 and misses the `effect/FileSystem` binding. The owner ruled that the bar is that another instrument already refuses every invalid case, because a compiler refusal is stronger than a lint rule. Stock `tsc` 7.0.2 reports TS2339 or TS2304 on all 10 invalid fixtures of `no-context-generic-tag`, since Effect 4.1.2 has no `Context.GenericTag`, so the rule goes. The other nine paired rules stay whole. (session-settled: user-directed — chosen over keeping the rule under the tsgo-only bar: a compiler refusal is stronger than a lint rule.) Governs R5, R8.
- KTD4. **The bump moves oxlint with it.** `@effect/tsgo` 0.67.7 supports oxlint 1.89.0 and 1.91.0 to 1.93.0 only (the message `effect-tsgo patch` prints; `_packages/tsgo/upstream.json` in the Effect-TS/tsgo repository). The repo's `~1.90.0` is outside that set: the patch is refused, and every package's `oxlint` then fails with `Unknown plugin: 'effecttsgo'`. 1.93.0 is the newest supported release. `oxlint-tsgolint` 7.0.2005 stays; the patch accepts it. Governs R2.
- KTD5. **The new diagnostic is listed in both tsconfig presets.** `packages/toolchain/tsconfig/effect.json` states that every diagnostic is listed so none falls back to its upstream default. `matchToResultOrOption` defaults to `suggestion`, so it is set to `error` in `effect.json` and `effect-entrypoint.json`. In the oxlint channel it is already at error through `promoteWarnToError`: `oxlint --print-config` in `effect-cell-types` shows `effecttsgo/match-to-result-or-option` as `deny`. Governs R3.
- KTD6. **The scratch tooling is not committed.** The three scripts live in Appendix C so the run is reproducible without adding code, a test or a gate to the tree (the issue forbids new tests; root `AGENTS.md` GATE1 puts a new gate behind owner sign-off).

### Risks & Dependencies

- Peer range: `oxlint-config-*` packages declare `oxlint` as a peer via `catalog:oxlint`, so the bump narrows their peer from `~1.90.0` to `~1.93.0` for consumers. That is why U1 recommends `major` for them.
- The tsconfig edit re-hashes every package's build (`.changeset/README.md`), so U1's intent names all 30 publishable packages.
- A new tsgo release can flip a verdict. The table is deterministic for a given version; rerun Appendix C on the next bump. No standing job is built for this.

## Implementation Units

### U1. Bump `@effect/tsgo` and its oxlint matrix

- **Goal:** R1 to R4 in one PR, independent of any deletion.
- **Requirements:** R1, R2, R3, R4.
- **Dependencies:** none.
- **Files:** `pnpm-workspace.yaml` (catalog `@effect/tsgo` to `^0.67.7`; named catalog `oxlint`: `oxlint` and `@oxlint/plugins` to `~1.93.0`), `pnpm-lock.yaml`, `packages/toolchain/tsconfig/effect.json`, `packages/toolchain/tsconfig/effect-entrypoint.json`, `.changeset/<intent>.md`.
- **Approach:**
  - Edit the three catalog values, regenerate the lockfile with `pnpm install`; `prepare` re-patches oxlint with `effect-tsgo patch --oxlint --no-typescript --skip-missing`.
  - Add `"matchToResultOrOption": "error"` in both tsconfig presets, in the "Prefer the smaller construct" group between `flatMapToMap` and `multipleCatchTag`.
  - One intent file naming all 30 publishable packages (`pnpm change --bump <level> --summary "..." <pkg>...`), levels below; body is the consumer-observable change only.
- **Changeset levels (recommendation; review decides, per `AGENTS.md` REPO-R2):**

| Packages                                                                                | Level | Why                                                                                                       |
| --------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| `oxlint-config-recommended`                                                             | major | New diagnostic at error on consumer trees, `@effect/tsgo` dependency to ^0.67.7, `oxlint` peer to ~1.93.0 |
| `oxlint-config-cell-architecture`, `oxlint-config-dmmf`, `oxlint-config-rule-authoring` | major | `oxlint` peer narrows from ~1.90.0 to ~1.93.0; rules unchanged                                            |
| `tsconfig`                                                                              | minor | `effect.json` and `effect-entrypoint.json` gain a diagnostic at error                                     |
| five `oxlint-plugin-*` packages                                                         | patch | `oxlint` and `@oxlint/plugins` dependency range moves to ~1.93.0                                          |
| the other 16 packages naming `oxlint` as a devDependency                                | patch | Packed manifest changes (`.changeset/README.md`: devDependency-only change earns at least patch)          |
| `stryker-config`, `tsdown-config`, `vitest-config`, `omp-typescript-discipline`         | none  | Build hash moves, tarball stays byte-identical; confirm with `changeset-management check`                 |

- **Execution note:** configuration work; the first proof is the repo's own lint and `lint:tsgo`, not new tests.
- **Patterns to follow:** `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`; the existing entries of that group in the tsconfig presets.
- **Test expectation:** none -- dependency and config change; the existing plugin RuleTester suites, `lint`, `lint:tsgo` and `typecheck` are the proof.
- **Verification:** the tree is clean at the new versions (Verification Contract, "Bump measured").

### U2. Delete `no-context-generic-tag`

- **Goal:** R8 for the one qualifying rule, in a PR apart from U1.
- **Requirements:** R8, R5.
- **Dependencies:** none in code; the PR branches from `main` and is merged after PR1, as the issue requires.
- **Files:** delete `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/no-context-generic-tag.ts`, `no-context-generic-tag.config.ts` and `src/rules/__tests__/no-context-generic-tag.test.ts`. Edit `src/index.ts` (import, `recommendedRules` entry, `rules` entry), `README.md` (the rule's rows), `etc/oxlint-plugin-cell-architecture.api.md`, and add `.changeset/<intent>.md`.
- **Approach:**
  - Remove the three files and the three `index.ts` references; no flag, alias or deprecation path.
  - Regenerate the API report with `pnpm api:update` for the package.
  - Intent one: `major` on `@systemfsoftware/oxlint-plugin-cell-architecture` (a rule id consumers could name no longer exists), `patch` on `oxlint-config-cell-architecture` and `oxlint-config-recommended` (their enabled set shrinks; nothing starts failing); body states the removal and that stock `tsc` refuses `Context.GenericTag` under Effect 4.
  - Intent two: `patch` on the 16 packages that take the recommended preset as a devDependency, which re-hash when it rebuilds (precedent: `e2e-lane-rebuilt-dependents` in 60ee6fe964).
  - The PR body carries the evidence: the `tsc` run over the 10 fixtures (Appendix C, "tsc evidence").
- **Test expectation:** none -- deletion; the evidence is the existing invalid fixtures run through stock `tsc`, plus the package build, `api:check`, lint and remaining RuleTester suites.
- **Verification:** `tsc --noEmit` over the 10 fixtures exits non-zero with an error on every one; the plugin builds, its remaining tests pass, and the rule id appears nowhere outside point-in-time `docs/plans` records.

## Verification Contract

**Bump measured** (run once on a scratch worktree at the PR1 diff, 8 cores; PR1 itself carries the lockfile):

| Check                                                                                                     | Result                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm turbo build`                                                                                        | 27/27 tasks successful                                                                                                                                     |
| `OXLINT_FORMAT=default pnpm turbo lint lint:tsgo`                                                         | 60/60 tasks successful (builds included); all 30 `lint` tasks `Found 0 warnings and 0 errors`; `lint:tsgo` 0 errors                                        |
| `lint:tsgo` with `matchToResultOrOption` at `error` (3 packages that define the script)                   | 0 errors; `effect-atom` 282 and 349 warnings, identical to 0.64.1                                                                                          |
| `pnpm turbo typecheck` (stock `tsc`; nothing in the tree patches `tsc`)                                   | 60/60 successful                                                                                                                                           |
| `pnpm --filter "./packages/oxlint-plugin/*" --filter "./packages/oxlint-presets/*" test` at oxlint 1.93.0 | exit 0 (dmmf-workflow 252 tests, test-discipline 1394, recommended 49, others pass)                                                                        |
| oxlint left at `~1.90.0` under tsgo 0.67.7                                                                | refused: "version 1.90.0 is not supported by @effect/tsgo version 0.67.7"; `oxlint .` in `packages/effect-cell-types` fails `Unknown plugin: 'effecttsgo'` |
| Fixture tables at 0.64.1 and 0.67.7                                                                       | `diff` empty: the bump changes no verdict                                                                                                                  |

**PR gates:** touched-package `lint`, `lint:tsgo`, `typecheck` and the plugin and preset tests locally; `pnpm check:local` and `gh pr checks --watch --fail-fast` named as pending off-host acceptance (root `AGENTS.md` OP28, REPO-D1). The Changeset Check workflow decides whether the intent is complete.

## Definition of Done

- PR1 is merged by a human with @effect/tsgo 0.67.7, oxlint ~1.93.0 and a clean tree; new diagnostic at error in both channels.
- PR2 is merged after PR1 and removes `no-context-generic-tag`, its tests, docs and preset entry together.
- The Appendix tables are the report: 76 rules, 1 delete, 9 keep, 66 unrelated; the run is reproducible from Appendix C.
- PR1 removes no rule, test, doc or preset entry; no scratch file, worktree or lockfile edit from the fixture run remains in either diff.

## Open Questions

- Deferred, review: the changeset levels in U1 and U2.

---

## Appendix A. What changed in `@effect/tsgo` 0.64.1 to 0.67.7

Source: `_packages/tsgo/CHANGELOG.md` and `_packages/tsgo/src/metadata.json` at tags `@effect/tsgo@0.64.1` and `@effect/tsgo@0.67.7` in a clone of `Effect-TS/tsgo`; registry via `npm view @effect/tsgo`. The registry lists 0.64.1 (2026-11-02), 0.67.0, 0.67.1, 0.67.3, 0.67.4, 0.67.5 and 0.67.7 (2026-11-10, `dist-tags.latest`). The changelog's 0.65.0, 0.66.0, 0.67.2 and 0.67.6 entries have no registry release; their changes ship in the next published version.

| Version                | Change                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.65.0                 | New diagnostic `matchToResultOrOption` (style, `suggestion`, fixable). Fix: `unnecessaryTypeofType` no longer reports a `typeof X.Type` in the `extends` clause of interface `X`                                                                             |
| 0.66.0                 | `effect-tsgo vp` runs vite-plus with the patched oxlint; `effect-tsgo oxlint` loads the binding through a `process.dlopen` bridge                                                                                                                            |
| 0.67.0                 | `--tsrs-lint` runs the type-aware Effect rules on tsrs; packaged tsrs 0.21.0                                                                                                                                                                                 |
| 0.67.1                 | Go build cache capped at 2 GB in CI                                                                                                                                                                                                                          |
| 0.67.1, 0.67.4, 0.67.7 | Bundled TypeScript tags move                                                                                                                                                                                                                                 |
| 0.67.2                 | Fix truncated output of CLI-proxy tools when stdio is a pipe                                                                                                                                                                                                 |
| 0.67.3                 | Fix: `preferEffectArray`, `preferEffectRecord`, `preferEffectString`, `promiseInEffectSuccess`, `anyUnknownInErrorContext` now walk a class `extends` expression; `effectFnOpportunity` stops offering a conversion that reads a const before initialization |
| 0.67.5                 | Oxlint patch `002-effect-tsgolint-path.patch` applies to oxlint 1.92.0 as well as 1.88 to 1.91; supported set now 1.89.0, 1.91.0 to 1.93.0                                                                                                                   |

Diagnostic set: 146 to 147 (one added, none removed, no default severity or group changed). Oxlint presets `recommended`, `strict` and `style` gain `effecttsgo/match-to-result-or-option`; `correctness`, `antipattern`, `effect-native` and `maintainers` are unchanged.

## Appendix B. Every diagnostic at 0.67.7 with its default severity

147 diagnostics. Severities are the `defaultSeverity` in `metadata.json`.

**correctness (26)**

- off (2): anyUnknownInErrorContext, unsafeEffectTypeAssertion
- error (13): classSelfMismatch, effectFnImplicitAny, floatingEffect, floatingEffectInVitest, missingEffectContext, missingEffectError, missingLayerContext, missingReturnYieldStar, missingStarInYieldEffectGen, nonObjectEffectServiceType, overriddenSchemaConstructor, schemaLiteralNonFinite, schemaOpaqueInstanceMember
- warning (9): duplicatePackage, experimentalApiUsage, genericEffectServices, obsoleteMatchImport, obsoleteSchemaImport, outdatedApi, promiseInEffectSuccess, schemaClassObjectLiteral, unstableApiUsage
- suggestion (2): errorPayloadShadowsName, schemaClassMissingBrand

**antipattern (21)**

- suggestion (8): catchUnfailableEffect, lazyEffect, leakingRequirements, preferUnsafeConstructor, returnEffectInGen, runEffectInsideEffect, schemaSyncInEffect, tryCatchInEffectGen
- warning (11): effectFnIife, effectGenUsesAdapter, effectInFailure, effectInVoidSuccess, globalErrorInEffectCatch, globalErrorInEffectFailure, layerMergeAllWithDependencies, lazyPromiseInEffectSync, multipleEffectProvide, scopeInLayerEffect, unknownInEffectCatch
- off (2): effectTryWithoutCatch, strictEffectProvide

**effectNative (27)**

- suggestion (1): abortControllerInEffect
- off (26): asyncFunction, cryptoRandomUUID, cryptoRandomUUIDInEffect, extendsNativeError, globalConsole, globalConsoleInEffect, globalDate, globalDateInEffect, globalFetch, globalFetchInEffect, globalJson, globalJsonInEffect, globalRandom, globalRandomInEffect, globalTimers, globalTimersInEffect, instanceOfSchema, newPromise, nodeBuiltinImport, preferEffectArray, preferEffectRecord, preferEffectString, preferSchemaOverJson, processEnv, processEnvInEffect, schemaSync

**style (72)**

- suggestion (53): acquireReleaseDisposable, allOfMapToForEach, catchAllTagDispatchToCatchTag, catchAllToMapError, catchChainToFirstSuccessOf, catchConditionalRefailToCatchIf, catchDieToOrDie, catchIfTagToCatchTag, catchRefailToTapError, catchTagToCatchReason, catchToIgnore, catchToOrElseSucceed, effectFnOpportunity, effectMapFlatten, effectMapVoid, effectSleepZeroToYieldNow, effectSucceedWithUndefined, effectSucceedWithVoid, failCauseToConstructor, flatMapConditionalToFilterOrFail, flatMapIdentityToFlatten, flatMapIgnoredParamToAndThen, flatMapToMap, flatMapToTap, manualMetricTapToTrack, mapConstToAs, mapSomeCatchNoSuchElement, mapSomeToAsSome, matchBooleanToIsSuccess, matchEffectToMapBoth, matchEffectToMatch, matchToResultOrOption, multipleCatchTag, optionMatchToFromOption, preferSucceedSomeOrNone, preferTypedSchemaDecoder, provideLayerSucceedToProvideService, raceFirstWithSleepToTimeout, redundantMapError, redundantOrDie, redundantSchemaTagIdentifier, resultMatchToFromResult, runOfExitToRunExit, schemaNumber, schemaStructWithTag, suspendFailToFailSync, syncToSucceed, timeoutCatchTagToTimeoutOrElse, unnecessaryEffectGen, unnecessaryFailYieldableError, unnecessaryPipe, unnecessaryPipeChain, unnecessaryTypeofType
- off (19): deterministicKeys, effectDoNotation, mapMapErrorToMapBoth, missedPipeableOpportunity, missingEffectServiceDependency, missingPipeableSignature, nestedEffectGenYield, newSchemaClass, preferBarrelImport, preferNamespaceImport, preferSchemaTaggedError, preferSchemaTypeProperty, provideMergeAllToArray, schemaUnionOfLiterals, serviceNotAsClass, strictBooleanExpressions, typeUnionToSchemaUnion, unnecessaryArrowBlock, yieldInCallArgument

**maintainers (1)**

- off (1): apiStabilityLeak

## Appendix C. Method and reproduction

**What the run does.** The five plugin test trees hold 111 `RuleTester.run` calls. A stub records each call instead of running it; 1198 unique invalid fixtures (after dropping duplicates across runs) are written as files, each in its own directory and under the `filename` the test gave it, so the preset's path overrides apply (`**/src/**` library set, test and `examples` entry set). Fixtures without a filename become `src/case.ts`; 23 whose filename is outside both globs are moved under `src/`. A scratch workspace package extends `@systemfsoftware/oxlint-config-recommended`. The patched oxlint lints the cases twice: with the preset as shipped, and with the ceiling config that turns every `effecttsgo/*` diagnostic on at error. A fixture is covered when a paired diagnostic fires on its file. `pairs.json` is the pairing (KTD2); the other 66 rules have no pair.

**Commands.** Run in a throwaway worktree at the PR1 diff; `$SCRATCH` holds the four files below.

```bash
pnpm install --frozen-lockfile && pnpm --filter "@systemfsoftware/oxlint-config-recommended..." build
export WT=$PWD OUT=$SCRATCH/out
bun --preload $SCRATCH/stub.ts $SCRATCH/materialize.ts          # writes cases/ and the scaffold package
pnpm install --no-frozen-lockfile --offline                       # registers the scaffold workspace package
cd packages/zz-fixture-run
pnpm exec oxlint --type-aware --tsconfig tsconfig.json --format json cases > $OUT/preset.json
pnpm exec oxlint -c oxlint.ceiling.config.ts --type-aware --tsconfig tsconfig.json --format json cases > $OUT/ceiling.json
cd ../.. && bun $SCRATCH/analyze.ts $SCRATCH/pairs.json $OUT/preset.json $OUT/ceiling.json
git checkout pnpm-lock.yaml && rm -rf packages/zz-fixture-run    # leave the tree as found
```

`analyze.ts` prints one tab-separated row per rule: plugin, rule, invalid fixtures, paired coverage under the preset, paired coverage at ceiling, fixtures with any `effecttsgo` hit (incidental), relocated fixtures. Running it at 0.64.1 and at 0.67.7 gave identical output. To see one case, open `cases/<id>/` and `manifest.json`. Four fixtures carry a random temp-directory name in their filename, so those four paths differ between runs; the counts do not.

**tsc evidence (U2).** The scaffold package's `tsconfig.json` already includes `cases/**`, so stock `tsc` runs over every fixture. With the compiler unpatched (`pnpm exec effect-tsgo unpatch`) and Effect 4.1.2 installed:

```bash
cd packages/zz-fixture-run && pnpm exec tsc --noEmit -p tsconfig.json | grep -E '^cases/(0089|009[0-8])/'
```

Every one of the 10 `no-context-generic-tag` cases (ids from `manifest.json`, `rule` equal to the rule) gets an error: TS2339 `Property 'GenericTag' does not exist on type 'typeof import(".../effect/dist/Context")'` where the fixture reads `Context.GenericTag`, and TS2304 `Cannot find name 'GenericTag'` where it names the type or binding bare (cases 0093, 0094, 0095). Cases 0094 and 0095 carry only the bare name, and tsc refuses them too.

**`$SCRATCH/pairs.json`** (diagnostic ids are the oxlint `effecttsgo/*` names; a rule absent here has no pair)

```json
{
  "oxlint-plugin-effect-schema/ban-data-taggederror": [
    "prefer-schema-tagged-error"
  ],
  "oxlint-plugin-effect-platform/no-unported-time-source": [
    "global-date",
    "global-date-in-effect",
    "global-timers",
    "global-timers-in-effect",
    "global-random",
    "global-random-in-effect",
    "crypto-random-uuid",
    "crypto-random-uuid-in-effect"
  ],
  "oxlint-plugin-dmmf-workflow/make-body-purity": [
    "global-date",
    "global-date-in-effect",
    "global-timers",
    "global-timers-in-effect",
    "global-random",
    "global-random-in-effect",
    "crypto-random-uuid",
    "crypto-random-uuid-in-effect",
    "global-fetch",
    "global-fetch-in-effect",
    "global-console",
    "global-console-in-effect",
    "async-function",
    "node-builtin-import",
    "process-env",
    "process-env-in-effect"
  ],
  "oxlint-plugin-effect-platform/no-logging-in-catch": [
    "global-console",
    "global-console-in-effect"
  ],
  "oxlint-plugin-cell-architecture/ban-unknown": [
    "any-unknown-in-error-context",
    "unknown-in-effect-catch"
  ],
  "oxlint-plugin-cell-architecture/ban-classes": [
    "extends-native-error",
    "service-not-as-class"
  ],
  "oxlint-plugin-test-discipline/no-io-module-in-source-test": [
    "node-builtin-import"
  ],
  "oxlint-plugin-effect-schema/schema-file-imports-pure-modules-only": [
    "node-builtin-import"
  ],
  "oxlint-plugin-effect-platform/runtime-construction-placement": [
    "strict-effect-provide",
    "multiple-effect-provide",
    "leaking-requirements"
  ],
  "oxlint-plugin-cell-architecture/no-context-generic-tag": [
    "outdated-api"
  ]
}
```

**`$SCRATCH/stub.ts`**

```ts
// Bun preload: records every RuleTester.run() call instead of executing it.
import { plugin } from 'bun'

const calls: unknown[] = []
;(globalThis as { __ruleTesterCalls?: unknown[] }).__ruleTesterCalls = calls

class RuleTester {
  static it: unknown
  static itOnly: unknown
  static describe: unknown
  constructor(private readonly config: unknown) {}
  run(name: string, rule: unknown, cases: unknown) {
    calls.push({ name, rule, config: this.config, cases })
  }
}

const noop = () => undefined
const callable = Object.assign(noop, {
  only: noop,
  skip: noop,
  each: () => noop,
  prop: noop,
  effect: Object.assign(noop, { prop: noop }),
})
const vitest = {
  it: callable,
  describe: callable,
  test: callable,
  expect: callable,
  beforeAll: noop,
  afterAll: noop,
  beforeEach: noop,
  afterEach: noop,
  vi: {},
}

plugin({
  name: 'rule-tester-stub',
  setup(build) {
    build.module('oxlint/plugins-dev', () => ({ exports: { RuleTester }, loader: 'object' }))
    build.module('vitest', () => ({ exports: vitest, loader: 'object' }))
  },
})
```

**`$SCRATCH/materialize.ts`**

```ts
// Usage: WT=<worktree> OUT=<dir> bun --preload ./stub.ts ./materialize.ts
// Writes every invalid fixture of every plugin rule to <WT>/packages/zz-fixture-run/cases/<id>/<filename>
// and the scaffold package that lints them with the repository's recommended preset.
import { Glob } from 'bun'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const WT = process.env.WT!
const OUT = process.env.OUT!
const pluginRoot = join(WT, 'packages/oxlint-plugin')
const pkg = join(WT, 'packages/zz-fixture-run')
const calls = (globalThis as { __ruleTesterCalls?: any[] }).__ruleTesterCalls!

const files = [...new Glob('oxlint-plugin-*/src/**/__tests__/*.test.ts').scanSync({ cwd: pluginRoot })].sort()
const captured: { file: string; name: string; cases: any }[] = []
// A run's rule is named by the registered rule object it exercises, not by the run's title.
const registered = new Map<unknown, string>()
for (const plugin of new Set(files.map((f) => f.split('/')[0]!))) {
  const index = (await import(join(pluginRoot, plugin, 'src/index.ts'))).default
  for (const [name, rule] of Object.entries<unknown>(index.rules)) registered.set(rule, name)
}
for (const file of files) {
  calls.length = 0
  await import(join(pluginRoot, file))
  for (const call of calls) captured.push({ file, name: registered.get(call.rule) ?? call.name, cases: call.cases })
}

const isSrc = (p: string) => /(^|\/)src\//.test(p)
const isEntry = (p: string) =>
  /(\.test\.ts$|\.spec\.ts$|(^|\/)__tests__\/|(^|\/)tests\/|(^|\/)test-types\/|(^|\/)examples\/)/.test(p)

rmSync(join(pkg, 'cases'), { recursive: true, force: true })
const seen = new Set<string>()
const manifest: unknown[] = []
for (const c of captured) {
  const plugin = c.file.split('/')[0]!
  for (const t of c.cases.invalid ?? []) {
    const code: string = typeof t === 'string' ? t : t.code
    const filename: string | undefined = typeof t === 'string' ? undefined : t.filename
    const key = [plugin, c.name, code, filename, JSON.stringify(t.options ?? null)].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const id = String(manifest.length).padStart(4, '0')
    let rel = filename === undefined ? 'src/case.ts' : filename.replace(/^\/+/, '')
    const relocated = !isSrc(rel) && !isEntry(rel)
    if (relocated) rel = 'src/' + rel.split('/').pop()
    const path = join(pkg, 'cases', id, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, code)
    manifest.push({
      id,
      plugin,
      rule: c.name,
      caseName: t.name ?? null,
      filename: filename ?? null,
      relocated,
      path: join('cases', id, rel),
    })
  }
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))

// Scaffold: one workspace package whose config is exactly the recommended preset, and a ceiling config
// that turns every effecttsgo diagnostic on at error (the most tsgo can ever report).
const schema = JSON.parse(readFileSync(join(WT, 'node_modules/@effect/tsgo/oxlint-schema.json'), 'utf8'))
const ids = new Set<string>()
const walk = (o: any) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    if (k.startsWith('effecttsgo/')) ids.add(k)
    if (v && typeof v === 'object') walk(v)
  }
}
walk(schema)
writeFileSync(
  join(pkg, 'package.json'),
  JSON.stringify(
    {
      name: '@scratch/zz-fixture-run',
      private: true,
      type: 'module',
      version: '0.0.0',
      devDependencies: {
        effect: 'catalog:',
        'fast-check': 'catalog:',
        vitest: 'catalog:',
        '@types/node': 'catalog:',
        oxlint: 'catalog:oxlint',
        'oxlint-tsgolint': 'catalog:oxlint',
        '@systemfsoftware/oxlint-config-recommended': 'workspace:^',
      },
    },
    null,
    2,
  ),
)
writeFileSync(
  join(pkg, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        moduleDetection: 'force',
        types: ['node'],
        allowImportingTsExtensions: true,
      },
      include: ['cases/**/*'],
    },
    null,
    2,
  ),
)
writeFileSync(
  join(pkg, 'oxlint.config.ts'),
  "import recommended from '@systemfsoftware/oxlint-config-recommended'\nimport { defineConfig } from 'oxlint'\n\nexport default defineConfig({ extends: [recommended] })\n",
)
writeFileSync(
  join(pkg, 'oxlint.ceiling.config.ts'),
  "import recommended from '@systemfsoftware/oxlint-config-recommended'\nimport { defineConfig } from 'oxlint'\n\nexport default defineConfig({\n  extends: [recommended],\n  overrides: [{ files: ['**/*.ts'], rules: " +
    JSON.stringify(Object.fromEntries([...ids].map((id) => [id, 'error']))) + ' }],\n})\n',
)
console.log(
  manifest.length + ' invalid fixtures from ' + files.length + ' test files; ' + ids.size + ' effecttsgo diagnostics',
)
```

**`$SCRATCH/analyze.ts`**

```ts
// Usage: OUT=<dir> bun analyze.ts <pairs.json> <preset-run.json> <ceiling-run.json>
// A rule's invalid fixture counts as covered when a paired effecttsgo diagnostic fires on its file.
import { readFileSync } from 'node:fs'

const [pairsFile, presetFile, ceilingFile] = process.argv.slice(2) as [string, string, string]
const OUT = process.env.OUT!
const manifest: { id: string; plugin: string; rule: string; relocated: boolean }[] = JSON.parse(
  readFileSync(OUT + '/manifest.json', 'utf8'),
)
const pairs: Record<string, string[]> = JSON.parse(readFileSync(pairsFile, 'utf8'))

const diagnosticsByCase = (file: string) => {
  const byCase = new Map<string, Set<string>>()
  for (const d of JSON.parse(readFileSync(file, 'utf8')).diagnostics as { code: string; filename: string }[]) {
    const m = /^effecttsgo\((.+)\)$/.exec(d.code)
    if (m) {
      ;(byCase.get(d.filename.split('/')[1]!) ??
        byCase.set(d.filename.split('/')[1]!, new Set()).get(d.filename.split('/')[1]!)!).add(m[1]!)
    }
  }
  return byCase
}
const preset = diagnosticsByCase(presetFile)
const ceiling = diagnosticsByCase(ceilingFile)

const rows = new Map<
  string,
  {
    plugin: string
    rule: string
    invalid: number
    relocated: number
    incidental: number
    paired: number
    pairedPreset: number
    pairedCeiling: number
  }
>()
for (const m of manifest) {
  const key = m.plugin + '/' + m.rule
  const r = rows.get(key) ??
    {
      plugin: m.plugin,
      rule: m.rule,
      invalid: 0,
      relocated: 0,
      incidental: 0,
      paired: 0,
      pairedPreset: 0,
      pairedCeiling: 0,
    }
  const want = pairs[key] ?? []
  r.invalid++
  if (m.relocated) r.relocated++
  if ((preset.get(m.id)?.size ?? 0) > 0) r.incidental++
  r.paired = want.length
  if (want.some((d) => preset.get(m.id)?.has(d))) r.pairedPreset++
  if (want.some((d) => ceiling.get(m.id)?.has(d))) r.pairedCeiling++
  rows.set(key, r)
}
for (const r of [...rows.values()].sort((a, b) => (a.plugin + a.rule).localeCompare(b.plugin + b.rule))) {
  console.log(
    [
      r.plugin.replace('oxlint-plugin-', ''),
      r.rule,
      r.invalid,
      r.paired ? r.pairedPreset + '/' + r.invalid : '-',
      r.paired ? r.pairedCeiling + '/' + r.invalid : '-',
      r.incidental,
      r.relocated,
    ].join('\t'),
  )
}
```

## Appendix D. Report: every custom rule

76 registered rules in five plugins: **1 delete, 9 keep, 66 unrelated**. 1198 invalid fixtures. (The 171 `.ts` files directly under the plugins' `src/rules/` directories are these 76 rule modules, their `.config.ts` option modules and shared helpers.) "Preset" is paired coverage under `oxlint-config-recommended`; "Ceiling" is the same with all 147 diagnostics at error. The Evidence column states the misses for a keep and the incidental hits that were rejected for an unrelated.

| Plugin            | Rule                                    | What it reports                                                                                          | Invalid | Class     | Paired tsgo diagnostic                                                                                                                    | Preset | Ceiling | Evidence                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cell-architecture | `ban-classes`                           | Ban classes except where Effect v4 makes a class the sanctioned idiom (Context.Service, Schema.Class,…   | 7       | keep      | extendsNativeError, serviceNotAsClass                                                                                                     | 0/7    | 0/7     | Fixtures are bare classes, `extends Object`, `extends Function`, class expressions and namespace members; tsgo reports only `class extends Error` and `Context.Service` bound to a variable.                                                                                                                    |
| cell-architecture | `ban-error-string`                      | Ban string coercion of error-like values                                                                 | 4       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `ban-unknown`                           | Ban unknown except as a generic default, a type-predicate parameter, or a catch binding                  | 14      | keep      | anyUnknownInErrorContext, unknownInEffectCatch                                                                                            | 0/14   | 0/14    | Fixtures put `unknown` in fields, parameters, returns, constraints, arrays and assertions; tsgo reads only Effect error and requirements channels and catch callbacks. Type-hole rule (lint-hygiene): tsgo does not close the same hole.                                                                        |
| cell-architecture | `cell-file-exports-cell-only`           | A *.cell.ts file exports exactly one value — its cell                                                    | 8       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `handle-definition-stays-private`       | A *.handle.ts file keeps its Handle.make definition binding module-private; exporting it hands…          | 4       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `handle-exports-guard`                  | A *.handle.ts file exports an is<Name> guard bound to its Handle.make definition's is, the same…         | 3       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `internal-export-jsdoc`                 | Require a JSDoc @internal tag on an export if and only if its file sits under a directory segment…       | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `kind-file-construction`                | A *.blueprint.ts file mints its blueprint with Blueprint.make and a *.handle.ts file mints its handle…   | 5       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `kind-file-declares-no-service`         | Blueprint and handle files declare no Context.Service, Context.Tag, or Context.Key; a handle is an…      | 3       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `kind-file-holds-no-module-state`       | Blueprint and handle files hold no module-level mutable state                                            | 7       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `kind-record-minted-by-kind`            | Blueprint and handle files mint records only through the kind                                            | 3       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `kind-typeid-by-symbol-for`             | A *.blueprint.ts / *.handle.ts file exports its TypeId declared as Symbol.for('<literal>') and…          | 6       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `no-bodyless-status-assertion`          | Forbids asserting an HTTP response status without surfacing the response body on failure                 | 5       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `no-context-generic-tag`                | Ban Context.GenericTag - a v4 service is declared with Context.Service                                   | 10      | delete    | stock `tsc` (TS2339, TS2304); no tsgo diagnostic                                                                                          | 0/10   | 0/10    | Owner ruling: another instrument already refuses every invalid case. Stock `tsc` reports all 10 fixtures because Effect 4.1.2 removed `Context.GenericTag`. tsgo `outdatedApi` has no `GenericTag` entry (0/10).                                                                                                |
| cell-architecture | `no-direct-tag-access`                  | Ban direct _tag access                                                                                   | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `no-either-tag-assertions`              | Ban Either _tag assertions in test files                                                                 | 44      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| cell-architecture | `sandwich-shell-is-straight-line`       | Refuse control flow, dispatcher calls, Match pipelines, and clock reads inside the read and write…       | 28      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: match-effect-to-match 2.                                                                                                                                                                                                  |
| cell-architecture | `medium-owns-no-recovery`               | Refuse Effect.retry, Effect.retryOrElse, Effect.forever and Stream.retry inside the ports of a…          | 9       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| dmmf-workflow     | `damp-workflow-stem`                    | A <stem>.workflow.ts stem is a kebab-case phrase of 2-5 lowercase tokens naming the decision, locked…    | 16      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| dmmf-workflow     | `make-file-location`                    | Workflow.make may be constructed only in a <stem>.workflow.ts file whose stem is one segment with no…    | 12      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| dmmf-workflow     | `workflow-match-exhaustive`             | Match dispatch inside a Workflow.make decision body must terminate with Match.exhaustive                 | 17      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 17.                                                                                                                                                                                            |
| dmmf-workflow     | `make-body-purity`                      | A Workflow.make decision body performs no I/O visible in the file that declares it                       | 44      | keep      | globalDate*, globalTimers*, globalRandom*, cryptoRandomUUID*, globalFetch*, globalConsole*, asyncFunction, nodeBuiltinImport, processEnv* | 2/44   | 14/44   | Reports 30 cases no tsgo diagnostic names: unsealed sibling and third-party imports, module state, mutable locals, unresolvable `Workflow.make` arguments, I/O-carrying Effect imports. The 2 preset hits are `node:` imports.                                                                                  |
| dmmf-workflow     | `make-command-schema`                   | The command property of Workflow.make holds a schema class, not a value laundered into looking like one  | 14      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 14.                                                                                                                                                                                            |
| dmmf-workflow     | `workflow-file-export-topology`         | A single-segment *.workflow.ts file publishes exactly one non-schema value export                        | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 2, missing-pipeable-signature 1.                                                                                                                                                               |
| dmmf-workflow     | `workflow-file-make-presence`           | A <stem>.workflow.ts file constructs its decision with Workflow.make                                     | 4       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| dmmf-workflow     | `workflow-variant-constructed`          | Every variant a workflow construction declares in its decision or error channel must be constructed…     | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 10.                                                                                                                                                                                            |
| effect-platform   | `entrypoint-interprets-once`            | Require exactly one interpretation edge in main.ts                                                       | 8       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-platform   | `entrypoint-no-exports`                 | Ban every export from main.ts                                                                            | 6       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-platform   | `entrypoint-not-imported`               | Ban every import of a main module                                                                        | 7       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-platform   | `entrypoint-no-promise-wrapper`         | Ban runMain wrapping a bare Effect.promise or Effect.tryPromise in main.ts                               | 2       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-platform   | `runtime-construction-placement`        | `ManagedRuntime.make` or `Layer.provide` inside a function body rebuilds wiring per call;…               | 17      | keep      | multipleEffectProvide, strictEffectProvide, leakingRequirements                                                                           | 0/17   | 0/17    | Reports where `ManagedRuntime.make` and `Layer.provide` are evaluated (module scope, function body, test); tsgo reports chained `Effect.provide` and stays silent here. `strictEffectProvide` is off by default and was dropped on purpose (docs/plans/2026-09-23-1830-fix-drop-strict-effect-provide-plan.md). |
| effect-platform   | `no-logging-in-catch`                   | Prevents logging inside Effect catch blocks                                                              | 35      | keep      | globalConsole, globalConsoleInEffect                                                                                                      | 0/35   | 8/35    | 27 cases log through `Effect.log*` inside a catch handler; tsgo has no diagnostic for that. `globalConsole*` is off in the preset and fires on the 8 `console.*` cases only at ceiling.                                                                                                                         |
| effect-platform   | `no-native-map-in-effect`               | When Effect is imported, ban native Map (new Map)                                                        | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: floating-effect 6, obsolete-schema-import 1.                                                                                                                                                                              |
| effect-platform   | `no-native-set-in-effect`               | When Effect is imported, ban native Set (new Set)                                                        | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: floating-effect 4, obsolete-schema-import 1.                                                                                                                                                                              |
| effect-platform   | `no-new-worker-with-wasm-import`        | When a file imports a WASM module (e.g                                                                   | 8       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-platform   | `no-unported-time-source`               | Production source takes timers, clocks, randomness, and task scheduling only through a named,…           | 21      | keep      | globalDate*, globalTimers*, globalRandom*, cryptoRandomUUID*                                                                              | 8/21   | 10/21   | Misses 11: `setImmediate`, `performance.now`, `process.hrtime`, `process.hrtime.bigint`, `crypto.getRandomValues`, and static, re-exported and dynamic `node:timers` imports. `Math.random` and `crypto.randomUUID` need diagnostics the preset leaves off.                                                     |
| effect-schema     | `ban-data-taggederror`                  | Ban Data.TaggedError in favor of S.TaggedError or Schema.TaggedError                                     | 35      | keep      | preferSchemaTaggedError                                                                                                                   | 0/35   | 15/35   | Diagnostic is off in the preset and absent from `packages/toolchain/tsconfig/effect.json`. At ceiling it reports only `class X extends Data.TaggedError(…)`; the 20 other cases (variable, export, call, array, object, return, `new`, no import) are silent.                                                   |
| effect-schema     | `no-manual-tag-member`                  | Ban hand-written _tag property signatures in type positions                                              | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-schema     | `no-manual-tag-property`                | Ban classes that declare their own _tag property                                                         | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-schema     | `schema-checked-element-named`          | A checked schema node passed inline as a collection combinator element lives in a named module-scope…    | 22      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-schema     | `schema-declaration-location`           | Module-scope Effect Schema declarations live only in *.schema.ts files (any stem, several per file)…     | 39      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 3, schema-number 35, strict-boolean-expressions 2.                                                                                                                                             |
| effect-schema     | `schema-filter-constructive-generation` | An Effect Schema filter consumed by check or exported from a module carries constructive-generation…     | 18      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-schema     | `schema-file-exports-schemas-only`      | A *.schema.ts file may export only the schema declarations it holds (a module-scope class extending a…   | 38      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: missing-pipeable-signature 9, schema-number 5.                                                                                                                                                                            |
| effect-schema     | `schema-file-imports-pure-modules-only` | A *.schema.ts file imports only the pure modules R6 names                                                | 25      | keep      | nodeBuiltinImport                                                                                                                         | 3/25   | 3/25    | tsgo sees `node:` builtins only. Misses 22: relative and workflow imports, `fast-check`, third-party packages, side-effect imports, I/O names from `effect`, re-exports, dynamic imports.                                                                                                                       |
| effect-schema     | `schema-recursive-union-budget`         | A recursive Effect Schema union derives superlinearly when six or more suspend-wrapped members sit on…   | 6       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| effect-schema     | `tagged-error-requires-message`         | A class extending Schema.TaggedError must declare a message                                              | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-class-missing-brand 9.                                                                                                                                                                                             |
| test-discipline   | `damp-test-naming`                      | Enforce DAMP (Descriptive and Meaningful Phrases) test naming format                                     | 18      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-behaviourless-assertion`            | Flag an assertion whose subject and expectation are both built only from imported declarations and…      | 7       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `pbt-naming`                            | Enforce a complete formal-specification name for property-based tests (it.prop / it.effect.prop)         | 20      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-silent-return`                      | Property predicates (it.prop / it.effect.prop from @systemfsoftware/vitest) must return a boolean…       | 33      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-assert-in-property`                 | Property predicates (it.prop / it.effect.prop) must never call expect(...), assert*(...), or raw…        | 11      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `property-file-purity`                  | A test that imports FastCheck or calls it.prop / it.effect.prop is a property test file, and it holds…   | 49      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-nested-quantification`              | A property predicate must not quantify over its own generated value and call out again inside that loop  | 17      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: strict-boolean-expressions 15.                                                                                                                                                                                            |
| test-discipline   | `prop-generated-law-duplicate`          | Inside an import.meta.vitest in-source block                                                             | 6       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `prop-arbitrary-schema-origin`          | Inside an import.meta.vitest in-source block, every it.prop / it.effect.prop arbitrary must derive…      | 27      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: strict-boolean-expressions 2.                                                                                                                                                                                             |
| test-discipline   | `prop-fixture-schema-origin`            | Inside an import.meta.vitest in-source block or a *.test.ts file, a recursive schema union must enter…   | 3       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: schema-struct-with-tag 3.                                                                                                                                                                                                 |
| test-discipline   | `in-source-test-prop-only`              | In-source `if (import.meta.vitest)` blocks under src/ must contain only `it.prop` or `it.effect.prop`…   | 9       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `in-source-test-targets-private`        | In-source `if (import.meta.vitest)` blocks under src/ must be at module level and exercise this…         | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: missing-pipeable-signature 1.                                                                                                                                                                                             |
| test-discipline   | `no-test-file-in-src`                   | Under src/, the only sanctioned test file is a single-segment <stem>.workflow.property.test.ts inside…   | 21      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `src-property-test-cell`                | A property test under src/ must be a single-segment <stem>.workflow.property.test.ts beside the…         | 9       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern. Incidental hits on fixture boilerplate only: strict-boolean-expressions 1.                                                                                                                                                                                             |
| test-discipline   | `test-file-outside-tests-dir`           | Test files outside src/ must live under a tests/ directory; free-standing test files have no…            | 3       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `test-suffix-outside-src`               | Outside src/, a test file is named for the lanes its imports select                                      | 24      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `e2e-tier-placement`                    | Reports an end-to-end test (a test file that value-imports `test`, or the namespace, from…               | 44      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `behaviour-test-requires-gherkin`       | A test that imports @systemfsoftware/effect-gherkin-spec (the behaviour lane) drives its suite…          | 15      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `behaviour-exercises-use-case`          | A behaviour test - any test file that imports @systemfsoftware/effect-gherkin-spec, whatever its name…   | 12      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `behaviour-one-feature-per-file`        | A behaviour test - any test file that imports @systemfsoftware/effect-gherkin-spec, whatever its name…   | 18      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-pseudo-gherkin-unit-tests`          | In a behaviour test - any test file that imports @systemfsoftware/effect-gherkin-spec, whatever its…     | 7       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `tests-dir-helpers-in-fixtures`         | Under tests/, the only non-test modules are helpers and fixtures, and they live inside…                  | 4       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `vitest-from-systemfsoftware-vitest`    | Every value a test uses from Vitest is imported from @systemfsoftware/vitest, which re-exports all of…   | 87      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `no-io-module-in-source-test`           | Reports an in-source `import.meta.vitest` test block in a module whose own syntax shows a called,…       | 5       | keep      | nodeBuiltinImport                                                                                                                         | 4/5    | 4/5     | Closest pair. The fifth fixture binds `effect/FileSystem` and calls it; tsgo reports `node:` and bare Node builtins only.                                                                                                                                                                                       |
| test-discipline   | `tests-import-public-api`               | Forbid package-level tests from relative-importing src or climbing into an internal folder               | 10      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `differential-test-requires-harness`    | A test that imports @systemfsoftware/differential-spec (the differential lane) runs through that harness | 15      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `conformance-test-requires-harness`     | Conformance tests must use the @systemfsoftware/conformance-spec Conformance barrel                      | 19      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `model-fixture-imports-subject`         | A *.model.ts fixture is the pure model a conformance check stands the implementation against, so it…     | 12      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `ban-raw-span-name-emit`                | Ban a raw span name passed to an emit API (startSpan, spanBuilder, startActiveSpan)                      | 4       | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |
| test-discipline   | `trace-test-requires-taxonomy`          | A test that imports @systemfsoftware/trace-spec (the trace lane) terminates its cases on relation…       | 30      | unrelated | -                                                                                                                                         | -      | -       | No tsgo diagnostic reports this concern.                                                                                                                                                                                                                                                                        |

### Deleted rules

- `no-context-generic-tag` (`oxlint-plugin-cell-architecture`): all 10 invalid fixtures are refused by stock `tsc` 7.0.2 with TS2339 or TS2304 (Appendix C, tsc evidence). Deleted by U2 under the owner's bar; no tsgo diagnostic replaces it.

Under the issue's literal bar (a tsgo diagnostic) no rule qualifies; the best candidate, `no-io-module-in-source-test`, reports 4 of 5 and stays.
