---
title: Zero-effect hydration and registry disposal - Plan
type: feat
date: 2026-10-13
topic: zero-effect-hydration
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-13-0944-feat-react-no-effect-plan.md
---

# Zero-effect hydration and registry disposal - Plan

Supersedes the 2026-10-13 09:44 plan: the one admitted `HydrationBoundary` Effect is withdrawn (recovery intent of work item it_60b5c196, 2026-10-13 17:11), so React code in this repository runs no Effect at all. Mapped to PR #763 at head `cb0c704dda`.

## Goal Capsule

- **Objective:** React code in every repository that extends `@systemfsoftware/oxlint-config-recommended` reaches no React Effect hook, with no exception, and the effect-atom React binding keeps server handoff, transition safety and registry cleanup without one.
- **Means:** `HydrationBoundary` hydrates during render only the atoms its registry does not hold, and never writes one it does. `RegistryProvider` disposes the registry of a render React never commits once React drops that render. `useEffect` joins the preset's import ban, and the plugin rule keeps only what the ban cannot see.
- **Product authority:** the withdrawal of the one-effect exception (recovery intent, 2026-10-13 17:11) and Ryan's no-Effect ruling of 2026-10-13. Repository law (`CONSTITUTION.md`, `repos/constitution/ENFORCEMENT.md`) outranks this plan.
- **Stop conditions:** a scenario in R8-R11 that cannot be proven green-and-red through an allowed route (AE4 included: KTD3); a root ruling against the stack in KTD7; a CONST article that forbids a requirement.
- **Open blockers:** root and Younna root review of this plan (Q1-Q4). No ce-work starts before it.
- **Provenance limit:** the zero-effect synthesis the recovery intent cites never reached this session: it is in no user message, steer-inbox entry or peer transcript between the 15:50 and 17:11 intents. Every decision below is derived from repository, history, upstream and react.dev evidence and is labelled for root reconciliation (Q4).

## Product Contract

### Summary

The binding drops its last React Effect. New saved atoms still arrive during render, which is upstream's own behaviour. An atom the page already holds keeps its live value: a saved page no longer overwrites it, neither during render nor after commit. The provider's registry is released on unmount as before. A registry created by a render that never commits is now released too, without racing a render that is still suspended on it. The lint refuses every Effect hook through the import ban, and a plugin rule refuses `import('react')`, `require('react')` and every directive that would switch the ban off.

### Problem Frame

At `cb0c704dda` the only React Effect in the repository is `HydrationBoundary`'s after-commit `useEffect` (`packages/atom/effect-atom-react/src/hydration-boundary.ts:133-135`). It writes saved values over atoms the registry already holds, after commit, so that an abandoned transition cannot change the current page. Removing that call fails exactly one scenario: deliberate-red PR #765, CI run `38428437461`, job `115414190397`, 1 failed / 62 passed, "A reloaded page keeps showing its current value until the saved one is safely committed" ("shows \"18\", not \"23\""). No other scenario and no in-repo consumer depends on it: `git grep HydrationBoundary -- ':!repos/'` finds only the package's own source, API report, three test files, the ui-state rule and the superseded plan. The SSR, streaming and restore scenarios hydrate into fresh registries, where every atom is new.

Separately, `RegistryProvider` (`src/registry-context.ts:108-137`, `:164-168`) creates its registry lazily in `getSnapshot` during render, and arms disposal only when a subscription ends. A render that never commits, such as an abandoned transition or StrictMode's discarded initializer, creates a registry nobody subscribes to, so it is never disposed. Any atom work it started (fibers, schedules) is never released.

### Key Decisions

Each is **derived** here, not session-settled. Q2 asks root to rule on KD2, the one decision that drops behaviour; KD1, KD3 and KD4 stand unless root rules against them.

