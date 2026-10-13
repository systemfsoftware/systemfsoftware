---
title: Zero-effect hydration and owner-held registries - Plan
type: feat
date: 2026-10-13
topic: zero-effect-hydration
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-13-1718-feat-zero-effect-hydration-plan.md
---

# Zero-effect hydration and owner-held registries - Plan

Supersedes the 2026-10-13 17:18 plan, which superseded the 09:44 plan. This plan adds the root's three accepted points on islands, island teardown and the server-snapshot seam (Islands), and the consumer migrations in R14. It moves R13 to the storybook-testing pack PR and records U0 as done. It applies to PR #763 at `e156d3a6f6`; no implementation unit beyond U0 has started.

## Goal Capsule

- **Objective:** React code in every repository that extends `@systemfsoftware/oxlint-config-recommended` reaches no React Effect hook, with no exception, and the effect-atom React binding keeps its subscriptions, server handoff and disposal without one.
- **Means:** the code that mounts the app or island owns the registry. It creates the registry, seeds or hydrates it before the first render, and disposes it. `RegistryProvider` only provides a registry it is given. The binding creates no registry and writes no registry state during render: `HydrationBoundary` and `useAtomInitialValues` are removed. After commit, the only saved-data write is the engine's own completion of deferred entries (After-commit flow), made outside React. `useEffect` joins the preset's import ban.
- **Product authority:** the root reconciliation of 2026-10-13: the hydration synthesis and the answers to Q1-Q3, the withdrawal of the one-Effect exception (2026-10-13 17:11), and Ryan's no-Effect ruling. Repository law (`CONSTITUTION.md`, `repos/constitution/ENFORCEMENT.md`) outranks this plan.
- **Delivery:** #763 stays one PR. New commits go on top, with plain merges of `origin/main`, no force-push and no history rewrite.
- **Stop conditions:** an acceptance example that cannot be shown both green and red through an allowed route; a CONST article that forbids a requirement; a consumer the organization search missed.
- **Open blockers:** root and Younna root review this plan. No implementation starts before both approve.

## Product Contract

### Summary

A registry belongs to whatever mounts the app: an Astro island's module, an SPA's entry, a per-request SSR handler, or a Storybook story's loader. That owner creates the registry, seeds or hydrates it before the first render, passes it to `RegistryProvider`, and disposes it at teardown; an island's teardown is the document's unload (Islands). The binding never creates, writes or disposes a registry. Saved data reaches the page before its first render. The one later write completes a pending entry from the same server render, so saved data never overwrites a value the client already shows. React code has no Effect hook to reach.

### Problem Frame

**The effect sites cited at `0923912e`, mapped to `#763` at `cb0c704dda`:**

| Site at `0923912e`                                                | At `cb0c704dda`                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `hydration-boundary.ts:145` after-commit `Atom.Hydration.hydrate` | still an Effect at `hydration-boundary.ts:133-135`; the last React Effect in the repository                                       |
| `hooks-ref.ts:32`                                                 | `useSyncExternalStore` with a cached snapshot (`hooks-ref.ts:55`; `13f9e514f2`)                                                   |
| `hooks-value.ts:118` mount keep-alive                             | a `useSyncExternalStore` subscription (`hooks-value.ts:114-120`)                                                                  |
| `hooks-value.ts:310` `useAtomSubscribe`                           | removed from the public API (`c81c801519`)                                                                                        |
| `registry-context.ts:181` disposal on unmount                     | a lease that subscribes with a 500 ms delayed dispose (`registry-context.ts:87-168`); the registry is still created during render |

**A registry created during render is broken, not merely leaky.** react.dev, `<Suspense>` caveats: "React does not preserve any state for renders that got suspended before they were able to mount for the first time. When the component has loaded, React will retry rendering the suspended tree from scratch." `RegistryProvider` keeps its lease in `useState` (`registry-context.ts:165`), and each registry stores its own suspense promises (`hooks-suspense.ts:63-71`). A probe at `cb0c704dda` in real Chromium, run uncommitted and then deleted, put a provider below a `Suspense` boundary and suspended its child on a 50 ms atom.

| Layout                                | Atom starts                        | Registries | Value shown |
| ------------------------------------- | ---------------------------------- | ---------- | ----------- |
| Provider below the boundary           | 6, still going when the wait ended | 6          | never       |
| Control: boundary inside the provider | 2                                  | 1          | `7`         |

