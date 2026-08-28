---
title: fix: remove root workspace devDeps from the turbo global hash
created: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
topic: turbo-global-hash-root-workspace-deps
issue: https://github.com/systemfsoftware/systemfsoftware/issues/285
---

# fix: remove root workspace devDeps from the turbo global hash

## Goal Capsule

- **Objective.** Root `package.json`'s six `workspace:^` devDependencies stop feeding turbo's global hash, so a diff scoped to `packages/testing/mutation/**` no longer invalidates tasks outside that closure and CI restores with cache hits for unchanged packages.
- **Authority hierarchy.** Issue #285 acceptance criteria govern; repo invariants (`AGENTS.md` REPO-R2 changeset gate, REPO-D1 `pnpm check:local`) govern the tail. This plan governs scope: the six `workspace:^` deps only.
- **Stop conditions.** If per-package declarations cannot make plugin resolution local (resolution still walks to a removed root entry), or the post-U1 turbo task graph is cyclic (`turbo run build --dry=json` reports `Cyclic dependency detected`), stop and report — either falsifies KTD2's mechanism.
- **Execution profile.** Config/dependency migration; no runtime code changes. Verification is probe-based (hash dry-runs, resolution probes), not test-suite-shaped.
- **Tail ownership.** Caller (LFG) owns simplify → review → commit → PR → CI watch.

---

## Product Contract

### Summary