- **KD1. HydrationBoundary survives with zero Effects.** It hydrates during render only the dehydrated atoms the registry does not hold, and drops the rest. That is upstream's documented-safe half: tim-smart/effect-atom `ReactHydration.ts` at `2fc0f70` hydrates new atoms during render and states "If the transition is aborted, we will have hydrated any _new_ Atom values" (lines 36-42); TanStack/query `HydrationBoundary.tsx` at `0fbbc62` does the same for queries (106-112). Chosen over removing it (A3), because the SSR handoff and streaming deferred hydration (`tests/ssr.integration.test.ts:116`, `:212`) keep working unchanged. Governs R8, R9.
- **KD2. An atom the page already holds is never overwritten by a saved page.** The after-commit adoption has no zero-Effect implementation (Unsupported Scenario). The value already on screen is live client state, and a newer server value reaches it the ui-state way: a runtime atom over an Effect service (pack: ui-state, server-data-lives-in-atoms.md). Governs R9, AE3.
- **KD3. An unclaimed registry is released when React drops the render that made it, not on a timer.** A suspense promise resolves only through a registry subscription (`src/hooks-suspense.ts:186-198`, `Atom.Registry.subscribe` at `:194`), so disposing a registry while a transition is suspended on it strands that transition. Only reachability tells "dropped" from "still waiting". Governs R10.
- **KD4. `useEffect` joins the import ban; the plugin rule keeps what the ban cannot see.** With no exception, every `useEffect` reach starts at an import the ban refuses, so the rule's reach detection and admitted shape would only report the same site twice. Governs R2, R3.

### Requirements

**Effect ban**

- R1. No module calls or references `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react`, in any form. There is no exception.
- R2. The preset's `no-restricted-imports` composition refuses those four names and the `default` import of `react`, which also refuses every namespace import (oxlint 1.82.0, probed). The list has one owner, the plugin's exported `reactImportBanNames` (`src/index.ts:64` at `1d9e0df3de`).
- R3. `@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect` reports `import('react')` and a global `require('react')` with a literal specifier. It also reports every disable directive that turns R2's ban off: one naming the rule, one naming no rule that covers a refused `react` import, or one naming `no-restricted-imports` or `eslint/no-restricted-imports` that covers a refused `react` import. Its reference tracking and admitted hydration shape are deleted.
- R4. Every diagnostic names `ui-state/react-runs-no-effect` and the effect-atom path (`useAtomValue`, `useAtomSet`).
- R5. The Rules of React set at `cb0c704dda` is unchanged: every React `correctness` rule except `react/rules-of-hooks`, plus `react/hooks` and the eight named rules.

**Binding**

- R6. `@systemfsoftware/effect-atom-react` source and tests contain no React Effect hook and pass R1-R5 with no disable comment, override or allowlist.
- R7. `useAtomRef`, `useAtomMount`, the setter hooks and `RegistryProvider` hold subscriptions through `useSyncExternalStore`, as at `cb0c704dda`. `useAtomSubscribe` stays removed.
- R8. `HydrationBoundary` contains no Effect. During render it hydrates every dehydrated atom whose key the registry does not hold, deferred streaming entries included.
- R9. `HydrationBoundary` never writes an atom whose key the registry already holds, whether during render, at commit or later.
- R10. `RegistryProvider` disposes its registry after the existing 500 ms delay when its last subscription ends, and keeps one registry across StrictMode's double subscribe. It also disposes a registry whose creating render never committed, once that render is unreachable, and never disposes a registry a still-pending render holds.
- R11. The binding lands in layers below the preset that turns the ban on (KTD7).

**Pack**

- R12. `compound-packs/ui-state/react-runs-no-effect.md` states R1-R2 with no admitted Effect, keeps its no-inline-exception item, and records the withdrawn exception and KD2 as the reason the after-commit adoption is gone. It keeps the 2026-10-11 incidents. Its Gate question and Lint paragraph drop the hydration carve-out, so the Gate asks only whether the diff reaches a React Effect hook in any form, imports `react` through a namespace or default specifier, `import('react')` or `require('react')`, or adds a directive that turns the ban off; the question stays answerable from the diff.
- R13. The ui-state README states that the rule governs the bindings with no exception.

