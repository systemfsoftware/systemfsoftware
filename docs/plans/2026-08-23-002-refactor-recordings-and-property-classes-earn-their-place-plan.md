---
title: "refactor: make recordings and property classes earn their place"
date: "2026-08-23"
type: refactor
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# refactor: make recordings and property classes earn their place

## Problem Frame

Two instruments in this repo are keyed on things their authors assert rather than on things the tree forces, and both have drifted into certifying nothing.

**The recordings.** `packages/testing/type-testing/arethetypeswrong/core/tests/snapshots.integration.test.ts` holds 5,430 lines of committed JSON across 14 files, 138–773 lines each. `CONCEPTS.md` puts the reviewable ceiling for a recording at "a few dozen lines" and treats anything past it as a file that gets regenerated rather than examined. Every one of the 14 is 3–20× past that ceiling, and no gate anywhere measures a recording's size — the ceiling is prose.

The file is also a junk drawer. One `Feature` holds three unrelated concerns: a meta-assertion about the fixture corpus (`every problem kind has a named recipe`), 16 recipe scenarios, and a failure-path scenario. `behaviour-one-feature-per-file` counts `Feature(...)` calls, so 18 scenarios of pure-function assertions under a single `Feature` pass a rule whose own description names the defect it exists to catch as "41 scenarios of pure-function assertions in a single file." It counts the spelling, not the content.

Underneath the recordings sits the assertion that actually matters, already written at lines 51–59: `the analysis reports the problem kind the recipe is named for`. It is guarded by `if (kindNames.has(recipeKey))`, so for every recipe whose name is not a problem kind that `Then` asserts nothing and reports green.

**The sibling does not cover this.** `check-package.integration.test.ts` is 31 lines holding one scenario, `Should_ReturnAnalysis_When_RecipePackageIsAnalysed`, which exercises exactly one recipe — `recipes.NamedExports()`. The registry holds 16: twelve named for the twelve literals of `ProblemKindSchema`, plus `TypesCompanion`, `TypesCompanionTypes`, `MultiEntrypoint`, and `KnownBad`. Deleting the junk drawer therefore _does_ drop coverage unless the deletion carries replacements, and this plan's earlier draft was wrong to claim otherwise.

**The mutation gate.** `requireTestContribution` defaults to `['.workflow.property.test.ts', '.policy.property.test.ts', '.kernel.property.test.ts']`. `policy` and `kernel` are cell-role names from the thirteen-role taxonomy retired 2026-08-16, whose retirement states that "no config enumerates those roles." Inside this repo `no-test-file-in-src` sanctions exactly one test file under `src/`, so the two retired classes are unconstructable here and zero exist. Outside this repo they are perfectly constructable, and the default silently claims to gate them.

## Requirements

- **R1** — `snapshots.integration.test.ts` and its 14 committed recordings are gone.
- **R2** — Every one of the 16 recipes carries at least one unconditional assertion after the deletion, and no assertion is reachable only through a condition that can make it vacuous. Twelve are covered by the recipe↔kind invariant; the other four carry their own named assertions.
- **R3** — `requireTestContribution` defaults to `['.workflow.property.test.ts']` alone, in every place the default is expressed, with no retired cell-role name left in the option's default, description, or emitted JSON schema.
- **R4** — A gate fails the build when a recording exceeds a stated line ceiling, and it finds a recording either by the matcher call that creates it or by a filename the tooling derives, never by a filename or directory an author chose.
- **R5** — The gate is observed failing against the **14 recordings committed in this repository today**, before they are deleted, with one violation naming each file and its measured size. A planted fixture is not the proof; it is the regression test that outlives the proof.
- **R6** — The mutation-gate default change ships with a changeset whose bump reflects what an adopter outside this checkout observes, not what this checkout observes.

## Key Technical Decisions

- **KTD1. Delete the whole file rather than rename or split it.** _(session-settled: user-directed — chosen over renaming it to name a capability: it is a junk drawer holding three unrelated concerns, so splitting preserves concerns that should not coexist and renaming preserves all of them under a better name.)_ Governs R1.

- **KTD2. Only workflows earn a property test; every other pure decision is an in-source test on a private target.** _(session-settled: user-directed — chosen over granting a property to every pure core: a workflow is an actual business decision, everything else pure is an implementation detail, and `CONCEPTS.md` § Property cell already states the grant is deliberately narrow.)_ This is why R3 narrows to one suffix rather than re-deriving which classes deserve gating.

