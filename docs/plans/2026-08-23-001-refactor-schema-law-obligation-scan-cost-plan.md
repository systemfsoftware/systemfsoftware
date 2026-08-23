---
title: "refactor: make the obligation scan pay for arms that can yield a witness"
date: "2026-08-23"
type: refactor
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
origin: session measurement of `omp-claude-compat`'s schema-law suite, where one generated test held 98% of the run
---

# refactor: make the obligation scan pay for arms that can yield a witness

## Goal Capsule

`@systemfsoftware/effect-schema-law`'s obligation scan spends its entire budget brute-forcing a witness search that, for the overwhelming majority of arms, is searching for something that cannot be there. Nine packages run this scan. Make the scan's cost proportional to the arms that can actually yield an obligation, without changing a single obligation verdict, and without moving a timeout or a coverage flag to hide the cost.

**Authority:** this plan. Existing measured numbers over any recollection of them.

## Problem Frame

`omp-claude-compat`'s `src/schema-laws.test.ts` takes ~98s. The breakdown, measured this session:

| what                                      | time                      |
| ----------------------------------------- | ------------------------- |
| 38 round-trip law tests (`ruleOfSchemas`) | ~1.7s total, 0-421ms each |
| the single generated obligation test      | **98,726ms**              |

Profiling one scan pass over that package's 20 exported schemas:

| schema            | arms | obligations | ms     |
| ----------------- | ---- | ----------- | ------ |
| `SettingsJSON`    | 74   | **0**       | 62,555 |
| `SettingsWrapped` | 36   | **0**       | 54,910 |
| the other 18      | 31   | 2           | ~350   |

**141 arms yield 2 obligations.** Two schemas are 99.7% of the time and produce none.

Every one of those 74 and 36 arms is `drop-to-arm`/`drop-from-arm` — **zero refinement arms**. Their paths (`root/property/hooks/property/PreToolUse/to/0`) name the nine `S.withDecodingDefaultTypeKey(Effect.succeed([]))` calls in `HookGroups`. `Weaken.ts` emits two arms per encoding link; nine defaulted keys produce 36, and `SettingsJSON = S.Union([SettingsWrapped, LiftFlatSettingsACL])` duplicates the set to 74. The arithmetic matches the measurement exactly.

A decoding default **widens** acceptance. `findWitness` searches for a value the weakened schema accepts and the original rejects; against a widening, the original is the more permissive of the two, so that witness cannot exist. The scan still pays full price to discover this: per arm, two `S.toArbitrary` builds over the whole nested settings AST, `WITNESS_BUDGET = 256` draws from each, and up to 1024 `S.decodeUnknownExit` calls against a nine-key struct of arrays of structs of unions.

Two things are wrong, and the second is the one that matters:

1. **Cost.** ~848ms per barren arm, 139 barren arms per pass.
2. **Honesty.** `scanObligations` already separates "no obligation" from "could not look" — that is what `blind` is for. For an arm whose weakening cannot narrow, the scan returns "no obligation" with the same confidence it returns for an arm it genuinely searched. A structural certainty is being reported as a sampling result.

This plan treats the cost as the symptom and that conflation as the defect.

## Requirements

- **R1** — The obligation set produced for every schema in all nine consuming packages is unchanged, proven by comparison against a recorded pre-change baseline, not by assertion.
- **R2** — The `blind` set is unchanged for the same schemas. An arm that could not be searched must not silently become an arm that was searched and found empty.
- **R3** — The wall time of the obligation scan falls, and the change reports the measured before/after for at least the two schemas that dominate it.
- **R4** — No timeout, coverage flag, or test-runner setting is moved to achieve R3, and `WITNESS_BUDGET` is never moved merely to make a number fit. Changing the budget as a first-class decision carrying U1's witness-depth evidence is permitted and is governed by KTD5 — the distinction is whether the change is argued or merely convenient.
- **R5** — If arm emission changes, the in-source `armCountOf` model in `packages/core/effect/schema/law/src/Weaken.ts` changes with it, and its generator still constructs schemas that exercise the arm kinds the model counts.