**Release**

- R14. Changesets: `@systemfsoftware/effect-atom-react` `patch` in L1 (KTD7: same API, a leak closed) and `major` in L2 (`useAtomSubscribe` removed; a saved page no longer overwrites held atoms); `@systemfsoftware/oxlint-plugin-effect-platform` `minor` (new rule, outside its `recommended`); `@systemfsoftware/oxlint-config-recommended` `major`.

### Acceptance Examples

- AE1. **R1-R3.** `import { useEffect } from 'react'` is reported once by the import ban. `useEffect(() => { Atom.Hydration.hydrate(registry, queue) }, [registry, queue])` with `Atom` from effect-atom is no longer admitted: its import is reported.
- AE2. **R8, R9.** A transition renders `HydrationBoundary` around a child that never finishes loading. The page still shows 18, the registry still holds 18, and an atom new to the registry arrived as 60. This is the scenario at `cb0c704dda`, `shared-values-read-write.integration.test.ts:335`, kept as is.
- AE3. **R9.** The page shows 18; a saved page carrying 23 for that atom renders and commits. The page still shows 18 after it settles. This rewrites the scenario at `:292`.
- AE4. **R10.** A `RegistryProvider` rendered only inside a transition that never commits has its registry disposed once the render is unreachable: an atom read in that render runs its finalizer. While the transition is still pending, the finalizer has not run.
- AE5. **R10.** StrictMode re-renders keep serving one registry, and an unmounted provider's registry is disposed after its delay (`keeping-registry-alive` and `shared-values-read-write` scenarios at `cb0c704dda`, unchanged).
- AE6. **R3.** A directive is reported once when it names `no-react-effect`, or when it turns off a diagnostic on a refused `react` import. A directive that covers no diagnostic is not reported: `directive-unnamed.ts` once its call line stops being diagnosed, and `directive-other-import.ts`. Each fixture's `react` import is reported by the ban unless a directive turns that diagnostic off. `import('react')` and `require('react')` are reported once each. The exact count for each fixture comes from a real oxlint run in U4, not from this list.

### Unsupported Scenario

"An atom the page already holds adopts the newer saved value once the page commits" has no zero-Effect implementation and is dropped (KD2). Evidence:

- react.dev, "Synchronizing with Effects": Effects "run at the end of a commit after the screen updates" (dossier `react-dev-grounding.md:68`). Among the sources quoted for this work, an Effect is the only React mechanism documented to run after commit.
- Running the write from a `useSyncExternalStore` `subscribe` callback or a ref callback would be the withdrawn exception under another name. The superseded plan already rejected that ("rather than running inside `subscribe` under another name", Key Decision "Registry lifetime is a subscription").
- Writing during render instead is A1, rejected below.
- Red evidence that this is the only scenario the Effect served: #765 (Problem Frame).

### Scope Boundaries

- `useAtomSuspense` subscribes during render (`hooks-suspense.ts:194`) and releases only when the promise settles. An abandoned render holds that subscription until its atom settles. This predates this plan, matches upstream, and is not changed here.
- The other ui-state rules, #759, F2 and F3 are untouched.

### Sources

- Upstream: tim-smart/effect-atom `packages/atom-react/src/ReactHydration.ts` at `2fc0f70`, lines 36-42, 77-79; TanStack/query `packages/react-query/src/HydrationBoundary.tsx` at `0fbbc62`, lines 106-112, 163-165.
- react.dev dossier `/tmp/compound-engineering-0/react-probe/react-dev-grounding.md` (session scratch, from react.dev "Synchronizing with Effects" and `useSyncExternalStore`).
- CI evidence: #764 (run `38428435406`, job `115412063030`), #765 (run `38428437461`, job `115414190397`), #766 (run `38428442254`, job `115413817253`), all closed unmerged. #768 (head `76536236f3`, existing atoms hydrated during render) is open; its result is A1's evidence and is read before it closes.
- Packs: ui-state (react-runs-no-effect.md, server-data-lives-in-atoms.md, components-perform-no-io.md); cell-architecture (pure-decision-workflows.md, scoped-lifecycle-boundaries.md); mutation-discipline (kill-survivors-with-contract-properties.md); boundary-testing (no-mocks-on-internal-glue.md, port-fakes-pass-the-port-contract.md, real-system-oracles.md); package-topology (surface-changes-are-versioned.md). storybook-testing does not apply: no story changes.