- **KTD3. `.workflow.` is not a drifted key and `no-test-file-in-src` is not label-routed.** _(session-settled: user-directed — chosen over deleting `in-source-test-targets-private` and dropping the `.workflow.` requirement: a drifted key runs only on files already carrying the label, while `no-test-file-in-src` bans every other test file under `src/`, which is the structural inverse; and the suffix tracks the `make` boundary that `CONCEPTS.md` names as the binding site, not a name the author chose.)_ Nothing in this plan touches either rule — and U1 must not, which is why the rescued assertions go to a behaviour file rather than in-source (KTD9).

- **KTD4. The gate keys on the matcher call site, or on a tooling-derived filename — never on an author's name.** A gate that scans `__fixtures__/snapshots/` is the label-routed defect `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` measures: it runs only where the author used the expected directory. What makes a file a recording is the matcher that reads it, so the gate resolves `toMatchFileSnapshot`'s literal argument and measures that file. `.snap` files are the one filename the gate may key on directly, because vitest derives that name from the test path — it is not an author's assertion about a file's contents, so the drifted-key objection does not reach it. Governs R4.

- **KTD5. The gate is a repo guard script over a real parser, not a regex and not an oxlint rule.** An oxlint rule sees one file at a time and cannot stat the sibling a `toMatchFileSnapshot('./x.json')` call points at — the case that produced all 5,430 lines is exactly the case a lint rule cannot decide. A regex cannot find an entry boundary either: a `.snap` file is a JavaScript module whose entries are template literals that may contain backticks and interpolation, and `toMatchInlineSnapshot` is overloaded (see KTD6). The repo already ships `ast_grep` and an oxlint plugin toolchain; the guard uses a real parse, not a pattern match. Governs R4, R5.

- **KTD6. The recording is the first string-shaped argument, not the first argument.** `toMatchInlineSnapshot` accepts both `(snapshot?)` and `(propertyMatchers, snapshot?)`. A guard that measures argument zero misreads the property-matchers form: it either measures an object literal (always small, gate falsely passes) or reports unmeasurable on a perfectly measurable recording (gate falsely fails). The rule is syntactic: argument zero is the recording only when its kind is a string or template literal; an object-expression at zero means the recording is argument one. The same overload exists on `toMatchSnapshot`. Governs R4.

- **KTD7. The narrowing is a breaking change for adopters, and the bump comes from their vantage.** `REPO-A5` says the audience is every adopter and this tree is the first one, never the set. Inside this checkout `.policy.property.test.ts` is unconstructable because `no-test-file-in-src` forbids it — but that rule ships in a different package and appears nowhere in `stryker-js-mutation-run`'s runtime dependencies, so an adopter who installs the runner does not get it. Such an adopter can hold those files today and is gated; after this change they are silently ungated, and their migration is real: set `requireTestContribution` explicitly. That is a named migration someone actually performs, so `REPO-R1`'s compatibility test is met and the change ships as a major with the `api!` marker. Governs R6.

- **KTD8. The ceiling is 50 lines, and it lives in the guard.** `CONCEPTS.md` already asserts "a few dozen lines" and cites the technique's own literature; the guard makes that enforceable instead of aspirational. The figure is contestable and belongs where it can be changed against evidence — the doctrine states the principle, the guard states the number. Do not restate 50 in `CONCEPTS.md`.

- **KTD9. The rescued assertions go to the behaviour file, not in-source.** `recipes` is exported (`packages/testing/type-testing/arethetypeswrong/core/src/index.ts:19`), and `in-source-test-targets-private` requires an in-source block to exercise a non-exported module-level binding. A block in `recipes.ts` asserting over `recipes` references only exported and imported names and fails that rule with `noPrivateTarget`. The corpus-completeness claim is in any case observable from outside the package — it says the package's exported registry covers its own exported schema — so it is a public-surface claim and belongs in the behaviour file by the taxonomy's own routing. Governs R2.

- **KTD10. The gate lands before the deletion, so its red is real.** An earlier draft ordered the deletion first "so the gate is not introduced red." That reasoning confuses red against code being deliberately removed with red against code being kept, and it throws away the only honest evidence this gate will ever get: 14 oversized recordings are committed _right now_. `CONST-E3` demands a gate name "a specific wrong thing that specifically happened," and `CONST-E2` demands evidence rather than a report of it. A gate whose only red is a fixture its own author planted satisfies neither. So U3 lands first and is observed failing on all 14 real files; U1 then deletes them and the same gate goes green. Governs R5.

