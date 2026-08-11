---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
plan_depth: lightweight
execution: code
date: 2026-08-10
---

# fix: break the toolchain workspace cycle so no turbo or pnpm command warns on stderr

**Product Contract preservation:** no upstream Product Contract existed. Authored fresh with `product_contract_source: ce-plan-bootstrap`. Scope was confirmed by the invoking objective, which names the exact symptom (a cycle warning on stderr of every turbo command) and points to `docs/solutions/` for the fix shape. Two headless doc-review rounds (18 findings, all resolved) and empirical verification corrected this plan's mechanism twice: the pnpm-only remedy could not silence turbo's own cycle warning, and the cycle's real breaker is removing the fork packages' back edges via path-based plugin loading — the sibling plan `docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` is the repo's designated owner of this SCC, and its U3 instrument (explicit task edges) plus its Q4 alternative (fork-side reverse edges) are the mechanisms this plan adopts.

---

## Goal Capsule

- **Objective:** every turbo and pnpm command runs with a clean stderr — no `WARNING Circular package dependency detected: ...` (turbo's own diagnostic) and no `[WARN] There are cyclic workspace dependencies: ...` (pnpm's) — by removing the workspace-graph cycle at its source, while preserving every verification edge that made the cycle load-bearing.
- **Authority:** the invoking objective, the recorded root cause in the sibling plan, and the repo rules the solution doc cites: lint coverage and mutation testing must not be weakened.
- **Stop conditions:** `pnpm turbo ls` and `pnpm install --frozen-lockfile` print no cyclic-workspace warning; the three fork packages still apply the cell rules at lint time and the plugin's mutation run still works; `pnpm check` exits 0 after the last edit; the solution doc no longer misattributes the warning or claims it "remains deliberately unsuppressed".
- **Tail ownership:** ce-work or a human implements U1 then U2; nothing here publishes to npm and no pure-core file changes, so no mutation gate runs.

---

## Product Contract

### Summary