## Key Technical Decisions

- **KTD1. Two of the three candidate sinks are already closed; the mechanism comes from the two that remain.** The per-arm cost splits across `S.toArbitrary` construction, fast-check draw generation, and `S.decodeUnknownExit`. **Arbitrary-construction memoisation is dead and must not be attempted:** Effect's own `S.toArbitrary` is already memoised on AST identity, and every arm's `weakened` AST is a fresh object (`cloneWith` is `Object.assign({}, node)` at `packages/core/effect/schema/law/src/Weaken.ts:54-59`), so both Effect's cache and any user-level cache on the same key miss by construction. That leaves two live candidates, and U1 measures which dominates before either is applied:
  - **Halve the decode loop.** `isWitness` is `accepts(weakened, v) && !accepts(schema, v)` (`Refutation.ts:92`). For draws taken from the weakened schema's own arbitrary the first term is true in the overwhelming majority of cases, so it is close to a redundant full decode per draw — up to 512 of the ~1024 per arm. It cannot simply be deleted: it is load-bearing for the `REJECTION_GENERIC_POOL` values, and an arbitrary can emit a value its schema rejects. Any change here must keep both facts true.
  - **Justify the draw count instead of assuming it.** `WITNESS_BUDGET = 256` per source is an unexamined density. If every witness this corpus can produce is found within far fewer draws, 256 is buying precision nobody priced. This is permitted by R4 only as a first-class decision with its own evidence — see KTD5.

- **KTD2. No static check can prove a default total, and the reason is narrower than "the AST says nothing".** The obvious fix — skip arms for links that cannot fail — is unavailable, but not for the sweeping reason a first draft of this plan gave. Two sub-claims, only the second of which survives:
  - **(a) The AST does carry a discriminator, and it is not enough.** `link.transformation` is `Transformation | Middleware` and both carry a `_tag` (`repos/effect/packages/effect/src/SchemaAST.ts:401-416`; Effect switches on it itself at `SchemaAST.ts:2528-2530`). `withDecodingDefaultTypeKey` always produces `Transformation`, never `Middleware`. So the tag separates middleware pipelines from value-level ones — it does not separate a total default from a fallible transform.
  - **(b) Within `Transformation`, totality is not statically visible.** `SchemaGetter.Getter.run` returns `Effect<Option<T>, SchemaIssue.Issue, R>` for every getter (`repos/effect/packages/effect/src/SchemaGetter.ts:64-68`), and a default built from `Effect.succeed(...)` is indistinguishable on the AST from one built from `Effect.fail(...)`. This is the real reason arm-elimination is off the table.
  - **Do not reach for `SchemaGetter.isPassthrough`.** It is module-private — defined at `repos/effect/packages/effect/src/SchemaGetter.ts:205-207` and never exported — and the reconstructible reference-equality trick catches only an encode-side passthrough, which neither of `withDecodingDefaultTypeKey`'s two links is.

- **KTD3. Verdict parity is characterized before the change, not after.** Nine packages consume this scan. A change to arm emission or witness search can turn a covered schema into a naked one and fail the generated obligation test in packages nobody touched. The baseline in U2 is what makes R1 falsifiable, and it is recorded before any behaviour moves — this is the characterization-before-restructuring discipline, applied to a shared package with nine dependents.

- **KTD4. A cheaper scan must not become a blinder scan.** Whatever U3 does, the distinction `blind` encodes must survive. Reducing cost by turning unsearched arms into confidently-empty ones would make the law pass more often while proving less — the exact failure this package's `blind` set was built to prevent.
- **KTD5. Arm elimination is unavailable, so the budget is a candidate rather than a forbidden lever.** KTD2 closes static arm elimination and KTD4 closes unsound arm elimination. With arbitrary-memoisation also closed by KTD1, a plan that additionally froze `WITNESS_BUDGET` would forbid every remaining mechanism and be unimplementable — an adversarial review of this plan's first draft landed exactly that. R4's prohibition is therefore specifically on moving the budget _to make a number fit_; changing it as a measured decision, with the witness-discovery-depth evidence U1 collects, is in scope and is the fallback when the decode-loop candidate proves insufficient.

