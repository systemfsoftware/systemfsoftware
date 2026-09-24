---
title: Closed Discern Label Sets - Plan
type: feat
date: 2026-09-24
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Closed Discern Label Sets - Plan

## Goal Capsule

- **Objective:** A discern caller can no longer compile a classification or rating whose label set is infinite or empty, so every label mistake the matcher already guards against (a duplicate case, a label typo, a level off the scale, an unprovable `exhaustive`) is refused by the compiler again.
- **Means:** refuse non-finite label sets at the public `classify`/`rate` constructors (KTD1); the one internal open-label path keeps an unguarded constructor (KTD2).
- **Authority:** R-IDs win on behavior; KTDs win on mechanism; `packages/discern/AGENTS.md` rules D1-D6 bind every unit.
- **Stop conditions:** stop if the guard needs a cast or `@ts-expect-error` in `src/` (D5), or if it changes `Procedure.registry` routing behavior or decision identity (D4).
- **Execution profile:** type-level change plus one internal call-site switch; no runtime behavior changes.
- **Finish and ship:** one PR against `main` with a changeset.

---

## Product Contract

### Summary

Public `classify` and `rate` accept only a finite, non-empty literal label set. A label set that is `string`, contains an infinite member (`` `tone-${string}` ``, `` `${number}px` ``, `Uppercase<string>`), or is empty is a compile error at construction. Labels known only at runtime keep two public paths that never claim label proofs: `Discern.decision` over an effect `Decision.classify`, read with `Discern.where`, and `Procedure.registry` for routing.

### Problem Frame

Every label guard in discern compares the caller's label against the decision's label union: `[Label] extends [All]` in `is`, `oneOf`, `margin`, `atLeast`, `atMost`, `between`, `[Label] extends [Remaining]` in `case`, and `Remaining` = `never` in `exhaustive`. When the label type is `string` or another infinite string type, the comparisons always pass and `exhaustive` never can; when it is `never` (empty criteria), no label check passes and `exhaustive` passes vacuously. Probes compiled under tsc 7.0.2 and TS 6.0.3 showed a duplicate `'none'` case and a typo `'nnoe'` both compiling against a registry-loaded classifier (`criteria: Record<string, string>`). That open shape is the common one for AI taxonomies loaded from prompt registries, where a silent label mismatch sends model answers down the wrong branch.

### Requirements

**Constructor refusal**

- R1. `Discern.classify`, `Discern.on(schema).classify`, `Discern.rate`, and `Discern.on(schema).rate` refuse a label set that is empty or has any infinite string member.
- R2. A finite literal label set keeps compiling at every constructor, including a `rate` criteria array written inline or held in an `as const` constant, and keeps every downstream proof (`match`, `case`, `exhaustive`, `is`, `atLeast`).

**Runtime routing**

- R3. `Procedure.registry` keeps routing over its runtime-computed candidate subset with unchanged behavior and unchanged decision identity (hash and fingerprint, D4).

**Consumer contract**

- R4. The published docs state the finite-set rule and name the two runtime-label paths: `Discern.decision` read with `Discern.where`, and `Procedure.registry`.

### Key Decisions

- **Compile-time error readability is not a goal; no named diagnostic types are added.** (session-settled: user-directed — chosen over branded named diagnostics such as `DuplicateCaseError<L>`: the user ruled readability out, and probes showed those diagnostics cannot sit on Blueprint methods and disappear under tsc 7 overload reporting.) Governs R1.

### Scope Boundaries

- The existing `never`-based guards (`case`, `is`, `atLeast`, …) stay as they are; this plan restores their meaning, it does not restyle them.
- No public open-taxonomy decision kind (a classifier with no `match`/`exhaustive` that must end in `orElse`).
- No runtime validation change: model answers are already decoded against the criteria keys.

#### Deferred to Follow-Up Work

