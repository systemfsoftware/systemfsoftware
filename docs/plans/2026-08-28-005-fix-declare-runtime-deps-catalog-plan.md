---
title: Declare undeclared runtime dependencies via catalog - Plan
type: fix
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Declare undeclared runtime dependencies via catalog - Plan

## Goal Capsule

- **Objective:** Every runtime import in a workspace package comes from that package's declared `dependencies`, with each external runtime dependency version owned once by the `pnpm-workspace.yaml` catalog. Concretely: declare `mutation-testing-metrics` in `@systemfsoftware/stryker-js-platform-node` `dependencies` via the `stryker` sub-catalog, and convert the mutation-testing-* family's literal runtime pins to `catalog:` references.
- **Authority:** Issue #297. Scope boundaries and acceptance criteria below are the user's stated contract; the plan implements it.
- **Stop conditions:** All four acceptance criteria green (boundaries query, frozen-lockfile install, platform-node build, `pnpm check:local`). No dependency version changes.
- **Execution profile:** Declaration/config work; verification is runnable gates, not unit tests.

## Product Contract

### Summary

`@systemfsoftware/stryker-js-platform-node` imports `mutation-testing-metrics` in three source files — value imports in `src/Reporter.ts` and `src/verdict-envelope.ts`, a type import in `src/Reporter.schema.ts` — but declares it in neither `dependencies` nor `devDependencies`. The imports resolve only because pnpm hoists another package's copy to the workspace root. Turbo's package-boundary checker flags the undeclared imports today; any install-layout change can break the build with a module-not-found nothing in CI predicts. Declare the dependency in `dependencies`, catalog its version once, and convert the family's literal runtime pins to catalog references.

### Problem Frame

Turbo boundaries flags `cannot import package mutation-testing-metrics because it is not a dependency` at three platform-node source files (measured this session, 2026-08-28, at 3 diagnostics plus the excluded `@std/path` one). The import is a build-time-smuggled runtime dependency — a defect the boundary check exists to catch, sitting one install-layout change from CI-broken.

### Requirements

- R1. A workspace package's shipped runtime imports come from packages declared in that package's `dependencies` — never `devDependencies`, never `peerDependencies`, never undeclared.
- R2. Each external runtime dependency has exactly one version entry in `pnpm-workspace.yaml` (main or deliberate sub-catalog), and every declaring manifest references it as `catalog:` / `catalog:<name>`, never a literal pin.
- R3. The boundaries query reports no diagnostic whose `message` names `mutation-testing-metrics`; the `@std/path` diagnostic in `omp/plugins/omp-typescript-discipline/scripts/checks/check-no-typescript-files.ts` is out of scope (Deno-owned manifest) and may remain.
- R4. Dependency versions are unchanged: this work only declares and catalogs what already resolves (`mutation-testing-metrics@3.7.3`, matching the version already pinned for `stryker-js-html-reporter` and the root).

### Scope Boundaries

- **Deferred to follow-up work:** nothing plan-local.
- **Outside this product's identity:**
  - Root `devDependencies` literal pins (`mutation-testing-elements`, `mutation-testing-metrics` at `3.7.3`) — root is tooling, not a shipped package; R2 governs runtime dependencies of shipped packages only.
  - `@std/path` boundary diagnostic — a Deno script whose dependency is declared in its own `scripts/deno.jsonc`.
  - `pnpm add`-driven or version-bump behavior — `catalogMode: prefer` is a setting, not a target.
  - Suppressing boundary diagnostics (turbo.json boundaries config) — the defect is the undeclared dependency, not the check.

## Planning Contract

### Key Technical Decisions

