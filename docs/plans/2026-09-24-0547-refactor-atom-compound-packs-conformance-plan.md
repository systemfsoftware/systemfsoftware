---
title: packages/atom Compound-Packs Conformance - Plan
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
date: 2026-09-24
type: refactor
topic: atom-compound-packs-conformance
execution: code
---

# packages/atom Compound-Packs Conformance - Plan

## Goal Capsule

- **Objective:** Consumers of `@systemfsoftware/effect-atom` and `@systemfsoftware/effect-atom-react` get a reactive toolkit that holds no process-global state, refuses malformed hydration payloads visibly, tells each listener about every change it watches exactly once after the write that caused it, and follows the same `compound-packs` design law as every conformant sibling.
- **Means:** Repair the verified violations in the current topology first, then decompose both packages into role-named modules behind one namespace barrel each, then add the schema-law, refusal, and type-surface layers (KD4, KTD1-KTD9). Then fix propagation against a model spec this repo owns and measure the engine with CI mutation testing (KD9, KD10, KTD13, KTD17).
- **Product Authority:** The two declared Compound Packs (`cell-architecture`, `boundary-testing`), the root `AGENTS.md` standing laws (use of `@systemfsoftware/effect-schema-vite`), and the precedent established by `docs/plans/2026-09-23-1600-refactor-discern-cell-architecture-plan.md`. This plan governs `packages/atom/effect-atom` and `packages/atom/effect-atom-react` together; other packages are not active scope.
- **Execution profile:** `ce-work` via `lfg`, one branch, one pull request; units land in U-ID dependency order as atomic commits.
- **Stop conditions:** Stop and report when an existing integration scenario can only pass by changing observable behaviour that no R-ID sanctions, when a unit would need a TypeId literal changed (R3), or when the engine-only mutate glob cannot finish inside the CI Mutation budget (report the measured time).
- **Open Blockers:** None.

---

## Product Contract

### Summary

Bring both packages under `packages/atom/` to full conformance with the declared Compound Packs by repairing verified review-gated violations, decomposing the core's 3,940-line `Atom.ts` into role-suffixed concept modules, and building the schema-law, refusal, and type-testing layers the package currently lacks. Both packages already pass oxlint and effect-tsgo with zero findings, so this work addresses architectural invariants and verification completeness rather than static lint debt.

### Problem Frame

The packages currently pass every mechanical gate (`oxlint --config oxlint.config.ts` reports 0 warnings and 0 errors across 303 rules; `pnpm lint:tsgo` reports 0 errors and 0 warnings on app and test projects). However, their internal architecture violates six load-bearing rules from the declared compound packs, and their test layout predates the repo's standing law.

Specifically: `Hydration.ts` and `Hooks.ts` maintain module-scope `WeakMap` registries that survive across test runs and split under dual-bundle installs; `HostTimer.ts` holds a module-level mutable clock reference; `Registry.ts` models a multi-instance runtime handle as a singleton `Context.Service`; the hydration rehydration seam is an untyped `{ encode, decode }` pair that silently swallows decode errors with a bare `catch { return }`; the react package exports a flat surface with no namespace barrel and masks a mis-typed Suspense throw helper with a `@ts-expect-error`; and neither package ships `src/schema-laws.test.ts`, `test-types/*.tst.ts`, or `*.refusal.test.ts`. Without these, the package remains unconformant under doctrine despite passing local linters.

The specification is also thin. The model-based differential spec alone covered 27.6% of `src/` lines and 15.2% of branches; it knew only plain synchronous numbers, and it passed an engine change that broke three existing scenarios. Nothing measures test strength: atom was excluded from mutation testing (AT4), and `atom-browser.resource.ts` sat at 32.8% line coverage because the core package has no browser project.

### Key Decisions