The turbo task-graph cycle was already neutralized on `main` (commit `b342597915d`: `packages/oxlint-plugins/cell-taxonomy/turbo.json` overrides `build` to `dependsOn: []`; the hard `Cyclic dependency detected` error is gone). What remains loud is a different diagnostic: turbo's package-graph validation prints `WARNING Circular package dependency detected: @systemfsoftware/stryker-js-typescript-checker, @systemfsoftware/oxlint-plugin-cell-taxonomy, @systemfsoftware/stryker-js-mutation-run` on stderr of every turbo command (verified at HEAD), and pnpm 11.9.0 separately prints `[WARN] There are cyclic workspace dependencies: <paths>` on stderr of its install step. The recorded solution doc misattributes turbo's warning to pnpm and prescribes the override, which cannot silence it: turbo 2.10.5's `PackageGraph::validate()` warns unconditionally on any cyclic package graph and has no suppression config. The only lever is removing the cycle from the workspace package graph. The cycle is closed by three back edges — the fork packages lint themselves with the cell-taxonomy plugin via `import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')` — and oxlint 1.77.0 loads that plugin's built bundle from a filesystem path instead, which removes the back edges without removing the lint check. This plan converts the three entries to path-based loading of the plugin's built bundle, compensates the lost build-ordering with explicit lint task edges (the sibling plan's U3 instrument), drops the three plugin devDependencies, and corrects the docs. The cell-taxonomy `turbo.json` override stays: it accurately states that the plugin's build consumes no workspace build output, and remains load-bearing until the sibling plan's sweep removes the plugin's forward devDependencies.

### Problem Frame

Two independent detectors warn about one package-graph cycle:

- **Turbo's `validate()`** (`crates/turborepo-repository/src/package_graph/mod.rs` at v2.10.5) runs on every command and emits `tracing::warn!("Circular package dependency detected: ...")` when the workspace package graph is cyclic. `BoundariesConfig` and the turbo.json schema expose no suppression key. Empirically proven with the repo's own turbo 2.10.5 binary in a throwaway workspace: a cyclic devDependency pair warns; breaking one edge silences it; an external (non-`workspace:`) version range silences it; pnpm's `ignore-workspace-cycles: true` does **not**.
- **pnpm's install check** emits `[WARN] There are cyclic workspace dependencies: <paths>`; gated by the Boolean setting `ignore-workspace-cycles` (default `false`), which only acknowledges the cycle — it cannot remove turbo's independent warning.

The cycle itself is the one the sibling plan owns: `{stryker-js-mutation-run, stryker-js-typescript-checker, oxlint-plugin-cell-taxonomy}` — the only non-trivial SCC in the workspace graph (Tarjan-verified in the sibling plan and in `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md`). Its structure is a self-hosting toolchain:

- `oxlint-plugin-cell-taxonomy` devDepends the stryker fork packages (`mutation-run`, `typescript-checker`, `vitest-runner`) to run its own `stryker run` mutation testing. These forward edges are immutable: `mutation-run` and `vitest-runner` are **not published on npm** (verified 404), so the plugin's mutation gate cannot consume published artifacts; it needs the local fork.
- The fork packages (`mutation-run`, `typescript-checker`, `mutation-report`) devDepend the plugin to lint themselves: their `oxlint.config.ts` loads `@systemfsoftware/oxlint-plugin-cell-taxonomy` via `import.meta.resolve` and applies the `capability-named-directory` rule. `mutation-run`→plugin and `typescript-checker`→plugin are the two edges that close the SCC; `mutation-report`→plugin is the same edge class, one-way.

The `import.meta.resolve` form forces a package.json edge. oxlint's `jsPlugins` accepts a filesystem path instead, with no package.json edge — but the path must target the plugin's **built bundle** (`dist/index.mjs`), not its TypeScript source: loading `src/index.ts` by path fails because Node's ESM loader (oxlint's plugin host) cannot resolve the source's `.js`-specifier internal imports (verified this session: `ERR_MODULE_NOT_FOUND` on `./rules/capability-named-directory.js`). Loading `dist/index.mjs` by path works and the rule fires by its configured name (verified this session in a depth-mirrored throwaway: `new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname` — oxlint preserves `import.meta.url` of the config, and the `capability-named-directory` rule reports a `utils/`-dir violation while an allowed `reporting/` file passes).

Loading the built bundle means the fork packages' lint needs the plugin's dist to exist and be fresh — today guaranteed by the devDep's `^build` edge. Removing the devDep removes that ordering, so the lost edge must be replaced with an explicit lint task edge (the sibling plan's U3 instrument: "keep `^build` and add explicit [task] edges; the explicit edges replace only what the removed devDeps used to imply").

### Requirements

- R1. No turbo or pnpm command prints a cyclic-workspace warning on stderr (`WARNING Circular package dependency detected` or `[WARN] There are cyclic workspace dependencies`).
- R2. The cell rules still lint the three fork packages: `capability-named-directory` stays configured and applied via path-based loading of the plugin's built bundle, and the plugin's own mutation testing still runs against the local fork with unchanged semantics.
- R3. The workspace package graph holds no cycle. (The cell-taxonomy `turbo.json` build override is retained: it states the plugin's build consumes no workspace build output and stays load-bearing until the sibling plan's sweep removes the plugin's forward devDependencies.)
- R4. The full verification gate `pnpm check` exits 0 after the last edit (REPO-D1, REPO-A1, REPO-A2, REPO-A3).
- R5. `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` states the shipped mechanism and the true root cause instead of misattributing the warning to pnpm or claiming it was deliberately kept; `CONCEPTS.md`'s "Toolchain bootstrap cycle" entry matches the shipped state.

### Scope Boundaries

- **In scope:** three `oxlint.config.ts` entries (plugin loaded by path from `dist`), three new fork-package `turbo.json` files carrying the explicit lint ordering edge, three package manifests (drop the plugin devDep), the lockfile, and the two doc corrections.
- **Out of scope:** the sibling plan's 20-package sweep (`docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` U1–U5: self-locating base preset, `extends` rewrites, explicit mutation task edges, dropping the fork devDeps from all 20 plugin packages and deleting the override, and rewriting the solution doc). That sweep additionally satisfies its discretionary R2 (make the false-edge class unrepresentable) and was left an author-only scope decision (its Q4); this plan answers that Q4 by adopting its fork-side alternative. The sweep is compatible with this change and remains deferred.
- **Out of scope:** registry consumption of the plugin by the fork packages (`catalog:`). Acknowledged benefit: versioned, source-layout-independent lint loading in three manifest lines. Rejected because it couples the fork packages' lint to publish state — the plugin's rules reach the fork lint only at its next publish (subject to the 24h `minimumReleaseAge` policy), so a local rule change would not be lint-enforced until a release; path-based loading is strictly local (see KTD4). Registry consumption of the stryker fork by the plugin is impossible (`mutation-run`, `vitest-runner` unpublished). Touching `minimumReleaseAgeExclude` (REPO-S2), catalogs, or any package's `mutate` globs or mutation config.
- **Out of scope:** deleting the cell-taxonomy `turbo.json` override. The override still suppresses three false `^build` edges (plugin build → fork builds) that would otherwise serialize the plugin's build on the fork packages' builds; it is accurate and load-bearing until the sweep removes the forward devDependencies, at which point the sweep's U4 deletes it.

### Assumptions

- The loudness the objective names is turbo's `validate()` warning plus pnpm's install warning; the hard task-graph error is already gone at this branch's HEAD (commit `b342597915d` is an ancestor).
- oxlint 1.77.0 (installed, and what the fork packages resolve via `catalog:oxlint` today) loads the plugin's `dist/index.mjs` from the proven relative-path form; U1 re-verifies the rule is active (not merely that lint exits 0).
- Dropping the plugin devDeps does not change lint or mutation outcomes for the fork packages: the plugin is referenced only by their `oxlint.config.ts`, and their lint loads the plugin's built bundle via the path form (dist never imports the fork packages; fork lint never imports the plugin's source).
- Sampling rationale for the stop conditions: turbo's `validate()` runs on every command (source-verified, unconditional), and pnpm's cycle check runs in the install step that precedes every turbo invocation here, so the two sampled commands (`turbo ls`, frozen install) cover the objective's "every command" claim.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Break the cycle at the back edges (fork → plugin), never the forward edges (plugin → fork). The forward edges carry the plugin's mutation testing and cannot be externalized: `mutation-run` and `vitest-runner` are not on npm (404 verified), so the plugin must keep its workspace links. The back edges exist only for lint, and oxlint's `jsPlugins` accepts a filesystem path — so the edge can die while the check survives. This is the sibling plan's Q4 alternative (it satisfies the sibling plan's R1: no cycle, no warnings).
- KTD2. Path-based plugin loading replaces `import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')` in the three fork `oxlint.config.ts` files with a path derived from `import.meta.url` resolving to the plugin's built bundle, `packages/oxlint-plugins/cell-taxonomy/dist/index.mjs`. The **built bundle**, not `src/index.ts`: the source tree is not loadable by Node's ESM resolver (`.js`-specifier internal imports — verified). The `capability-named-directory: 'error'` rule config stays byte-identical, so lint coverage is unchanged.
- KTD3. The explicit lint ordering edge compensates the lost `^build` edge. The fork packages' lint loads the plugin's dist, which today is ordered by the devDep's `^build` edge; without a replacement, a full-gate run can race the plugin's build and fail on a missing/partial dist in a fresh tree. Each fork package gets a `turbo.json` with `lint: { "dependsOn": ["^build", "build", "@systemfsoftware/oxlint-plugin-cell-taxonomy#build"] }`. This is the sibling plan's U3 instrument ("keep `^build` and add explicit [task] edges; the explicit edges replace only what the removed devDeps used to imply") applied to the lint task; the repo's per-package override precedent (`packages/stryker-js/vitest-runner/turbo.json`, `packages/arethetypeswrong/cli/turbo.json`) re-declares root's `["^build", "build"]` plus the addition. Turbo's `extends` merge replaces `dependsOn`, it does not union (verified in a throwaway: a package override with only `["other#build"]` dropped root's `build`/`^build`), so the root values must be re-declared.
- KTD4. The cell-taxonomy `turbo.json` override is **retained**. After the back edges are gone the package graph is acyclic, but the plugin's forward devDependencies remain (KTD1), so root `^build` on the plugin's build would resolve to the three fork packages' builds — three false build-task edges the override deliberately suppresses (the plugin's build consumes no workspace dist). Deleting the override now would serialize the plugin's build on the fork builds and add a failure-propagation path, for no objective gain. The sibling plan's U4 deletes the override when its sweep removes the forward devDependencies; until then the override is the accurate statement. This reverses this plan's first-draft U2 (deleted it), which three round-2 reviewers independently disproved.
- KTD5. Registry consumption (the `catalog:attw` pattern) was considered and rejected for both directions. For the fork packages consuming the published plugin: the real benefit is versioned, layout-independent lint loading in three manifest lines — acknowledged. The rejection rests on publish-state coupling: the fork packages' lint would validate against the last published plugin (subject to the 24h `minimumReleaseAge` policy), so a working-tree rule change would go unenforced until a release, breaking the working-copy self-hosting loop this repo's lint gates assume; path-based loading is strictly local and removes the edge without the coupling. The plugin consuming the published fork is impossible (`mutation-run`, `vitest-runner` unpublished). The rejection is recorded with its actual tradeoff so it is not re-litigated on a strawman.
- KTD6. The docs correction distinguishes the two detectors: pnpm's warning is gated by `ignore-workspace-cycles` (a pnpm 11.9.0 Boolean, default `false`; `allowCyclicDependencies` does not exist in this pnpm — checked the bundle), while turbo's warning is unconditional in `validate()` and config-free. The current solution doc calls turbo's warning "the pnpm WARNING" and claims it "remains and was deliberately not suppressed" — both claims are wrong and are corrected.