## Planning Contract

### Key Technical Decisions

- KTD1. **The partition decision becomes `HydrateDuringRender | KeepCurrent`.** `src/partition-hydrated-atoms.workflow.ts` renames `DeferUntilCommit` to `KeepCurrent`. `hydration-boundary.ts` hydrates the `HydrateDuringRender` keys inside its existing `useMemo` and returns nothing. `queueHydration`, `queueHydrationFromState`, the `existingAtoms` field of `partitionDehydratedAtoms` (`hydration-boundary.ts:38`, `:68`), the `useEffect` import and the after-commit block are deleted. The workflow stays a pure core (pack: cell-architecture, pure-decision-workflows.md), and `src/__tests__/partition-hydrated-atoms.workflow.property.test.ts` is updated to the renamed tag.
- KTD2. **An unclaimed registry is released through `FinalizationRegistry` keyed on the lease.** `makeRegistryLease` registers the lease when it first creates a registry, and the first `subscribe` unregisters it, from which point the existing subscription timer owns disposal. The callback calls `Atom.Registry.dispose` on the held registry. The registry holds no reference to the lease (`registry-context.ts:108-137`), so the lease can become unreachable only once React drops the render's state. When React does drop it, including a suspended transition's work-in-progress tree, is **unverified**, and AE4 tests that premise (KTD3). A registry disposed under a live reader throws on read (`registry-engine.ts:355-358`), so the callback must never run while a pending render can still read the registry, which is the half of AE4 that asserts the finalizer has not run.
- KTD3. **AE4 runs in real Chromium with forced GC.** It needs `gc()`, which requires the Playwright launch option `args: ['--js-flags=--expose-gc']` in `packages/atom/effect-atom-react/vitest.config.ts:18`. That option is **unverified** in this repository: U1's first step proves `typeof gc === 'function'` in a scenario. Finalizers have no guaranteed timing, so AE4 never asserts disposal without `gc()`. If the option cannot be passed, or if React keeps the dropped render's state past the test window, R10's never-committed clause is recorded as unverified ("red not shown", with no green claim), the stop condition fires, and Q3 goes to root. A fake-finalization port is not used: the subject is React's reachability, so a fake would only check its own wiring (pack: boundary-testing, no-mocks-on-internal-glue.md).
- KTD4. **AE3 rewrites the `:292` scenario in place.** It keeps the existing Given and changes the When and Then to assert that 18 remains after settle. Its red route is the same break #768 carries.
- KTD5. **The import ban carries `useEffect`.** `REACT_IMPORT_BAN_NAMES` (`no-react-effect.config.ts:6-11`) gains `useEffect`. The rule deletes `isAdmittedEffectCall`, `isHydrateCall`, `blockBodyStatementsOf`, the `Identifier` and `ExportNamedDeclaration` visitors, `EFFECT_ATOM_SOURCE`, `HYDRATE_MEMBER_SEQUENCE` and the three reach verdicts. The directive check keeps only its import-ban branch, because reach lines no longer exist. `git grep -e isAdmittedEffectCall -e HYDRATE_MEMBER_SEQUENCE` must return nothing (DEL1).
- KTD6. **Fixtures follow the rule.** `ui-state-fixture/src/react-effect/hydration*.ts` become reach fixtures reported once each by the import ban. `hydration.ts` moves from the clean list to the reported list. The RuleTester's admitted cases are deleted.
- KTD7. **#763 is restacked into four layers, without force-push (OP13b).** Each layer is a branch cut from `origin/main` by cherry-picking #763's commits plus the new ones, and the plain-merge mechanics follow:
  - **L1 `packs/effect-atom-react-sync-store`** (effect-atom-react, `patch`): `e38f707efc`, `7481b9f94b`, `0010eb3d76`, `fe9a00fd5d`, `13f9e514f2`, plus U1.
  - **L2 `packs/zero-effect-hydration`** (effect-atom-react, `major`): `c81c801519` without its hydration hunk, `9c5cea78b6`, `cb0c704dda`, plus U2.
  - **L3 `packs/no-react-effect-rule`** (plugin, `minor`): `b8e397b399`, `9d429787ce`, `9bb61d25ed`, plus U3.
  - **L4 = #763 `packs/react-no-effect`** (preset, pack and this plan): its base moves to L3 with `gh stack link`, then L3 is plain-merged into it. The cherry-picked content equals #763's, so only the new hunks merge.

  L1 ships alone as a fix; L2 is the breaking binding change; L3 is opt-in; L4 turns the ban on. A revert of L4 leaves the binding fixed. Rejected: keeping #763 as one PR (A7).

