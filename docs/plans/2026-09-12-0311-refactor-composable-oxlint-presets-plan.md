---
title: Composable oxlint plugins and two canonical presets - Plan
type: refactor
date: 2026-09-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
execution: code
---

# Composable oxlint plugins and two canonical presets - Plan

## Goal Capsule

- **Objective:** The lint surface becomes a fragment library composed by exactly two canonical preset roots — a **very strict canonical set for all product code, no escape hatches**, and an **instrument set for the oxlint-plugin subtree**, which operates in a declared non-endgame state — with `@systemfsoftware/all` reduced to a pure re-export that declares nothing. Both re-key aggregates (`@systemfsoftware/oxlint-plugin`, `@systemfsoftware/oxlint-plugin-effect-dmmf`) die and every rule id becomes `<owning package>/<rule>`, set once, never re-keyed. `base` survives this change as a **derived transitional preset** (no aggregate imports, no hand-spreads); its deletion and the strict enrollment of the 19 ex-base packages are a separate follow-up plan.
- **Means:** Each plugin package ships a self-registering `./preset` config fragment (measured host semantics: `extends` concatenates `jsPlugins`, merges `rules`, concatenates `overrides`); one public preset package owns the two extends-roots; consumer configs collapse to one-line `extends` plus their own ignores.
- **Authority:** Root `AGENTS.md`; `packages/oxlint-plugin/AGENTS.md`; the endgame article draft (2026-09-12, `/tmp/endgame`, user-authored — its `check:` columns are the rule-set authority); `docs/census/oxlint/CENSUS.md` (measured inventory); oxlint 1.77.0 host semantics measured this session.
- **Execution profile:** Two sequential deliveries in this change (A composition, B namespace cutover), each its own PR watched to green (REPO-D1); the strict migration and `base`'s deletion are a named follow-up plan. Evaluator-surface edits in standalone commits (CONST-E8).
- **Stop conditions:** Definition of Done. No intermediate yield.

---

## Product Contract

### Summary

Today one architecture is linted through thirteen plugin packages, two re-key aggregates, and two parallel hand-maintained presets (`all` public, `base`/`strict` private) that have already drifted — five published rules never load in nineteen packages, nothing reports it, and four consumers must reach into the preset's shape to append an ignore glob (`docs/census/oxlint/CENSUS.md`). This change replaces every hand-spread with derivation: plugins register themselves, a single preset package composes fragments into the two canonical roots, `all` re-exports the canonical root, and the plugin subtree lints itself with the instrument root. Rule namespaces become the owning package names, permanently.

### Problem Frame

Three structural defects, all measured:

1. **Inert recommendation.** oxlint never dereferences a plugin's `configs` (`ExternalPluginEntry` carries no configs concept; `docs/.../a-disable-comment-names-the-config-key.md`). A plugin's recommended set takes effect only where a config author hand-spreads it — today in four places (`oxlint-plugin/index.ts`, `effect-dmmf/index.ts`, `all/src/mod.ts`, `oxlint-config.base.ts`), which is why the presets drifted.
2. **Namespace invention.** Both aggregates re-key other packages' rules under their own names. One rule carries up to three names; the tsc-eslint leak catalog (eslint/eslint discussion #17766) shows alias divergence across composed configs produces duplicate diagnostics and option deadlock. Oxlint's host already namespaces at registration (`{ name, specifier }` measured to override `meta.name`), so the aggregates re-implement the host badly.
3. **Two declaration surfaces.** `all` (public, used by 6 stryker-family configs, one of which spreads `{...all}` and thereby silently drops `overrides` — `oxlint-preset-overrides-are-replaced-by-a-spread.md`) and `base` (private, used by 19 configs, missing cell-vocabulary and entrypoint). Extends semantics make this worse: `ignorePatterns` and `plugins` are **replaced**, not merged (measured this session), forcing shape reach-in.

### Key Decisions (session-settled)