- Deciding whether runtime-label taxonomies need dispatch beyond `Discern.decision` + `Discern.where` and `Procedure.registry`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A label set is refused when it is `never` or any member is an infinite string type, tested by `{} extends Record<Member, never>`.** An infinite string type (`string`, a template literal with a `string`/`number` hole, an intrinsic like `Uppercase<string>`) makes `Record<Member, never>` an index signature that `{}` satisfies; a finite literal does not. The check distributes over the union so one infinite member refuses the set, and a separate `[Label] extends [never]` check refuses the empty set. When refused, `criteria` resolves to `never`. This is type-fest's `IsStringLiteral` technique (`source/is-string-literal.d.ts`). A plain `string extends Label` check was rejected because it accepts `` `tone-${string}` ``, `` 'a' | `${number}px` ``, and `{}`. Governs R1, R2.
- KTD2. **The refusal lives on the four public constructor signatures; `ClassifyOptions`, `RateOptions`, `classifyFor`, and `rateFor` stay unguarded.** Internal code and effect's `Decision.classify`/`Decision.rate` never see a conditional type, and a guarded options object forwards to `classifyFor` without a cast under both compilers. Governs R1, R2.
- KTD3. **`Procedure.registry` builds its routing decision through an internal open-label constructor, not the public `on(routeInput).classify`.** Its candidate ids are computed per call (`criteriaOf` returns `Record<string, string>`), so its label type is `string` by construction and its ids are checked at runtime. The internal constructor is exported from `decision.blueprint.ts` only, never from `src/Discern/mod.ts` (D1). Governs R3.
- KTD4. **Refusals are asserted with tstyche `not.toBeCallableWith`, matching the existing refusal laws** in `packages/discern/test-types/discern.tst.ts`. Type laws are the only layer that observes a compile-time refusal; acceptance of finite sets is already covered by every existing suite that builds a literal classifier, so no acceptance law is added. Governs R1.

### Assumptions

Three structural assumptions this plan rests on, stress-tested under the Edge-First lens (boundary cases over the happy path):

1. `string extends Label` alone captures every open label set. Refuted: probe p10 showed it accepts template-literal, mixed, and empty sets; KTD1 replaced it.
2. A guarded public signature can forward to an unguarded internal constructor without a cast. Confirmed by probe p11 under tsc 7.0.2 and TS 6.0.3 (whole-object forwarding and field-by-field forwarding both compile).
3. The guard reaches external consumers. A conditional type in a public signature, and a module-private alias it references, survive declaration emit (the alias is emitted locally). No gate inspects `dist/` for the guard; `attw` only proves the packed declarations resolve. Accepted residual risk.

`packages/discern/etc/discern.api.md` lists namespace members only, so the signature change may leave it unchanged; if `api:check` reports a diff, the report is regenerated with `api:update`. The change is breaking at the type level for any external caller with an open label set; under REPO-R1 it ships directly with a `minor` changeset (pre-1.0).

### Sources

- Probes and compiler output (local, gitignored): `.context/compound-engineering/ce-prototype/2026-09-24-named-diagnostics-failures/01-where-named-diagnostics-fail/`. p5 shows the open-set hole, p9 the `string` guard, p10 the finite-set guard, p11 cast-free forwarding.
- type-fest `IsStringLiteral`: https://github.com/sindresorhus/type-fest/blob/main/source/is-string-literal.d.ts
- `docs/solutions/architecture-patterns/blueprint-type-index-reads.md`: tstyche (TS 6.0.3) and `tsc` (TS 7.0.2) can disagree on blueprint types, so both `typecheck` and `test:types` must pass.

---

## Implementation Units

### U1. Refuse non-finite label sets at the public constructors

- **Goal:** `classify`, `rate`, `DecisionScope.classify`, and `DecisionScope.rate` refuse empty and infinite label sets (KTD1, KTD2).
- **Requirements:** R1, R2
- **Dependencies:** none
- **Files:** `packages/discern/src/decision.blueprint.ts`, `packages/discern/test-types/discern.tst.ts`
- **Approach:**
  1. Add a module-private finite-set type per KTD1.
  2. Change the four public signatures (`classify`, `rate`, and the `classify`/`rate` members of `DecisionScope` and `on`) so `criteria` resolves to `never` for a refused set.
  3. Forward to `classifyFor`/`rateFor` unchanged; keep `src/` free of casts and `@ts-expect-error` (D5).