### High-Level Technical Design

No diagram needed: the change is three config rewrites, three new turbo.json files, three manifest edits, and two doc corrections. The mechanism chain: every turbo command builds the package graph → `validate()` warns if it is cyclic → the three back edges close the SCC → path-based plugin loading removes them → the graph is acyclic → neither turbo nor pnpm warns. The lint task edges keep the plugin's dist ordered for the three fork packages, and the retained cell-taxonomy override keeps the plugin's build a leaf.

### Sources / Research

- `docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` — the designated owner of this SCC; its Q4 documents and live-verifies the fork-side reverse-edge fix this plan adopts; its U3 defines the explicit-task-edges instrument this plan applies to lint; its U4–U5 specify when the override is deleted and how the solution doc is rewritten.
- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — names this triple as the only non-trivial SCC and the workspace-`:`-protocol mechanism (a plain range resolves externally; `linkWorkspacePackages` is unset here).
- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — the doc this plan corrects; its "Why This Works" proves turbo derives `^build` edges from devDependencies in this repo.
- Turbo 2.10.5 source (v2.10.5 tag): `crates/turborepo-repository/src/package_graph/mod.rs` `validate()`; `crates/turborepo-boundaries/src/config.rs` (no suppression key); schema.json (no suppression key).
- Empirical probes this session (repo toolchain, throwaway workspaces):
  - turbo 2.10.5: cyclic devDep pair warns; one edge broken → silent; external range → silent; pnpm `ignore-workspace-cycles: true` → pnpm silent, turbo still warns.
  - oxlint 1.77.0: `src/index.ts` by path fails (`ERR_MODULE_NOT_FOUND` on `.js`-specifier internal imports); `dist/index.mjs` by path loads and the rule fires by its configured name; `new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname` in a config at fork depth works; a bad path fails loudly (`Failed to parse oxlint configuration file`, exit non-zero).
  - turbo `extends` merge: package-level `dependsOn` replaces root's, it does not union.
  - today's graph: `mutation-run#lint` depends on `cell-taxonomy#build` (via the devDep `^build` edge) — the edge this plan re-establishes explicitly.