- KTD1. __Catalog the mutation-testing-_ family under `catalogs.stryker`._* `mutation-testing-metrics`, `mutation-testing-report-schema`, and `mutation-testing-elements` each get one exact `3.7.3` entry in the existing `stryker` sub-catalog, and every runtime declaration in the mutation packages references `catalog:stryker`. Rationale: the repo convention puts mutation-tooling packages on the `stryker` axis (docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md; the same mechanism `catalog:stryker` prescribes for this package family in docs/solutions/tooling-decisions/root-workspace-protocol-hashes-every-task.md), and `catalogMode: prefer` exists precisely to prevent literal-pin drift. Chosen over the default `catalog:` (axis isolation — keeps Stryker machinery out of the main library axis) and over leaving literal pins (R2's non-counting outcome).
- KTD2. **Do not hand-edit `inlinedDependencies`; the build reconciles it.** The `mutation-testing-metrics: 3.7.3` entry currently in platform-node's `inlinedDependencies` is stale tsdown-generated output — tsdown writes the field from the set of packages actually physically inlined (`noExternal`), and platform-node's `tsdown.config.ts` inlines only `@std/jsonc`. The next `build` run regenerates the field from the actually-inlined set and drops the stale entry. Recovery: if a clean build exits 0 but the entry persists, hand-edit the field to drop it — the stale claim must not ship. Rationale: never hand-maintain generated output (repos/tsdown/src/features/deps.ts:347-350 documents the generation).

### Assumptions

- `pnpm install --no-frozen-lockfile` regeneration is required once because the lockfile stores catalog specifiers; frozen re-install is the gate (per docs/solutions convention).
- The lockfile's platform-node importer block matches the manifest today (verified this session); the new edge is additive.
- `catalogMode: prefer` (pnpm-workspace.yaml) governs `pnpm add` behavior only — per pnpm primary docs (https://pnpm.io/catalogs) it does not fail install over existing literals and does not change `catalog:` resolution precedence. Root `devDependencies` literals are devDependencies per the issue's runtime-dependency definition (test/build-tooling usage), so they stay out of scope; no future `strict` mode is planned.

### Sources & Research

- Repo learnings: `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`, `docs/solutions/tooling-decisions/root-workspace-protocol-hashes-every-task.md` (catalog:stryker mechanism for this family), `docs/solutions/test-failures/fixture-pin-duplicates-the-catalogs-decision.md` (no second literal anywhere).
- pnpm primary docs: https://pnpm.io/catalogs (catalog protocol, named catalogs, `catalogMode: prefer` semantics, publish-time `catalog:` replacement).
- Turborepo primary docs: https://turborepo.dev/docs/reference/boundaries (violation class: importing a package not declared in the package's `package.json`).
- Software-wiki corpus: nil result for these topics (queried 2026-08-28, software-wiki collection, 634 docs); the docs/solutions learnings carry the local convention.

## Implementation Units

### U1. Catalog the family and convert runtime declarations

- **Goal:** Every mutation-testing-* runtime declaration in the workspace references the `stryker` catalog; the platform-node manifest gains `mutation-testing-metrics` in `dependencies`.
- **Requirements:** R1, R2, R4
- **Files:**
  - `pnpm-workspace.yaml` (add 3 entries under `catalogs.stryker`)
  - `packages/testing/mutation/stryker-js/html-reporter/package.json` (convert 3 literal pins in `dependencies`; `mutation-testing-metrics` is declared-but-currently-unimported there — the conversion applies to the existing declaration per R2's "every declaring manifest references it via `catalog:`")
  - `packages/testing/mutation/stryker-js/platform-node/package.json` (add `mutation-testing-metrics` to `dependencies`; convert `mutation-testing-report-schema`)
  - `packages/testing/mutation/stryker-js/stryker-js/package.json` (convert `mutation-testing-report-schema`)
- **Approach:**
  1. Add `mutation-testing-metrics: 3.7.3`, `mutation-testing-report-schema: 3.7.3`, `mutation-testing-elements: 3.7.3` to `catalogs.stryker` in `pnpm-workspace.yaml`, keeping the existing `stryker` axis shape (per KTD1).
  2. In each of the three manifests, replace the literal `3.7.3` runtime pins with `catalog:stryker` (KTD1). platform-node `dependencies` gains `"mutation-testing-metrics": "catalog:stryker"` next to the existing `mutation-testing-report-schema`.
  3. Leave platform-node `inlinedDependencies` untouched — the next build regenerates the field and drops the stale `mutation-testing-metrics` entry (KTD2).
  4. Leave the root `devDependencies` literals untouched (scope boundary).
  5. Land all three manifest edits and the catalog additions in a single working-tree state before the one `pnpm install --no-frozen-lockfile` run in U2 — do not interleave per-file installs.
  6. Run the platform-node build (per the Verification Contract) after U2's install; commit the regenerated manifest (reconciled `inlinedDependencies`) and the lockfile in the same change, so the gate's evidence is in the diff, not a post-commit mutation.
- **Patterns to follow:** html-reporter's `dependencies` block ordering; the `catalog:stryker` reference style already used for `@stryker-mutator/*` deps elsewhere in the tree; trailing-comma hygiene when editing JSON (per the catalogs solution doc).
- **Test expectation:** none — declarations only; every scenario below is enforced by the runnable gates in the Verification Contract, which fail on a plausible wrong edit (wrong catalog name, literal left behind, missing declaration).
- **Verification:** `pnpm exec turbo query 'query { boundaries { items { message path } length } }'` reports no message naming `mutation-testing-metrics`; every touched manifest references `catalog:stryker` and no literal `3.7.3` runtime pin remains in the three packages.

### U2. Regenerate lockfile importer edges

- **Goal:** `pnpm-lock.yaml` records the new declarations: platform-node's importer gains the `mutation-testing-metrics` edge, and the converted specifiers read `catalog:stryker`.
- **Requirements:** R2, R3
- **Files:**
  - `pnpm-lock.yaml` (regenerated)
- **Approach:**
  1. Run `pnpm install --no-frozen-lockfile` once from the repo root to regenerate the lockfile (required for catalog-specifier storage per the convention; the change is additive — no version resolution changes).
  2. Read the regenerated `pnpm-lock.yaml`: the `packages/testing/mutation/stryker-js/platform-node` importer lists `mutation-testing-metrics` under `dependencies` with `specifier: 'catalog:stryker'`; `html-reporter` and `stryker-js` importers show the converted specifiers.
- **Patterns to follow:** existing importer-block shape; the convention's `pnpm check` verification path.
- **Test expectation:** none — lockfile regeneration; the gates in the Verification Contract (frozen re-install, importer-edge read) are the deterministic checks.
- **Verification:** `pnpm install --frozen-lockfile` exits 0; `git diff --stat pnpm-lock.yaml` shows only importer specifier/edge churn plus any synthetic catalog resolution keys pnpm 11.x introduces for the three packages at `3.7.3`, with no other resolution additions; the platform-node importer lists `mutation-testing-metrics` with `specifier: 'catalog:stryker'`.

## Verification Contract

| Gate           | Command                                                                                                            | Pass signal                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Boundary audit | `pnpm exec turbo query 'query { boundaries { items { message path } length } }'`                                   | No `message` names `mutation-testing-metrics`; `length` drops to 1 (`@std/path` only) |
| Frozen install | `pnpm install --frozen-lockfile`                                                                                   | Exit 0                                                                                |
| Package build  | `pnpm --filter @systemfsoftware/stryker-js-platform-node build`                                                    | Exit 0; `inlinedDependencies` no longer claims `mutation-testing-metrics`             |
| Sibling builds | `pnpm --filter @systemfsoftware/stryker-js-html-reporter build && pnpm --filter @systemfsoftware/stryker-js build` | Exit 0 — a catalog typo in either converted manifest fails here                       |
| Repo gate      | `pnpm check:local`                                                                                                 | Exit 0 after the last edit                                                            |

## Definition of Done

- Per-unit done: U1's declared manifests and catalog entries land; U2's lockfile regenerates with the importer edges.
- Global done: all four Verification Contract gates green after the last edit (REPO-D1), work delivered as a pull request watched to green (REPO-D2); tree left restartable.
- Order of operations: U1 manifest edits → U2 lockfile regeneration → platform-node build → commit the regenerated manifest and lockfile together, so the reconciled `inlinedDependencies` lands in the diff.
- Cleanup: no abandoned-attempt code is expected; stale `inlinedDependencies` content is reconciled by the build, not left in the diff.