## Implementation Units

Presented in dependency order. U-IDs are stable.

### U1. Attribute the per-arm cost

- **Goal:** Split the ~848ms per barren arm between draw generation and the decode loop, and measure how deep in a draw sequence a real witness is actually found, so KTD1 picks its mechanism from numbers and KTD5's budget question has evidence.
- **Requirements:** R3 (its before/after depends on this unit selecting the mechanism), R4 (the witness-depth evidence is what makes a budget change a decision rather than a lever), KTD1, KTD5
- **Dependencies:** none
- **Files:**
  - `scripts/tools/profile-obligation-scan.ts` — create. A utility, deliberately under `scripts/tools/` (wired into no check chain), that loads a named package's exported schemas and reports, per schema: arm count by kind, obligation count, blind count, and elapsed time split across arbitrary construction, draw generation, and decode calls.
- **Approach:** Time around the call sites in `packages/core/effect/schema/law/src/Refutation.ts` — `sample` and the `accepts` pair inside `findWitness` — from a measurement harness rather than by editing the shipped functions. Record `S.toArbitrary` construction separately too, but only to confirm KTD1's claim that it is already closed; a large construction share would falsify KTD1 and must be reported rather than absorbed. Additionally record, for every arm that DOES yield a witness anywhere in the corpus, the draw index at which it was found — that distribution is the evidence KTD5 needs. Resolve the package's schemas the way the vite plugin does (walk `src`, keep exports carrying `ast`). Run against `omp-claude-compat`, whose two heavy schemas are the known extreme, and against one package with genuine refinements so the witness-depth sample is not empty.
- **Execution note:** This unit's output is a number, not a behaviour. It is complete when the split and the witness-depth distribution are recorded; it ships no change to the law package.
- **Test scenarios:** none — this is a measurement utility, not a feature. **Test expectation: none — the unit's deliverable is the recorded measurement.**
- **Verification:** the timed parts sum to within a few percent of total scan time for `SettingsJSON` and `SettingsWrapped`; the witness-depth sample is non-empty; and the arbitrary-construction share is reported explicitly, confirming or falsifying KTD1.

### U2. Characterize the obligation surface across all nine consumers

- **Goal:** A recorded, comparable baseline of what the scan decides today, so R1 and R2 can be checked rather than claimed.
- **Requirements:** R1, R2, KTD3
- **Dependencies:** none (may run alongside U1)
- **Files:**
  - `scripts/tools/obligation-baseline.ts` — create. Emits, for every package carrying a `src/schema-laws.test.ts`, a stable machine-comparable record: per schema, the arm count by kind, the obligation count, and the blind count.
- **Approach:** The nine packages are `omp/packages/omp-utils`, `omp/plugins/omp-agent-discipline`, `omp/plugins/omp-claude-compat`, `packages/core/effect/daemon-spec`, `packages/core/hex/hex-schema`, `packages/testing/mutation/plugins/stryker-plugins`, `packages/testing/mutation/stryker-js/cli`, `packages/testing/type-testing/arethetypeswrong/cli`, and `packages/testing/type-testing/arethetypeswrong/core`. Emit sorted, deterministic output so two runs diff cleanly. Do not commit the baseline itself as a checked-in artifact — a recorded snapshot of a moving measurement rots and starts governing; capture it to a scratch path and carry the comparison in the change's own evidence.
- **Execution note:** Capture the baseline before U3 touches anything. A baseline taken after the change proves nothing.
- **Test scenarios:** none — measurement utility. **Test expectation: none — deliverable is the recorded baseline.**
- **Verification:** the script completes for all nine packages, and two consecutive runs on an unchanged tree produce byte-identical output.

### U3. Cut the per-arm work the search does not need