- npm registry: `@systemfsoftware/oxlint-plugin-cell-taxonomy` latest 1.1.2 == local version; `@systemfsoftware/stryker-js-mutation-run` and `@systemfsoftware/stryker-js-vitest-runner` 404.

---

## Implementation Units

### U1. Break the cycle: path-based plugin loading in the three fork packages

- **Goal:** remove the three back edges (`mutation-run` → plugin, `typescript-checker` → plugin, `mutation-report` → plugin) from the workspace graph so the SCC dissolves, while keeping the cell rules active in all three packages' lint and keeping the plugin's dist ordered before their lint.
- **Requirements:** R1, R2, R3.
- **Dependencies:** none.
- **Files:**
  - `packages/stryker-js/mutation-run/oxlint.config.ts`
  - `packages/stryker-js/typescript-checker/oxlint.config.ts`
  - `packages/stryker-js/mutation-report/oxlint.config.ts`
  - `packages/stryker-js/mutation-run/turbo.json` (new)
  - `packages/stryker-js/typescript-checker/turbo.json` (new)
  - `packages/stryker-js/mutation-report/turbo.json` (new)
  - `packages/stryker-js/mutation-run/package.json` (drop the plugin devDep)
  - `packages/stryker-js/typescript-checker/package.json` (drop the plugin devDep)
  - `packages/stryker-js/mutation-report/package.json` (drop the plugin devDep)
  - `pnpm-lock.yaml` (regenerated, not hand-edited)