## Implementation Units

Presented in dependency order. U-IDs are stable and are not renumbered when order changes — U3 now precedes U1.

### U3. Gate recording size on the matcher, observed red on the live tree

- **Goal:** A recording past the ceiling fails the build, and the gate is seen failing on the 14 recordings this repository holds today.
- **Requirements:** R4, R5, KTD4, KTD5, KTD6, KTD8, KTD10
- **Dependencies:** none — this lands first
- **Files:**
  - `scripts/guards/check-recording-size.ts` — create. Deno, least-privilege shebang, following the existing guards under `scripts/guards/`.
  - The check-chain entry that runs the repo guards — modify, so the gate runs in `pnpm check:local` and CI rather than on request.
- **Approach:** Parse first-party sources (excluding `repos/`) with a real parser rather than a regex. Three subjects:
  - `toMatchFileSnapshot(<literal>)` — resolve the literal against the calling file and count the referenced file's lines. A non-literal argument cannot be resolved statically: report it as unmeasurable and fail, because a silent skip is the hole an author walks through.
  - `toMatchInlineSnapshot` / `toMatchSnapshot` — apply KTD6's rule to select the recording argument, then count the literal's lines. A property-matchers first argument means the recording is the second; a call with no string-shaped argument at all is the auto-fill form and holds no recording yet, so it is reported as unmeasurable rather than passing.
  - `*.snap` files — measure directly, per KTD4. Parse the module and measure each `exports[...]` entry separately, since one file pools many assertions and a per-file total would blame the wrong test.

  Carry a `--selftest` covering every case below, mirroring `.claude/hooks/guard-local-mutation.ts`, so the demonstration outlives the recordings that prove it.
- **Execution note:** Land this unit and run the gate against the tree _before_ U1 removes anything. Capture the 14 violation lines — that output is R5's evidence and cannot be regenerated after U1.
- **Test scenarios:**
  - A `toMatchFileSnapshot` pointing at a file over the ceiling fails, and the message names the file and its line count.
  - The same call pointing at a file under the ceiling passes.
  - A `toMatchInlineSnapshot` whose literal exceeds the ceiling fails; a short one passes.
  - A `toMatchInlineSnapshot({ id: expect.any(Number) }, '<long literal>')` is measured on the **second** argument and fails — the property-matchers overload of KTD6.
  - A `toMatchInlineSnapshot()` with no argument is reported as unmeasurable, not passed.
  - A `.snap` file with one oversized entry and several small ones fails, and the message names the oversized entry, not the file total.
  - A recording placed outside any `__fixtures__/snapshots/` directory and not named `*.snap` is still found, because the matcher names it — the case a filename-keyed gate misses and the reason KTD4 exists.
  - A non-literal path argument is reported as unmeasurable and fails.
  - A file containing no matcher is not reported.
  - `--selftest` exits 0 with every case above covered.
- **Verification:** `deno run scripts/guards/check-recording-size.ts --selftest` exits 0; run against the pre-U1 tree the gate exits non-zero and names all 14 recordings with their sizes; run against the post-U1 tree it exits 0.

### U1. Delete the junk drawer and rescue every assertion worth keeping

- **Goal:** The 5,430 lines and the three-concern `Feature` are gone, every one of the 16 recipes still carries an unconditional assertion, and the gate from U3 goes green.
- **Requirements:** R1, R2, KTD1, KTD9
- **Dependencies:** U3 (whose red must be observed against these files before they are removed)
- **Files:**
  - `packages/testing/type-testing/arethetypeswrong/core/tests/snapshots.integration.test.ts` — delete.
  - `packages/testing/type-testing/arethetypeswrong/core/tests/__fixtures__/snapshots/*.json` — delete all 14.
  - `packages/testing/type-testing/arethetypeswrong/core/tests/check-package.integration.test.ts` — modify. Receives every rescued assertion; today it holds one scenario over one recipe.
