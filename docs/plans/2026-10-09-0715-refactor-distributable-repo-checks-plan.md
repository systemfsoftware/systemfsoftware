---
title: Distributable Repo Checks - Plan
type: refactor
date: 2026-10-09
topic: distributable-repo-checks
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-09-0448-refactor-distributable-repo-checks-plan.md
---

# Distributable Repo Checks - Plan

## Goal Capsule

- **Objective:** no repository-local guard remains. Every invariant worth keeping is enforced by something another repository can consume: an output of this repository's Nix flake, or the engine that already owns the effect. Each enforcer decides on the real effect or a declared property, never on a word or a name.
- **Done when:** `.claude/hooks/guard-*` and `scripts/guards/*` are gone; the required CI gate runs every kept check through the flake output, the way a consumer would; each kept check fails the same CI run on one planted, honest violation; every dropped invariant carries a one-line reason in the pull request body.
- **Out of scope:** the operator's `~/.config/omp-infra`; other repositories' guards (follow-up units, listed below); the vitest-config unit; branch rulesets.

## Problem Frame

Seven repository-local guards enforce invariants through two shapes the operator ruled out: Claude Code hooks under `.claude/hooks/` that only this checkout runs, and Deno scripts under `scripts/guards/` that only this repository's `package.json` invokes. Most decide by matching text: a path prefix, a word in a command line, a regex over lockfile keys, a regex over added YAML text. A text guard sees only what an agent typed through one tool, so it misses the same change made any other way.

### What the investigation found that contradicts the brief

1. **REPO-S2 is already violated on `main`.** `pnpm-workspace.yaml` excludes `effect` and `@effect/*` from `minimumReleaseAge` (added by acef0480c2 when effect 4.0.0 shipped). The write hook only saw agent edits, so the exclusion landed anyway. A check over the parsed file fails on `main` today. The locked `effect@4.0.1` was published 2026-10-05, well past the 1440-minute cutoff, so the exclusions can go.
2. **`check-changeset.ts` is already dead.** #683 pointed `.github/workflows/changeset-check.yml` at the reusable workflow pinned at pnpm-release-management `8cd6e83`; nothing invokes the local script.
3. **`isolatedDeclarations` already has an engine.** Turning it on makes `tsc` refuse every inferred Effect export. Reproduce in `packages/effect-readiness` with a fresh build-info file: `tsc -p tsconfig.app.json --tsBuildInfoFile "$d/b" --outDir "$d/out"` exits 0 with no errors; adding `--isolatedDeclarations` exits 1 with 83 errors (TS9010 ×29, TS9021 ×27, TS9013 ×15, TS9038 ×8, TS9011 ×3, TS9007 ×1). A stale `node_modules/.cache` build-info replays old diagnostics, so the fresh `--tsBuildInfoFile` matters. `packages/toolchain/tsconfig/README.md` explains why no annotation can satisfy it.
4. **The effect pre-release guard cannot generalize.** It matches the names `effect` and `@effect/*`. The property behind it ("no pre-release is locked") fails today on 18 transitive entries (`rolldown@1.0.0-rc.17`, `gensync@1.0.0-beta.2`, ...). For effect itself, the `^4.0.1` catalog ranges already exclude pre-releases: pnpm's range resolution refuses one unless a specifier names it.
5. **A Nix flake `checks` derivation cannot see git history** (the flake source carries no `.git`). The git-based checks therefore ship as a flake package run with `nix run`, not as `checks.<system>`.
6. **The static lane checks out at `fetch-depth: 2`.** The subtree check needs the commit graph. `git fetch --filter=tree:0 --unshallow` fetches commits only and resolves trees on demand: 0.8 s against this repository, measured.
7. **Mainline commits also carry `git-subtree-*` trailers.** c4efc332 has `git-subtree-dir`/`git-subtree-split` trailers but a whole-repository tree. Selecting the squash commit by trailer alone would compare against the wrong tree.
8. **The Changeset Check workflow is not a required status check.** The `main` ruleset requires only `Build · lint · typecheck · test / the gate (pnpm check:ci)`. Rulesets are operator settings; this plan reports it and does not change it.

## Requirements