- **Goal:** The scan stops paying twice per draw, with every verdict unchanged.
- **Requirements:** R1, R2, R3, R4, KTD1, KTD2, KTD4, KTD5
- **Dependencies:** U1 (which mechanism, and the witness-depth evidence), U2 (parity baseline)
- **Files:**
  - `packages/core/effect/schema/law/src/Refutation.ts` — modify. `findWitness`'s draw/decode loop, and `WITNESS_BUDGET` only under KTD5.
  - `packages/core/effect/schema/law/src/Weaken.ts` — **not expected to change.** KTD2 closes static arm elimination; touching arm emission here would trip R5 and U4. If U1 somehow points at emission, stop and re-plan rather than improvising.
- **Approach:** Apply the candidate U1 selected. **Do not build an arbitrary cache** — KTD1 records that Effect already memoises `S.toArbitrary` on AST identity and that every `weakened` AST is a fresh `cloneWith` object, so such a cache is a guaranteed miss and would be pure added surface. The decode-loop candidate must preserve two facts: `accepts(weakened, v)` is load-bearing for `REJECTION_GENERIC_POOL` values, and an arbitrary may emit a value its own schema rejects, so the term cannot simply be assumed true. The budget candidate ships only with U1's witness-depth distribution attached, per KTD5.
- **Technical design:** directional only. The shape today is `armsOf` → per arm `findWitness` → build 2 arbitraries, draw `WITNESS_BUDGET` from each, `accepts` twice per draw. The fix removes redundant work inside that loop; it does not change what counts as a witness and does not change which arms are searched.
- **Test scenarios:**
  - A schema whose refinement is genuinely refutable still reports exactly one obligation for it, with the same witness-bearing arm as before.
  - A schema built only from `withDecodingDefaultTypeKey` defaults reports zero obligations, and reports them as searched-and-empty or not-searched consistently with KTD4 — never flipping a previously-blind arm to confidently empty.
  - A schema with a genuinely fallible `decodeTo` (a `transformOrFail` that can reject) still yields its obligation — the case KTD2 says cannot be told apart statically, so it must be preserved dynamically.
  - An arbitrary that emits a value its own schema rejects still classifies that arm correctly — the decode-loop change must not assume `accepts(weakened, v)` is true for every schema-derived draw.
  - A witness reachable only from `REJECTION_GENERIC_POOL`, not from either arbitrary, is still found — the pool path keeps its `accepts(weakened, …)` check.
  - Re-running the scan twice on the same schema returns equal obligation and blind sets.
- **Verification:** `pnpm --filter @systemfsoftware/effect-schema-law test` passes, and U2's script rerun produces output identical to the baseline for all nine packages.

### U4. Keep the arm-count model honest

- **Goal:** If arm emission moved, the property test that models it moved with it, and still exercises the paths it claims to.
- **Requirements:** R5
- **Dependencies:** U3
- **Files:**
  - `packages/core/effect/schema/law/src/Weaken.ts` — modify the in-source `if (import.meta.vitest)` block.
- **Approach:** The model today is `transform → 2 + armCountOf(from) + armCountOf(to)`. Its generator builds transforms with a plain total `S.decodeTo(target)`. If U3 changes emission so that some transforms contribute fewer arms, updating only the arithmetic would leave the generator producing exclusively the new zero-arm shape, and the property would silently stop covering the arm path it exists to pin. Add the recipe variant needed to keep both shapes generated, then update `armCountOf` to match. If U3 left emission untouched, this unit is a no-op and says so.
- **Test scenarios:**
  - The arm-count property holds over generated recipes for both transform shapes.
  - A recipe built from the transform shape that still emits arms produces a non-zero arm count — the model is not vacuously satisfied by every generated schema producing zero.
- **Verification:** `pnpm --filter @systemfsoftware/effect-schema-law test` passes; deliberately mis-stating `armCountOf` by one fails it.

### U5. Prove cost moved and verdicts did not

- **Goal:** The change ships with the evidence R1 and R3 demand.
- **Requirements:** R1, R2, R3
- **Dependencies:** U3, U4
- **Files:** none — this unit produces evidence, not code.
- **Approach:** Rerun U2's script and diff against the baseline; rerun the `omp-claude-compat` schema-law suite and record before/after wall time for the file and for the two dominant schemas. Run the full local gate.
- **Test scenarios:** none — this unit runs existing suites. **Test expectation: none — deliverable is the recorded comparison.**
- **Verification:** obligation/blind diff across nine packages is empty; the recorded scan time is lower; `pnpm check:local` exits 0.