### Rejected Alternatives

| #  | Alternative                                                                          | Why rejected                                                                                                                                                                                   |
| -- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 | Hydrate existing atoms during render                                                 | Mounted components read the value during render, so an abandoned transition overwrites the current page. Upstream names this hazard (`ReactHydration.ts:36-42`). #768 measures it against AE2. |
| A2 | Write existing atoms from a `useSyncExternalStore` `subscribe` or a ref callback     | The withdrawn Effect under another name (Unsupported Scenario).                                                                                                                                |
| A3 | Remove `HydrationBoundary`; callers hydrate before render                            | The SSR handoff and streaming scenarios already work through it, and new-atom render hydration is upstream's documented-safe path; removal changes the API for no gain. Kept as a root option. |
| A4 | Hydrate existing atoms during render only when unmounted, or newer by `dehydratedAt` | Still a write during render. It needs a listener-count read not shown in the registry's public API (unverified), and nothing needs it.                                                         |
| A5 | Dispose an unclaimed registry on a timer, fixed or re-armed per render               | Strands a transition still suspended on the registry: the suspense promise resolves only through `Atom.Registry.subscribe` (`hooks-suspense.ts:194`).                                          |
| A6 | Keep the plugin's `useEffect` reach detection beside the import ban                  | Reports every site twice.                                                                                                                                                                      |
| A7 | Keep #763 as one PR                                                                  | It carries four concerns across three packages; OP13b asks for one per layer. Cost of restacking: three new PRs and a fresh review per layer.                                                  |

### Implementation Units