- KD1. Break the public surface freely. (session-settled: user-directed — chosen over preserving the published surface: doctrine wins over fork drop-in compatibility; behaviour is preserved through the existing 15 integration suites while exported names and topology may move). Governs R1, R2, R4, R5, R7, R15, R16.
- KD2. Wire-format TypeId literals stay frozen. (session-settled: user-directed — chosen over migrating to Symbol.for: AGENTS.md AT5 governs the literals as wire format, and Effect v4 itself uses string literals in repos/effect/packages/effect/src/Fiber.ts:25). Governs R3.
- KD3. Acceptance bar is discern's bar plus the root standing law. (session-settled: user-directed — chosen over adding new mechanical gates: lint-clean under recommended, role-suffixed modules, pack architecture rules satisfied, effect-schema-vite laws, refusal suites, tstyche pins, and dispositioned upstream scenarios). Governs R8, R9, R10, R11, R12.
- KD4. Conform by repairing in place and decomposing. (session-settled: user-directed — chosen over either alone: local architectural repairs and role-suffixed decomposition are both in scope; repairs land first to isolate behaviour changes from structural moves). Governs R1, R4, R7, R16.
- KD5. Scope covers both packages in one unified artifact. A shared Registry handle contract binds core and react; neither can conform meaningfully without the other. Governs R1 through R12.
- KD6. Rules without subject matter in atom are explicitly inapplicable. Atom contains no Sandwich chains, Workflow deciders, or Context.Service ports; those six rules are documented as N/A rather than forced into reactive primitives. Governs R13.
- KD7. The Registry handle is separated from its environment binding. The Registry interface is a hot runtime handle with TypeId and Pipeable; Context.Service binding is provided on demand via a parameterised constructor rather than an ambient singleton. Governs R4, R5, R15.
- KD8. A listener on a derived value nobody has read hears that value's later changes. (session-settled: user-directed — chosen over documenting it as intended laziness: the user confirmed the silent subscriber is a bug). Governs R17.
- KD9. The registry is checked against a model this repo owns, never against upstream `effect/unstable/reactivity`. (session-settled: user-directed — chosen over an upstream differential: upstream shares the fork's bugs, and REPO-O1 gives it no authority). Governs R20, R21.
- KD10. Test strength is measured by mutation score and by what the spec alone exercises, not by suite-wide line coverage. (session-settled: user-approved — chosen over accepting 91% suite line coverage: the spec alone covered 27.6% of lines and passed three regressions). Governs R20, R22, R23.

### Destructive Review Record

Three structural assumptions surfaced before convergence:

1. **Assumption 1 (Module Map):** `Atom.ts` must be split along concept boundaries (`*.resource.ts`, `*.handle.ts`, `*.schema.ts`), assuming fine-grained role suffixes preserve internal cyclical type references cleanly without creating cyclic imports across files.
2. **Assumption 2 (Registry Handle Privacy):** Storing `initialValuesSet` and `atomPromiseMap` on the `Registry` handle instance requires expanding the `Registry` protocol record or using module-private symbol slots, assuming consumers never instantiate registries outside `Registry.make`.
3. **Assumption 3 (Hydration Codec Seam):** Replacing the untyped `{ encode, decode }` seam with an Effect Schema transformation requires all serializable atoms to provide an explicit `Schema.Schema<A, I>`, assuming serializable atom values never carry un-serializable transient instances (such as live fibers or open streams).

**Selected Lens:** Substitution (rotated from Inversion).
**Rationale:** Atom is currently structured as a monolithic procedural toolkit (`Atom.ts` + `Registry.ts`). Testing whether an alternate structural primitive (e.g. modeling `Registry` strictly as an Effect-native `Scope` manager rather than an imperative node dictionary) surfaces latent boundary leaks.

**Three Failures Under Substitution:**

1. _Registry Lifecycle Coupling:_ `Registry.ts` couples node eviction, scheduler management, and serializable cache into a single monolithic object. If `Registry` is replaced by an explicit resource specification, callers lose synchronous `registry.get(atom)` reads.
2. _Suspense Thenable Contract:_ In React 19+, throwing thenables is superseded by `React.use(thenable)`. Relying solely on `throwForSuspense` traps `effect-atom-react` in legacy Suspense semantics without an explicit contract test pinning thenable resolution.
3. _Hydration Silent Failure:_ `Registry.ts:517` silently swallows decoding errors in `catch { return }`. Substituting an Effect Schema codec causes previously silently-dropped malformed preloads to fail fast, which could break consumers relying on graceful partial hydration.

**Convergence Delta:**

- **Kept:** Nominal TypeId branding (`~effect-atom/...`), dual-function combinator style, existing 17 integration suites as behavior oracles.
- **Replaced:** Untyped hydration `{ encode, decode }` seam replaced with an explicit Schema transformation preserving parse issues on refusal; fixed `throwForSuspense(error: unknown)` to eliminate `@ts-expect-error`.
- **Added:** Paired negative refusal suites (`*.refusal.test.ts`), `src/schema-laws.test.ts` via `@systemfsoftware/effect-schema-vite`, TSTyche type-surface laws (`test-types/*.tst.ts`), and an executable contract test for React Suspense thenable throwing (`pin-dependency-semantics.md`).
- **Removed:** Module-level `WeakMap` registries in `Hydration.ts` and `Hooks.ts`, module `let hostClock` in `HostTimer.ts`, and static unconditional `layer: Layer.Layer<AtomRegistry>` in `Registry.ts`.

**Second cycle (propagation and verification extension):**

1. **Assumption 1:** The propagation fixes, the model widening, CI mutation enrollment, and the core browser project ship in the same pull request as the conformance work.
2. **Assumption 2:** Synchronous effect atoms in the model are enough to specify R19, one effect run per invalidation.
3. **Assumption 3:** An engine-only mutate glob, run against the full core suite, finishes inside the 30-minute CI Mutation budget.

**Selected Lens:** Scope Challenge (rotated from Substitution).
**Rationale:** The extension joins independent objectives: correct propagation, a stronger specification, and measurement infrastructure.

**Three Failures Under Scope Challenge:**

1. _Measurement stops at a number:_ Success Criterion 9 only records the first mutation score, so "measure" and "strengthen" were split without an owner for the second half. The test-layer mutation gate requires every survivor to be killed or named equivalent.
2. _R19 has two owners that cover different cases:_ U16 cited R19, but the defect that broke R19 came through async RPC effects and reactivity keys, which the synchronous model cannot express.
3. _Browser proof and engine proof are unrelated work:_ U18 shares no file or dependency with U15-U17, so it was sequenced as if it belonged to the spec track.

**Convergence Delta:**

- **Kept:** one pull request (a split would stack on an unmerged #505 and add a second plan under REPO-D2), the engine-only mutate glob (KTD17), and synchronous effects in the model.
- **Replaced:** Success Criterion 9's record-only wording, replaced by kill-or-name for every survivor. U16's R19 claim now covers synchronous effects only, and KTD14's scenarios own the async cases.
- **Added:** U21, which dispositions surviving mutants from the first CI report.
- **Removed:** nothing.

### Test Layer Placement & Admission Matrix

Admitted per `skill://test-layer-selection`. No isolated unit tests for internal helpers or private glue modules are permitted.

| Target File / Suffix                                        | Admitted Test Kind                | Permitted Location                                   | Why / Invariant                                                                                                                           |
| :---------------------------------------------------------- | :-------------------------------- | :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `*.schema.ts` (Hydration, Result)                           | Schema codec laws + Refusal tests | `src/schema-laws.test.ts`, `tests/*.refusal.test.ts` | `ruleOfSchemas`: bidirectional round-trip stability + explicit negative parse failure verification (`refusals-beside-generated-laws.md`). |
| `*.handle.ts` (`Registry`, `AtomRef`)                       | In-process integration tests      | `tests/*.integration.test.ts`                        | Sociable execution verifying state isolation across concurrent registries; zero mocks on internal glue (`no-mocks-on-internal-glue.md`).  |
| `*.resource.ts` (`Atom` constructors)                       | Law & property tests              | `tests/*.property.test.ts`                           | PBT verifying atom identity, dependency tracking, and combinator composition over arbitrary values.                                       |
| Technology Boundary (React Suspense)                        | Contract test                     | `tests/suspense-thenable.contract.test.ts`           | Pins React thenable-throwing protocol semantics without relying on unverified prose comments (`pin-dependency-semantics.md`).             |
| Type Surface (`Atom`, `Registry`)                           | TSTyche type laws                 | `test-types/*.tst.ts`                                | Pins exact type inference, variance constraints, and type-level rejection of invalid atom compositions.                                   |
| Registry propagation (`atom-node.ts`, `registry-engine.ts`) | Model differential + metamorphic  | `tests/*.differential.test.ts`                       | The model is the specification; generated programs check the registry against it (KD9).                                                   |
| Browser resources (`atom-browser.resource.ts`)              | Browser integration               | core `tests/browser/*.integration.test.ts`           | Real Chromium events; acceptance and refusal paired (`real-system-oracles.md`).                                                           |

### Requirements

#### State Encapsulation and Privacy

- R1. Eliminate every module-level mutable state site and every live instance created at module load across both packages. Governed by KD1, KD4. (pack: cell-architecture, handle-state-privacy.md)
  - `packages/atom/effect-atom/src/Hydration.ts:57`: the `pendingResults` `WeakMap`.
  - `packages/atom/effect-atom-react/src/Hooks.ts:34`: `initialValuesSet` (`WeakMap<Registry, WeakSet<Atom>>`).
  - `packages/atom/effect-atom-react/src/Hooks.ts:285`: `atomPromiseMap` (two `WeakMap` instances).
  - `packages/atom/effect-atom/src/internal/HostTimer.ts:20`: `let hostClock`.
  - `packages/atom/effect-atom/src/Atom.ts:2551`: the exported `runtime` factory singleton, whose closure holds a mutable `globalLayer` shared by every caller of `addGlobalLayer`.
  - `packages/atom/effect-atom/src/AtomRef.ts:155`: the `keyState` counter shared by every ref.
  - `packages/atom/effect-atom/src/Browser.ts:319`: the `searchParamState` coordinator (`Map` plus mutable generation and flag).
  - `packages/atom/effect-atom-react/src/RegistryContext.ts:50`: the default registry that `React.createContext` builds at import time and shares with every provider-less render in the process.

#### Hydration Boundary and Codec Safety

- R2. Replace the untyped hydration codec seam with an Effect Schema transformation. Governed by KD1.
  - The serializable atom contract must require an Effect Schema or bidirectional `Codec<Type, Encoded>`, replacing the untyped `{ readonly decode: (encoded: AnyValue) => AnyValue }` interface in `Registry.ts:417-421`. (pack: cell-architecture, decode-never-cast.md)
  - `Registry.ts:517-521` must not silently swallow decoding errors via `catch { return }`; decode failures on external payloads must surface on the typed error channel or return structured diagnostic issues. (pack: cell-architecture, decode-never-cast.md)

- R3. Preserve TypeId string literals as stable wire format. Governed by KD2.
  - `~effect/reactivity/Atom`, `~effect-atom/atom/Registry`, `~@effect/atom-react/ScopedAtom`, and `~effect/reactivity/DehydratedAtom` must remain unchanged across all renames and module splits, per `packages/atom/AGENTS.md` rule AT5. (pack: cell-architecture, handle-state-privacy.md)

#### Handle Duality and Service Boundaries

- R4. Restructure `Registry` from an ambient `Context.Service` to a runtime handle with on-demand layer synthesis. Governed by KD1, KD4, KD7.
  - `Registry` must be authored as a nominal `Pipeable` handle interface with TypeId branding; operations remain standalone dual functions in the module namespace. (pack: cell-architecture, resource-vs-handle-duality.md)
  - `AtomRegistry extends Context.Service` must not be exported as the primary identity; bind a registry handle into `Context` on demand through a parameterised constructor `Registry.layer(tag, options?)` accepting the caller's service tag. (pack: cell-architecture, resource-vs-handle-duality.md)
  - The static unconditional `export const layer: Layer.Layer<AtomRegistry>` in `Registry.ts:198` must be removed from the library's public surface. (pack: cell-architecture, service-and-layer-boundaries.md)

- R5. `AtomHttpApi` and `AtomRpc` depend on no process-global runtime: a service built without an explicit runtime factory owns a private one instead of falling back to the module-level `Atom.runtime` (`AtomHttpApi.ts:177`, `AtomRpc.ts:342`). Governed by KD1, KD7.

- R15. Every hot handle the packages publish (`Registry`, `AtomRef.ReadonlyRef`, `AtomRef.AtomRef`, `AtomRef.Collection`) is a minimal `Pipeable` protocol record branded with its TypeId, and its operations are standalone dual functions. Governed by KD1, KD7. (pack: cell-architecture, resource-vs-handle-duality.md)

#### React Binding Conformance

- R6. Remove the `@ts-expect-error` directive in `Hooks.ts:461`. Governed by KD3.
  - Change `throwForSuspense(error: Error): never` in `Hooks.ts:443` to accept `error: unknown`, eliminating the type mismatch when throwing a thenable `Promise<void>` for React Suspense.
  - Pin the React Suspense thenable-throwing protocol semantics in a dedicated contract test rather than documenting the invariant in a source comment. (pack: boundary-testing, pin-dependency-semantics.md)

- R7. Convert `packages/atom/effect-atom-react/src/index.ts` from flat `export * from` declarations into the single `AtomReact` namespace barrel R16 defines. Governed by KD1, KD4. (pack: cell-architecture, single-namespace-barrel.md)

- R16. Each package root exports exactly one namespace barrel (`Atom` for the core, `AtomReact` for the React binding) and one package entry point; every other public name is reached through that barrel. Governed by KD1, KD4. (pack: cell-architecture, single-namespace-barrel.md)

#### Verification Layers and Test Discipline

- R8. Auto-discover Schema exports and run bidirectional round-trip property tests using `@systemfsoftware/effect-schema-vite`. Governed by KD3.
  - Add `@systemfsoftware/effect-schema-vite` to `devDependencies` of both packages.
  - Add `src/schema-laws.test.ts` to both packages, asserting round-trip laws over all exported Schemas (Hydration payloads, Result schemas, AtomHttpApi schemas). (pack: boundary-testing, refusals-beside-generated-laws.md)

- R9. Ship negative refusal test suites beside every refined schema. Governed by KD3.
  - For every schema carrying a refinement (`Schema.filter`, bounds, non-empty checks), author a paired `tests/*.refusal.test.ts` asserting that invalid inputs fail decoding with structured parse issues. (pack: boundary-testing, refusals-beside-generated-laws.md)
  - Refined schemas tested under fast-check must attach explicit bounded `Arbitrary` generators to prevent rejection trap timeouts. (pack: boundary-testing, arbitrary-filter-floors.md)

- R10. Pin type inference and rejection laws using TSTyche. Governed by KD3.
  - Create `test-types/` directories in both packages with `*.tst.ts` suites asserting exact return types, pipeable inference, variance laws, and compilation rejections for invalid atom combinations.

- R11. Author boundary integration tests with paired acceptance and refusal conditions. Governed by KD3.
  - Browser and SSR integration tests in `effect-atom-react` must verify clean lifecycle teardown and prove both acceptance and refusal conditions for external event sources and timers. (pack: boundary-testing, real-system-oracles.md)
  - No internal boundary functions or driver seams may be verified with mocked implementations or synthetic stubs. (pack: boundary-testing, no-mocks-on-internal-glue.md)

- R12. Freeze upstream behaviour with a scenario disposition table. Governed by KD3.
  - Every scenario in the 15 existing integration test files must be mapped to exactly one disposition: retained integration test, property law, type test, or retired with an explicit architectural reason.

#### Scope Exclusions and Inapplicable Rules

- R13. Document inapplicable rules without forcing synthetic abstractions. Governed by KD6.
  - The following rules are classified as N/A due to the absence of cells and business deciders in a reactive toolkit: `sandwich-phase-order.md`, `pure-decision-workflows.md`, `four-channel-contracts.md`, `pipeline-composition.md`, `ports-separate-from-layers.md`, and `staged-lawful-builders.md`. No synthetic workflows or sandwich chains may be introduced to satisfy these rules nominally.

- R14. Ship a changeset under `REPO-R2`.
  - Both packages' build hashes change; author a `.changeset/` intent declaring the breaking public surface modifications and consumer-observable improvements.

#### Propagation Correctness and Specification Depth

- R17. A listener hears every change to the value it watches, including a derived value nobody had read when the listener attached. Governed by KD8.
- R18. A listener hears a value only after the write or outermost batch that caused it finishes, never a value from partway through propagation, and not at all when a batch leaves the value where it started.
- R19. One invalidation re-runs an effect atom's effect at most once.
- R20. An executable model states what a subscriber hears and what a read returns, and a differential spec checks the registry against it over generated programs. The programs cover plain and derived values, synchronous effect atoms and their run counts, `immediate` subscribe, `mount`, `modify`, `refresh`, nested batches, writes from inside listeners, idle-TTL eviction, and `dispose`. Governed by KD9, KD10.
- R21. The registry satisfies two relations with no reference at all: splitting a batch into separate writes changes no read, and batching never adds a notification. Governed by KD9.
- R22. The core propagation engine is enrolled in CI's advisory Mutation workflow, so every PR that changes it reports a mutation score. Governed by KD10.
- R23. `atom-browser.resource.ts` behaviour (window focus signal, refresh on focus, search parameters) is proven in a real browser from the core package, with acceptance and refusal paired. Governed by KD10. (pack: boundary-testing, real-system-oracles.md)

### Key Flows

- F1. Registry Lifecycle and State Isolation
  - **Trigger:** Application or test initialises a reactive scope.
  - **Actors:** Calling application, `Registry` handle.
  - **Steps:** Caller invokes `Registry.make(options)`; a fresh `Registry` handle is returned carrying all internal state (node maps, listeners, promise caches) on instance properties; caller optionally synthesises a scoped `Layer` bound to an application-specific tag via `Registry.layer(tag)`.
  - **Outcome:** Zero module-level state is shared across concurrent registries or test runs; closing or disposing a registry frees all associated node resources deterministically.
  - **Covered by:** R1, R4.

- F2. Serialisation and Safe Hydration
  - **Trigger:** Server dehydrates atom state to JSON; client preloads it into a fresh registry.
  - **Actors:** Server renderer, client `Registry` handle, `Hydration` module.
  - **Steps:** Server calls `Hydration.dehydrate(registry)`; serializable values are encoded via their registered Effect Schemas into `DehydratedAtomValue` records; client receives raw JSON and passes it to `Hydration.hydrate(registry, payload)`; each envelope and value decodes through its Schema; valid entries populate preloaded values; malformed entries are recorded as `PreloadRefused` diagnostics on the registry instead of dropping silently.
  - **Outcome:** The serialization boundary is fully typed; every refused entry is readable from the registry with its schema issue, and the affected atom computes its own value (KTD5).
  - **Covered by:** R2, R3, R9.

- F3. React Suspense Integration
  - **Trigger:** React component reads an atom that has not completed its initial async resolution.
  - **Actors:** React rendering fiber, `useAtomValue` hook, `Registry` handle.
  - **Steps:** Component calls `useAtomValue(atom)`; hook checks readiness; finding the atom pending, it accesses the per-registry promise cache, obtains the resolution promise, and passes it to `throwForSuspense(promise)`; React catches the thenable and suspends the subtree; once the atom settles, the promise resolves and React re-renders.
  - **Outcome:** The Suspense protocol functions without `@ts-expect-error` directives; the promise cache lives on the registry handle rather than a module-level `WeakMap`.
  - **Covered by:** R1, R6.

### Acceptance Examples

- AE1. Module State Isolation Across Registries
  - **Covers:** R1
  - **Given:** Two distinct `Registry` instances created via `Registry.make()`.
  - **When:** Atoms are written, hydrated, and accessed in both registries concurrently in the same Node.js process.
  - **Then:** Neither registry reads, mutates, or evicts values from the other; no module-level `WeakMap` or `let` variable holds cross-instance state.

- AE2. Hydration Schema Refusal
  - **Covers:** R2, R9
  - **Given:** An atom registered with a schema that requires a positive integer.
  - **When:** `Hydration.hydrate` receives an external payload where the value is `-5` or a string `"invalid"`.
  - **Then:** Rehydration does not drop the key silently; it reports a structured decode failure preserving the parse issue.

- AE3. Clean React Suspense Throw
  - **Covers:** R6
  - **Given:** A React component reading an unresolved async atom.
  - **When:** `atomResultOrSuspend` executes.
  - **Then:** The thenable promise is thrown cleanly; `tsc --noEmit` and `pnpm lint` pass with zero directives and zero errors.

- AE4. Multiple Registries in Effect Context
  - **Covers:** R4
  - **Given:** An application requiring two distinct registries (e.g. primary and background worker).
  - **When:** Both registries are bound to distinct tags using `Registry.layer(TagA)` and `Registry.layer(TagB)`.
  - **Then:** Both layers merge into a single environment without tag collision; `Context.get` retrieves each handle independently.

- AE5. Schema Law Coverage
  - **Covers:** R8, R10
  - **Given:** Every exported schema in `packages/atom/effect-atom` and `packages/atom/effect-atom-react`.
  - **When:** `pnpm test` runs `src/schema-laws.test.ts` via `@systemfsoftware/effect-schema-vite`.
  - **Then:** 100% of exported schemas pass automated bidirectional round-trip property tests, and `test-types/*.tst.ts` passes TSTyche typecheck.

### Scope Boundaries

#### In Scope

- Eliminating all eight module-level mutable state sites R1 lists across `effect-atom` and `effect-atom-react`.
- Re-architecting `Registry` from an ambient `Context.Service` singleton to an explicit handle with parameterised layer synthesis.
- Converting the untyped hydration codec to an Effect Schema codec that rejects malformed external payloads explicitly.
- Decomposing the core package's mega-modules into role-suffixed concept modules (`*.resource.ts`, `*.handle.ts`, `*.schema.ts`).
- Authoring namespace barrels for `effect-atom-react`.
- Removing the `@ts-expect-error` in `Hooks.ts` and authoring an executable contract test for the Suspense protocol.
- Adding `@systemfsoftware/effect-schema-vite` schema laws, refusal suites, and TSTyche type-surface tests.
- Mapping all existing integration scenarios into a disposition table.
- Shipping a `.changeset/` entry for the breaking release.
- Fixing the propagation defects the model spec found (R17-R19) and widening the spec to the whole registry operation set (R20, R21).
- CI mutation enrollment for the core propagation engine, amending AT4 (R22).
- A core browser project proving the browser resources (R23).

#### Deferred for Later

- Creating new Oxlint rules in `@systemfsoftware/oxlint-plugin-cell-architecture` to mechanically enforce these review-gated patterns across other packages.
- Enrolling the React package, or core modules beyond the propagation engine, in CI mutation. Local mutation runs stay forbidden (REPO-D3).
- Hydration, serializable atoms, and async (non-synchronous) effects in the propagation model.
- Retiring or pruning little-used public surfaces (e.g. `AtomHttpApi`, `AtomRpc`) — the fork's full breadth is retained.

#### Outside This Product's Identity

- Introducing artificial Sandwich cells or Workflow deciders into a reactive toolkit: atom is a state primitive library, not an application workflow engine.
- Migrating string-literal TypeIds (`~effect-atom/...`) to `Symbol.for`: the wire format is frozen by AT5 and conforms to Effect v4 lineage.
- Maintaining backward drop-in compatibility with upstream `@effect-atom/atom`: doctrine wins over fork parity.

### Success Criteria

1. `pnpm --filter @systemfsoftware/effect-atom lint` and `pnpm --filter @systemfsoftware/effect-atom-react lint` exit 0 with zero warnings, zero errors, and zero `@ts-expect-error` / `@ts-ignore` comments in `src/`.
2. `pnpm --filter @systemfsoftware/effect-atom typecheck` and `pnpm --filter @systemfsoftware/effect-atom-react typecheck` exit 0.
3. `pnpm --filter @systemfsoftware/effect-atom test` and `pnpm --filter @systemfsoftware/effect-atom-react test` exit 0 with all existing scenarios accounted for in the disposition table.
4. `src/schema-laws.test.ts` executes and passes via `@systemfsoftware/effect-schema-vite` in both packages.
5. `pnpm dts:check` and `pnpm api:check` pass in both packages with updated API reports.
6. A `.changeset/` file is present declaring the major breaking release.
7. Architectural review confirms no module-level mutable binding, mutable collection, or live registry instance exists in either package's `src/`.
8. The differential specs alone cover at least 90% of branches in `src/atom-node.ts` and at least 70% in `src/registry-engine.ts` (52.4% and 28.6% before). Branches still uncovered are listed with a reason in the pull request.
9. The CI Mutation run reports a score for the enrolled engine files, and every mutant the first run leaves alive is killed or named equivalent in the pull request (U21).
10. `src/atom-browser.resource.ts` reaches at least 90% line coverage in the core browser project.
11. Every failure count an agent reports comes from a run with bail disabled.

---

## Planning Contract

**Product Contract preservation:** changed: R1 (site list extended from five to eight after research found `Atom.ts:2551`, `AtomRef.ts:155`, `Browser.ts:319`, and `RegistryContext.ts:50`), R4 bullet 2 (`Registry.layer(tag, options?)` signature), R5 (premise refuted: neither `AtomHttpApi.ts` nor `AtomRpc.ts` references `AtomRegistry`; re-scoped to their fallback onto the module-level `Atom.runtime`), R7 (now cites R16), R12 and KD1 (file count corrected from 17 to 15); added R15 and R16 for handle-protocol and single-barrel obligations the brainstorm's list missed. It also adds KD8-KD10 and R17-R23, and moved core-engine CI mutation enrollment from Deferred to In Scope, which amends AT4. The objective of full applicable-rule conformance is unchanged.

### Key Technical Decisions

- KTD1. **Registry becomes a minimal handle record; its engine sits in a module-private symbol slot.** The public `Registry` interface carries only `[TypeId]`, the engine slot, and `Pipeable`; every operation (`get`, `set`, `modify`, `update`, `refresh`, `mount`, `subscribe`, `reset`, `dispose`, `getNodes`, `setSerializable`, `setInitialValue`) becomes a `dual` function in the registry module. The existing `RegistryImpl` engine survives as an internal object, so node bookkeeping in `AtomNode.ts` keeps its current shape. Covers R4, R15. (pack: cell-architecture, resource-vs-handle-duality.md; pack: cell-architecture, handle-state-privacy.md)
- KTD2. **One library tag, `Registry.Current`, names the registry evaluating an effect; no static layer exists.** Runtime atoms already inject the owning registry into each evaluation's services (`Atom.ts:2203`, `Atom.ts:2624`), and `Atom.get`/`Atom.set`-style conversions require it, so the tag stays as a fiber-local capability declared in a `*.service.ts` module under a new key; the handle's TypeId literal is untouched (R3). Applications bind a registry with `Registry.layer(tag, options?)`, a scoped layer that disposes the registry with its scope; passing `Registry.Current` gives the old behaviour, and distinct tags hold several registries at once (AE4). Rejected: deleting the tag, because every runtime atom and conversion would then need the registry threaded by hand. Covers R4.
- KTD3. **Per-registry storage lives inside the registry engine.** The engine carries keyed instance storage reached through one dual operation that returns the value for a key, creating it on first use. Callers outside the engine (React hook caches, the seeded-atoms set, the search-param coordinator) key it with module-constant symbols, which are immutable. Storage dies with the registry. Covers R1. (pack: cell-architecture, handle-state-privacy.md)
- KTD4. **Each registry resolves its clock and timer at construction.** `Registry.make` reads Effect's default `Clock` once when no `now` option is given and keeps it on the instance, and schedules timers through the same instance-held path; `internal/HostTimer.ts` loses its module `let`. Covers R1.
- KTD5. **Hydration refusals are recorded on the registry, never dropped.** The serializable seam carries a JSON codec built from the atom's schema and decodes to an `Exit`; a failed decode records a `PreloadRefused` value (key plus the schema issue) on the registry, readable through a dual accessor, and the atom then computes its value as if nothing was preloaded. The `DehydratedAtomValue` envelope becomes a Schema that `hydrate` decodes from `unknown`, and an in-process pending result travels on the entry in a non-enumerable module-private symbol slot that JSON serialization never sees. Encode failures during `dehydrate` are recorded the same way instead of throwing through `Option.getOrThrow` (`Atom.ts` serializable combinator). Covers R1, R2, AE2. (pack: cell-architecture, decode-never-cast.md)
- KTD6. **React needs an explicit registry.** `RegistryContext` has no default value; a hook rendered outside `RegistryProvider` (or an explicit context provider) fails with a defect that names `RegistryProvider`. Rejected: a lazily created global default, which is the same module-level instance under another name. Covers R1.
- KTD7. **No library-level runtime singleton.** `Atom.runtime` is deleted; callers build factories with `Atom.context()` at their own composition root. `AtomHttpApi.Service` and `AtomRpc.Service` create a private factory per service definition when no `runtime` option is given. Behaviour change: two services no longer share global layers unless handed the same factory. Covers R1, R5.
- KTD8. **Modules take a role suffix when one of the six roles fits; others are named for their concern.** Atom definitions and combinators are `*.resource.ts` (cold definitions a registry evaluates); `Registry` and refs are `*.handle.ts`; data contracts and codecs are `*.schema.ts`; `Registry.Current` is `*.service.ts`. React components and hooks, and the internal node engine, match no role and take concern names, which `service-and-layer-boundaries.md` §1 permits for implementation modules. Each package ships one entry (`.` → `src/mod.ts`) with one barrel (`Atom`, `AtomReact`); nested namespaces (`Atom.Registry`, `Atom.AsyncResult`, `Atom.Hydration`, `Atom.Ref`, `Atom.HttpApi`, `Atom.Rpc`) replace today's seven subpath entries. Covers R7, R16. (pack: cell-architecture, single-namespace-barrel.md; pack: cell-architecture, service-and-layer-boundaries.md)
- KTD9. **Verification layers copy the conformant siblings.** Both `vitest.config.ts` files add `inlineSchemaTests()` and include `src/**/*.test.ts`, mirroring `packages/effect-microsandbox/vitest.config.ts`; refusal suites are `effect-gherkin-spec` `scenarioOutline` tables in `tests/*.refusal.test.ts`, following `packages/effect-memfs/tests/learn-why-a-request-was-turned-down.integration.test.ts`; TSTyche uses `tstyche.json` with `rejectAnyType` and `rejectNeverType` plus a `test:types` script, mirroring `packages/trace-spec`. Root `gate:tasks` already runs `test:types`. Covers R8, R9, R10.
- KTD10. **The twelve `throw` sites stay defects.** They guard dual-dispatch misuse (`Atom.ts:1228-1263`, `AtomHttpApi.ts:85-142`, `AtomRpc.ts:95,412`), a disposed registry (`Registry.ts:679`), and builder exhaustiveness (`Result.ts` builder), all programmer errors with no domain refusal to type; `four-channel-contracts.md` has no cell here to apply to (R13). Only the serializable `getOrThrow` pair changes (KTD5).
- KTD11. **Subscribing computes the node before the listener attaches.** An uninitialized node ignores invalidation, and its first computation would otherwise reach the listener as a change. Covers R17; inherits KD8.
- KTD12. **The model lives in the test fixture as a pure step function.** `tests/__fixtures__/registry-program.fixture.ts` reduces a program to the lines a subscriber hears and a read returns; the observed side runs the same program on a fresh registry. Cross-subscriber order within one write is normalized away, while each subscriber's own sequence and its position between reads stay exact. Covers R20; inherits KD9.
- KTD13. **Propagation is push-pull.** A change marks direct children stale and further descendants `checking`. Reading a `checking` node first brings its parents up to date and rebuilds only if one of them changed. Listeners fire after the outermost write or batch finishes, and a batch notifies only nodes whose value ends different from its value before the batch (`BatchState.valueBeforeBatch`, compared with the atom's own equality). alien-signals uses the same shape: `Dirty` and `Pending` flags, with `checkDirty` on read ([`src/system.ts`](https://github.com/stackblitz/alien-signals/blob/master/src/system.ts)). Covers R18.
- KTD14. **The two reactivity-key scenarios are the spec for R19.** `AtomRpc` and `AtomHttpApi` keep asserting three server calls (read, submit, one refetch); the engine changes, not the scenarios. Covers R19.
- KTD15. **The never-read unsubscribe scenario keeps its removal assertion and drops its `uninitialized` pin.** KTD11 makes the node computed at subscribe, so `uninitialized` pinned the defect KD8 removes. Covers R17, R12.
- KTD16. **Model time uses Vitest fake timers driven by an `Advance` program step, not Effect's TestClock.** Differential targets run on the live runtime (`docs/solutions/developer-experience/differential-targets-run-on-the-live-clock.md`), and registry idle timers go through the host timer that fake timers control, as `tests/Registry.integration.test.ts` already relies on. Covers R20.
- KTD17. **Mutation enrollment covers the propagation engine only.** `packages/atom/effect-atom/stryker.config.ts` mirrors `packages/effect-daemon-spec/stryker.config.ts` with a mutate glob of `src/atom-node.ts` and `src/registry-engine.ts`: the files the model specifies, sized for the 30-minute per-package budget in `.github/workflows/mutation.yml`. The workflow step is `continue-on-error`, so the first run is a baseline, not a gate. The config is an Evaluator surface and lands in its own commit. `src/internal/node-lifetime.ts` stays excluded (AT4). Covers R22. (`docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md`: the glob is a window, so a renamed engine file must be re-added.)
- KTD18. **The core package gains a browser Vitest project** mirroring `packages/atom/effect-atom-react/vitest.config.ts` (playwright provider, headless Chromium), scoped to `tests/browser/**`; the node project excludes that directory. AT6 extends to it. Covers R23. (pack: boundary-testing, real-system-oracles.md)
- KTD19. **Agents report failure counts from `--bail=0` runs; no config changes.** The shared base sets `bail: 1` only when `AGENT` is set (`packages/toolchain/vitest-config/lib/base.js`), and CI never bails. A red agent run is re-run with `--bail=0` before any count is reported. Covers Success Criterion 11.

### High-Level Technical Design

Module map after U9 and U10. Arrows point from importer to imported module; the internal engine stays behind the handle.

```mermaid
flowchart TB
  subgraph core[effect-atom]
    mod[mod.ts: Atom barrel] --> atomMod[Atom/mod.ts]
    atomMod --> res[atom*.resource.ts]
    atomMod --> reg[registry.handle.ts]
    atomMod --> cur[current-registry.service.ts]
    atomMod --> hyd[hydration.handle.ts]
    atomMod --> ar[async-result.schema.ts]
    atomMod --> ref[atom-ref.handle.ts]
    atomMod --> svc[atom-http-api / atom-rpc]
    hyd --> env[dehydrated-atom.schema.ts]
    reg --> refuse[registry-refusal.schema.ts]
    reg --> eng[internal/registry-engine.ts]
    eng --> node[internal/atom-node.ts]
  end
  subgraph react[effect-atom-react]
    rmod[mod.ts: AtomReact barrel] --> rns[AtomReact/mod.ts]
    rns --> ctx[registry-context.ts]
    rns --> hooks[hooks modules]
    rns --> hb[hydration-boundary.ts]
    rns --> scoped[scoped-atom.resource.ts]
  end
  hooks --> reg
  ctx --> reg
  hb --> hyd
```

Hydration with a pending result, after U5:

```mermaid
sequenceDiagram
  participant S as Source registry
  participant E as DehydratedAtomValue
  participant T as Target registry
  S->>E: dehydrate encodes value through the atom codec
  S->>E: Initial value with deferred mode attaches Deferred in private slot
  E->>T: hydrate decodes envelope from unknown
  T->>T: store encoded preload keyed by serialization key
  T->>T: first read decodes to Exit
  alt decode succeeds
    T->>T: node starts from decoded value
  else decode fails
    T->>T: record PreloadRefused and compute normally
  end
  S-->>T: source settles and Deferred completes the target
```

Node states after U15. A change reaches direct children as `stale` and deeper descendants as `checking`; a read settles `checking` by pulling parents first (KTD13).

```mermaid
stateDiagram-v2
  [*] --> uninitialized
  uninitialized --> valid: first read or subscribe (KTD11)
  valid --> stale: a parent changed
  valid --> checking: an ancestor changed
  checking --> valid: parents unchanged on read
  checking --> stale: a parent changed on read
  stale --> valid: rebuild on read
  valid --> removed: no listeners, idle
  stale --> removed: no listeners, idle
  checking --> removed: no listeners, idle
  removed --> [*]
```

### Test Layer Admission

Every test this plan adds passes `skill://test-layer-selection`: behaviour of the registry, hooks, and hydration is proven through public surfaces in in-process integration suites; schemas get generated laws plus refusal tables; the React Suspense dependency gets one contract test; types get TSTyche pins. No test targets `internal/` modules or private helpers, and no process is spawned. The Product Contract matrix row for `*.resource.ts` property tests is admitted but not required: this plan adds none, because no R-ID owns a combinator law that the retained integration scenarios do not already pin.

The U15-U21 additions pass the same gate. The differential and metamorphic specs run in-process through `Atom.Registry`. The core browser project runs real Chromium under Vitest's playwright provider, as AT6 already admits. No test targets engine internals, and none spawns a process.

### Assumptions

- The run is `lfg`-driven, so the plan-time scoping confirmation was skipped; the R-ID changes in the preservation note are recorded here for review rather than confirmed live.
- `AtomReact.useAtomValue`-style member access satisfies the React hooks lint rules in `oxlint-config-recommended`; if not, the barrel keeps hook names and the finding is recorded in the PR.
- The search-param coordinator keyed per registry is acceptable: two registries on one page batch their own URL writes.
- Removing the React default registry is acceptable breakage under KD1; every existing React test already renders under a provider or will be given one (U3).
- The reactivity-key refetch excess (4 calls instead of 3) is an engine defect introduced by the working-tree propagation changes, not a scenario error; its root cause is found during U15.
- Synchronous effect atoms represent effect atoms well enough for R20. R19's async cases are owned by the two reactivity-key scenarios (KTD14).

### Sequencing

Phase 1 repairs the current topology (U1-U8) so each behaviour change lands in a file reviewers already know. Phase 2 moves code without changing behaviour (U9, U10). Phase 3 adds verification layers against the final names (U11-U14). U7 lands before the other repairs that touch registry call sites, so hooks and hydration change call shape once.

Phase 4 (U15-U20) follows the landed conformance work. U15 lands the propagation fixes with the spec that found them. U16 and U17 widen the spec in order. U18 is independent of the spec track and can land at any point. U19 lands after U17 so the first mutation run measures the finished spec, and it ships in its own commit. U21 acts on that run's survivors. U20 records the result.

---

## Implementation Units

| U-ID | Title                                                   | Key files                                                                                 | Depends on   |
| ---- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| U1   | Registry owns its clock and timer                       | `src/Registry.ts`, `src/internal/HostTimer.ts`                                            | none         |
| U7   | Registry handle protocol and `Registry.Current`         | `src/Registry.ts`, `src/Atom.ts`, react `src/Hooks.ts`                                    | U1           |
| U2   | Registry-local storage for React hook state             | `src/Registry.ts`, react `src/Hooks.ts`                                                   | U7           |
| U3   | Explicit registry provision in React                    | react `src/RegistryContext.ts`                                                            | U7           |
| U4   | Suspense throw fix and thenable contract test           | react `src/Hooks.ts`                                                                      | U2           |
| U5   | Typed hydration boundary                                | `src/Hydration.ts`, `src/Registry.ts`, `src/Atom.ts`                                      | U7           |
| U6   | Remove remaining module singletons                      | `src/Atom.ts`, `src/AtomRef.ts`, `src/Browser.ts`, `src/AtomHttpApi.ts`, `src/AtomRpc.ts` | U2           |
| U8   | AtomRef handle protocol                                 | `src/AtomRef.ts`, react `src/Hooks.ts`                                                    | U6           |
| U9   | Core decomposition and `Atom` barrel                    | all core `src/`, `tsdown.config.ts`, `package.json`, api-extractor configs                | U1-U8        |
| U10  | React decomposition and `AtomReact` barrel              | all react `src/`, packaging configs                                                       | U9           |
| U11  | Schema laws                                             | both `vitest.config.ts`, `src/schema-laws.test.ts`                                        | U9, U10      |
| U12  | Refusal and boundary suites                             | `tests/*.refusal.test.ts`, react tests                                                    | U11          |
| U13  | TSTyche type-surface pins                               | `test-types/`, `tstyche.json`                                                             | U9, U10      |
| U14  | Disposition record, changeset, leaf docs                | `packages/atom/AGENTS.md`, READMEs, `.changeset/`                                         | U12, U13     |
| U15  | Propagation fixes and scenario disposition              | core `src/atom-node.ts`, `src/registry-engine.ts`, `tests/Registry.integration.test.ts`   | none         |
| U16  | Model: effect atoms, mount, immediate, modify, dispose  | core `tests/__fixtures__/registry-program.fixture.ts`                                     | U15          |
| U17  | Model: time, nested batches, listener writes, relations | core fixture, `tests/registry-batching.differential.test.ts`                              | U16          |
| U18  | Core browser project for browser resources              | core `vitest.config.ts`, `tests/browser/`                                                 | none         |
| U19  | CI mutation enrollment for the engine                   | core `stryker.config.ts`, `package.json`, `packages/atom/AGENTS.md`                       | U17          |
| U20  | Changeset, doctrine, and pull request record            | `.changeset/curvy-poets-hide.md`, `packages/atom/AGENTS.md`                               | U15-U19, U21 |
| U21  | Surviving-mutant disposition                            | core fixture and specs as survivors dictate                                               | U19          |

All paths below are repo-relative; `core` means `packages/atom/effect-atom` and `react` means `packages/atom/effect-atom-react`.

### U1. Registry owns its clock and timer

**Goal:** Remove the module-level clock memo so each registry holds its own time source.
**Requirements:** R1 (site `HostTimer.ts:20`); KTD4.
**Dependencies:** none.
**Files:** `packages/atom/effect-atom/src/Registry.ts`, `packages/atom/effect-atom/src/internal/HostTimer.ts`, `packages/atom/effect-atom/tests/Registry.integration.test.ts`.
**Approach:**

1. Replace `hostNow` with a function that takes the clock the registry resolved at construction; `nowOrHost` (`Registry.ts:436`) resolves the default clock once per `make` call.
2. Keep `hostScheduleTimer` stateless; it already holds no module state.
   **Patterns to follow:** `RegistryMakeOptions` option fallbacks in `Registry.ts:117-125`.
   **Test scenarios:**

- A registry made without `now` reports increasing timestamps from Effect's default clock when an idle TTL expires.
- Two registries made with different `now` functions expire the same idle atom at their own times, and neither affects the other.
  **Verification:** `HostTimer.ts` has no `let`; existing TTL scenarios in `Registry.integration.test.ts` pass unchanged.

### U7. Registry handle protocol and `Registry.Current`

**Goal:** `Registry` becomes a minimal handle with dual operations, and the only way to put a registry in `Context` is `Registry.layer(tag, options?)`.
**Requirements:** R4, R15, AE4; KTD1, KTD2.
**Dependencies:** U1.
**Files:** `packages/atom/effect-atom/src/Registry.ts`, `packages/atom/effect-atom/src/Atom.ts`, `packages/atom/effect-atom/src/AtomNode.ts`, `packages/atom/effect-atom/src/Hydration.ts`, `packages/atom/effect-atom/src/Server.ts`, `packages/atom/effect-atom-react/src/Hooks.ts`, `packages/atom/effect-atom-react/src/RegistryContext.ts`, `packages/atom/effect-atom-react/src/ReactHydration.ts`, every test file that calls a registry method, `packages/atom/effect-atom/tests/Registry.integration.test.ts`.
**Approach:**

1. Split the public `Registry` interface from the engine: the handle record holds `[TypeId]`, a module-private engine slot, and `Pipeable`; `make` returns it.
2. Author each registry method as a `dual` function over the handle that forwards to the engine; migrate every call site in both packages and the tests.
3. Rename the `AtomRegistry` class to `Current` in its own service module with a key distinct from the TypeId literal; update the runtime service maps (`Atom.ts:2203`, `Atom.ts:2624`) and every `AtomRegistry` requirement in signatures.
4. Replace `layerOptions` and the static `layer` with `layer(tag, options?)`, a scoped layer that disposes the registry when its scope closes.
   **Execution note:** Migrate call sites mechanically first and run both packages' suites before touching behaviour; this unit should change no observable result.
   **Patterns to follow:** `packages/effect-microsandbox/src/running-vm.handle.ts` (TypeId, private symbol slot, `Prototype`).
   **Test scenarios:**

- Covers AE4. Two registries bound to two distinct tags through `Registry.layer` merge into one environment; each tag yields its own handle, and a write through one is invisible through the other.
- `Registry.layer(Registry.Current, { initialValues })` provides a registry whose preloaded atom reads the seeded value (replaces `Registry.integration.test.ts:783-789`).
- Closing the layer's scope disposes the registry: a later read through the captured handle fails with the disposed-registry defect.
- Every registry operation gives the same result called data-first and piped data-last.
  **Verification:** No `class AtomRegistry`, `layerOptions`, or static `layer` export remains; both packages' existing suites pass.

### U2. Registry-local storage for React hook state

**Goal:** The two `WeakMap` caches in the React hooks move into storage owned by each registry.
**Requirements:** R1 (sites `Hooks.ts:34`, `Hooks.ts:285`), AE1; KTD3.
**Dependencies:** U7.
**Files:** `packages/atom/effect-atom/src/Registry.ts`, `packages/atom/effect-atom-react/src/Hooks.ts`, `packages/atom/effect-atom/tests/Registry.integration.test.ts`, `packages/atom/effect-atom-react/tests/seeding-and-listening.integration.test.ts`.
**Approach:**

1. Add keyed instance storage to the engine and a dual accessor that returns the stored value for a key, creating it on first access; storage is cleared on dispose.
2. Re-key `initialValuesSetFor` and `promiseMapFor` on registry-local storage with module-constant symbol keys.
   **Test scenarios:**

- Covers AE1. Two registries seeded with different initial values for the same atom through `useAtomInitialValues` each read their own seed.
- Registry-local storage created under one key on one registry is absent on a second registry.
- After `dispose`, a fresh registry starts with empty storage for the same key.
  **Verification:** `Hooks.ts` declares no module-level `WeakMap`; React suites pass.

### U3. Explicit registry provision in React

**Goal:** No registry is created at import time.
**Requirements:** R1 (site `RegistryContext.ts:50`); KTD6.
**Dependencies:** U7.
**Files:** `packages/atom/effect-atom-react/src/RegistryContext.ts`, `packages/atom/effect-atom-react/src/Hooks.ts`, `packages/atom/effect-atom-react/src/ReactHydration.ts`, React test files that render without a provider, `packages/atom/effect-atom-react/tests/keeping-registry-alive.integration.test.ts`.
**Approach:**

1. Give `RegistryContext` an absent default and route every hook through one registry lookup that fails with a defect naming `RegistryProvider` when absent.
2. Wrap provider-less test renders in `RegistryProvider`; record each such change for the U14 disposition record.
   **Test scenarios:**

- A component using `useAtomValue` inside `RegistryProvider` renders the atom's value.
- The same component rendered with no provider raises an error whose message names `RegistryProvider`, caught by an error boundary.
- Two sibling providers keep independent values for the same atom.
  **Verification:** Importing the React package creates no registry; React suites pass.

### U4. Suspense throw fix and thenable contract test

**Goal:** Remove the only suppression directive and pin the React Suspense contract executably.
**Requirements:** R6, AE3.
**Dependencies:** U2.
**Files:** `packages/atom/effect-atom-react/src/Hooks.ts`, `packages/atom/effect-atom-react/tests/suspense-thenable.contract.test.ts`.
**Approach:** Type the throw helper's parameter as `unknown` and delete the directive at `Hooks.ts:461`. The contract test drives real React in the browser project: a component suspends on the cached promise, the fallback shows, and settling the atom renders the value. React's thenable semantics per react.dev `<Suspense>` reference.
**Test scenarios:**

- Covers AE3. A component reading an unresolved async atom through `useAtomSuspense` shows the Suspense fallback, then the value once the atom succeeds.
- Two components suspending on the same atom in one registry receive the same cached promise and both render after one settlement.
- An atom that fails renders the nearest error boundary instead of the value.
  **Verification:** `src/` contains no `@ts-expect-error` or `@ts-ignore`; the contract test passes in headless chromium.

### U5. Typed hydration boundary

**Goal:** Hydration decodes external payloads through Schema, records every refusal, and keeps pending results off module state.
**Requirements:** R1 (site `Hydration.ts:57`), R2, R3, AE2; KTD5.
**Dependencies:** U7.
**Files:** `packages/atom/effect-atom/src/Hydration.ts`, `packages/atom/effect-atom/src/Registry.ts`, `packages/atom/effect-atom/src/Atom.ts`, `packages/atom/effect-atom/tests/Hydration.integration.test.ts`.
**Approach:**

1. Define the `DehydratedAtomValue` envelope as a Schema whose tag field keeps the `'~effect/reactivity/DehydratedAtom'` literal (R3); `hydrate` decodes each input entry from `unknown` and records malformed entries as refusals.
2. Change the serializable seam to carry the JSON codec and decode to `Exit`; replace the bare `catch { return }` in `applyDecodedSerializable` (`Registry.ts:519`) with a recorded `PreloadRefused` plus normal computation.
3. Replace `pendingResults` with a non-enumerable module-private symbol slot on the entry.
4. Replace the `Option.getOrThrow` encode and decode in the serializable combinator with the same recorded-refusal path.
   **Test scenarios:**

- Covers AE2. Hydrating `-5` into an atom whose schema requires a positive integer records one `PreloadRefused` naming the key and the schema issue, and the atom computes its own value.
- Hydrating the string `"invalid"` into a numeric atom records a refusal; valid sibling entries in the same payload still preload.
- An entry missing `key` is refused at envelope decode and never reaches the registry.
- `JSON.stringify` of a dehydrated pending entry contains no Deferred data, and in-process hydration of the same entry still settles the target when the source succeeds.
- A round trip of a serializable `AsyncResult` atom through dehydrate, JSON, and hydrate yields an equal value.
  **Verification:** `Hydration.ts` has no module `WeakMap`; `Registry.ts` has no bare `catch`; hydration suites pass.

### U6. Remove remaining module singletons

**Goal:** No runtime factory, key counter, or URL coordinator lives at module scope.
**Requirements:** R1 (sites `Atom.ts:2551`, `AtomRef.ts:155`, `Browser.ts:319`), R5; KTD3, KTD7.
**Dependencies:** U2.
**Files:** `packages/atom/effect-atom/src/Atom.ts`, `packages/atom/effect-atom/src/AtomRef.ts`, `packages/atom/effect-atom/src/Browser.ts`, `packages/atom/effect-atom/src/AtomHttpApi.ts`, `packages/atom/effect-atom/src/AtomRpc.ts`, `packages/atom/effect-atom/tests/Atom.integration.test.ts`, `packages/atom/effect-atom/tests/AtomHttpApi.integration.test.ts`, `packages/atom/effect-atom/tests/AtomRpc.integration.test.ts`, `packages/atom/effect-atom/tests/AtomRef.integration.test.ts`.
**Approach:**

1. Delete `export const runtime`; migrate internal and test callers to a factory from `Atom.context()` created at the call site's root.
2. Have `AtomHttpApi.Service` and `AtomRpc.Service` build a private factory per service definition when no `runtime` option is given (`AtomHttpApi.ts:177`, `AtomRpc.ts:342`).
3. Give each ref an identity key that needs no shared counter.
4. Move the search-param coordinator into registry-local storage (U2 accessor).
   **Test scenarios:**

- Two runtime factories from `Atom.context()` with different global layers give atoms that each see only their own factory's layer.
- An `AtomHttpApi` service built without `runtime` resolves its endpoints; a second service definition does not observe the first one's added global layer.
- Two refs created in sequence have distinct keys and equal refs compare by value as before.
- Two `searchParam` atoms written in the same tick in one registry produce one URL update carrying both values (browser suite).
  **Verification:** No module-level `let`, mutable `Map`, counter, or singleton factory remains in `Atom.ts`, `AtomRef.ts`, or `Browser.ts`.

### U8. AtomRef handle protocol

**Goal:** Refs and collections become minimal handle records with dual operations.
**Requirements:** R15; KTD1 applied to refs.
**Dependencies:** U6.
**Files:** `packages/atom/effect-atom/src/AtomRef.ts`, `packages/atom/effect-atom-react/src/Hooks.ts`, `packages/atom/effect-atom/tests/AtomRef.integration.test.ts`, `packages/atom/effect-atom-react/tests/shared-values-read-write.integration.test.ts`.
**Approach:** Keep each ref's mutable value and subscriber list behind a module-private slot; expose `get`, `set`, `update`, `subscribe`, `map`, `prop`, and the collection operations as dual functions; migrate `useAtomRef`, `useAtomRefProp`, and `useAtomRefPropValue`.
**Test scenarios:**

- Setting a ref notifies each subscriber once with the new value.
- A `prop` ref of a nested field updates the parent value and notifies parent subscribers.
- A collection insert and remove notify collection subscribers, and a removed item's ref no longer notifies them.
- Each ref operation gives the same result called data-first and piped data-last.
  **Verification:** No public ref interface declares methods; AtomRef suites pass.

### U9. Core decomposition and `Atom` barrel

**Goal:** The core package ships one entry with one `Atom` barrel over role-named modules, with no behaviour change.
**Requirements:** R16, R3; KTD8.
**Dependencies:** U1, U2, U3, U4, U5, U6, U7, U8.
**Files:** `packages/atom/effect-atom/src/` (new `mod.ts`, `Atom/mod.ts`, and the module map in the High-Level Technical Design; delete `index.ts` and the flat modules they replace), `packages/atom/effect-atom/tsdown.config.ts`, `packages/atom/effect-atom/package.json`, `packages/atom/effect-atom/api-extractor*.json`, `packages/atom/effect-atom/tsconfig.api*.json`, `packages/atom/effect-atom/etc/*.api.md`, every core and React test import.
**Approach:**

1. Move code into the target modules by the `Atom.ts` section map; keep the `ResultValues.ts` cycle break as the leaf of the async-result schema module.
2. Collapse the eight tsdown entries to `mod` and the package exports to `.`; drop the per-entry api-extractor configs for one report.
3. Repoint every import in both packages and tests to the barrel.
   **Execution note:** Move code without editing it; run both suites after each moved group so a failure points at one move.
   **Patterns to follow:** `packages/effect-microsandbox/src/mod.ts`, `packages/effect-microsandbox/tsdown.config.ts`.
   **Test expectation:** none new -- a pure move; the retained suites are the oracle.
   **Verification:** `src/` holds only `mod.ts`, `Atom/mod.ts`, role-named modules, and `internal/`; build, `dts:check`, `api:check`, and `attw` pass; every TypeId literal is byte-identical to before.

### U10. React decomposition and `AtomReact` barrel

**Goal:** The React package ships one entry with one `AtomReact` barrel.
**Requirements:** R7, R16; KTD8.
**Dependencies:** U9.
**Files:** `packages/atom/effect-atom-react/src/` (new `mod.ts`, `AtomReact/mod.ts`, concern-named modules; delete `index.ts`), `packages/atom/effect-atom-react/tsdown.config.ts`, `packages/atom/effect-atom-react/package.json`, `packages/atom/effect-atom-react/api-extractor.json`, `packages/atom/effect-atom-react/etc/effect-atom-react.api.md`, React test imports.
**Approach:** Split `Hooks.ts` by concern (value hooks, ref hooks, Suspense) and move `ScopedAtom.ts` to a resource module; point tsdown at `mod`.
**Test expectation:** none new -- a pure move; the retained suites are the oracle.
**Verification:** React build, `dts:check`, `api:check`, `attw`, and both Vitest projects pass.

### U11. Schema laws

**Goal:** Every exported schema in both packages gets generated round-trip laws.
**Requirements:** R8, AE5; KTD9.
**Dependencies:** U9, U10.
**Files:** `packages/atom/effect-atom/vitest.config.ts`, `packages/atom/effect-atom-react/vitest.config.ts`, `packages/atom/effect-atom/src/schema-laws.test.ts`, `packages/atom/effect-atom-react/src/schema-laws.test.ts`, both `package.json` files.
**Approach:** Add `@systemfsoftware/effect-schema-vite` and `@systemfsoftware/effect-schema-law` as dev dependencies, register `inlineSchemaTests()`, and widen `include` to `src/**/*.test.ts`; in the React config add it to the node project only. Refined schemas get bounded arbitraries through annotations (R9 second bullet).
**Test scenarios:**

- Covers AE5. The generated file holds a law pair for the dehydrated-atom envelope and the registry refusal schema, and both pass.
- A refined field in the envelope generates values without fast-check rejection exhaustion.
  **Verification:** `pnpm --filter` `test` runs the generated laws in both packages.

### U12. Refusal and boundary suites

**Goal:** Every refined schema and every external boundary has an explicit refusal proof beside its acceptance proof.
**Requirements:** R9, R11; KTD9.
**Dependencies:** U11.
**Files:** `packages/atom/effect-atom/tests/hydration.refusal.test.ts`, `packages/atom/effect-atom-react/tests/window-focus-and-search-params.integration.test.ts`, existing React integration files for teardown.
**Approach:** Author the hydration refusal table as a `scenarioOutline` over malformed envelopes and values; add browser scenarios for the two external event sources (visibility and URL) proving acceptance, refusal, and listener teardown on unmount; timers are covered through registry TTL with real time.
**Test scenarios:**

- Envelope refusals: missing `key`, non-string `key`, missing tag literal, negative `dehydratedAt`; each is refused with a schema issue naming the field.
- Value refusals: wrong primitive type and refinement violation each record a `PreloadRefused`.
- A visibility change to `visible` refreshes an atom using `refreshOnWindowFocus`; a change to `hidden` does not.
- A malformed URL search parameter decodes to the atom's fallback rather than throwing.
- Unmounting the last subscriber removes the visibility and popstate listeners it added.
  **Verification:** The refusal suite passes; no test in either package uses `vi.fn` to replace a driver seam (`no-mocks-on-internal-glue.md`), with the SSR read counter at `ssr.integration.test.ts` retained as an observed input, not a stub.

### U13. TSTyche type-surface pins

**Goal:** Pin the public type surface both packages promise.
**Requirements:** R10; KTD9.
**Dependencies:** U9, U10.
**Files:** `packages/atom/effect-atom/tstyche.json`, `packages/atom/effect-atom/test-types/atom.tst.ts`, `packages/atom/effect-atom-react/tstyche.json`, `packages/atom/effect-atom-react/test-types/atom-react.tst.ts`, both `package.json` files, both `tsconfig.test.json` (include `test-types/`).
**Approach:** Add `tstyche` as a dev dependency and a `test:types` script mirroring `packages/trace-spec/package.json`.
**Test scenarios:**

- `Atom.make(0)` is a writable atom of `number`; `Atom.make(Effect.succeed(1))` reads as `AsyncResult<number, never>`.
- `Atom.get` requires `Atom.Registry.Current` in its environment.
- `Atom.Registry.layer(tag)` rejects a tag whose shape is not a registry.
- Every registry and ref operation accepts both data-first and data-last calls.
- `AtomReact.useAtomValue` with a selector returns the selector's type; `AtomReact.useAtomSet` rejects a read-only atom.
  **Verification:** `test:types` passes in both packages.

### U14. Disposition record, changeset, leaf docs

**Goal:** Reviewers can trace every existing scenario, rule applicability, and release note.
**Requirements:** R12, R13, R14.
**Dependencies:** U12, U13.
**Files:** `packages/atom/AGENTS.md`, `packages/atom/effect-atom/README.md`, `packages/atom/effect-atom-react/README.md`, `.changeset/<generated>.md`.
**Approach:**

1. Disposition rule: every scenario in the 15 integration files is retained as an integration test with imports repointed; the exceptions are the scenarios U3, U5, U6, and U7 rewrote, each listed with its reason in the pull request body.
2. Update AT1 (one entry, one API report) and the Verification block to add `lint:tsgo` and `test:types`; record the six inapplicable rules with R13's reason.
3. Update both READMEs' entry-point sections to the single barrel.
4. Run `pnpm change --bump major` for both packages with a consumer-facing body.
   **Test expectation:** none -- documentation and release metadata.
   **Verification:** The changeset guard passes; README examples name only exports that exist.

### U15. Propagation fixes and scenario disposition

**Goal:** The registry tells each listener about every change it watches, once, after the causing write finishes, and re-runs an effect at most once per invalidation.
**Requirements:** R17, R18, R19; KTD11, KTD13, KTD14, KTD15.
**Dependencies:** none.
**Files:** `packages/atom/effect-atom/src/atom-node.ts`, `packages/atom/effect-atom/src/registry-engine.ts`, `packages/atom/effect-atom/tests/Registry.integration.test.ts`, `packages/atom/effect-atom/tests/registry-model.differential.test.ts`, `packages/atom/effect-atom/tests/__fixtures__/registry-program.fixture.ts`, `packages/atom/effect-atom/package.json`, `pnpm-lock.yaml`.
**Approach:**

1. Keep the working-tree changes: subscribe computes first (KTD11), the `checking` state with pull-on-read, and batch net-change notification (KTD13).
2. Find why the two reactivity-key scenarios now see four server calls and fix the engine; the scenarios stay unchanged (KTD14).
3. Rewrite the never-read unsubscribe scenario per KTD15.

**Execution note:** The failing runs already exist; re-run each with `--bail=0` before and after its fix (KTD19).
**Patterns to follow:** existing Gherkin scenario shape in `tests/Registry.integration.test.ts`.
**Test scenarios:**

- A listener on a derived value that was never read hears the next change of its source.
- Two listeners on values derived from one source each hear one notification per write, and neither hears a value computed from a mix of old and new inputs.
- A batch that moves a counter away and back notifies nobody; a batch that ends at a new value notifies once.
- A reactivity-key submission refetches the watched query once: the `AtomRpc` and `AtomHttpApi` scenarios see three calls.
- Subscribing without reading, then unsubscribing, leaves no node for the value.

**Verification:** The core suite passes under `--bail=0`, and the model spec passes at its 500-program budget.

### U16. Model: effect atoms, mount, immediate, modify, dispose

**Goal:** The spec's programs exercise every registry operation except time and nesting.
**Requirements:** R19 (synchronous effects), R20; KTD12.
**Dependencies:** U15.
**Files:** `packages/atom/effect-atom/tests/__fixtures__/registry-program.fixture.ts`, `packages/atom/effect-atom/tests/registry-model.differential.test.ts`.
**Approach:**

1. Add a synchronous effect atom derived from the counter whose read increments a run count that the log reports; its value is an `AsyncResult` success.
2. Add program steps: `immediate` subscribe, mount and unmount, `modify` (logging its return value), and `dispose`, after which every step logs the model's disposed outcome.
3. Keep the model a pure step function; the observed side stays imperative inside `Effect.sync`, never mutable bindings inside `Effect.gen`.

**Test scenarios:** The spec is one property. Its program arbitrary must generate each family below, and the model must state the outcome:

- An `immediate` subscribe logs the current value before any write.
- A mounted value with no listener stays computed across writes; after unmount, the next read recomputes it.
- `modify` on the counter logs its return value, and the next read shows the new counter.
- An effect atom read twice with no change between runs once, and runs once more after its source changes and it is read again.
- After `dispose`, a read, a write, and a subscribe each produce the disposed outcome, and no listener hears anything.

**Verification:** The spec passes at 500 programs, and the spec-only coverage run shows effect, mount, modify, and dispose branches exercised.

### U17. Model: time, nested batches, listener writes, relations

**Goal:** The spec covers idle eviction, nested batches, and writes made from listeners, and two reference-free relations hold.
**Requirements:** R20, R21; KTD16.
**Dependencies:** U16.
**Files:** `packages/atom/effect-atom/tests/__fixtures__/registry-program.fixture.ts`, `packages/atom/effect-atom/tests/registry-model.differential.test.ts`, `packages/atom/effect-atom/tests/registry-batching.differential.test.ts`.
**Approach:**

1. Build the observed registry with `defaultIdleTTL` and `timeoutResolution`; add an `Advance` step that moves fake timers (KTD16).
2. Let a batch step contain a nested batch; add a mirror writable that one listener sets to what it hears.
3. Author R21's two relations with the harness's `Metamorphic` builder over the same program arbitrary.

**Patterns to follow:** `packages/differential-spec/tests/metamorphic.differential.test.ts`.
**Test scenarios:**

- A value with no listener, idle past its TTL, re-runs on its next read; the same read inside the TTL does not.
- A `keepAlive` value never re-runs because of idle time.
- Notifications from a nested batch arrive only after the outermost batch ends.
- A listener that copies what it hears into the mirror leaves the mirror equal to the last value heard, and the mirror's own listener hears each copy once.
- Splitting every batch into separate writes leaves every read line unchanged.
- A program with batches never has more heard lines than the same program unbatched.

**Verification:** Both specs pass, and Success Criterion 8 holds or the pull request lists each uncovered branch with its reason.

### U18. Core browser project for browser resources

**Goal:** `atom-browser.resource.ts` is proven in real Chromium from the core package.
**Requirements:** R23; KTD18.
**Dependencies:** none.
**Files:** `packages/atom/effect-atom/vitest.config.ts`, `packages/atom/effect-atom/package.json`, `packages/atom/effect-atom/tsconfig.test.json`, `packages/atom/effect-atom/tests/browser/window-focus-and-search-params.integration.test.ts`, `packages/atom/AGENTS.md`.
**Approach:** Add the browser project and its dev dependencies as the React package declares them. Drive visibility and URL changes with real DOM events, as the React suite does, without hooks.
**Patterns to follow:** `packages/atom/effect-atom-react/vitest.config.ts`, `packages/atom/effect-atom-react/tests/window-focus-and-search-params.integration.test.ts`.
**Test scenarios:**

- `windowFocusSignal` increments when visibility becomes `visible` and not when it becomes `hidden`.
- An atom wrapped with `refreshOnWindowFocus` re-runs once per return to `visible`, and after its last listener leaves, its `visibilitychange` listener is removed.
- `makeRefreshOnSignal` with a custom signal atom refreshes on each signal change.
- `searchParam` reads the current URL value, and writing it updates `location.search` without a reload.
- Two writes in one tick produce one URL update.
- A `popstate` carrying a new value updates the atom.
- `searchParam` with a schema decodes a valid value, and a malformed value reads as the decode-failure outcome instead of throwing.
- Two registries on one page keep separate search-parameter coordinators.

**Verification:** The core browser project passes, and Success Criterion 10 holds.

### U19. CI mutation enrollment for the engine

**Goal:** CI's Mutation workflow discovers the core package and mutates the propagation engine.
**Requirements:** R22; KTD17.
**Dependencies:** U17.
**Files:** `packages/atom/effect-atom/stryker.config.ts`, `packages/atom/effect-atom/package.json`, `packages/atom/effect-atom/tsconfig.node.json`, `packages/atom/AGENTS.md`.
**Approach:**

1. Mirror `packages/effect-daemon-spec/stryker.config.ts` (runner, checker, ignorers, test-contribution plugin) with KTD17's mutate glob, and add the `mutation` script and dev dependencies that package declares.
2. Rewrite AT4: the core engine is enrolled through `stryker.config.ts`; `node-lifetime.ts` is never mutated; the React package is not enrolled.
3. Land it in its own commit (Evaluator surface).

**Execution note:** Never start Stryker locally (REPO-D3); confirm enrollment with the discovery script's output.
**Test expectation:** none -- evaluator configuration; the CI Mutation run is the proof.
**Verification:** On the pull request, the Mutation workflow's discovery lists `packages/atom/effect-atom`, and its run uploads a report inside the 30-minute budget.

### U21. Surviving-mutant disposition

**Goal:** Every mutant the first CI Mutation run leaves alive is killed or named equivalent.
**Requirements:** R22, Success Criterion 9; KD10.
**Dependencies:** U19 and its first CI Mutation report.
**Files:** `packages/atom/effect-atom/tests/__fixtures__/registry-program.fixture.ts`, `packages/atom/effect-atom/tests/*.differential.test.ts`, and any integration file a survivor points to.
**Approach:**

1. Read the survivors from the CI report artifact.
2. Kill each with the program family or scenario that observes it, or record why it is equivalent.
3. When survivors exceed one pass, record the remainder as pull request residuals, each with file, line, and operator.

**Execution note:** Never start Stryker locally (REPO-D3); the next CI run confirms the kills.
**Test scenarios:** Set by the survivor list. Each added program family or scenario names the mutant it kills (file, line, operator) in the pull request.
**Verification:** The next CI Mutation report shows every first-run survivor killed, or the pull request lists it as equivalent or residual.

### U20. Changeset, doctrine, and pull request record

**Goal:** The release note and the pull request state what changed for consumers and how strong the spec now is.
**Requirements:** R14, R12; Success Criteria 8-10.
**Dependencies:** U15-U19, U21.
**Files:** `.changeset/curvy-poets-hide.md`, `packages/atom/AGENTS.md`.
**Approach:** Add the consumer-observable propagation changes (R17-R19) to the changeset body. The pull request body records the KTD15 scenario rewrite, the spec-only coverage figures, and the first mutation score.
**Test expectation:** none -- release metadata and documentation.
**Verification:** The changeset guard passes, and the leaf `AGENTS.md` Verification block names the browser project.

---

## Verification Contract

| Gate         | Command                                                                                                          | Applies to      |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | --------------- |
| Types        | `pnpm --filter @systemfsoftware/effect-atom typecheck` and the same for `@systemfsoftware/effect-atom-react`     | every unit      |
| Lint         | `pnpm --filter <pkg> lint` and `pnpm --filter <pkg> lint:tsgo`                                                   | every unit      |
| Behaviour    | `pnpm --filter <pkg> test` (React needs `pnpm exec playwright install chromium`, AT6)                            | every unit      |
| Type surface | `pnpm --filter <pkg> test:types`                                                                                 | U13 onward      |
| Packaging    | `pnpm --filter <pkg> build` (runs `dts:check` and `api:check`) and `pnpm --filter <pkg> attw`                    | U9, U10, U14    |
| Repository   | `pnpm check:local`                                                                                               | final           |
| CI           | `gh pr checks --watch --fail-fast`                                                                               | final           |
| Spec depth   | Coverage of the differential specs alone (`vitest run tests/*.differential.test.ts` with coverage over `src/**`) | U16, U17, U20   |
| Mutation     | CI Mutation workflow (advisory), report attached to the pull request                                             | U19, U21, final |

Local mutation runs stay forbidden (REPO-D3); U19's score comes from the CI Mutation workflow. An agent re-runs any red suite with `--bail=0` before reporting a failure count (KTD19).

---

## Definition of Done

- Every R-ID is implemented and every AE has a passing scenario.
- Every gate in the Verification Contract exits 0 after the last edit.
- Review confirms: no module-level mutable state or live instance in either `src/` (Success Criterion 7); every exported combinator and handle operation is `dual` over a `Pipeable` subject (`pipeable-dual-parity.md`); no `.port.ts` or `.layer.ts` file and no static `layer`/`*Live` export.
- Every TypeId literal is byte-identical to its value before this work.
- No abandoned-attempt code, commented-out blocks, or unused modules remain in the diff.
- The pull request body carries the scenario disposition exceptions (U14) and any residual review findings.
- R17-R23 are implemented, Success Criteria 8-11 hold or each gap is listed with its reason in the pull request, U19 landed in its own commit, and every first-run surviving mutant is killed, named equivalent, or listed as a residual.