None of those six registries was ever subscribed, so none is ever disposed. A render that never commits gives no signal at all: `subscribe` is never called, and no React callback marks a discarded render. A registry read during such a render also keeps its nodes running: `Registry.get` creates a node without scheduling its removal (`registry-engine.ts:567`), and only an unsubscribe schedules removal (`:628-633`).

**Render-time writes outlive the render.** `useAtomInitialValues` seeds during render and keeps the first seed for each atom (`hooks-value.ts:40-80`, `seedInitialValueIfNew`). `HydrationBoundary` hydrates new atoms during render. Once the registry outlives renders, a seed written by an abandoned render stays, and the committed render's seed is ignored.

**Consumers.** In this repository, `HydrationBoundary` appears only in the package's own source, its API report, three of its test files, the ui-state rule and plans (`git grep HydrationBoundary -- ':!repos/'`). `useAtomInitialValues` appears only in the package and its tests. `RegistryProvider` appears in the package, its tests, its README, two storybook-testing rules and one ui-state rule. The organization search is in Consumer Search.

### Key Decisions

- **KD1. #763 stays one PR** (root-directed, Q1). Considered: OP13b asks for one concern per stack layer. Against layering: every binding change here depends on the next. The owner registry removes the lease the old plan's standalone patch layer would have fixed. Hydration moves to the owner because the provider no longer creates. The ban needs all of it at once. Rejected: the four-layer restack (A7).
- **KD2. Saved data never overwrites a value already on screen** (root-directed, Q2). Challenged with evidence: no house stack produces streamed re-hydration (synthesis), and no consumer exists (Consumer Search). With the binding writing nothing, overwriting is impossible through the binding. The major changeset and the README's hydration section state it. Governs R10, R14.
- **KD3. The owner creates and disposes the registry; `RegistryProvider` requires a `registry`** (root-preferred, Q3; derived from the probe). A reference count driven by `useSyncExternalStore` handles StrictMode, but it cannot see a render that never commits, and it cannot stop the per-retry re-creation the probe shows. Rejected: a timer (A5) and `FinalizationRegistry` (A6). The owner composes the registry in the app's Layer with `Atom.Registry.layer`, which disposes when its scope closes (`registry.handle.ts:208-221`), or calls `Atom.Registry.make` and `Atom.Registry.dispose` (`:133`, `:428`) at mount and teardown. Grounding: the software wiki's composition-root rule (kb://software/fcis), "One composition root per process; interpret at the edge ... not inside a reentrant callback". Also kb://software effect-cache-and-the-impure-shell-discipline: "When an application must run inside a framework it does not own (React, ...), the top-level runtime is created explicitly with `ManagedRuntime.make` — the framework entry point is where the Effect program is interpreted, not inside a nested callback." Render is such a callback. Governs R8, AE2-AE5.
- **KD4. `HydrationBoundary` is removed; its new-atom-only path is rejected** (derived). The path is upstream's (tim-smart/effect-atom `ReactHydration.ts:36-42` at `2fc0f70`; TanStack/query `HydrationBoundary.tsx:106-112` at `0fbbc62`), and the synthesis lists it as one professional seam. Here it is a render-time write into a registry that outlives the render, with no consumer and no house stack that delivers data after mount. Hydration moves before the first render (R10). Governs R9.
- **KD5. `useAtomInitialValues` is removed** (derived). Seeds move to `Atom.Registry.make({ initialValues })` at the owner, the store-creation seam the synthesis lists first. Governs R9.
- **KD6. `useEffect` joins the import ban, and `no-react-effect` keeps only what the ban cannot see** (carried over). With no exception, every `useEffect` reach starts at an import the ban refuses. Governs R2, R3.

### Before-commit hydration

Hydration is a write the owner makes before the first render that reads the registry, in one of three forms:

1. **Seeds:** `Atom.Registry.make({ initialValues })` for typed values the owner already holds, such as an app entry's Layer choice or a story's fakes. An island's props are not seeds (I2).
2. **Saved state:** `Atom.Hydration.hydrate(registry, state)` on state the server produced with `Atom.Hydration.dehydrate`, called before `hydrateRoot` or `createRoot(...).render`.
3. **Routed apps:** the router's own hydrate option, run before render. This is a consumer seam; the binding ships nothing for it.

**After-commit flow.** `Atom.Hydration.hydrate` also writes later, outside React, for one thing only: an entry the server dehydrated while still pending is completed when the server's promise resolves (`registry.handle.ts:932-946`). That write is unconditional (`registry-engine.ts:161-171`). It finishes the same server render rather than delivering a second saved page, and React sees it through `useSyncExternalStore` like any other registry update. Its scenario stays (`ssr.integration.test.ts:212`).

### Islands

Settled with the root on 2026-10-13. Astro sources are cited at withastro/astro `3310450`.

- **I1. A prop-less island's registry is made at module scope.** The island's module calls `Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask })` at import, and its root component renders `RegistryProvider` with that registry. The module is imported before Astro's React renderer calls `createRoot` or `hydrateRoot` (`packages/integrations/react/src/client.ts:121-138`), so the registry exists before any render. A first mount that suspends retries against the same registry, which AE4 shows for any registry made outside render. Every instance of the island on a page shares the registry. That is Astro's own recipe for state shared across islands: a store defined at module scope in a separate file (https://docs.astro.build/en/recipes/sharing-state-islands/).
- **I2. A supported island takes no server-data props.** No supported island seeds an atom from its props. A prop reaches the island only inside the renderer's `startTransition` render (`client.ts:111-115`, `:121-138`). That leaves render as the only place a props-seeded registry could be made, which is what the probe showed broken (Problem Frame), and Astro runs no consumer code with the props before `createRoot`. An island's server data comes through its atoms over the app runtime's services. Props that seed no atom, such as a label or an id, are unaffected. An island that needs server-rendered data as seeds is outside this plan: it needs its own plan, naming a creation site and proving it under a suspending first mount.
- **I3. `Atom.withServerValue` stays the server-snapshot seam.** With `client:load`, `client:idle` or `client:visible`, Astro also renders the island on the server. There, the module-scope registry is one per server process or build, shared by every request or page. React reads a store during server render and hydration through `getServerSnapshot`, which the binding keeps as `Atom.getServerValue` (`hooks-value.ts:24`, unchanged). That function reads the atom's `withServerValue` target when present. Otherwise it falls back to `Registry.get`, which creates a node in the shared registry (`registry.handle.ts:273-278`); the node is never unsubscribed on the server, so it is never removed (`registry-engine.ts:567`). So every atom an island reads during a server render carries `Atom.withServerValue` with a request-independent value, or `Atom.withServerValueInitial` for a result atom, and that read touches no atom without one. The alternative is `client:only="react"`, which never renders on the server (`client.ts:121-129`). The existing scenario (`ssr.integration.test.ts:70`) keeps covering the seam.
- **I4. An island's teardown is the document's unload.** The renderer unmounts an island's root on `astro:unmount` (`client.ts:125`, `:134`). A ClientRouter swap fires that event for every island not carried over by `transition:persist` (`astro-island.ts:58-61`, `:266-269`), and stateful islands are never persisted. On unmount, `useSyncExternalStore` unsubscribes and the registry schedules each node left without a listener for removal (`registry-engine.ts:628-633`). Removal runs the node's finalizers (`atom-node.ts:438-442`), which interrupt an effect atom's fiber unless the atom is uninterruptible (`atom.blueprint.ts:1978-1983`, `:2049-2065`). A `keepAlive` atom is pinned (`atom-node.ts:375-381`): its fiber and values live as long as the module-scope registry, which a swap does not end. A later page that mounts the same island reads them. Live fibers need no handling beyond this. No island calls `Atom.Registry.dispose`, and the document's unload ends the registry.

### Requirements

**Effect ban**

- R1. No module calls or references `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react`, in any form. There is no exception.
- R2. The preset's `no-restricted-imports` composition refuses those four names and the `default` import of `react`, which also refuses every namespace import (oxlint 1.82.0, probed). The plugin's `reactImportBanNames` is the one list.
- R3. `no-react-effect` reports `import('react')` and a global `require('react')` with a literal specifier. It also reports every directive that turns R2's ban off: one naming the rule, one naming no rule that covers a refused `react` import, and one naming `no-restricted-imports` or `eslint/no-restricted-imports` that covers a refused `react` import. Its reference tracking and admitted hydration shape are deleted.
- R4. Every diagnostic names `ui-state/react-runs-no-effect` and the effect-atom path (`useAtomValue`, `useAtomSet`).
- R5. The Rules of React set at `cb0c704dda` is unchanged.

**Binding**

- R6. `@systemfsoftware/effect-atom-react` source and tests contain no React Effect hook and pass R1-R5 with no disable comment, override or allowlist.
- R7. `useAtomRef`, `useAtomMount` and the setter hooks hold their subscriptions through `useSyncExternalStore`, as at `cb0c704dda`. `useAtomSubscribe` stays removed.
- R8. `RegistryProvider` takes a required `registry` and provides it. It creates, seeds and disposes nothing. `RegistryProviderOptions`' creation options leave the API, and so does the lease. `AtomReact.scheduleTask` stays exported, so an owner keeps React's low-priority scheduling: today `RegistryProvider` passes it by default (`registry-context.ts:92-101`), while a bare `Atom.Registry.make` falls back to the host dispatcher (`registry-engine.ts:520`).
- R9. The binding writes no registry state during render: `HydrationBoundary`, `HydrationBoundaryProps`, `useAtomInitialValues`, the partition workflow and its property test are removed.
- R10. The binding's README documents before-commit hydration in the three forms above, the deferred-entry flow, the owner's `scheduleTask: AtomReact.scheduleTask`, the island pattern (I1-I4), and the sentence "Saved data reaches a registry before the first render; the binding never writes saved data, so it never overwrites a value already on screen."
- R11. Every scenario that used `RegistryProvider`'s creation options, `HydrationBoundary` or `useAtomInitialValues` gets an owner instead: a scenario layer creates the registry, seeds or hydrates it before rendering, and disposes it in its finalizer. The exceptions are the two `shared-values-read-write` scenarios retired under the declared CONST-T8 waiver (Acceptance Examples).

**Packs**

- R12. `compound-packs/ui-state/react-runs-no-effect.md` states R1-R2 with no admitted Effect, and keeps its no-inline-exception item and its 2026-10-11 incidents. It records why `HydrationBoundary`'s after-commit Effect is gone (KD2), and that the engine's deferred-entry completion remains outside React. Its Gate and Lint lines drop the hydration carve-out, and the Gate stays answerable from the diff. `compound-packs/ui-state/README.md` states that the rule governs the bindings with no exception.
- R13. The storybook-testing rules' move to an owner outside render ships in its own pack PR (branch `packs/storybook-registry-owner`), which lands before #763. A story's loader builds its registry, the decorator provides it, and the cleanup `beforeEach` returns disposes it. That PR also updates `compound-packs/ui-state/components-dispatch-to-runtime-atoms.md`'s `RegistryProvider` sentence. #763 edits none of those files and is graded against them once that PR merges.

**Release**

- R14. `.changeset/quiet-hooks-subscribe.md` (`@systemfsoftware/effect-atom-react`, `major`) names every removal (`useAtomSubscribe`, `HydrationBoundary`, `useAtomInitialValues`, `RegistryProvider`'s creation options) and R10's sentence. It names the consumer migration for each owner:
  - an island: a module-scope `Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask })`;
  - an app entry: `Atom.Registry.make({ initialValues, scheduleTask: AtomReact.scheduleTask })`, plus `Atom.Hydration.hydrate` for saved state, before `createRoot` or `hydrateRoot`;
  - a catalogue: each story's registry built in the story's loader, provided by the decorator, and disposed by the cleanup `beforeEach` returns.

  A consumer with a bare `RegistryProvider` or `RegistryProvider initialValues` migrates when it takes this major on its catalog bump, and does not block this merge (root, 2026-10-13). `.changeset/eager-pandas-aim.md` (`@systemfsoftware/oxlint-plugin-effect-platform`, `minor`) and `.changeset/strict-react-rules.md` (`@systemfsoftware/oxlint-config-recommended`, `major`) drop the admitted `Atom.Hydration.hydrate(registry, queue)` exception and the reach-tracking sentence, matching R1-R3.

### Acceptance Examples

- AE1. **R1-R3.** `import { useEffect } from 'react'` is reported once, by the import ban.
- AE2. **R7, R8: StrictMode double subscribe.** Under `StrictMode`, a widget mounts an atom with a finalizer in an owner registry. After the double subscribe settles, the atom has computed once and not been released, and every render saw the owner's registry.
- AE3. **R8: a render that never commits.** A transition renders a page that reads an atom with a finalizer and then suspends forever, so it never commits. Every render saw the owner's registry, and React created none. When the owner unmounts the root and disposes the registry, the finalizer runs.
- AE4. **R8: a suspended first mount** (the probe). A provider sits below a `Suspense` boundary with an owner registry. Its child's first mount suspends on a slow atom. The value shows, every render saw the one registry, and the atom ran once per retry at most.
- AE5. **R8: unmount.** Unmounting the root disposes nothing: the registry still reads values. The owner's `Atom.Registry.dispose` releases the atom.
- AE6. **R10, R11: hydration before render.** An owner hydrates saved state for an atom, then renders. The page shows the saved value in its first commit (rewrite of `restoring-saved-state.integration.test.ts:19`). SSR serves a per-request registry; the client hydrates before render, and deferred entries complete when the server promise settles (`ssr.integration.test.ts:116`, `:212`, rewritten).
- AE7. **R3.** A directive is reported once when it names `no-react-effect`, or when it turns off a diagnostic on a refused `react` import. A directive covering no diagnostic is not reported. Each fixture's expectation comes from a real oxlint run.

**Declared CONST-T8 waiver.** `HydrationBoundary`'s handling of atoms the page already holds is removed with no replacement, as KD2 decides. Two scenarios are retired with it: `shared-values-read-write.integration.test.ts:292` (after-commit adoption) and `:335` (an abandoned transition leaves existing atoms alone). No published name will write saved data into a live registry from React, so these observables have no new path to pin, and a test that the API is absent would pin source text. This plan and the PR body declare the breach, naming CONST-T8 and this case (`repos/constitution/ENFORCEMENT.md:197-203`, waiver clause). R10 and R14 carry the statement in its place.

Every other replaced operation is pinned before its old path is deleted (U2). The pinned observables are:

- a saved value for a fresh atom showing in the first commit;
- a boundary without saved state leaving values alone;
- SSR markup;
- deferred completion;
- first-seed-wins seeding.

### Consumer Search

Searched on 2026-10-13 for `HydrationBoundary`, `useAtomInitialValues`, `useAtomSubscribe`, `RegistryProvider`, `effect-atom-react`, `@effect/atom-react` and `@effect-atom/atom-react`.

- **This repository** (`cb0c704dda`): see Problem Frame.
- **The 16 other `systemfsoftware` repositories visible to the delivery token**, each shallow-cloned at its default-branch head into `/tmp/repos/systemfsoftware__<name>` and searched with `git grep` (the token lists 21 repositories; the other 4 are forks of these under the bot account, and `.github` is empty): no consumer of `@systemfsoftware/effect-atom-react` and no use of `HydrationBoundary`. Every hit is one of these:
  - a vendored copy of upstream Effect (`are-the-types-wrong-effect`, `repos/effect/packages/atom/...`);
  - documentation or examples for upstream `@effect/atom-react` (`xstate` `packages/xstate-effect/docs/atoms-and-react.md`; the `alchemy` fork's examples);
  - an unrelated schema-registry `RegistryProvider` (`alchemy` `packages/alchemy/src/{AWS,GCP}/`).

  None of these depends on this fork, so the major release cannot break them.
- **Private product repositories:** not reachable from this session. The delivery token lists no private repository and no organization membership (GitHub GraphQL `viewer`, 2026-10-13), and no local clone exists. The root's synthesis reports no `HydrationBoundary` use there, and one bare `RegistryProvider` that is being removed. R8 breaks a bare `RegistryProvider`; that consumer migrates when it takes this major on its catalog bump, and does not block this merge (R14).

No producer of streamed re-hydration was found, so the stop condition does not fire.

### Where This Plan Departs from the Synthesis

- **Registry disposal.** The synthesis offers the owner or a subscribe/unsubscribe reference count. The count is not a second option: the existing lease already counts subscriptions, and the probe shows it fails on a suspended first mount. Only the owner holds. The lease is deleted, not kept beside the owner.
- **`RegistryProvider initialValues` as a store-creation seam.** The synthesis lists it with Redux's `preloadedState`. Here the store is created in render state, which React discards on a suspended first mount (probe), so the seam moves to `Atom.Registry.make` at the owner.
- **Render-time writes for unobserved atoms** (Jotai `useHydrateAtoms`, TanStack's new-query path). Rejected for this binding: the owner's registry outlives the render, and the first seed wins (KD4, KD5).
- **"Hydration only before render."** It is true for the binding. `Atom.Hydration.hydrate` still completes pending entries after commit, outside React, and the plan names that flow instead of hiding it.

### Scope Boundaries

- `effect-atom`'s registry engine is unchanged. A node read in a render that never commits keeps running until its registry is disposed (`registry-engine.ts:567`), which is upstream behaviour. The owner's disposal bounds it to the registry's life, and AE3 shows that bound.
- An Astro island that seeds atoms from server-data props is unsupported (I2).
- PR #759 and the root's open work items F2 and F3 are untouched.

## Planning Contract

### Rejected Alternatives

| #  | Alternative                                                                      | Why rejected                                                                                                                                                    |
| -- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 | Hydrate existing atoms during render                                             | An abandoned transition overwrites the page: #768 measured "shows \"23\", not \"18\"" (Evidence Ledger). Upstream names the hazard (`ReactHydration.ts:36-42`). |
| A2 | Write existing atoms from `useSyncExternalStore`'s `subscribe` or a ref callback | The withdrawn Effect under another name.                                                                                                                        |
| A3 | Keep `HydrationBoundary`'s new-atom-only path                                    | A render-time write that outlives the render, with no consumer (KD4).                                                                                           |
| A4 | Keep the subscription lease as the only disposal                                 | Blind to renders that never commit, and re-created on every suspended retry (probe).                                                                            |
| A5 | Dispose an unclaimed registry on a timer                                         | Disposes a registry a pending suspense promise subscribes to (`hooks-suspense.ts:194`).                                                                         |
| A6 | `FinalizationRegistry` on the lease                                              | Its only proof needs forced GC (root, Q3).                                                                                                                      |
| A7 | Restack #763 into four PRs                                                       | Root, Q1, and KD1.                                                                                                                                              |
| A8 | Keep `useAtomInitialValues`                                                      | A render-time seed that outlives an abandoned render, and first-write-wins (KD5).                                                                               |

### Implementation Units

All units land as commits on #763, in this order. U3 and U4 land as one commit.

- **U0. Storybook owner check. Done** (2026-10-13, Storybook 10.6.0, real Chromium under `@storybook/addon-vitest`; the probe was deleted after it ran). A registry built in the story's loader was the same object through a suspended first mount: `beforeEach`, the decorator and the render all saw it, and the cleanup `beforeEach` returned disposed it before the next story. A registry kept in component state was created twice, and the first was never disposed. The evidence and the rule text live in the pack PR (R13).
- **U1. Owner-held registries.** Files: `packages/atom/effect-atom-react/src/registry-context.ts`, `src/AtomReact/mod.ts`, `etc/effect-atom-react.api.md`, `tests/__fixtures__/registry-wrapper.ts`, `tests/keeping-registry-alive.integration.test.ts`, every test that renders `RegistryProvider` (`shared-values-read-write`, `suspense-thenable`). Scenarios: AE2-AE5. The probe's measured failure is AE4's red, shown through a deliberate-red PR that puts the lease back.
- **U2. No render-time writes, in two commits.**
  - **Commit A** adds owner-path scenarios beside the existing ones, with the same inputs and expected values: saved state hydrated before render (`restoring-saved-state`), SSR with a per-request registry (`ssr` `:116`, `:212`), and seeding through `Atom.Registry.make({ initialValues })` (`seeding-shared-values`). It runs green beside the old scenarios.
  - **Commit B** deletes `src/hydration-boundary.ts`, `src/partition-hydrated-atoms.workflow.ts`, `src/__tests__/partition-hydrated-atoms.workflow.property.test.ts`, `useAtomInitialValues`, the old-path scenarios and the two waived scenarios. It also updates `README.md` (R10).

  Red for AE6 comes from a deliberate-red PR that drops the owner's hydrate call. A DEL1 grep for `HydrationBoundary`, `useAtomInitialValues` and `partitionHydratedAtoms` outside `repos/` and `docs/plans/` must return nothing.
- **U3+U4. Ban flip, rule, preset and fixtures, as one commit.** The ban flip and the fixture expectations it changes are one behaviour change, so they land together and the per-commit gate holds.
  - **Files:** `packages/oxlint-plugin/oxlint-plugin-effect-platform/src/rules/no-react-effect{,.config}.ts`, its RuleTester file, `README.md`, `etc/*.api.md`, `.changeset/eager-pandas-aim.md`; `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`, `tests/react-effect.test.ts`, `ui-state-fixture/src/react-effect/{hydration*,directive-*}.ts`, `.changeset/strict-react-rules.md`.
  - **Change:** `useEffect` joins `REACT_IMPORT_BAN_NAMES`, and the reach detection and admitted shape are deleted.
  - **Verification:** AE1 and AE7; a DEL1 grep for `isAdmittedEffectCall` and `HYDRATE_MEMBER_SEQUENCE` returns nothing; a repo-wide `pnpm turbo run lint --force` passes.
- **U5. Packs.** R12. R13 is the pack PR's.
- **U6. Changesets.** R14, validated with the author-changesets checker (`/root/.omp/agent/skills/author-changesets/scripts/check_changeset.ts`) and CI's Changeset Check.
- **U7. Delivery evidence.**
  - Record the consumer search (Consumer Search) in the PR body by count and kind, without private names.
  - Cite #764-#766 and #768 in the PR body from the Evidence Ledger. All four are closed unmerged with their branches deleted.
  - Merge `origin/main` before the final review.

### Test Admission

- **Admitted:** AE2-AE5 as browser integration scenarios, since consumer-visible lifetime rides on real React and real StrictMode with no GC; AE6 as integration scenarios rewritten around the owner; AE1 and AE7 as preset tests that lint planted fixtures with a real oxlint run; the RuleTester cases.
- **Refused:** a test asserting that removed exports are absent (source text; the API report and typecheck cover it); a fake-finalization test; any island test. Islands are a consumer pattern that ships no binding code. I1's suspended first mount is AE4 with a registry made outside render, I3's seam keeps `ssr.integration.test.ts:70`, and I4 is engine behaviour this PR does not change.

### Assumptions Attacked

- **"A registry made at import exists once, before render."** Broken on the server: an island's module is imported once per server process or build, so its registry is shared across requests. Astro's guidance warns the same of module stores, and request-scoped Nanostores exist to fix it (https://docs.astro.build/en/recipes/sharing-state-islands/, https://inox-tools.fryuni.dev/request-nanostores). I3 confines the server read to `withServerValue`, or the island to `client:only`.
- **"Page unload is an island's teardown."** Partly broken: a ClientRouter swap unmounts an island without unloading the document. I4 states what the registry releases on unmount and what `keepAlive` keeps.
- **"Island props can seed the registry."** Broken: props exist only inside the island's first render (I2).
- No software-wiki entry covers islands or module-scope stores (three queries, no results, 2026-10-13).

### Evidence Ledger

- #764, red: `useAtomMount` never releases. Run `38428435406`, job `115412063030`: 1 failed / 62 passed.
- #765, red: `HydrationBoundary` drops its after-commit hydrate. Run `38428437461`, job `115414190397`: 1 failed / 62 passed.
- #766, red: `no-react-effect` without the directive guard. Run `38428442254`, job `115413817253`: 8 failed / 72 passed.
- #768, red: existing atoms hydrated during render. Run `38436211263`, job `115449761976`: 1 failed / 63 passed, "A saved page whose loading is abandoned leaves the value already on screen alone" ("shows \"23\", not \"18\"").

All four are closed unmerged, with their branches deleted.

### Verification Contract

- After each commit: forced `pnpm turbo run build typecheck lint test` for the three packages, `pnpm gate:repo`, `./bin/dprint check`, and the author-changesets checker on every changeset.
- Red evidence comes only from deliberate-red PRs that are closed unmerged afterward, never from local mutation. Without one, the text says "red not shown".
- At the final head, a full-path, pack-aware, report-only ce-code-review runs with a named DeepSeek V4.1 Flash peer through omp. MiniMax is used only if a route exists on the host. Every finding is fixed, rejected with evidence, or owned as a follow-up, and the PR body has no residual section.
- The PR body carries the ce-compound call, the privacy grep result, the organization consumer search by count and kind, and green CI at the exact head.

### Definition of Done

R1-R14 hold, and AE1-AE7 are exercised at the final head. No React Effect hook remains outside vendored `repos/`, and no binding API creates or writes a registry during render. The root merges.