- **U1 (L1). Release an unclaimed registry.** Files: `packages/atom/effect-atom-react/src/registry-context.ts`, `vitest.config.ts` (launch option, KTD3), `tests/keeping-registry-alive.integration.test.ts`, `.changeset/<new>.md` (`patch`). Test scenarios: "A provider whose page is abandoned before it shows releases its data source" (AE4); the existing StrictMode and unmount scenarios unchanged (AE5). Verification: the package's forced turbo `build typecheck lint test`; red through a deliberate-red PR that removes the registration.
- **U2 (L2). Zero-effect HydrationBoundary.** Files: `src/hydration-boundary.ts`, `src/partition-hydrated-atoms.workflow.ts`, `src/__tests__/partition-hydrated-atoms.workflow.property.test.ts`, `tests/shared-values-read-write.integration.test.ts` (AE3 rewrite; AE2 kept), `etc/effect-atom-react.api.md`, `.changeset/quiet-hooks-subscribe.md` (names KD2's behaviour change). Test scenarios: "A saved page does not overwrite a value the page already shows" (AE3); AE2; `restoring-saved-state` and `ssr` unchanged. Verification: forced turbo; `git grep -n useEffect -- packages/atom/effect-atom-react` returns nothing; mutation run on the workflow (pack: mutation-discipline); red for AE3 and AE2 through #768's break.
- **U3 (L3). Shrink `no-react-effect`.** Files: `packages/oxlint-plugin/oxlint-plugin-effect-platform/src/rules/no-react-effect{,.config}.ts`, its RuleTester file, `README.md`, `etc/*.api.md`, `.changeset/eager-pandas-aim.md`. Test scenarios: RuleTester for module loads and every directive branch; admitted cases deleted. Verification: forced turbo; DEL1 grep (KTD5).
- **U4 (L4). Preset and fixtures.** Files: `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` (import-ban message names `useEffect`), `tests/react-effect.test.ts`, `ui-state-fixture/src/react-effect/hydration*.ts`, `ui-state-fixture/src/react-effect/directive-*.ts` (expectations from a real run, AE6), `.changeset/strict-react-rules.md`. Verification: forced turbo; repo-wide `pnpm turbo run lint` (no package reaches `useEffect`).
- **U5 (L4). Pack.** Files: `compound-packs/ui-state/react-runs-no-effect.md`, `compound-packs/ui-state/README.md`. Verification: `./bin/dprint check`; the structural privacy check over the pack and changesets.
- **U6. Stack mechanics.** `gh stack init` for L1-L3, `gh stack link` with #763 on top, both OP13b checks before every push, and plain merges only. #768 is read, then closed with its branch deleted; the `/tmp/compound-engineering-0/red4-clone` scratch clone is removed.

### Verification Contract

- Per layer: forced turbo `build typecheck lint test` for its packages; `pnpm gate:repo` (single-plan holds: one plan in L4, none below); `./bin/dprint check`; changesets pass `check_changeset.ts`.
- Red evidence only through unmodified pre-fix commits or throwaway deliberate-red PRs closed afterward; otherwise the exact text "red not shown". No local mutation.
- Full-path report-only ce-code-review per layer at its exact head, with a DeepSeek V4.1 Flash peer through omp, every finding ruled, and green CI at that head.

### Test Admission

Each proposed test went through the test-layer admission gate, which defaults to refusal:

- **AE3 (rewritten scenario):** admitted as a browser integration scenario. It pins a consumer-visible behaviour change (KD2) that a regression back to adoption would break.
- **AE4 (new scenario):** admitted as a browser integration scenario. A leaked registry keeps consumer work running, and only real React and real GC can show it.
- **Workflow property test (renamed tag):** admitted. It keeps the pure core's contract.
- **RuleTester cases:** kept for the remaining branches; the admitted-shape cases are deleted.
- **Refused:** a fake-finalization unit test (it checks its own wiring); a test asserting that `HydrationBoundary` imports no `useEffect` (that is source text, and the lint already enforces it).

### Assumptions Attacked

- **"Zero Effects means removing `HydrationBoundary`":** broken. New-atom hydration during render needs no Effect, and upstream does exactly that (KD1).
- **"Something must still adopt saved values after commit":** broken. Only one scenario and no consumer depends on it (Problem Frame consumer search, #765).
- **"A timer can release a registry nobody claimed":** broken. A suspended transition holds the registry through a subscription a timer cannot see (A5).
- **"The plugin rule must still track `useEffect` references":** broken. With no exception, the import is always refused first (KD4).

No software-wiki entry covers hydration or finalization (three queries, no results, 2026-10-13).

### Definition of Done

R1-R14 hold and AE1-AE6 are exercised; every layer is green at its reported head; no React Effect hook remains in the repository outside vendored `repos/`; each PR body declares the zero-exception rule and the dropped scenario with its evidence. The root merges bottom-up.

### Open Questions for Root

- Q1. Approve the four-layer restack (KTD7), or keep #763 as one PR with new commits on top?
- Q2. Accept KD2: a saved page never overwrites an atom the page already holds, which drops the after-commit adoption scenario.
- Q3. If AE4 cannot force GC here, or React keeps the dropped render's state past the test window, R10's never-committed disposal ships unverified or the layer stops. Which does root choose?
- Q4. Reconcile this derivation with the zero-effect synthesis that did not reach this session.