- **Patterns to follow:** the refusal laws under `describe('the exhaustive classification match')` and the scoped/unscoped match laws in `packages/discern/test-types/discern.tst.ts`.
- **Test scenarios:**
  - `Discern.classify` and `Discern.on(Schema.String).classify` are not callable with `criteria` typed `Record<string, string>`.
  - `Discern.on(Schema.String).classify` is not callable with `criteria` typed ``Record<`tone-${string}`, string>`` or ``Record<'a' | `${number}px`, string>``.
  - `Discern.on(Schema.String).classify` is not callable with `criteria: {}`.
  - `Discern.rate` and `Discern.on(Schema.String).rate` are not callable with `criteria` typed `Array<string>` or with `criteria: []`.
- **Verification:** the new laws pass under `test:types` (TS 6.0.3), the package `typecheck` (TS 7.0.2) stays clean, and every existing literal-set suite still compiles.

### U2. Route Procedure.registry through an internal open-label constructor

- **Goal:** the registry's per-call routing decision compiles after U1 without widening the public surface (KTD3).
- **Requirements:** R3
- **Dependencies:** U1
- **Files:** `packages/discern/src/decision.blueprint.ts`, `packages/discern/src/registry.blueprint.ts`
- **Approach:**
  1. Export an internal constructor from `decision.blueprint.ts` that takes the input schema and unguarded `ClassifyOptions<string>` and delegates to `classifyFor`, the same call `on(schema).classify` makes today.
  2. Replace `on(routeInput).classify(…)` in the registry's decision builder with it; keep the `id` field logic and `criteriaOf` untouched so decision identity is unchanged (D4).
  3. Do not re-export it from `src/Discern/mod.ts` (D1).
- **Patterns to follow:** existing module-internal exports consumed across `src/` (for example `ask` and `on` imported by `registry.blueprint.ts`).
- **Test scenarios:** Test expectation: none -- behavior-preserving call-site switch; the existing registry routing tests and `tests/caching-and-budgets.integration.test.ts` / `tests/recording-and-replay.integration.test.ts` (D4) must pass unchanged.
- **Verification:** package `test`, `typecheck`, and `build` (with `api:check`) pass; the namespace export list in `etc/discern.api.md` gains no new member.

### U3. Document the finite-set rule and ship the changeset

- **Goal:** consumers learn the rule and the release carries it (R4, REPO-R2).
- **Requirements:** R4
- **Dependencies:** U1, U2
- **Files:** `packages/discern/README.md`, `.changeset/<generated>.md`
- **Approach:**
  1. In the README decision-kinds section, state that `criteria` must be a finite literal label set (inline object or array, or `as const`), that an open or empty set is a compile error, and that runtime labels use `Discern.decision` over an effect `Decision.classify` read with `Discern.where`, or `Discern.Procedure.registry` for routing.
  2. Add a `minor` changeset for `@systemfsoftware/discern` via `pnpm change`, with consumer-observable facts only.
- **Test scenarios:** Test expectation: none -- documentation and release metadata only.
- **Verification:** the changeset check accepts the PR; README examples still match the tested API.

---

## Verification Contract

| Gate                 | Command                                             | Proves                                                     |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Type laws (TS 6.0.3) | `pnpm --filter @systemfsoftware/discern test:types` | R1 refusals                                                |
| Typecheck (TS 7.0.2) | `pnpm --filter @systemfsoftware/discern typecheck`  | R2 literal sets still compile; U2 registry switch compiles |
| Runtime suite        | `pnpm --filter @systemfsoftware/discern test`       | R3 routing and decision identity unchanged                 |
| Lint                 | `pnpm --filter @systemfsoftware/discern lint`       | D3 preset, no new suppressions                             |
| Build and API report | `pnpm --filter @systemfsoftware/discern build`      | D1 namespace surface unchanged                             |
| Packed types         | `pnpm --filter @systemfsoftware/discern attw`       | published declarations resolve for external consumers      |
| Repo gate            | `pnpm check:local`                                  | REPO-D1                                                    |

---

## Definition of Done

- R1-R4 hold, each backed by a passing gate in the Verification Contract.
- No `as`, `@ts-expect-error`, `throw`, or `orDie` was added under `packages/discern/src` (D5).
- `src/Discern/mod.ts` exports nothing new (D1).
- A `minor` changeset for `@systemfsoftware/discern` exists.
- No abandoned-attempt code (dead helpers, unused type aliases) remains in the diff.