- **KD1.** `@systemfsoftware/all` never declares anything — its source is re-exports only. (user-directed)
- **KD2.** `@systemfsoftware/oxlint-config` dies entirely — `base`, `strict`, and the package. One new public preset package owns composition; tiers become exports of that one package. (user-directed; sequencing amended same session — the deletion lands as the follow-up strict-migration's last act, not in the reorganization, per KD7)
- **KD3.** The canonical root is **very strict by default: no escape hatches** — no `warn` tier (ENFORCE-L5), no allowlists, no baselines, no opt-down fragment. Strictness lands by fixing code, never by carving exceptions (`an-escape-hatch-is-an-unfalsified-hypothesis.md`). (user-directed — chosen over a separate `/strict` opt-in tier: a strict core with a documented opt-down is two presets again with the drift class reborn.) The canonical root SHIPS strict in this change; the ex-base packages enroll onto it in the follow-up. Scope ruling (recorded): the no-escape clause binds the **published** canonical root too — external `extends: [all]` consumers receive the strict tier at `all`'s major bump, and the adopter escape is semver pinning of the prior major, not an opt-down tier (typescript-eslint's own `strict` ships the same way, as an unstable escalation consumed via `extends`).
- **KD4.** The oxlint-plugin subtree operates in a **non-endgame state** with its own canonical instrument root: the endgame's own carve-out (`04-products`: "Evaluator surface … is not part of this topology"). Instrument = the law-independent defect tier, no article rules, no complexity ceilings. (user-directed)
- **KD5.** Both re-key aggregates die; rule ids = owning package names. Churn-once (REPO-R1 blesses; alias preservation is only possible 1:1 and ours is 3→1 and 5→1). (derived from KD1–KD2 + the leak catalog)
- **KD6.** Article consolidation (merging the ten leaves into the six endgame-article packages) is **deferred** — leaf names are already domain-named, the churn budget is spent on the namespace cutover, and consolidation without new rules buys renaming only. Accepted cost (recorded): consolidation re-renames ids a second time; churn-once refers to this cutover, and the consolidation plan's changesets will carry that second break. The disposition table (authored in the follow-up stub, U0(c)) is the input a later plan needs.
- **KD7.** The reorganization changes lint **structure only**: plugin packages, preset packages, consumer config files, suppression comments, and manifests. No product package's source logic changes in this change — every code fix belongs to the follow-up strict-migration plan. (user-directed: "blast radius too wide for a PR that should just be re-organizing oxlint")

### Measured host semantics (oxlint 1.77.0, this session — the plan's load-bearing facts)