- R1. No `.claude/hooks/guard-*.ts` and no `scripts/guards/*.ts` exist; `.claude/settings.json`, `.husky/pre-push`, root `package.json`, AGENTS.md, CONCEPTS.md, and live docs cite none of them.
- R2. One flake package, `repo-checks`, runs the kept repository checks for any pnpm workspace with `nix run github:systemfsoftware/systemfsoftware#repo-checks -- <check>...`. This repository's required gate invokes the same output (`nix run .#repo-checks`).
- R3. Exit code is the verdict: `0` holds, `1` a named violation, `2` the check could not decide (shallow history, missing compiler, unparseable file, a declared directory that is not one, or any unexpected error). A planted violation must exit `1`, not `2`, and only a named violation can exit `1`.
- R4. No check decides by a word, name, or regex over text. Each reads a declared property (git-subtree trailers, the parsed workspace file, workspace package manifests, the compiler's own file list, the diff) or defers to the engine that refuses.
- R5. Each kept invariant fails one CI step on one planted, honest violation in the same run that checks the real tree.
- R6. Dropped invariants are listed in the pull request body with a one-line reason each.

## Invariant → Enforcer

| Old guard                                                            | Invariant                                                                         | New enforcer                                                                                                                                                                            | Runs in                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.claude/hooks/guard-local-mutation.ts`                              | No local mutation run (REPO-D3)                                                   | `@systemfsoftware/stryker-js` ≥ 16.0.0 refuses `run` unless `GITHUB_ACTIONS=true` or `ALLOW_LOCAL_MUTATION=1` (rule `mutation-runs-on-main-ci`; locked 17.0.2 contains it)              | static lane: planted `stryker run` with CI variables unset must end in a `refused` event |
| `.claude/hooks/guard-protected-writes.ts` (repos/)                   | Vendored subtrees are read-only (REPO-S3)                                         | `repo-checks subtrees`: each subtree directory's tree at `HEAD` equals the tree of its latest squash commit                                                                             | static lane via `pnpm gate:repo`; planted edit inside a subtree must exit 1              |
| `.claude/hooks/guard-protected-writes.ts` (minimumReleaseAgeExclude) | The supply-chain cutoff holds; only the workspace's own scope is exempt (REPO-S2) | `repo-checks release-age`: parsed `pnpm-workspace.yaml` sets a positive `minimumReleaseAge`, and every exclusion is `@<scope>/*` for a scope the workspace's own packages publish under | static lane; planted `effect` exclusion must exit 1                                      |
| `.claude/hooks/guard-protected-writes.ts` (isolatedDeclarations)     | —                                                                                 | **Dropped.** `tsc` refuses inferred Effect exports under it; the compiler is the gate                                                                                                   | —                                                                                        |
| `.claude/hooks/guard-native-equivalent.ts`                           | —                                                                                 | **Dropped.** Matches command words; it steers one agent client toward its own tools, which is that client's configuration, not a repository property                                    | —                                                                                        |
| `scripts/guards/check-changeset.ts`                                  | A turbo build-hash change in a publishable package needs an intent (REPO-R2)      | pnpm-release-management's reusable `changeset-check.yml` at `8cd6e83` (already wired by #683)                                                                                           | Changeset Check workflow                                                                 |
| `scripts/guards/check-effect-release.ts`                             | —                                                                                 | **Dropped.** A name guard; the `^4.0.1` ranges exclude pre-releases and pnpm's resolution refuses one unless a specifier names it                                                       | —                                                                                        |
| `scripts/guards/check-project-membership.ts`                         | Every tracked TypeScript source is in exactly one compiler project                | `repo-checks project-membership`: the workspace's own `tsc --showConfig` file lists                                                                                                     | static lane; planted stray source must exit 1                                            |
| `scripts/guards/check-single-plan.ts`                                | A pull request adds at most one plan (REPO-D2)                                    | `repo-checks single-plan --plans docs/plans --base <rev>`: files the diff adds under the declared directory                                                                             | static lane and `.husky/pre-push`; planted second plan must exit 1                       |

### check-changeset parity

The reusable workflow decides the same property: per publishable member, the turbo `#build` hash at base versus head (`change-verdict.ts` `verdictTouched`/`hashMoved` ≡ local `verdict`), with the same changed-file fallback for a member with no build task, the same `private !== true` publishability, `none` counted as an intent, liveness over pending intents, and fail-closed on an unreadable dry run. It differs only off the property: members come from `pnpm ls -r` rather than the union of both dry runs, the turbo pin check parses YAML instead of a hand-rolled split, there is no `--selftest`, and diagnostics go through its reporter. It adds deleted-package reporting and release-ledger append verification. Verdict: **covers**; no unit for pnpm-release-management is needed.

## Key Technical Decisions

- **KTD1. One flake package, Deno source.** The guards are Deno today and the flake already ships a Deno tool the same way (`nix/test-timings.nix`: `writeShellApplication` over `deno run --frozen` with this repository's lock). `nix/test-timings.nix` becomes a shared `nix/deno-tool.nix` builder used by both, so the DENO_DIR logic exists once. A TypeScript workspace package was rejected: it would ship as an npm tarball and need a Node build to run, for four checks with no consumer-visible API.
- **KTD2. A flake package, not `checks`.** Three of four checks need git history or the workspace's installed compiler; a `checks` derivation sees neither (finding 5). A `lib` wrapper for the one pure check would be a second delivery surface for one check.
- **KTD3. Subtree identity from git-subtree's own trailers.** A subtree directory is any `git-subtree-dir` value (each value of a multi-valued trailer counts) whose squash commit carries one `git-subtree-split` and lies off `HEAD`'s first-parent chain (finding 7). The check compares `HEAD:<dir>` to that commit's tree; a dir absent at `HEAD` was removed and is skipped, since it has no tree left to misreport its upstream. A dir a trailer declares and `HEAD` holds, with no reachable squash, is undecided (exit 2), never a silent pass; a violation found in another dir still exits 1. A shallow repository exits 2 naming `git fetch --filter=tree:0 --unshallow`.
- **KTD4. Own scope from declared manifests.** The permitted exclusions are derived from the workspace's own non-private `package.json` names: the scope of a scoped name, or the exact unscoped name. An entry's pinned versions (`name@1.2.3 || 2.0.0`) do not change the package it names. The check carries no organization name and works unchanged in a consumer.
- **KTD5. Plan directory is declared by the caller.** `--plans <dir>` is required and must be a repository-relative directory at the head revision, else the check is undecided; it counts additions and renames into that directory between `merge-base(<base>, HEAD)` and `HEAD`.
- **KTD6. No in-process selftests.** The old `--selftest` fixture suites are replaced by one planted violation per property in CI against the real checkout (R5); no case matrix.
- **KTD7. No agent-side plugin is added.** The CI check makes vendored-tree edits fail whichever tool made them; a second, edit-time enforcer for the same invariant would be duplicate machinery.

## Implementation Units

### U1. `repo-checks` source and flake package

- **Files:** `scripts/tools/repo-checks/{cli,subtrees,release-age,project-membership,single-plan}.ts`, `nix/deno-tool.nix` (from `nix/test-timings.nix`), `flake.nix`.
- **Approach:** each check is a module exporting a pure verdict function and its git/file reads; `cli.ts` parses `<check>...` plus `--plans`/`--base`, runs each, prints every verdict, exits per R3. `project-membership` is ported from the old script minus its selftest; suffix tests use `extname` rather than regex. Permissions: `--allow-read --allow-run=git,./node_modules/.bin/tsc --allow-env`.
- **Verify:** `deno check`, `deno lint`, `nix build .#repo-checks`, and each check run against this checkout.

### U2. Delete the guards and their wiring

- **Files:** `.claude/hooks/guard-*.ts`, `scripts/guards/*.ts`, `.claude/settings.json`, `package.json` (`guard:projects` → `gate:repo` calling `nix run .#repo-checks`), `.husky/pre-push`.
- **Verify:** `git grep` for every deleted name returns only historical plans/records.

### U3. Fix the live REPO-S2 violation

- **Files:** `pnpm-workspace.yaml` (drop `effect`, `@effect/*` exclusions), lockfile unchanged.
- **Verify:** `repo-checks release-age` exits 1 before, 0 after; `pnpm install --frozen-lockfile` passes.

### U4. CI: history fetch and planted violations

- **Files:** `.github/actions/checks-lane/action.yml` (static lane).
- **Approach:** after the upstream-ref fetch, `git fetch --no-tags --filter=tree:0 --unshallow origin +refs/heads/main:refs/remotes/origin/main`; then one step builds `.#repo-checks` once and, for each kept property, plants a violation, requires exit 1, and restores `HEAD`. The mutation plant runs `stryker run` in one package with `GITHUB_ACTIONS` and `ALLOW_LOCAL_MUTATION` unset and requires a non-zero exit plus a `refused` event with rule `mutation-runs-on-main-ci`.
- **Verify:** the CI run shows each plant step's output.

### U5. Doctrine and docs point at the new enforcers

- **Files:** AGENTS.md (surface classes, directory map, REPO-S3/D2/D3 gates), CONCEPTS.md (Intent Versioning gate), `packages/toolchain/tsconfig/README.md`, `packages/upstream-manifest/README.md`, live `docs/solutions/` entries naming deleted scripts.

## Verification

- `pnpm check:local` after the last edit.
- Locally: each `repo-checks` check exits 1 on a planted violation and 0 on the real tree.
- CI on the PR head: the required gate green, with the static lane's plant step and `gate:repo` output visible.

## Risks

- **Fetching history in the static lane** could interact with the depth-1 upstream-ref fetches. Mitigation: unshallow after them; `--unshallow` deepens every boundary.
- **`stryker run` in CI** would start a real run if the refusal regressed. Mitigation: `timeout 300`, and the step fails on a missing `refused` event.
- **Local `check:local` in a shallow worktree** exits 2 at `subtrees` with the fetch command; one command fixes it.

## Test Admission

No permanent test file is proposed. The checks are shell tools (git, compiler, file reads); per the in-process admission gate, a test that spawns them is refused, and their pure verdicts are a few lines each with no universal a property could reach that the planted CI violations do not. Each kept property gets exactly one planted violation in CI (R5), which is a gate demonstration, not a suite.

## Assumptions Challenged

1. _"A guard must stop the agent at edit time."_ Rejected: the harm is a change landing on `main`, and only the required gate sees every change regardless of tool. Edit-time hooks add a second enforcer that sees a subset.
2. _"Every old guard encodes an invariant worth keeping."_ Rejected for three (findings 3, 4 and the command-word guard): each either has an engine already or protects a client preference.
3. _"Distributable means `nix flake check`."_ Rejected: `checks` cannot see history or the consumer's compiler (finding 5); a flake package run by `nix run` is consumed the same way by any repository.

## Follow-up Units (other repositories, not edited here)

- stryker-js-effect: its own repository-local guards.
- comment-checker: its own repository-local guards.
- `.claude/settings.json` wires the `oxlint-guard` and `git-subtrees` plugins by checkout path rather than as installed plugins.
- Make Changeset Check a required status check (operator ruleset).