- **Approach:** Handle the registry as two populations rather than iterating all 16 through one conditional path. The twelve recipes named for `ProblemKindSchema` literals get the recipe↔kind invariant as one scenario each, iterating only that population so no scenario is reachable through a condition — that is what retires the vacuous `if (kindNames.has(recipeKey))`. The four remaining recipes each get a named scenario stating what that recipe exists to demonstrate: `TypesCompanion` merged with `TypesCompanionTypes` resolves its companion types, `MultiEntrypoint` reports per-entrypoint results, and `KnownBad` fails the analysis. `TypesCompanionTypes` is an input to `TypesCompanion` rather than a standalone subject and is covered by that scenario; state that in the scenario name so its absence is not read as an omission. The corpus-completeness claim moves into the same file as its own scenario, per KTD9 — it is a public-surface claim and cannot be an in-source block. Derive the twelve from `ProblemKindSchema.literals` rather than hardcoding, so a new problem kind fails the corpus scenario instead of silently going untested.
- **Test scenarios:**
  - Each of the twelve kind-named recipes produces an analysis reporting its namesake problem kind — twelve scenarios, none conditional.
  - `TypesCompanion` merged with `TypesCompanionTypes` resolves the companion types.
  - `MultiEntrypoint` reports a result per declared entrypoint.
  - `KnownBad` fails the analysis.
  - A problem kind in `ProblemKindSchema.literals` with no matching recipe fails the corpus-completeness scenario.
  - Adding a recipe that is neither kind-named nor one of the three named companions is not silently ignored — the corpus scenario accounts for every registry entry, not only for every kind.
- **Verification:** `pnpm --filter @systemfsoftware/arethetypeswrong-core test` exits 0; every one of the 16 recipes appears in at least one scenario name; `git grep -n "toMatchFileSnapshot" -- ':!repos'` returns nothing; U3's gate now exits 0.

### U2. Narrow the mutation gate to the one class that exists

- **Goal:** `requireTestContribution` claims to gate exactly the file class the taxonomy can construct.
- **Requirements:** R3, KTD2, KTD7
- **Dependencies:** none (independent of U1/U3; may land in parallel)
- **Files:**
  - `packages/testing/mutation/stryker-js/mutation-run/src/config/fork-schema.schema.ts` — modify. The annotation default (line 10), the `withDecodingDefaultKey` array (lines 15–19), and the description prose naming "workflow, policy, and kernel property tests today".
  - `packages/testing/mutation/stryker-js/mutation-run/schema/stryker-schema.json` — modify. Carries the same default at line 587.
- **Approach:** All three source sites must change together; the annotation default and the decoding default are separate literals, and changing one alone leaves the schema describing a default it does not apply. Determine first whether `schema/stryker-schema.json` is emitted or hand-maintained: `forkCoreSchema` derives from `S.toJsonSchemaDocument(forkOptionsSchema)` at runtime, and `docs/plans/2026-08-05-002-fix-mutation-config-drift-plan.md` describes a drift gate over this pair. If a generator exists, run it; if the JSON is hand-maintained, edit it and let the drift gate confirm. Either way the drift gate is the red-before: change the source alone, observe the failure, then bring the JSON into line.
- **Test scenarios:**
  - Decoding an options document that omits `requireTestContribution` yields exactly `['.workflow.property.test.ts']`.
  - Decoding a document that sets it explicitly to a multi-entry array round-trips that array unchanged — narrowing the default must not narrow the option.
  - Setting it to `null` still disables the check.
  - No retired cell-role name survives: `git grep -n "policy.property.test.ts\|kernel.property.test.ts" -- packages/testing/mutation` returns nothing.
- **Verification:** `pnpm --filter @systemfsoftware/stryker-js-mutation-run test` exits 0; the config-drift gate observed red before the JSON was updated and green after.

### U4. Record the release intent

- **Goal:** The publishable change ships with an intent that matches what an adopter observes.
- **Requirements:** R6, KTD7
- **Dependencies:** U2
- **Files:**
  - `.changeset/<generated>.md` — create via `pnpm change --bump major`.
- **Approach:** Major bump, `api!` marker on the commit, per KTD7. The body is read by someone who installed the package from a registry and has never seen this repository: it states that the default set of gated suffixes narrowed to the workflow class, and that a consumer relying on the previous default must set `requireTestContribution` explicitly to keep gating the other two. Nothing about this repo's lint rules, file counts, or the taxonomy retirement that motivated it.
- **Test scenarios:** none — a release artifact. **Test expectation: none — the deliverable is the intent file.**
- **Verification:** the changeset gate exits 0; every sentence names something a consumer observes or must do.