| `extends:[p]`, child then sets key                           | behavior                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules`                                                      | merge, union per id, last wins                                                                                                                                                                                                                                                                                      |
| `jsPlugins`                                                  | **concatenate**                                                                                                                                                                                                                                                                                                     |
| `overrides`                                                  | concatenate                                                                                                                                                                                                                                                                                                         |
| `ignorePatterns`                                             | **replace**                                                                                                                                                                                                                                                                                                         |
| `plugins`                                                    | **replace** (documented in `dist/index.d.ts`)                                                                                                                                                                                                                                                                       |
| `{ name, specifier }` alias                                  | overrides plugin `meta.name` for rule ids                                                                                                                                                                                                                                                                           |
| relative `'./p.ts'` plugin specifier in an extended config   | **rejected** — package name or absolute path only                                                                                                                                                                                                                                                                   |
| `import.meta.resolve('<own package>')` from inside a package | resolves own `dist` (self-reference)                                                                                                                                                                                                                                                                                |
| string `extends: ['<npm package>']`                          | **no npm resolution** (oxc#17320) — composition is object-form only: the consumer imports the config object and lists it in `extends` (the TypeScript config form; every consumer config in this repo already does this)                                                                                            |
| self-reference resolution basis                              | Node resolves self-reference from the package's own `package.json` ancestor walk (node#47681: it works from within the package, never from an arbitrary external path) — the fragment executes inside its own leaf, so consumer layout does not divert it; verified for published layout by R6's tarball simulation |

### Target Architecture

```
 FRAGMENTS — each owns its declarations; nothing else may state them
   <plugin>/preset   defineConfig({ jsPlugins: [import.meta.resolve('<self>')],
                                     rules: <own configs.recommended.rules> })
                     — sets jsPlugins + rules, optional file-glob overrides
                       (never plugins/ignorePatterns)
   oxlint-plugin-recommended   the stock defect tier (loses no-ternary and
                               switch-exhaustiveness to the canonical root —
                               they are CONST-P2 expression law, not law-independent)
   oxlint-preset/defaultIgnores  named glob export consumers spread

 ROOTS — @systemfsoftware/oxlint-preset (new, public; plugins as dependencies)
   ./            CANONICAL: extends [recommended, the ten leaf ./preset
                  fragments: effect-native, tag-discipline, structure,
                  effect-schema, effect-workflow, property-testing,
                  test-hygiene, test-placement, cell-vocabulary,
                  effect-entrypoint] + plugins:[stock] + categories
                  correctness:error + complexity tiers + no-ternary +
                  no-restricted-imports. VERY STRICT. No hatches (KD3).
                  (Post-Delivery-B chain; Delivery A briefly holds the
                  aggregate form oxlint-plugin/preset + effect-dmmf/preset
                  until R9 deletes them.)
   ./instrument  INSTRUMENT: extends [recommended] + plugins:[stock] +
                  categories correctness:error. Nothing else (KD4).

 @systemfsoftware/all   export { default } from '@systemfsoftware/oxlint-preset'
                        (+ defaultIgnores) — declares nothing (KD1)
 CONSUMERS
   product packages          19 keep `extends: [base]` for now (follow-up flips them);
                             6 stryker-family keep `extends: [all]`
   packages/oxlint-plugin/*  extends: [oxlint-preset/instrument]

 TRANSITIONAL (dies with the follow-up strict migration)
   oxlint-config/base  re-derived: extends [ten leaf fragments + oxlint-plugin-recommended]
                       at today's-base strictness — no aggregate imports,
                       no hand-spread plugin sets; the 19 park here (KD7)

 DIES NOW   oxlint-plugin (aggregate) · effect-dmmf (aggregate) · the
            subtree's inline baseline config · every hand-spread
```

---

### Requirements

- **R1.** Every **leaf** plugin package in `packages/oxlint-plugin/` (the twelve with `configs.recommended.rules`; `@systemfsoftware/oxlint-plugin-recommended` is excluded — it registers no plugin and is consumed via `extends` directly by both roots) exports `./preset` derived from its own default export: `jsPlugins` is exactly `[import.meta.resolve('<own package name>')]`, `rules` is exactly its own `configs.recommended.rules`. A fragment MAY carry `overrides` (file-glob-scoped only — `extends` concatenates them, so a leaf's test-path scoping stays leaf-owned instead of petitioning the root); it never sets `plugins` or `ignorePatterns`. Gate: per-package registration test asserts the fragment equals the derivation (fails if either side drifts); fragment sets no other config key (asserted mechanically).

- **R2.** `configs.recommended` stays the single source of a plugin's recommendation; no fragment, root, or consumer hand-copies a rule id list that a plugin already owns. Gate: grep for `configs?.recommended` spreads outside `*/preset.ts` and the preset package returns only the derivation sites.
- **R3.** `@systemfsoftware/oxlint-plugin-recommended` drops `no-ternary` and `typescript/switch-exhaustiveness-check` from its exports (they move to the canonical root as its own declarations); everything else it exports is unchanged. Still declaration-data-only (`RC1` gate unchanged). Gate: `guard-no-behavior.mjs` green; its test suite updated.
- **R4.** New package `@systemfsoftware/oxlint-preset`: canonical root `./` (strict, per KD3 — it ships strict now; the ex-base packages enroll in the follow-up) and instrument root `./instrument` per the Target Architecture; leaf plugins and `oxlint-plugin-recommended` are `dependencies` (ESLint shareable-config law; oxc#23944 workaround pattern). `defaultIgnores` reach (recorded): it serves the 6 `all`-consumers in this change; the 19 ex-base consumers adopt it in F1's flips — the seam is born narrow and grows with the follow-up, not before. Instrument tier (recorded): `./instrument` inherits `recommended`'s rules **and its test-path `overrides` verbatim** — test hygiene (`vitest/no-focused-tests`, `no-disabled-tests`, `expect-expect`, …) is ruled law-independent defect tier, not article law; instrument adds nothing on top. Gate: package `typecheck`/`lint`/`attw`; a host-semantics probe suite (below) passes.
- **R5.** `@systemfsoftware/all` source is re-exports only — `export { default } from '@systemfsoftware/oxlint-preset'` plus the `defaultIgnores` re-export; its `rules`/`overrides`/`plugins`/`ignorePatterns`/`jsPlugins` exports are gone (consumers use `defaultIgnores`). Gate: a test asserts `all`'s module source contains no `defineConfig(` call and its built default deep-equals the canonical root's default.
- **R6.** Host-semantics probe suite in `oxlint-preset`'s tests pins the measured table (jsPlugins concat, rules merge, ignorePatterns replace, plugins replace, alias-wins, relative-specifier rejection, string-extends npm-resolution gap per oxc#17320, self-reference resolution per node#47681) against the installed oxlint, and asserts every `extends` in the repo is object-form (imported config objects — string extends cannot carry `jsPlugins` across packages). Plus a **published-tarball simulation**: `pnpm pack` the preset, install it into a fresh throwaway project (pnpm, offline), run oxlint against a config extending the canonical root, assert every rule key in the resolved rules map maps to a loaded jsPlugin — proving `import.meta.resolve('<self>')` holds under consumer layout, not just in-workspace. Gate: suite green; a semantics change in oxlint turns it red before anything else breaks.
- **R7.** The `packages/oxlint-plugin/` subtree's inline `oxlint.config.ts` baseline becomes `extends: [instrument]`; the per-package configs in the subtree keep only local deltas (they are in this gate's scope: each keeps overrides/deltas only, declares no plugin set). Build order (recorded): the subtree lint presupposes `oxlint-plugin-recommended` and `@systemfsoftware/oxlint-preset` are built — `instrument` extends a workspace peer and reads its `dist`; a stale or missing build silently lints against old rules (the lint task depends on the build outputs, turbo ordering enforces it). Gate: subtree `pnpm --filter './packages/oxlint-plugin/*' lint` green after build; the baseline file declares no `rules` of its own.

**Namespace cutover (Delivery B — breaking, ids change once, no product source changes)**

- **R8.** The three private leaves become public packages unchanged in content: `oxlint-plugin-effect-native`, `oxlint-plugin-tag-discipline`, `oxlint-plugin-structure` — each gains `publishConfig`, api-extractor wiring, README install section, and its existing mutation cell. Gate: per-package `build` incl. `api:check` and `attw`.
- **R9.** `@systemfsoftware/oxlint-plugin` and `@systemfsoftware/oxlint-plugin-effect-dmmf` are deleted; the canonical root's extends-chain re-points from the two aggregates to the fragments of the ten leaf packages. Every rule id in the tree is `<owning package>/<rule>`. Gate: preset registration test asserts the canonical rules map equals the union of the ten leaves' recommended sets under their own namespaces (the generalized `base-registration.test.ts`); grep for `@systemfsoftware/oxlint-plugin/`, `@systemfsoftware/effect-dmmf/`, and `@systemfsoftware/oxlint-plugin-effect-dmmf/` across configs and sources returns 0.
  **R10.** `base` becomes `extends: [the ten leaf fragments, @systemfsoftware/oxlint-plugin-recommended]` plus only its own today's-strength stock deltas — no aggregate imports, no hand-spread plugin sets (R2 holds); the retained stock deltas (the `typescript/*` severity lifts, `no-console: off`, the warn→error promotion, and the two test/fixture `overrides` blocks) are **enumerated in the plan's working notes and each asserted by the mechanical diff** — `base`'s hand-typed rule keys are in the gate's scope, not just `configs.recommended` spreads, so the "zero hand-spreads" criterion cannot pass over a surviving literal derivation site. Mechanically gated: a recorded mechanical diff shows `base`'s resolved rules map ≡ the pre-change map modulo namespace re-keying; the subtree grep gate (R9) passes. Its 19 consumers keep `extends: [base]` untouched.
- **R11.** Disable comments naming dead namespaces are swept to owning-package ids; the pre-sweep count is measured in U0 and the sweep lands in one commit. Gate: the R9 grep gate covers comments; one differentially probed disable (delete-the-suppression, lint flips red) recorded in the PR per `a-disable-comment-names-the-config-key.md`.
- **R12.** Changesets: breaking bump for `all` (major), debut intents for the three newly public leaves, deletion intents for the two dead aggregates (each naming the suppression-id migration: disable comments naming the dead namespaces go silently inert — re-key to `<owning package>/<rule>`), and a **major** for `@systemfsoftware/oxlint-config` (consumer-observable: diagnostic ids change to owning-package namespaces — breaking by the changeset doctrine, not a patch); per REPO-R1 alpha, breaking is direct; the changesets cite U0(b)'s audit. Gate: `scripts/guards/check-changeset.ts` green; no intent names a package that does not exist.

**Doctrine (this change)**

- **R13.** `packages/oxlint-plugin/AGENTS.md`'s topology section is rewritten for fragments + two roots + the non-endgame state, and records the follow-up contract (below) as the sanctioned death of `base`; the three plugin READMEs' "adopt gradually at `warn`" advice is deleted (contradicts KD3/ENFORCE-L5). Gate: review; grep `': 'warn'` over `packages/oxlint-plugin/**/README.md` returns 0.

**Follow-up strict-migration plan (separate plan, separate PRs — recorded here as the binding contract, not executed by this change)**

- **F1.** Fix-then-flip, package by package: each of the 19 ex-base packages drives its measured red set to zero by code fixes (own commits), then flips `extends: [base]` → `extends: [all]` + `defaultIgnores` as its final commit. Largest-red packages first. Gate: per-package lint green before and after its flip.
- **F2.** Canonical strictness is unconditional at `error` — complexity ceilings (`max 2` on `**/src/**`, `max 1` on `**/src/**/*.workflow.ts`, `variant: modified`, off for test files), `no-ternary`, `typescript/switch-exhaustiveness-check`, `no-restricted-imports`, the full defect tier. No `warn` literal, no allowlists, no baselines anywhere (KD3, ENFORCE-L5). Gate: grep `': 'warn'` over `packages/**/oxlint.config.ts` and the preset sources returns 0.
- **F3.** Non-conformant code resolves through exactly four dispositions, in order — **fix** (default; complexity/no-ternary extraction toward small pure functions, `node:*` → `@effect/platform`, the strict trio is type hygiene), **declare** (CONST-W3 in the PR — the only legal bypass), **reclassify** (evaluator-surface code moves to `instrument`), **delete** (CONST-S4). Article rules are self-gating (Cell descriptions, `*.workflow.ts`, `*.schema.ts`), so the delta an ex-base package inherits is the enumerable non-self-gating set: two complexity ceilings, `no-ternary`, `switch-exhaustiveness-check`, `no-unnecessary-condition`, `strict-boolean-expressions`, `no-restricted-imports`, the test-file vitest tier.
- **F4.** `@systemfsoftware/oxlint-config` is deleted after the last flip (KD2). Gate: no manifest resolves it; repo-wide audit that no hatch exists — every surviving exception a CONST-W3 declaration named in its PR.

**Deferred (KD6 — out of this change's identity)**

- Article consolidation of the ten leaves into endgame-article packages; the disposition table (authored in the U0(c) follow-up stub) is its input.
- New endgame rules (CELL-L2/L4/L10/M1, CORE-BND1/D3, SURF-AFF1/INT1, STORE-CAP1/ENC1, PROD-CFG1), each with its own RuleTester suite and red-green proof.
- Demotions out of oxlint (label-routed `no-io-boundary-tests` filename routing, test-placement's directory-shape rules → content-keyed re-derivation or deletion; type-carried checks → `effect-cell-types`).
- OX conventions (`OX-TS2`, `OX-CS1`, `OX-EF1`) promoted from grep-gates to cross-package lint rules.
- Deprecating the four source-less published names (`cell-imports`, `cell-taxonomy`, `effect-executor`, `effect-kernel`) — registry actions, not tree work.

### Success Criteria

- Zero hand-spread recommended sets anywhere in the tree; the census's four derivation sites are gone, replaced by per-plugin `./preset` derivations pinned by registration tests — and the transitional `base`'s retained stock deltas are enumerated and diff-asserted (R10), so no literal derivation site survives under a green criterion.
- Exactly two lint declaration surfaces exist **for new work, and in full after F4**: `@systemfsoftware/oxlint-preset`'s two roots, and each consumer's own `oxlint.config.ts`. `all`'s source declares nothing. Until F4, the tree ships **three** surfaces — two permanent plus the transitional `base` (KD7), death-dated by the follow-up stub plan opened in U0(c); this plan's merge-state claim is "two permanent + one transitional, owned and dated", not "exactly two today".
- Every rule id equals its owning package's name; the delivery asymmetry (5 rules unreachable in 19 packages) is structurally impossible — the canonical root extends every plugin's fragment.
- No consumer reaches into a preset's shape to extend it: `all.ignorePatterns`-style access is gone; `defaultIgnores` is the only composition seam, and it is a named export, not a shape dependency.
- **The PR diffs contain no product-package source-logic changes** (KD7): `packages/oxlint-plugin/**`, the new preset package, `oxlint.config.ts` files, suppression comments, and manifests only — auditable by a mechanical diff-stat over `src/` trees outside the subtree.
- `pnpm check:local` green after each delivery.

### Scope Boundaries

In scope: R1–R13, the two deliveries, U0(a)–(c), doctrine and README corrections, changesets.

Deferred to the named follow-up strict-migration plan (F1–F4): every ex-base package's flip, every product code fix, `base`'s deletion, the zero-`warn` audit, the strict red-set dry run (that plan's evidence step, opened as its stub in U0(c)).

Outside this change's identity: rule semantics, messages, or options (moves are 1:1); the stryker-js fork's own packages beyond their config's `extends` target; mutation-cell topology (leaves keep their cells; neither aggregate had one); article consolidation (KD6).

## Implementation Units

**U0 (evidence, its own commits).** (a) Measure the disable-comment count for the two dead namespaces (R11 consumes it). (b) External-consumer audit: npm dependents + public code search for `extends: ['@systemfsoftware/all']` and the two dying namespaces in suppressions; record the consumer count and their migration cost under `docs/census/oxlint/` — Delivery B's breaking changesets cite it (R12). (c) Open the follow-up strict-enrollment stub plan `docs/plans/2026-MM-DD-strict-enrollment.md` (owner, trigger, acceptance = F1–F4, the red-set dry run as its evidence step); the rule disposition table (keep / delete / rescope / promote-to-tsc / demote-to-import-graph / new-rule, per rule, derived from the endgame `check:` columns) is authored **there** — produced where consumed, its only consumer being the deferred consolidation. Outputs are committed artifacts; no code changes.

**Delivery A — composition (behavior-preserving).**

- **U1.** `./preset` fragment + registration test on the twelve leaf plugin packages (R1–R2; `oxlint-plugin-recommended` is excluded — no plugin to register). Per-leaf edits, the same pattern twelve times via the shared tsdown toolchain helper: one `src/preset.ts`, one `./preset` entry in `package.json#exports` (a subpath absent from `exports` is unresolvable — `ERR_PACKAGE_PATH_NOT_EXPORTED`), one `preset` entry in `tsdown.config.ts#entry` beside `index`, api-extractor wiring per subpath. Evaluator-neutral: rule ids unchanged.
- **U2.** Trim `oxlint-plugin-recommended` (R3); `defaultIgnores` lives in the preset package (R4 — one home).
- **U3.** Create `@systemfsoftware/oxlint-preset` with both roots (canonical ships strict, KD3) + host-semantics probe suite (R4, R6).
- **U4.** Rewrite `@systemfsoftware/all` as pure re-export (R5); migrate its 6 consumers to `defaultIgnores` (the four `...(all.ignorePatterns ?? [])` reach-ins — cli, engine, typescript-checker, vitest-runner — and the vitest-runner `{...all}` spread become `extends:` + `defaultIgnores` — config-only edits).
- **U5.** Subtree baseline → `extends: [instrument]` (R7).

**Delivery B — namespace cutover (breaking, no product source changes).**

- **U6.** Publish the three leaves (R8).
- **U7.** Re-point the canonical root to the ten leaf fragments; delete both aggregates; generalize the registration test to the union assertion (R9). Gate: after re-pointing, the canonical root's built default deep-equals `@systemfsoftware/all`'s built default modulo namespace re-keying — drift fails the PR (re-asserts R5's equality against the post-cutover composition).
- **U8.** Re-derive `oxlint-config/base` from the ten leaf fragments + `@systemfsoftware/oxlint-plugin-recommended` at today's strength; record the mechanical id-mapping diff covering the retained stock deltas and both `overrides` blocks (R10); the 19 consumers keep `extends: [base]` untouched; resolve the daemon-spec dead devDependency.
- **U9.** Disable-comment sweep across all consumers + the at-most-two named-rule id updates + one differential probe record (R11).
- **U10.** Changesets (R12); AGENTS.md topology + README doctrine rewrite (R13).

Order is fixed: A before B (fragments must exist before roots re-point). Each delivery is one PR watched green; within each, evaluator-surface edits (preset roots, subtree baseline, CI) land in standalone commits (CONST-E8). The follow-up strict-migration plan (F1–F4) starts only after B lands: per-package fix-then-flip onto `all`, then `base`'s deletion — that plan owns every product-code change, so this one's PRs contain none (KD7). Standalone value if F1–F4 never lands (recorded): the namespace cutover permanently kills the dead-suppression defect class (`a-disable-comment-names-the-config-key`) and makes rule ids self-describing for every external consumer; the fragment library makes a new leaf composable by shipping one file, without touching any preset; the probe suite pins the alpha host's semantics before anything else depends on them quietly.

---

## Testing

Classification per the repo's testing trophy (CONST-T15; no forwarding-helper tests, CONST-T8):

- **Registration/derivation tests** — per plugin package and for both roots: contract tests at the published edge asserting fragment ≡ derivation and root ≡ union of fragments. These generalize the two existing suites (`aggregate.test.ts`, `base-registration.test.ts`), which are replaced.
- **Host-semantics probe suite** — contract tests against the installed oxlint pinning the measured `extends` table; the early-warning tripwire for the alpha API.
- **RuleTester suites** — moved 1:1 with their rules (a file move is a test move — `extraction-strands-the-origins-gate.md`); no new rules in this change, so no new suites.
- **Sweep gates** — deterministic greps (dead namespaces, `warn` literals, `all` declaring) wired as package tests, not prose.

Verification chain per delivery: `pnpm check:local`; per-package `typecheck`/`test`/`lint`/`attw`/`api:check` for touched packages; `gh pr checks --watch --fail-fast` (REPO-D1).

---

## Risks and Destructive Review Record

**Assumptions (destructive review, lens: Substitution).**

2. _Id churn is bounded_ — configs plus a small disable-comment population. If suppressions are widespread, the sweep cost grows. Mitigation: U0(a) measures before B commits to it; the sweep gate makes the remainder impossible to miss.
3. _The transitional `base` holds parity_ — re-derived from fragments, it must resolve to today's rule set modulo namespace, or the 19 parked packages change behavior silently. Mitigation: R10's recorded mechanical diff (`base`-resolved ≡ pre-change map modulo re-key) is a delivery gate, not a review claim.

The follow-up strict-migration plan carries its own risk register — its load-bearing assumption (strict enrollment achievable by fixing code across the 19 ex-base packages, exits limited to F3's fix/declare/reclassify/delete dispositions) is recorded in F1–F4 and sized by that plan's red-set dry run, not this one's.

**Alternatives evaluated and rejected (substitution).** (a) Keep aggregates, preserve ids via registration aliases — rejected: namespace invention condemned by the leak catalog; alias preservation is 1:1 only, ours is 3→1 and 5→1. (b) Reference-style plugin registration (ESLint `plugins: {}`) — rejected: unsupported by oxlint (oxc#23944, closed with the `import.meta.resolve` workaround this plan institutionalizes). (c) No preset at all — consumers compose fragments directly — rejected: N membership copies reintroduce the drift class the census measured; the endgame licenses exactly one composition root per concern. (d) Strict core + `/strict` opt-in tier — rejected by KD3: an opt-down path is two presets again. (e) Strict enrollment inside the reorganization — rejected by KD7 (blast radius; every product-code fix belongs to the follow-up). (f) One-release deprecation bridge — the two aggregates ship a final major re-exporting the leaf fragments under their old names, deletion follows — rejected: an aggregate re-implementing the host's composition is the measured defect itself (inert recommendation + re-key aliasing; wiki canon `composite-plugin-re-export`: composites on oxlint are legal but fight the host, aliasing existing only to dodge a duplicate-name throw that config composition never triggers); the bridge would re-publish the defect it exists to delete, and external reach is bounded by U0(b)'s audit rather than assumed. (g) Host the two roots as subpath exports of the existing `@systemfsoftware/all` instead of a new package — rejected on layering: KD1 keeps `all` a pure re-export shim (inert, enumerated, no smuggled decision); hosting declaration roots in it would make the compatibility shim itself a declaration surface, and its six consumers' `extends: [all]` lines would silently change meaning when the root tightens — the new package keeps the shim and the surface separable. (h) Permanent third root (make `base` a legitimate legacy root, drop the two-surfaces criterion) — rejected: the census measured where a second hand-maintained surface drifts; `base` is named TRANSITIONAL with a death-dated stub plan (U0(c)), which is the honest form of the third surface, not a permanent one. **Upgrade stance (recorded):** pin oxlint 1.77.x; if oxc ships native npm-resolution `extends` or a preset primitive (oxc#17320/#23944 follow-ups), re-evaluate — the fragment library keeps migration to a native primitive cheap (fragments are the unit either way; only the roots' composition syntax changes).

**Radical alternative recorded:** delete `all` and the preset package entirely once fragments exist; every consumer lists fragments. Rejected for (c)'s reason; the fragment library keeps this escape cheap to adopt later if the preset ever drifts again — that is the remediation.

---

## Related

- `docs/solutions/build-errors/oxlint-preset-overrides-are-replaced-by-a-spread.md` — the spread trap U4's `extends:` migration defuses.
- `docs/census/oxlint/CENSUS.md` — the measured inventory and defect ledger this plan consumes.
- `docs/solutions/build-errors/a-disable-comment-names-the-config-key.md` — the two-names trap B eliminates.
- `docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md` — the private-leaf pattern; KD5 supersedes its re-key aggregate with fragment composition.
- oxc-project/oxc#23944; eslint/eslint discussion #17766 — host constraints and the leak catalog.