## Scope Boundaries

**In scope:** the obligation scan's cost and the honesty of its "no obligation" verdict, inside `packages/core/effect/schema/law/`.

**Out of scope:**

- Changing `WITNESS_BUDGET`, any `testTimeout`, or any coverage setting (R4).
- Rewriting `HookGroups` or `SettingsJSON` in `omp-claude-compat`. Nine defaulted keys behind a two-member union is a legitimate shape; the scan's behaviour against it is the subject.
- The `Effect.sync`-wrapped-IO and hand-written-declaration class of defect already fixed on this branch.

### Deferred to Follow-Up Work

- Whether `withDecodingDefaultTypeKey` should be expressible in a way the AST can recognise as total. That is an upstream-shaped question about Effect's own encoding surface, and KTD2 shows it cannot be answered from the consumer side today.
- Whether the generated obligation test should call `obligationsOf` once per schema rather than up to twice (`covered` loop plus `naked` filter) in `packages/core/effect/schema/vite/src/mod.ts`. Real, but second-order to the per-arm cost, and it changes generated-code shape for nine packages.

## Verification Contract

| Gate               | Command                                                                                  | Signal                                         |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Law package suite  | `pnpm --filter @systemfsoftware/effect-schema-law test`                                  | exits 0                                        |
| Verdict parity     | rerun U2's script, diff against the pre-change baseline                                  | empty diff across all nine packages            |
| Cost moved         | rerun the `omp-claude-compat` schema-law suite                                           | recorded wall time below the pre-change number |
| Consumers unbroken | `pnpm --filter @systemfsoftware/omp-claude-compat test` and the same for the other eight | each exits 0                                   |
| Repo gate          | `pnpm check:local`                                                                       | exits 0                                        |
| Release intent     | `pnpm change --bump none` naming the publishable law package                             | changeset gate exits 0                         |

The bump is **`none`**, and the plan's own requirements are why: R1 and R2 assert the obligation and blind sets are unchanged, and R3 moves only wall time. Nothing a consumer can observe from outside the package changes, which is the case REPO-R2 defines as `none` — "shipped sources changed but no exported name, type or behaviour did". The gate decides only whether an intent is owed, never which bump is right, so a defaulted `patch` here would pass green while publishing a CHANGELOG entry for a release that does not exist. If U3 ends up taking the KTD5 budget route, re-judge this: a budget change alters how hard the law looks, which a consumer relying on the law's strength can observe, and that is no longer `none`.

## Definition of Done

- U1's cost split is recorded and named the mechanism U3 applied.
- U2's baseline was captured before U3 changed anything.
- Obligation and blind sets are identical across all nine consuming packages.
- The scan is measurably faster, with before/after numbers in the change.
- No timeout or coverage setting moved. `WITNESS_BUDGET` is unchanged, or changed under KTD5 with U1's witness-depth evidence recorded in the change and the changeset class re-judged accordingly.
- No arbitrary cache was added (KTD1 closed it), and `Weaken.ts` arm emission is unchanged, or U4 moved the model with it.
- `pnpm check:local` exits 0 and the PR is watched to CI-decided.

## Risks

- **A shared package with nine dependents.** Any verdict change surfaces as a red generated test in a package the change never mentions. U2 is the mitigation and must precede U3.
- **A cheaper scan that proves less.** The tempting shortcut is to stop searching arms that look unpromising and record them as empty. That buys the number and loses the law. KTD4 and R2 exist to catch it, and U3's second test scenario is where it would show.
- **The model going vacuous.** If U3 changes emission and U4 only updates arithmetic, the property test keeps passing while covering nothing. U4's second scenario is the guard.
- **Measurement noise.** The two dominant schemas take tens of seconds; a few percent of run-to-run variance is expected. R3 asks for a direction and a magnitude, not a precise figure.