## Scope Boundaries

### Deferred to Follow-Up Work

- **The `integration` → `feature` rename.** 125 first-party `*.integration.test.ts` files. What the gates enforce is BDD form — `makeFeature`, exactly one `Feature`, an import of package code — and nothing checks that a boundary is crossed; most of the 125 cross none. Settled in direction, but 125 mechanical renames would bury this PR's semantic changes under review noise, and each is independently revertible.
- **A purpose-built TypeScript-drift recording.** The deleted recordings incidentally detected changes in TypeScript's own module resolution — a rule this repo does not own and therefore cannot state as a property, which is the legitimate case for a recording. Fourteen ~390-line blobs is not the instrument for it. If that drift matters it earns one small, purpose-named recording under the U3 ceiling; introducing one now, with no observed drift incident, would be speculative structure.
- **A rule that reads scenario content.** `behaviour-one-feature-per-file` counts `Feature(...)` calls, so it cannot catch an 18-scenario drawer written under a single `Feature`. Fixing that needs a rule keyed on what the scenarios assert — a different and harder instrument than anything here.

## Verification Contract

| Gate                                 | Command                                                                                       | Signal                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Gate fires on live code (U3, pre-U1) | the recording gate against the current tree                                                   | exits non-zero, naming all 14 recordings |
| Gate self-proof                      | `deno run scripts/guards/check-recording-size.ts --selftest`                                  | exits 0                                  |
| Gate green after deletion            | the recording gate against the post-U1 tree                                                   | exits 0                                  |
| Package under change                 | `pnpm --filter @systemfsoftware/arethetypeswrong-core test`                                   | exits 0                                  |
| Every recipe asserted                | each of the 16 recipes appears in a scenario name                                             | 16/16                                    |
| Mutation-run package                 | `pnpm --filter @systemfsoftware/stryker-js-mutation-run test`                                 | exits 0                                  |
| No recording survives                | `git grep -n "toMatchFileSnapshot" -- ':!repos'`                                              | no first-party hit                       |
| No retired role name                 | `git grep -n "policy.property.test.ts\|kernel.property.test.ts" -- packages/testing/mutation` | no hit                                   |
| Repo gate                            | `pnpm check:local`                                                                            | exits 0                                  |
| Release intent                       | `pnpm change --bump major`                                                                    | changeset gate exits 0                   |

## Definition of Done

- The recording gate was observed failing on all 14 committed recordings before any were deleted, and that output is recorded in the change.
- `snapshots.integration.test.ts` and all 14 recordings are deleted, and the gate now passes.
- All 16 recipes carry an unconditional assertion; no rescued assertion sits behind a condition that can make it vacuous.
- No in-source block was added to a module whose only module-level names are exported or imported.
- `requireTestContribution` names one suffix in the annotation default, the decoding default, the description, and the emitted JSON schema.
- A major changeset with the `api!` marker ships with U2, and its body names only consumer-observable facts.
- `pnpm check:local` exits 0 and the PR is watched to CI-decided.

## Risks

- **The gate's live red is one-shot.** Once U1 deletes the recordings the evidence cannot be regenerated in this repository, so the U3 execution note is load-bearing: capture the violation output before U1 runs. If the units land out of order the plan loses the very evidence `CONST-E3` asks for, and the gate degrades to the selftest-only posture this plan's earlier draft was rejected for.
- **The rescued assertions are weaker than the blobs they replace.** A recording pins the entire analysis; `recipe K reports kind K` pins one field. That is the intended trade — the extra coverage was never reviewed by anyone and cost 5,430 lines — but a TypeScript resolution change that does not alter the reported kind will now pass unnoticed until the deferred drift recording exists.
- **The drift gate may not cover the JSON schema pair.** U2's red-before assumes the config-drift gate compares `schema/stryker-schema.json` against the Effect schema. If it does not, that unit has no mechanical red-before and its verification degrades to unit tests plus a `git grep`. Discovering this is the first step of U2, not a surprise at the end.
- **`--allow-run` on the guard.** Enumerating first-party files may want `git ls-files`. Granting `--allow-run=git` widens the guard's permissions beyond `--allow-read`; a read-only walk that excludes `repos/` by path is preferred where it does not require reimplementing gitignore semantics.