Turbo folds the source files of every internal workspace package the root depends on into the global hash of every task (turborepo.dev caching docs, "Root workspace dependencies": "changing a source file in `@repo/tooling` causes every cacheable task to miss cache"). Root's six `workspace:^` devDeps — `@systemfsoftware/stryker-js`, `-cli`, `-platform-node`, `-typescript-checker`, `-vitest-runner`, `@systemfsoftware/stryker-test-contribution` — therefore put ~90 tasks behind the mutation packages' files; CI measured 0 cache hits / 91 misses on every run since ≥ 2026-08-23 (issue #285 evidence, run 33128544759 job 98712461382).

### Problem Frame

The six root entries are not decorative: they are the workspace-wide resolution floor. Twelve of the 13 packages carrying a `"mutation": "stryker run"` script own a `stryker.config.json` whose `extends` chain reaches `stryker.config.base.json:5-11` and its five plugin families, and Node's upward resolution from each package reaches root `node_modules` — none of the twelve declares the `stryker` bin or the runner/checker/contribution plugins, and only `daemon-spec` and `hex-schema` declare `@systemfsoftware/stryker-plugins`. The 13th, `hex-schema`, owns no config: its mutation script is presently unrunnable and it is not a CI mutation target (`scripts/tools/discover-mutation-targets.mjs` enrolls exactly the projects owning `stryker.config.json`). Removing the root lines without migrating resolution breaks the 12 runnable mutation tasks (issue #285 non-counting outcome bans "deleting the test file or the affected tasks"). The fix is migrate-then-remove.

### Requirements

- R1. On a synthetic diff touching only `packages/testing/mutation/stryker-js/platform-node/**`, `globalCacheInputs.hashOfInternalDependencies` and the `@systemfsoftware/effect-atom#lint` task hash are unchanged by that diff (turbo `--dry=json` comparison, gatekeeper — issue AC1).
- R2. After root drops the six deps, each config-bearing mutating package resolves every plugin named in its effective config chain from its own declarations, the `stryker` bin resolves for the 12 non-cli packages, and the cli self-runs its own `dist/main.mjs` bin — verified by a per-package resolution probe (pre-removal: resolved paths outside root `node_modules`; post-removal: resolution succeeds at all) plus real mutation-run smokes on two packages including the cli (issue AC2's local half; CI hits are AC2's CI half, confirmed on the PR).
- R3. Tasks that legitimately depend on mutation packages still invalidate when those packages change, through their own dependency closure, not the global hash (issue AC3) — a mutation-package change moves the hash of a declaring consumer's `mutation` task while unrelated packages stay stable.
- R4. `pnpm check:local` exits 0 after the last edit, and every publishable package whose turbo `build` hash moved carries a `.changeset/` intent (REPO-D1, REPO-R2; devDependency-only movement → `none` bump).

### Scope Boundaries

- **Out of scope (with reason):** every non-`workspace:` root devDependency (`concurrently`, `estree-walker`, `oxc-parser`, `@std/jsonc`, `tstyche-typescript`, …). Registry deps enter the global hash only through lockfile changes, never through package-file changes — removing them buys nothing for the per-PR invalidation this issue measures. (session-settled: user-directed — chosen over full root-devDep minimization: registry deps ride the lockfile component, not the internal-deps closure.)
- **Out of scope:** `turbo.json` changes, `.github/workflows/**` changes, catalog changes, remote cache, any turbo fork (issue orientation bans the last two).

### Assumptions

- Plugin resolution walks up to root `node_modules` today; a package-local declaration short-circuits the walk. Proven by the U1 probe (pre-removal) and re-proven in U2 (post-removal); if the walk-up model is wrong, stop per Goal Capsule.
- The `stryker` bin ships from `@systemfsoftware/stryker-js-cli`, whose declared bin is `./dist/main.mjs` built by its tsdown pipeline; CI builds all packages before the mutation job, local runs need a prior cli build.
- `@systemfsoftware/stryker-js` and `@systemfsoftware/stryker-js-platform-node` take no per-package entry: each declared plugin package carries them in its own closure (`stryker-js` is a dependency of every fork package; `platform-node` of the cli and `stryker-test-contribution`), so the plugin-resolution probe and smokes cover them end to end.
- `@systemfsoftware/stryker-plugins` is one package whose ignorers are subpaths; declaring the package once covers `effect-schema-ignorer` and `workflow-make-ignorer`.
- Moving the cli's three oxlint-plugin devDependencies to `peerDependencies` keeps them installed (pnpm auto-installs peers by default; this repo has no `.npmrc`) while excluding those edges from turbo's task graph — turbo validates cycles at task-graph level over dependencies/devDependencies (vercel/turborepo#9253, #12327), and a devDependency cycle hard-fails the repo's pinned turbo while `pnpm install` exits 0.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Scope is the six `workspace:^` root deps, nothing else.** (session-settled: user-directed — chosen over minimizing all root devDependencies: turbo's global hash internal-deps component covers only internal workspace packages in the root closure; registry deps surface solely via lockfile changes, per the turborepo caching doc's "Root workspace dependencies" section.)
- KTD2. **Migrate-then-remove, cycle-free.** Every consumer declares what it actually resolves before root drops the six lines: the bin via `@systemfsoftware/stryker-js-cli`, the four base-config plugin packages (`-vitest-runner`, `-typescript-checker`, `-stryker-test-contribution`, `stryker-plugins`) per package, with `stryker-js` and `-platform-node` left transitive through the plugins' own closures; the cli's three oxlint-plugin devDependencies move to `peerDependencies` so the new plugin→cli devDependencies cannot close a turbo task-graph cycle — a devDep cycle hard-fails turbo while `pnpm install` exits 0, so U1 gates on a turbo dry-run, never on install success. Chosen over delete-only (breaks the 12 runnable mutation tasks) and over per-task `inputs` masking or cache enlargement (issue non-counting outcomes). Accepted tradeoff: peer edges drop plugin-source changes out of the cli's own task hashes, where those plugins are dev-time lint inputs.
- KTD3. **devDep-only hash movement ships `none` changesets.** Adding devDeps to publishable packages moves their `package.json` and the lockfile, which moves the turbo `build` hash; REPO-R2's canonical class for that is `pnpm change --bump none`. The changeset gate (`scripts/guards/check-changeset.ts` via CI) decides which packages need intents; `none` is correct because no exported name, type, or behaviour changes.

### Sequencing

U1 (declarations + lockfile + pre-removal probes) → U2 (root removal + post-removal probes) → U3 (gatekeeper hashes + gate + changesets). U2 must not start before U1's resolution probe shows every resolved path outside root `node_modules` and its acyclicity probe exits clean; R1's probe must run on the post-U2 tree.

---

## Implementation Units

### U1. Declare mutation tooling in the 13 mutating packages

- **Goal:** each package that runs `stryker run` resolves the bin and its effective plugin set from its own `devDependencies`.
- **Requirements:** R2, R3.
- **Dependencies:** none.
- **Files:** the `devDependencies` blocks of the 13 manifests matching `"mutation": "stryker run"` (verified set this session: `packages/core/effect/daemon-spec`, `packages/core/hex/hex-schema`, `packages/lint/oxlint/plugins/cells/cell-vocabulary`, `packages/lint/oxlint/plugins/cells/effect-workflow`, `packages/lint/oxlint/plugins/effect/entrypoint`, `packages/lint/oxlint/plugins/effect/schema`, `packages/lint/oxlint/plugins/meta/core`, `packages/lint/oxlint/plugins/testing/property-testing`, `packages/lint/oxlint/plugins/testing/test-hygiene`, `packages/lint/oxlint/plugins/testing/test-placement`, `packages/testing/mutation/stryker-js/cli`, `omp/plugins/omp-agent-discipline`, `omp/plugins/omp-claude-compat`) plus `pnpm-lock.yaml` via `pnpm install`.
- **Approach:**
  1. Re-enumerate the set at implementation time (`"mutation": "stryker run"` across `packages/ omp/ agent-plugins/`) in case the tree moved.
  2. For each package, enumerate its effective config chain: `extends` target (root `stryker.config.base.json` or another base) plus package-local `plugins`/`ignorers` additions.
  3. Add exactly the missing members of: `@systemfsoftware/stryker-js-cli` (bin), `@systemfsoftware/stryker-js-vitest-runner`, `@systemfsoftware/stryker-js-typescript-checker`, `@systemfsoftware/stryker-test-contribution`, `@systemfsoftware/stryker-plugins` — all `workspace:^`. Skip members already declared (`daemon-spec` and `hex-schema` already declare `@systemfsoftware/stryker-plugins`); `stryker-js` and `-platform-node` take no entry (transitive through the plugins' closures).
  4. `packages/testing/mutation/stryker-js/cli`: declare the four plugin packages (it cannot depend on itself), and switch its `mutation`/`mutation:full` scripts to self-run its own declared bin — `node ./dist/main.mjs run` / `node ./dist/main.mjs run --force` — the pattern `arethetypeswrong/cli` uses for its own bin.
  5. Move the cli's three oxlint-plugin devDependencies (`oxlint-plugin-cell-vocabulary`, `oxlint-plugin-effect-entrypoint`, `oxlint-plugin-test-placement`) to `peerDependencies`: keeping them as devDependencies closes `cli#build ↔ plugin#build` cycles that hard-fail turbo, while peers stay outside the task graph and pnpm auto-install-peers keeps them installed.
  6. `pnpm install` to settle the lockfile; confirm the three peers still land in the cli's `node_modules`.
  7. Acyclicity probe: `pnpm exec turbo run build --dry=json` exits 0 with no `Cyclic dependency detected`.
  8. Resolution probe (pre-removal): from each of the 13 packages' cwd, `require.resolve` the four plugin modules and the bin — every resolved path must lie outside root `node_modules` (a prefix assertion; pre-removal a bare no-throw check proves nothing because root still supplies resolution).
- **Patterns to follow:** existing per-package devDep declarations (`packages/testing/mutation/plugins/stryker-plugins/package.json:72-73`); `arethetypeswrong/cli`'s by-path bin script.
- **Test expectation:** none — dependency-declaration work; behaviour is proven by the resolution probes and U2's mutation smokes, not new tests.
- **Verification:** `pnpm install` exits 0; the turbo acyclicity probe exits clean; the pre-removal resolution probe shows every path outside root `node_modules`; `git diff --stat` shows only the 13 manifests + lockfile.

### U2. Drop the six root deps and prove local resolution

- **Goal:** root stops depending on any internal workspace package; every mutating package still resolves what it runs.
- **Requirements:** R2, R3.
- **Dependencies:** U1.
- **Files:** `package.json` (root `devDependencies`: remove the six `workspace:^` entries), `pnpm-lock.yaml`.
- **Approach:**
  1. Remove the six lines from root `package.json`.
  2. `pnpm install`.
  3. Resolution probe (post-removal): repeat U1 step 8 — every plugin module and the bin must resolve from each package's own closure.
  4. Mutation smokes: run two real `mutation` tasks end to end — the cli (exercises its by-path self-run and its own sandbox) and one small config-bearing package (`test-placement` or `cell-vocabulary`) — confirming both reach a verdict with the base-config plugins loaded; treat any sandbox `symlinkJunction` warning during sandbox creation as a probe failure, not a log line.
- **Execution note:** if any post-removal probe fails to resolve, or a smoke loses a plugin inside its sandbox, stop — the declaration model missed a consumer; report before touching anything else.
- **Test expectation:** none — probes plus two real runs are the proof.
- **Verification:** every probe resolves locally; both smokes reach a verdict with zero swallowed symlink warnings; root `package.json` contains no `workspace:` specifier.

### U3. Gatekeeper hashes, repo gate, changesets

- **Goal:** issue acceptance criteria demonstrated; repo gates green; release intents filed.
- **Requirements:** R1, R3, R4.
- **Dependencies:** U2.
- **Files:** `.changeset/*` (new intents), nothing else.
- **Approach:**
  1. Baseline probe: `env -u AGENT GITHUB_ACTIONS=true OXLINT_FORMAT=github CI=true pnpm exec turbo run lint --filter=@systemfsoftware/effect-atom --dry=json` → record `globalCacheInputs.hashOfInternalDependencies` and the `effect-atom#lint` task hash.
  2. Synthetic diff: append a comment line to a tracked source file under `packages/testing/mutation/stryker-js/platform-node/src/`, re-run the probe, compare — both hashes must be identical (R1). Restore the file.
  3. Consumer-closure probe: same synthetic diff, compared repo-wide — a declaring consumer's `mutation` task hash (e.g. `hex-schema#mutation`) must move while no out-of-closure task hash changes; scan the full dry-run task list rather than trusting one package pair.
  4. Run `pnpm check:local` (REPO-D1).
  5. File `.changeset/` intents per KTD3 for every publishable package the changeset gate flags — expect more than the directly-edited 13, because devDep-closure consumers (e.g. `@systemfsoftware/oxlint`, `@systemfsoftware/oxlint-config`) re-hash too; file each non-interactively as `pnpm change --bump none --summary "devDependencies-only change; no observable behaviour" <pkg>`.
- **Test expectation:** none — hash probes and existing gates are the contract.
- **Verification:** R1 and R3 probes show the exact expected hash movements; `pnpm check:local` exits 0; changeset intents exist for every flagged package.

---

## Verification Contract

| Gate                       | Command                                                                                                                                       | Proves                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Global-hash stability (R1) | baseline-vs-synthetic-diff `turbo run lint --filter=@systemfsoftware/effect-atom --dry=json` comparison (CI env vars per issue #285)          | `hashOfInternalDependencies` + `effect-atom#lint` unchanged |
| Local resolution (R2)      | per-package `require.resolve` probe for bin + four plugin modules — pre-removal with outside-root path assertion, post-removal for resolution | no package leans on root `node_modules`                     |
| Mutation smoke (R2)        | two real `mutation` tasks (cli + one small config-bearing package), zero swallowed sandbox symlink warnings                                   | plugins load in the sandbox, runs reach verdict             |
| Consumer closure (R3)      | declaring consumer's `mutation` task hash moves under a platform-node diff                                                                    | dependency-local invalidation                               |
| Acyclic task graph (U1)    | `pnpm exec turbo run build --dry=json` exits clean                                                                                            | the devDep migrations closed no turbo cycle                 |
| Repo gate (R4)             | `pnpm check:local`                                                                                                                            | REPO-D1                                                     |
| Release intents (R4)       | changeset gate + `pnpm change --bump none --summary "…" <pkg>` per flagged package                                                            | REPO-R2                                                     |

CI half of issue AC2 (cache hits on unrelated packages in the gate log) is confirmed by watching the PR's checks — the babysit tail, not a local command.

---

## Definition of Done

- R1–R4 all demonstrated with the probes above, run in this session after the last edit.
- No `.changeset` debt: gate green or intents filed for every flagged package.
- Delivered as a PR watched to green (REPO-D2); tree left restartable; no leftover probe files or synthetic diffs.