- **Approach:**
  1. In each `oxlint.config.ts`, replace the `jsPlugins` entry `import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')` with the proven path form: `new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname`. Keep the `capability-named-directory: 'error'` rule and all other config byte-identical.
  2. In each fork package, add a `turbo.json` (the sibling plan's U3 instrument, the repo's re-declare precedent):
     ```json
     {
       "$schema": "https://v2-10-1.turborepo.dev/schema.json",
       "extends": ["//"],
       "tasks": { "lint": { "dependsOn": ["^build", "build", "@systemfsoftware/oxlint-plugin-cell-taxonomy#build"] } }
     }
     ```
     This restores today's exact `lint` ordering (verified: today `mutation-run#lint` depends on `cell-taxonomy#build` plus the fork deps' builds) — turbo's `extends` replaces `dependsOn`, so the root's `["^build", "build"]` must be re-declared.
  3. Remove the `@systemfsoftware/oxlint-plugin-cell-taxonomy` entry from each package's `devDependencies`. Refresh the lockfile with a real resolution pass (a frozen install cannot express a dependency removal). Do not touch `minimumReleaseAgeExclude` (REPO-S2), catalogs, or anything else.
- **Test expectation:** none — config and manifest change; the behavioral surface (lint rules apply, mutation unchanged) is covered by the Verification Contract.
- **Verification:**
  - Rule wired end-to-end (proves the path-loaded plugin applies the rule): in `mutation-run`, temporarily add `src/utils/__verify-rule.ts` (any trivial module), run `pnpm --filter @systemfsoftware/stryker-js-mutation-run lint`, confirm the `utils is forbidden` diagnostic appears (the rule fires through the path-based plugin load), then remove the fixture and re-run lint to confirm it exits 0 clean. The fixture never enters a commit. (The rule cannot be shown via violations in the fork packages' real trees — none contain a banned directory segment, verified: mutation-run/src has checker/config/logging/mutants/plugins/project/reporting/run-stages/sandbox/test-runner/worker-pool; typescript-checker/src has grouping/project; mutation-report/src is flat — and oxlint 1.77.0 has no print-config flag, so the fixture is the only deterministic visibility proof.)
  - `pnpm --filter @systemfsoftware/stryker-js-mutation-run lint` (and `typescript-checker`, `mutation-report`) exits 0 with no plugin-load or config-parse error.
  - `pnpm turbo run lint --filter @systemfsoftware/stryker-js-mutation-run --dry=json` lists `@systemfsoftware/oxlint-plugin-cell-taxonomy#build` among `mutation-run#lint`'s dependencies (and likewise for the other two).
  - `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy mutation` still runs with the same effective config (fork packages resolve from the workspace as before).
  - `pnpm turbo ls` (inspect stderr) and `pnpm install --frozen-lockfile` print no cyclic-workspace warning.

### U2. Correct the docs

- **Goal:** the recorded solution and the vocabulary match the shipped state.
- **Requirements:** R5.
- **Dependencies:** U1 (the docs record what shipped).
- **Files:**
  - `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`
  - `CONCEPTS.md` (the "Toolchain bootstrap cycle" entry)
- **Approach:** rewrite the solution doc's remedy sections:
  - **Detectors:** distinguish turbo's `validate()` warning (unconditional, config-free, printed on every turbo command) from pnpm's install warning (gated by `ignore-workspace-cycles`). The doc's "The pnpm `WARNING Circular package dependency detected` remains and was deliberately not suppressed" misattributes turbo's warning to pnpm and is corrected.
  - **Shipped mechanism:** the override neutralized the hard task-graph error (still true, still in place — it remains load-bearing, see KTD4); the back-edge removal via path-based loading of the plugin's built bundle removes the package-graph cycle itself, so both detectors are silent. The doc's "What Didn't Work" first bullet (deleting the plugin devDep from the fork packages) is superseded in the precise sense that the edge is removed but the check survives: the rejection was of deleting the edge without replacing the mechanism; path-based loading is the replacement.
  - **Root causes, distinguished:** this plan's root cause is the back edges (fork lint via `import.meta.resolve`, forcing a package.json edge). The deferred cause is the fork's bare-specifier base preset (`stryker.config.json` `extends`/`plugins` resolved against consumers) which forced the forward devDeps — that cause remains, its remedy is the deferred sibling-plan sweep, and the doc must say so rather than assert the root cause is fixed. The forward edges remain (immutable: `mutation-run`/`vitest-runner` unpublished), which is why the override stays.
  - **Keep the correct lessons:** the masking-failure lesson ("a task-graph cycle conceals every other failure"), the four-edge diagnosis, and turbo's edge-removal menu. Add the accretion note in the sibling plan's framing: the per-consumer override approach was the wrong rung because it multiplied; this repo's override was the single-choke-point version and remains accurate until the sweep.
  - Update `CONCEPTS.md`'s "Toolchain bootstrap cycle" entry: the cycle is no longer mutual — the lint plugin is loaded by path from its built bundle, so the fork packages carry no workspace edge into the plugin; the package graph is acyclic; the entry's prescription ("the build graph must be told per package that a tooling edge carries no build ordering") is superseded by edge removal plus explicit task edges and is rewritten to describe the shipped state.
- **Test expectation:** none — documentation.
- **Verification:** re-read the updated sections; every claim matches the shipped `oxlint.config.ts`, `package.json`, `turbo.json`, and `pnpm-workspace.yaml` state.

---

## Verification Contract

| Gate           | Command                                                                                               | Signal                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config smoke   | `pnpm install --frozen-lockfile`                                                                      | exits 0; no cyclic-workspace warning on stderr                                                                                                                                                       |
| Turbo smoke    | `pnpm turbo ls`                                                                                       | no cyclic-workspace warning on stderr; workspace graph lists all packages                                                                                                                            |
| Lint coverage  | `pnpm --filter @systemfsoftware/stryker-js-mutation-run lint` (+ typescript-checker, mutation-report) | exits 0, no plugin-load/config-parse error; rule wired end-to-end proven once via a temporary `src/utils/__verify-rule.ts` fixture in mutation-run (diagnostic fires, fixture removed, re-run clean) |
| Ordering edge  | `pnpm turbo run lint --filter @systemfsoftware/stryker-js-mutation-run --dry=json` (+ the other two)  | `mutation-run#lint` dependencies include `@systemfsoftware/oxlint-plugin-cell-taxonomy#build`                                                                                                        |
| Mutation smoke | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy mutation`                                 | unchanged behavior (fork packages resolve from the workspace)                                                                                                                                        |
| Root gate      | `pnpm check` (exactly, no filters — REPO-A1)                                                          | exits 0; run in this session after the last edit (REPO-A2)                                                                                                                                           |

The root gate is heavy (the recorded doc measures ~16 minutes) and is the repo's single definition of done; it runs once after all units. No mutation gate applies: U1–U2 touch config, manifests, turbo.json, and docs; no pure-core file changes.

## Definition of Done

- U1 shipped: three `oxlint.config.ts` files load the plugin's built bundle by path, three new `turbo.json` files carry the explicit lint ordering edge, three manifests no longer devDepend the plugin, the lockfile is regenerated, and the graph is acyclic (both detectors silent).
- U2 shipped: the solution doc and `CONCEPTS.md` state the shipped mechanism, distinguish the detectors, and no longer misattribute the warning; the override's retention and the deferred sweep are recorded.
- `pnpm check` exits 0 in this session after the last edit (REPO-D1, REPO-A1–A3).
- No scratch or probe files remain; `git status --porcelain` shows only the intended files.

## Risks & Dependencies

- **Path-based loading regresses under an oxlint catalog bump.** The mechanism is verified against oxlint 1.77.0 (installed); `catalog:oxlint` can be bumped independently. U1's verification checks the rule is visibly active, so a semantic change fails loudly at implementation time. If a bump lands before U1, re-run the probe.
- **Stale plugin dist silently applies old rules.** The fork lint's cache key does not include the plugin's dist (root lint `inputs` glob the plugin only via oxlint-config; the plugin dist is absent) — a pre-existing hole, unchanged by this plan: today a cached fork lint also survives a plugin rule change. The explicit ordering edge ensures existence, not freshness. Documented, not fixed here (out of scope; a future change would add the plugin dist glob to the fork lint inputs).
- **A future author reverts to `import.meta.resolve` + a workspace devDep.** The cycle returns loudly — pnpm's install warning and turbo's `validate()` warning are the enforcement; the corrected solution doc records the convention.
- **The plugin's `dist/index.mjs` entry renames or the layout changes.** The fork lint fails loudly at the next run (bad path → config parse failure, exit non-zero — verified); the path is stated in the doc.
- **The sibling plan's sweep lands later.** Shared-file reconciliation: the sweep's U4 deletes the cell-taxonomy `turbo.json` this plan retains (idempotent — it deletes a file that exists; no conflict), and its U5 rewrites the same solution doc this plan's U2 rewrites — the later lander (the sweep's executor) must preserve this plan's misattribution correction and back-edge mechanism in the rewrite; the reconciliation duty is recorded here in this plan's Risks & Dependencies, and the sibling plan predates this change, so its executor will not otherwise know. The sweep removes different edges (plugin → fork); either plan alone keeps the graph acyclic. This plan also answers the sibling plan's open Q4 by adopting the fork-side fix.
- **Sweep lands first.** Then the forward edges are gone and the override is deleted; the package graph is already acyclic (fork→plugin back edges alone form no cycle), so the objective is met and U1 becomes an optional false-edge-class cleanup. U2's doc corrections still apply; its "override remains" statements must be adjusted to "override deleted by the sweep".
- **Lockfile refresh perturbs unrelated resolutions.** Removing dependencies should only prune entries, but pnpm's holistic resolution can re-resolve peers. Diff the lock for changes outside the three fork packages before committing.
- **Unrelated pre-existing gate failures surface.** The gate has run red for unrelated causes in past sessions (the recorded doc's 2026-08-09 correction resolved the contract lane only; the status of the other recorded failures at this HEAD is not established by that doc). Any red under this plan is triaged: failures caused by this change fixed first; unrelated reds block done per REPO-A3 and go through the pipeline's CI loop.
