---
title: De-rot the CLI contract-lane global setup — drop the effect pin, drop the comments, de-root the file
type: fix
date: 2026-08-24
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Summary

Delete the `overrides: { effect: EFFECT_PIN }` block (and the `EFFECT_PIN` constant) from the CLI contract lane's global setup; the contract workspace resolves `effect` through the tree's catalog like every other surface, and the lane's first run after the change must be observed green to prove the pin was never load-bearing. The wrong-premise comments are deleted outright — nothing replaces them. The file moves from `tests/__fixtures__/global-setup.ts` to the package root and is typed through `tsconfig.node.json`, and its repo-root path arithmetic is deleted: a package's test infrastructure resolves workspace siblings by name through pnpm, never by counting `../` levels out of the package.

# Problem Frame

`packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts:29` declares `const EFFECT_PIN = '4.0.0-rc.108'` and applies it at line 57 as `overrides: { effect: EFFECT_PIN }` inside the contract-workspace manifest. The comment at lines 22-28 claims _"the tarballs' own exact dependencies pin `4.0.0-rc.108`"_ and _"two copies of effect in one tree"_ cause Schema/Order interop to die.

Measured this session, neither claim is true:

- `pnpm-lock.yaml` resolves `effect` to `4.0.0-rc.111` for every workspace consumer and every transitive registry dep. No copy exists twice (lockfile scan, lines 73-75, 250-252, 306-310, 8688, 8697, 8738).
- The seven packages in `WORKSPACE_PACKAGES` (the fixture's packed set) either pin `effect: catalog:` → `4.0.0-rc.111` exact, peer on `^4.0.0-rc.111`, or do not depend on `effect` at all. None pin `4.0.0-rc.108` (`packages/testing/mutation/stryker-js/cli/package.json:36`, `…/mutation-run/package.json:137`, `…/mutation-report/package.json:45`, `…/plugin-api/package.json:36`, `…/instrumenter/package.json`, `…/util/package.json`, `…/cell/types/package.json:56,64`).
- The fixture's pin is the only `4.0.0-rc.108` reference in the entire `packages/` tree (`grep -rI "4\.0\.0-rc\.108" packages` returns the fixture, one README example, and one plan).
- The bump that moved the tree from `4.0.0-rc.108` → `4.0.0-rc.111` (commit `441e645064b`) updated the catalog, the lockfile, every published `effect` dep, and the README install lines — but **did not update `EFFECT_PIN`**. The lane has been running against the wrong effect version since 2026-08-22.

The "REPO-R2's hash floor" reference at line 28 is misapplied. REPO-R2 governs changeset intent per turbo `build` hash (`AGENTS.md:89`), not runtime version pinning. The fixture's author reached for it because nothing else in the doc tree governs exact dep pinning.

The user's directive: _"We shouldnt have a file that pins the exact effect version as part of a 'global fixture'. something is deeply wrong here."_

The file has two further defects beyond the stale pin. First, location: `global-setup.ts` is node-context infrastructure — a sibling of `vitest.config.ts` and `tsdown.config.ts`, which `tsconfig.node.json` types — yet it hides under `tests/__fixtures__/`, where the package's main tsconfig picks it up as test-tree content instead. Second, and worse, it computes `REPO_ROOT` by counting `../` segments out of the package (`tests/__fixtures__/global-setup.ts:43-48`), and its own comment records the consequence: a directory move once left the up-count wrong and _"the lane has died in `setup` — before collecting a single test — ever since."_ The one consumer of `REPO_ROOT` is `cwd:` for `pnpm --filter <name> exec pnpm pack` (line 151) — but `--filter` resolves the named package through pnpm's own workspace-manifest walk from any directory inside the workspace, so the package's own directory serves identically. The reach for repo root buys nothing and breaks on every move. User's directive: _"if it needs to touch repo root its wrong."_

# Requirements

R1. The fixture file does not declare `EFFECT_PIN` or any other exact `effect` version string. The contract-workspace manifest does not contain an `overrides` block. The fixture's hash integrity stays intact: no unrelated changes, no comment drift beyond the lines this plan names.

R2. The first run of the CLI contract lane (`pnpm --filter @systemfsoftware/stryker-js-cli test:contract` or the equivalent) after the change exits 0. This is the observation that proves the pin was never load-bearing — the green run is the warrant that the comment's premise was wrong.

R3. The fixture's `WORKSPACE_MANIFEST` literal resolves `effect` to `4.0.0-rc.111` through the tree's catalog, like every other consumer in the workspace. The version appears nowhere as a literal string inside the fixture file.

R4. The misleading comment block (lines 22-28) and the manifest's "duplicating effect" comment (lines 55-56) are removed, and nothing is written in their place. No comment about effect resolution, "two copies", or "Schema/Order interop" remains anywhere the plan touches.

R5. The plan lands with `pnpm check:local` green after the last edit and the PR's checks green. Per `REPO-D1`/`REPO-D2`.

R6. The global setup file lives at `packages/testing/mutation/stryker-js/cli/global-setup.ts` (package root), `vitest.contract.config.ts` points `globalSetup` at that path, and `tsconfig.node.json`'s `include` lists `global-setup.ts` alongside the other root node scripts.

R7. No path constant in the global setup escapes the package directory. `REPO_ROOT` is deleted; the pack loop's `pnpm --filter <name>` runs with the package root as `cwd`; `CLI_DIR` and `FIXTURES_DIR` derive from the file's own location with no upward traversal.

# Scope Boundaries

In scope:

- `packages/testing/mutation/stryker-js/cli/` — the global setup file (moved to package root), `vitest.contract.config.ts`, `tsconfig.node.json`
- One run of the contract lane to observe the green warrant
- Comment deletion on the lines this plan names and path-constant rewrites the move forces — nothing is written in the deleted comments' place

Out of scope:

- Any change to `pnpm-workspace.yaml`, `pnpm-lock.yaml`, or any other package's `package.json`. The catalog already resolves to `4.0.0-rc.111`; touching it would expand the diff past this plan.
- Changes to the README `pnpm add 'effect@4.0.0-rc.108'` example lines. Those are adopter-facing docs and a separate concern.
- Re-architecting the contract lane (replacing testcontainers with a lighter harness, changing what the lane packs or asserts). This plan moves the setup file and deletes its stale content; the lane's behaviour is unchanged.
- Mutation runs. `REPO-D3` forbids agent-started mutations.
- Adding a regression gate that detects stale version literals in fixture files. The user did not ask for one and it would be scope creep.

Deferred to follow-up work:

- The README `pnpm add 'effect@4.0.0-rc.108'` lines in `packages/testing/mutation/stryker-js/mutation-run/README.md` and every other published package's README still pin rc.108. They are stale by the same mechanism (the bump missed them). They are not this plan's surface; a follow-up doc-bump sweep can address them.

# Key Technical Decisions

KTD1 — _Delete the override, do not derive the version._ Removing the `overrides` block entirely is preferred over parsing `pnpm-workspace.yaml` or `pnpm-lock.yaml` to source a new pin. Reasoning: the user chose "Remove the override entirely" over "Derive the pin from the catalog" (ask, option 1 vs 2). The premise of the original pin was wrong (lockfile shows no duplicates), so a derived pin would still be a fix to a non-problem. The first observed green run after the change is the warrant that the original pin was never load-bearing.

KTD2 — _No new gate._ A guard that scans test fixtures for exact version literals is tempting but is not added. Reasoning: the fixture was the only one, the surface area is small, and the gate would be ceremony for a one-off smell. The user's stated rule ("don't pin exact versions in global fixtures") is captured by the deletion itself; adding a guard to enforce a rule with a single observed violation is `CONST-E3` false-positive arithmetic against an empty corpus. If a third instance appears, the rule earns its gate then.

KTD3 — _No changeset._ The fixture file is not a publishable surface. The lane consumes it; consumers do not. `REPO-R2` requires intent for publishable packages whose turbo `build` hash moves; a test fixture's hash does not contribute to any published `dist/`. Reasoning grounded in `REPO-R2` and `AGENTS.md:89`.

KTD4 — _Comments are removed, not replaced._ The deleted comment blocks leave nothing behind — not even a versionless one-liner explaining that `effect` resolves through the catalog (session-settled: user-directed — chosen over a one-line replacement comment: comments rot; the original stale pin survived two catalog bumps precisely because a narrative lived in a global fixture, and any replacement narrative is the same liability one bump later). The code's behaviour — a manifest with no overrides — states the resolution policy; the catalog owns the version.

KTD5 — _The package is the boundary; pnpm owns workspace resolution._ The global setup moves to the package root, is typed through `tsconfig.node.json` beside `vitest.config.ts` and `tsdown.config.ts`, and loses `REPO_ROOT` entirely. The pack loop's `pnpm --filter <name> exec pnpm pack` runs with the package root as `cwd`: `--filter` resolves the named workspace package through pnpm's workspace-manifest walk from any directory inside the workspace, so counting `../` segments to the repo root duplicated pnpm's own job with arithmetic that broke on the last directory move and will break on the next (session-settled: user-directed — "if it needs to touch repo root its wrong" — chosen over keeping a corrected up-count: a corrected count is the same fragility one move later).

# Implementation Units

## U1. Delete the pin and its comments in place

**Goal.** Remove `EFFECT_PIN`, remove the `overrides` block from the contract-workspace manifest, delete the wrong-premise comments outright, and leave the file otherwise untouched — the move is U2's concern, so U1's edits are anchored at the current location.

**Requirements.** R1, R2, R3, R4.

**Dependencies.** None.

**Files.** `packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts`.

**Approach.**

1. Delete `const EFFECT_PIN = '4.0.0-rc.108'` (line 29).
2. Delete the seven-line comment block at lines 22-28.
3. Remove the `overrides: { effect: EFFECT_PIN },` line (line 57) from the `WORKSPACE_MANIFEST` literal.
4. The fixture's `WORKSPACE_MANIFEST` literal at lines 52-58 becomes:
   ```ts
   const WORKSPACE_MANIFEST = JSON.stringify({
     name: 'stryker-contract-workspace',
     private: true,
   })
   ```
5. Run the contract lane locally. `pnpm --filter @systemfsoftware/stryker-js-cli test:contract` (or the equivalent — the lane needs a Docker daemon; see `global-setup.ts`'s own `podmanSockets`/`reachable` runtime detection). If green, R2 is satisfied at this unit's checkpoint. If red, **stop** — the previous pin was load-bearing after all and the plan needs to revert; do not paper over the failure by re-pinning.

**Execution note.** This is mostly packaging/config: prefer install/runtime smoke verification (the contract lane run) over unit coverage. The "test" is the observed green exit code, which is the only warrant that R2's premise (the pin was never load-bearing) holds.

**Patterns to follow.** The fix shape — _delete the override, trust the catalog_ — mirrors the wider repo doctrine (REPO-A3 collapses projections back into the owning port; the catalog already owns effect's exact version). The fixture is reaching into catalog territory it shouldn't own.

**Test scenarios.**

- The fixture file no longer contains the substring `"4.0.0-rc.108"` anywhere (covers R1, R3).
  - Input: `grep -n "4\.0\.0-rc\.108" packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts`.
  - Action: read stdout.
  - Expected outcome: empty output.
- The fixture file's `WORKSPACE_MANIFEST` literal has no `overrides` key (covers R1, R3).
  - Input: `grep -n "overrides" packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts`.
  - Action: read stdout.
  - Expected outcome: empty output.
- The misleading comment block is gone (covers R4).
  - Input: `grep -nE "two copies|Schema/Order|hash floor" packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts`.
  - Action: read stdout.
  - Expected outcome: empty output.
- The contract lane exits 0 against the catalog-resolved version (covers R2).
  - Input: `pnpm --filter @systemfsoftware/stryker-js-cli test:contract`.
  - Action: run to completion; capture exit code.
  - Expected outcome: exit code 0; no `Cannot convert a Symbol value to a number` or equivalent interop failure in the output (this is the diagnostic the original comment claimed to fear).

**Verification.** U1's own warrant is the observed green contract-lane run, recorded with its command and exit code. `pnpm check:local` runs once after U2, not per-unit.

## U2. Move the setup to the package root and delete the repo-root reach

**Goal.** Relocate the global setup from `tests/__fixtures__/global-setup.ts` to `global-setup.ts` at the package root, register it in `tsconfig.node.json`, repoint `vitest.contract.config.ts`, and rewrite the path constants so nothing in the file escapes the package directory.

**Requirements.** R6, R7, R5.

**Dependencies.** U1 (same file; content edits land before the move so U1's line anchors stay valid).

**Files.** `packages/testing/mutation/stryker-js/cli/global-setup.ts` (new location), `packages/testing/mutation/stryker-js/cli/tests/__fixtures__/global-setup.ts` (deleted by the move), `packages/testing/mutation/stryker-js/cli/vitest.contract.config.ts`, `packages/testing/mutation/stryker-js/cli/tsconfig.node.json`.

**Approach.**

1. `git mv tests/__fixtures__/global-setup.ts global-setup.ts`.
2. `vitest.contract.config.ts`: `globalSetup: ['./tests/__fixtures__/global-setup.ts']` → `['./global-setup.ts']`.
3. `tsconfig.node.json`: add `"global-setup.ts"` to `include` beside `oxlint.config.ts`, `tsdown.config.ts`, `vitest.config.ts`.
4. Rewrite the path constants at the new location:
   - `CLI_DIR` → `fileURLToPath(new URL('./', import.meta.url))` — the file's own directory is the package root; zero traversal.
   - `REPO_ROOT` → delete the constant and its comment block. The pack loop's `execFileAsync('pnpm', ['--filter', workspacePackage, 'exec', 'pnpm', 'pack', …])` takes `cwd: CLI_DIR` instead of `cwd: REPO_ROOT`; `pnpm --filter` resolves the named workspace package from any directory inside the workspace.
   - `FIXTURES_DIR` → `fileURLToPath(new URL('./tests/__fixtures__/fixtures', import.meta.url))` — the fixtures directory does not move.
5. Run the contract lane again. Green here proves the move and the de-rooted pack loop together. If red at the pack step with a filter-resolution error, the fallback is `cwd` = any workspace ancestor — but never a counted `../` chain; surface the error and stop before improvising.

**Execution note.** The dist-presence check (`join(CLI_DIR, 'dist', 'main.mjs')`) and the tarball-count assertion already guard the loop's assumptions; the de-rooted `cwd` is exercised by the same green run.

**Test scenarios.**

- The file exists at the package root and not under `tests/__fixtures__/` (covers R6).
  - Input: `git ls-files packages/testing/mutation/stryker-js/cli | grep global-setup`.
  - Action: read stdout.
  - Expected outcome: exactly one line, `packages/testing/mutation/stryker-js/cli/global-setup.ts`.
- `tsconfig.node.json` includes the file (covers R6).
  - Input: `git grep -n "global-setup" packages/testing/mutation/stryker-js/cli/tsconfig.node.json`.
  - Action: read stdout.
  - Expected outcome: one line naming `global-setup.ts` inside `include`.
- `vitest.contract.config.ts` points at the new path (covers R6).
  - Input: `git grep -n "globalSetup" packages/testing/mutation/stryker-js/cli/vitest.contract.config.ts`.
  - Action: read stdout.
  - Expected outcome: `globalSetup: ['./global-setup.ts']`.
- No upward path traversal remains (covers R7).
  - Input: `git grep -nE "'\.\./" packages/testing/mutation/stryker-js/cli/global-setup.ts`.
  - Action: read stdout.
  - Expected outcome: empty output — no `REPO_ROOT`, no `../` segments in any path constant.
- The contract lane exits 0 from the new location with the de-rooted pack loop (covers R7, R2, R5).
  - Input: `pnpm --filter @systemfsoftware/stryker-js-cli test:contract`.
  - Action: run to completion; capture exit code.
  - Expected outcome: exit code 0; seven tarballs packed, install succeeds in-container.
- `pnpm check:local` exits 0 after the last edit (covers R5).
  - Input: `pnpm check:local`.
  - Action: run to completion; capture exit code.
  - Expected outcome: exit code 0.

**Verification.** Green contract lane from the new location + green `pnpm check:local` + the three grep gates above, all with commands and exit codes recorded in the commit body.

# Definition of Done

- U1's four content edits and U2's move + de-root both land.
- `git grep -n "4\.0\.0-rc\.108" packages/testing/mutation/stryker-js/cli/global-setup.ts` returns zero lines.
- `git grep -nE "two copies|Schema/Order|hash floor|duplicating effect|see above" packages/testing/mutation/stryker-js/cli/global-setup.ts` returns zero lines.
- `git grep -nE "REPO_ROOT|'\.\./" packages/testing/mutation/stryker-js/cli/global-setup.ts` returns zero lines.
- `git grep -n "global-setup" packages/testing/mutation/stryker-js/cli/tsconfig.node.json packages/testing/mutation/stryker-js/cli/vitest.contract.config.ts` shows the tsconfig include and the `./global-setup.ts` globalSetup path.
- Contract lane run exits 0 from the new location, with the run command and exit code recorded in the commit body.
- `pnpm check:local` exits 0 after the last edit.
- PR pushed, `gh pr checks --watch --fail-fast` exits 0.
- No changeset is added (`KTD3`).
- No mutation run is started (`REPO-D3`).

# Sources & Research

- `AGENTS.md:89` — REPO-R2 governs changeset intent per turbo `build` hash, not runtime version pinning. The fixture's "REPO-R2's hash floor" reference is misapplied; cited for KTD3.
- `pnpm-lock.yaml:73-75, 250-252, 306-310, 8688, 8697, 8738` — `effect` resolves to `4.0.0-rc.111` everywhere in the tree; no duplicate copies. Cited for the Problem Frame's measurement.
- `packages/testing/mutation/stryker-js/cli/package.json:36`, `…/mutation-run/package.json:137`, `…/mutation-report/package.json:45`, `…/plugin-api/package.json:36`, `…/instrumenter/package.json`, `…/util/package.json`, `…/cell/types/package.json:56,64` — the seven `WORKSPACE_PACKAGES` either pin `effect: catalog:` (exact), peer on `^4.0.0-rc.111`, or do not depend on `effect` at all. Cited for the Problem Frame's claim that no published tarball pins `4.0.0-rc.108`.
- `packages/testing/mutation/stryker-js/cli/tsconfig.node.json:3` — `include` lists exactly `oxlint.config.ts`, `tsdown.config.ts`, `vitest.config.ts`: the package-root node scripts the moved file joins. Read this session.
- `packages/testing/mutation/stryker-js/cli/vitest.contract.config.ts:13` — `globalSetup: ['./tests/__fixtures__/global-setup.ts']`, the reference U2 repoints. Read this session.
- `global-setup.ts:43-48` (path constants and the recorded directory-move breakage), `:118` (sole `CLI_DIR` consumer), `:151` (sole `REPO_ROOT` consumer — `cwd` for the `pnpm --filter` pack loop), `:178` (sole `FIXTURES_DIR` consumer). Read this session.
- Commit `441e645064b` (`fix(deps): bump effect to 4.0.0-rc.111`) — moved the catalog but did not touch `EFFECT_PIN`. Cited for the staleness timeline.
- Commit `d24871cca75` (`test(stryker-js-cli): pin effect in the contract-lane container install`) — introduced `EFFECT_PIN`. Cited for the original intent.

# Software Wiki Corpus

Two queries were issued against `/home/ryan/Documents/projects/software-wiki` (719 docs, single `software-wiki` collection):

1. `lex:global fixture effect version pin` + `lex:contract lane container install effect pin overrides` + `vec:test fixture pins exact effect version fights pnpm catalog` + `hyde:A doc on removing exact version pins…`
2. `lex:pnpm overrides exact pin version contract test` + `lex:"two copies" effect npm install peer` + `vec:should a test fixture override a pnpm catalog's exact dep with a different exact pin` + `hyde:In a pnpm-catalog monorepo where the catalog pins effect to 4.0.0-rc.111 exact and peers to ^4.0.0-rc.111, a test fixture's package.json adds an overrides: { effect: '4.0.0-rc.108' }…`

Neither returned a settled answer on the question. The closest hits were `software-wiki/entities/effect-ts.md` (about the effect library) and `software-wiki/entities/library-public-api-surface.md` (about Effect package public APIs) — neither on-topic for "should a test fixture override a pnpm catalog's exact dep." This plan therefore does not cite a wiki atom on the version-source question; the decision rests on REPO-A3, the user's directive, and the measured lockfile state.

# Risks

R-RISK1 — _The pin was load-bearing and the contract lane goes red without it._ Probability: low (lockfile scan shows no duplicates; KTD1's reasoning). Mitigation: U1's `Approach` step 5 says **stop**, not paper over. If the lane goes red, the original comment was right and this plan needs a different shape — the right move is to revisit whether the published tarballs' `effect` deps converge with their peers and fix that, not to re-pin the fixture.

R-RISK2 — _The contract lane needs a Docker daemon._ Probability: medium (the fixture's own runtime-detection logic at lines 72-82, 89-106 shows the workspace already accommodates podman fallback). Mitigation: the verification step captures the run command and exit code; if the runner cannot provide a daemon, that is a precondition failure for the verification, not a plan defect — surface it and stop.

# Assumptions

- The contract lane's run command is `pnpm --filter @systemfsoftware/stryker-js-cli test:contract`. If a different command governs the lane in this branch, substitute it; the green-exit-code warrant is the same shape.
- `pnpm check:local` will be green after the fixture edit (no other touched files; no downstream consumers depend on the deleted constant because `EFFECT_PIN` is module-local — `grep -n "EFFECT_PIN" packages` returns the fixture only).
