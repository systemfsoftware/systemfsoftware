---
title: Release Adoption - Plan
type: fix
date: 2026-10-09
supersedes: docs/plans/2026-10-09-0310-ci-release-adoption-plan.md
topic: release-adoption
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Release Adoption - Plan

## Goal Capsule

- **Objective:** a merged change intent becomes a per-package version bump, an annotated `<name>@v<version>` tag and a GitHub Release, through the shared `pnpm-release-management` Release workflow.
- **Means:**
  - `release.jsonc` moves to `changesets` versioning, with gritlint and Cargo kept as one version through a `cargo` surface.
  - The root `package.json` gains a `version` field.
  - One intent covers the tagged packages no pending intent names.
  - Every version the first cycle tags has its changelog file.
  - `@systemfsoftware/upstream-manifest` becomes private, and the flake's consumer-store check moves to another public package.
  - `.changeset/README.md` describes the pipeline that runs.
  - `release.yml` calls the workflow at the same SHA as the Changeset Check (#683).
- **Authority:** conductor rulings 06, 07 and 08 on the 2026-10-08 harness brainstorm (Layer 1c). `.github/workflows/` is Evaluator surface (`AGENTS.md` "Surface Classes"), so this ships in its own pull request, red before and green after.
- **Stop conditions:** stop and report if any of these holds.
  - The R29 probe fails at the pull request head.
  - At probe time, a tagged publishable member is named by no releasing intent (R26).
  - At probe time, a version the cycle tags has no changelog file (R30).
- **Execution profile:** configuration only. The R29 probe runs before the pull request opens. The first Release run on `main` after merge proves AE16.
- **Ships as:** one pull request on a branch cut from `main` after #683 merged (ruling 08: not stacked), with this plan as its only plan file (`REPO-D2`). The conductor merges.

---

## Product Contract

### Summary

The Release workflow runs again and versions each TypeScript package on its own, from Changesets intents. gritlint's launcher version and the Cargo workspace stay one version, which follows the launcher's own intents. Releases record their bytes in annotated tags from the first managed release on. The 976 historical lightweight tags stay as they are.

### Problem Frame

Every Release run on `main` since 2026-10-07 has failed: [37866804142](https://github.com/systemfsoftware/systemfsoftware/actions/runs/37866804142), [37865579460](https://github.com/systemfsoftware/systemfsoftware/actions/runs/37865579460), [37853346249](https://github.com/systemfsoftware/systemfsoftware/actions/runs/37853346249). The last green run was [37549115034](https://github.com/systemfsoftware/systemfsoftware/actions/runs/37549115034), on this repository's own pipeline before #658. Three defects stack:

1. **Startup.** `.github/workflows/release.yml:18-20` calls `release.yml@prm/toolchain`, a deleted branch, so runs fail with zero jobs. This is the same defect #683 fixes for the Changeset Check.
2. **History refusal.** At `8cd6e83`, `release plan` checks every publishable member whose current version is tagged and that no pending release names (`packages/github-release-engine/src/plan.ts:120-133`). With no ledger entry, a lightweight tag is refused as `tag-annotation-lightweight` (`plan.ts:203-206`). All 976 release tags on the remote are lightweight.
3. **Wrong versioning model.** #658 copied `versioning.strategy: surfaces` from the starter-kit callers. That strategy gives the repository one version: a scratch bump with intents naming 40 packages moved none of them and rewrote only `npm/gritlint/package.json` and `Cargo.toml`.

### Rulings carried (ruling 07)

- **Q-J. Per-package versioning for the TypeScript packages.** `surfaces` is a defect for them and fits only gritlint. Evidence: 976 per-package tags, intents that name packages, and the standing rule that Changesets plus GitHub Releases per package keep working.
- **Q-L. Released bytes.** "Released" means the git tag plus the GitHub Release for it, whose bytes are the flake/tarball build of the tagged commit. npm is not a source of truth. A ledger is acceptable only if the tool can compare it against the tagged commit's own pack.
- **Q-M. First managed release.** It may tag a package only if the package has unreleased changes since its last tag, or an intent. Any other package needs an intent or is excluded from that cycle.
- **Q-N. O5 dropped.** Pinning to an older tool with an older input contract is a regression.
- **F2 (review of #683).** The `release.yml` pin is in scope here.

### Rulings carried (ruling 08)

- **O3 accepted** under `changesets` with gritlint's `cargo` surface.
- **Q-O.** Decide `upstream-manifest` from evidence: an outside consumer gets an intent to `0.1.0` and a changelog; no consumer makes it `private: true`. Never ship a `0.0.0` tag. Decision below: private.
- **Q-P.** A new branch from `main`, not stacked.
- **Q-Q.** Keep the root `"version": "0.0.0"`. The tool-side fix is named in the pull request body as a follow-up and not opened.
- **A1, A2, C2, C3, F1** fixed in this plan; C1 is settled by Q-O. `.changeset/README.md` is rewritten in this pull request.

### Source findings at `8cd6e83` (ruling 07 asked for these)

**Q-J: one `release.jsonc` can do both, given one repo-side field.**

- Under `changesets`, the bump hands each package's version to the Changesets libraries (`packages/version-engine/src/bump.ts:59-86`, `port.plan()` and `port.apply()` at `:225-236`).
- It writes only `cargo` surfaces, each at the version of the workspace package it names (`bump.ts:182-206`). A `cargo` surface must name that package under `changesets` (`bump.ts:44-53`, refusal `VersionCargoPackageMissing`).
- A `toml` or `json` surface is silently not written under `changesets` (`bump.ts:200-202`). So today's `toml` surface for `[workspace.package]` must become a `cargo` surface.
- `@systemfsoftware/gritlint` is a workspace member (`pnpm-workspace.yaml:107`, `npm/*`). Private members are members, though never release candidates (`packages/workspace-adapter/src/WorkspaceStoreLive.ts:96`).

Probe (full clone of `main` at `3ab8edca7`, tools from `8cd6e83`, root `package.json` given `"version": "0.0.0"`, config `{ strategy: changesets, surfaces: [{ kind: cargo, path: Cargo.toml, package: @systemfsoftware/gritlint }] }`):

| Step                                                                                 | Exit | Output                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release plan`, `main`'s 34 intents only                                             | 1    | `refused: tag-annotation-lightweight, tag: @systemfsoftware/omp-typescript-discipline@v1.0.7`                                                                                                     |
| `release plan`, plus one patch intent for `omp-typescript-discipline` and `tsconfig` | 0    | `phase=release pending_intents=35 this_cycle=2 deferred=0`                                                                                                                                        |
| `version bump`, same intents                                                         | 0    | 43 manifests moved one by one, e.g. `omp-typescript-discipline 1.0.7 → 1.0.8`, `effect-atom 6.0.0 → 6.0.1`. `Cargo.toml` stayed `0.1.0`, because no intent names gritlint. 43 changelogs written. |
| `version bump`, plus a `minor` intent for `@systemfsoftware/gritlint`                | 0    | gritlint `0.1.0 → 0.2.0`. `Cargo.toml` `[workspace.package]` and `Cargo.lock` follow to `0.2.0`. All 36 intents consumed.                                                                         |

**Q-K: the refusal comes from this repository's layout meeting a read the tool performs but never uses.**

- Under `changesets` the manifest target is hardwired to the root `package.json` (`apps/version-management/src/boundary.ts:36-41,99-100`). `read` loads its version for every strategy (`bump.ts:54-57`).
- This repository's root `package.json` has no `version` field, so `JsonVersion` decoding fails and `malformed(file)` raises `VersionIntentMalformed { path: package.json }` (`packages/workspace-adapter/src/SurfaceStoreLive.ts:40,78-80`).
- `changesetsCase` never uses that version (`packages/version-engine/src/bump-versions.workflow.ts:99-109`).
- Reproduced with the config above: exit 1, `::error::VersionIntentMalformed: path=package.json`. Adding `"version": "0.0.0"` to the root manifest clears it.
- The tool-side fix is named, not opened: in `pnpm-release-management`, `packages/version-engine/src/bump.ts` `read` should skip `surfaces.readSurface(request.manifest…)` when `request.strategy === 'changesets'`. Either `apps/version-management/src/boundary.ts` `targetsOf` stops assigning `ROOT_TARGET`, or the manifest field becomes optional under `changesets`.

**Q-L: the tool cannot compare a ledger against the tagged commit's own pack.**

- `release adopt` takes bytes only from a registry. It calls `registry.metadata(request.registry, name, version)`, then `registry.download(metadata.tarball)` (`packages/github-release-engine/src/adopt.ts:108-149`), and `--registry` has no default (`apps/github-release-management/src/main.ts:95-99`).
- No flag or config field adopts from a tarball directory or a git revision (`packages/release-language/src/Config.schema.ts:175-205`). O1 and O2 are therefore out under Q-L.
- Going forward, the requirement holds without a ledger. `tag` annotates each release tag with the `{integrity, files}` digest of the pack built for that release (`tag.ts:145-165`), and later `plan` runs compare a tagged version against that annotation (`plan.ts:203-227`).

**Q-M: the two tagged members that no pending intent names both changed after their last tag.**

- `omp/plugins/omp-typescript-discipline` (tag `v1.0.7` at `05de29e00e`) and `packages/toolchain/tsconfig` (tag `v2.0.1` at `7de99e21e8`) were both touched by `eafd889c5b` (#539, 2026-09-25).
- Both qualify for an intent.
- The other 38 tagged members are named by `main`'s pending intents.
- `main` has two untagged publishable versions: `oxlint-config-rule-authoring@1.1.0` and `upstream-manifest@0.0.0`. Neither has ever been released.
- `oxlint-config-rule-authoring@1.1.0` has authored release notes. Version pull request #453 (`2816ee0349`) wrote `.changeset/changelogs/@systemfsoftware!oxlint-config-rule-authoring@1.1.0.md`, and #456 (`17652c78cd`) deleted it although no tag was ever made.

**Q-O: nothing outside this repository consumes `@systemfsoftware/upstream-manifest`.** Searched 2026-10-09:

| Search                                                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub code search `"@systemfsoftware/upstream-manifest" org:systemfsoftware`                                                                                                                                                         | 11 hits, all in `systemfsoftware/systemfsoftware` (the package itself, four intents, the root `package.json`)                                                                                                                                                                                                     |
| GitHub code search `"@systemfsoftware/upstream-manifest" user:ryanleecode`                                                                                                                                                            | 0 hits                                                                                                                                                                                                                                                                                                            |
| Shallow clone of every repository in both organisations (77: 70 `systemfsoftware`, 7 `ryanleecode`; public and private, archived included), `git grep -e upstream-manifest -e upstreamManifest` over all files except this repository | 0 hits                                                                                                                                                                                                                                                                                                            |
| Flake inputs pinning `github:systemfsoftware/systemfsoftware` in those clones                                                                                                                                                         | 5 repositories (3 public: `effect-endgame-starter-kit`, `stryker-js-effect`, `xstate`; 2 private). The outputs they use: `workspace-tarballs` (2), `test-timings`, `gritlint-unwrapped`, `comment-checker` and `gritlint`. Neither `workspace-tarballs` consumer depends on `@systemfsoftware/upstream-manifest`. |

- In this repository no workspace package depends on it. The flake's `consumer-store` check and its `sabotage` twin (`flake.nix:106-121`) build it as their subject.
- Private members leave the workspace packages (callee `nix/lib/pnpm-workspace-packages.nix:53`), so that check must name another public member. The check leaves the subject's dependencies out (`nix/consumer-store-check.nix:21-22`), so any public member works.

### Key Decisions

- **Chosen option: re-baseline through a release (O3) under `changesets` versioning.** Governs R24 to R28.
  - session-settled, user-directed, ruling 07: chosen over O1 and O2, whose ledger compares against registry bytes (Q-L), over O4, a tool change the probe shows is not needed, and over O5 (Q-N).
- **The root `version` field, not the tool change, clears Q-K.** Governs R25.
  - It is a one-line, repo-side change, and the probe shows it is sufficient.
  - The tool change stays named under Source findings, for the conductor to schedule separately.
- **`upstream-manifest` becomes private.** Governs R31. It has no outside consumer (Q-O evidence), so ruling 08 makes it private rather than releasing `0.1.0`.
  - session-settled, user-directed, ruling 08: chosen over an intent to `0.1.0`, which needs an outside consumer that does not exist.
- **The first-cycle changelog is restored, not rewritten.** Governs R30. The 1.1.0 notes were authored in #453 and deleted by #456 without a release, so the file is restored from `2816ee0349` byte for byte.
- **Historical lightweight tags stay as they are.** No adoption, no re-tagging. The first managed release of each package is its first annotated tag.

### Requirements

- R24. `release.jsonc` `versioning` is `{ "strategy": "changesets", "surfaces": [{ "kind": "cargo", "path": "Cargo.toml", "package": "@systemfsoftware/gritlint" }] }`. The surfaces-only fields (`manifest`, `changelog`) and the `toml` surface are gone. `distribution`, `gate` and `pr` are unchanged.
- R25. The root `package.json` carries `"version": "0.0.0"` and stays `"private": true`.
- R26. Before the pull request opens, every tagged publishable member whose current version tag is lightweight is named by a releasing intent (`patch` or higher). Today that requires one intent naming `@systemfsoftware/omp-typescript-discipline` and `@systemfsoftware/tsconfig`. Its body states the consumer-observable change from `eafd889c5b` in each package (`REPO-R2`). The set is recomputed at probe time.
- R27. `.github/workflows/release.yml` calls `systemfsoftware/pnpm-release-management/.github/workflows/release.yml@8cd6e83009531de040cd9c03e1370b4966fd2a12`, the SHA #683 pins. It drops `tools-ref`, which `release.yml` at that SHA does not declare, and passes `ci-workflow: ci.yml`, required at that SHA. The caller job grants `contents: write`, `pull-requests: write` and `actions: write`, as the callee's `version` job declares (callee `release.yml:70-73`).
- R28. No `release-ledger.json` is committed, `release adopt` is not run, and no tag is created by hand.
- R29. Before the pull request opens, a probe in a separate full clone at the pull request head, with tools from `8cd6e83`, shows:
  - `release plan` exits 0 with `phase=release`, and reports the `this_cycle` count;
  - `release tag --dry-run` exits 0 and names the versions the cycle tags;
  - `release release --dry-run` on that capture exits 0, and a file `.changeset/changelogs/<name>@<version>.md` exists for every captured version;
  - `version bump` exits 0, moves each intent-named package on its own, and leaves `Cargo.toml` alone unless an intent names gritlint;
  - `changeset-management check origin/main` exits 0.
- R30. Every version the first cycle tags has a non-empty `.changeset/changelogs/<name>@<version>.md`. That is `.changeset/changelogs/@systemfsoftware!oxlint-config-rule-authoring@1.1.0.md`, restored from `2816ee0349`. The release step reads it (callee `packages/github-release-engine/src/cycle.ts:29`, `github-release.ts:95-97`) and refuses with `ReleaseChangelogMissing` when it is absent, after `tag` has already pushed (callee `release.yml:134-144`).
- R31. `packages/upstream-manifest/package.json` carries `"private": true`. The flake's `consumer-store` check and its `sabotage` twin name `tsconfig` instead of `upstream-manifest`.
- R32. `.changeset/README.md` and the "Releasing" section of `CONTRIBUTING.md` describe the pipeline that runs: `release.jsonc`, the Changeset Check, and the Release workflow's `plan`, `version`, `tag` and `release` steps in the tool's order. They name no script that does not exist.

### Acceptance Examples

- AE16. First Release run after merge.
  - **Covers R24, R26, R27, R30, R31.** **Given** the pull request is merged. **Then** the push run on `main` has jobs, `plan` reports `phase=release` with the `this_cycle` count R29 recorded, and `tag` creates an annotated `@systemfsoftware/oxlint-config-rule-authoring@v1.1.0` with a GitHub Release whose body is R30's changelog. No `upstream-manifest` tag is created. Today every run fails at startup.
- AE17. The version phase.
  - **Covers R24, R25, R26.** **Given** AE16. **Then** the next Release run reports `phase=version` and opens or refreshes `chore(release): version packages`. Its diff moves each intent-named package on its own and consumes the intents, and the run dispatches `ci.yml` on that branch.
- AE18. Red before.
  - **Covers R27.** The pull request body cites the zero-job Release failures since 2026-10-07 as the before-state.

### Scope Boundaries

- No change to `pnpm-release-management`. The Q-K tool fix is named only.
- No ledger, adoption or re-tagging of history (R28).
- No new check, lint rule or guard (standing boundary).
- The Changeset Check and the Nix pin are #683's (merged as `4e84270d`).
- The flake changes only the consumer-store check's subject (R31).

---

## Planning Contract

### Key Technical Decisions

- KTD4. **`cargo`, not `toml`, carries the Cargo workspace version.** Under `changesets` only `cargo` surfaces are written (`bump.ts:200-202`), and only a `cargo` surface can name the package it follows (`Config.schema.ts:70-75`). It also rewrites the workspace members in `Cargo.lock` (callee `README.md:185-190`); probe E shows that.
- KTD5. **The intent set is recomputed at probe time, not fixed here.** `main`'s pending intents change with every merge. The rule is R26's: every tagged publishable member is named by a releasing intent. The two names in R26 are the set as of `3ab8edca7`.
- KTD6. **Ship after #683, unstacked.** R27 reuses #683's SHA and its flake pin; #683 merged as `4e84270d`, and this branch is cut from `main` after it (ruling 08).
- KTD7. **`tsconfig` is the consumer-store subject.** It is public, has no dependencies, and is installed by the outside flake consumers (`effect-endgame-starter-kit`, `xstate`), so the check keeps exercising a tarball consumers fetch.

### Sources and Research

- Callee at `8cd6e83`, all cited above:
  - `apps/version-management/src/boundary.ts`, `packages/version-engine/src/bump.ts`, `bump-versions.workflow.ts`
  - `packages/workspace-adapter/src/SurfaceStoreLive.ts`, `WorkspaceStoreLive.ts`
  - `packages/release-language/src/Config.schema.ts`
  - `packages/github-release-engine/src/adopt.ts`, `plan.ts`, `integrity.ts`, `tag.ts`
  - `apps/github-release-management/src/main.ts`, `.github/workflows/release.yml`, `README.md`
- This repository: `release.jsonc:5-58`, `package.json` (no `version`), `pnpm-workspace.yaml:95-107`, `npm/gritlint/package.json` (`private: true`, `0.1.0`). There is no `.changeset/config.json`.
- Changesets `privatePackages` defaults to not versioning private packages ([config docs](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md)). Probe E observed the private gritlint launcher versioned (`0.1.0 → 0.2.0`), so R24 relies on the callee's own Changesets configuration. R29 rechecks it at the pull request head.
- Release run history: 37866804142, 37865579460 and 37853346249 failed; 37549115034 was the last green run.
- Wiki probe: not run; `xd://mcp__software_wiki_qmd_query` is not mounted here (raw error: `No such tool`).
- Test layer (`skill://test-layer-selection`): no test is admitted. Every unit is configuration or an intent, with no cell to test. The proof is the R29 probe plus GitHub's own Release runs (AE16, AE17).

### Risks

- **`catalog:` dependents.** Every bump prints `Package … must depend on the current version of … vs catalog:` for `storybook-gherkin` and `upstream-manifest` and still exits 0. Whether the release pull request's own CI accepts the rewritten ranges is first observed at AE17.
- **Launcher pins are not part of the release.** The callee workflow runs only `version-management bump` (callee `release.yml:85`). Stamping platform `optionalDependencies` belongs to the separate pins command (`apps/version-management/src/boundary.ts:143-165`, `packages/version-engine/src/pin-root-manifest.workflow.ts:93`), which no workflow step calls. `npm/gritlint/package.json` has no `optionalDependencies` today, and probe E's bump added none. The `release.jsonc` comment saying a bump stamps them is wrong (U3).
- **Release order.** The tool's `plan` puts owed (untagged) versions before pending intents: `release` runs before `version`, so AE16 tags `oxlint-config-rule-authoring@1.1.0` before any bump. The old `.changeset/README.md` documents the reverse order through scripts that no longer exist; R32 rewrites it.
- **A pushed tag is never released again.** The release cycle is the publishable versions with no remote tag (callee `packages/github-release-engine/src/cycle.ts:20-23`). A run that pushes a tag and then fails to cut its GitHub Release leaves that version out of every later cycle. R30 and the R29 `release --dry-run` row guard the first cycle, and the README says to cut such a release by hand.

### Challenge (destructive review, Edge-First lens)

Three assumptions behind the earlier options, broken by source and probe:

1. **"One `release.jsonc` cannot version per package and keep Cargo as one version."** Broken by probe E: under `changesets`, a `cargo` surface naming the launcher moves `Cargo.toml` and `Cargo.lock` with gritlint's own intents, and every other package moves on its own.
2. **"History must be adopted before the tool will run" (the premise of O1 and O2).** Broken by `plan.ts:129-133`: only tagged members that no planned release names are integrity-checked. Releasing them past their lightweight tag (R26) needs no ledger.
3. **"The release stamps the launcher's platform pins on a bump."** Broken: see the launcher-pins risk above.

Edge cases this plan still carries, each with its gate:

- E1. Probe E saw the private gritlint launcher versioned, unlike the Changesets default for private packages. R29 re-asserts this at the pull request head, and a gritlint intent that leaves `Cargo.toml` unmoved is a stop.
- E2. The first cycle must leave every publishable member's current version annotated. R26 releases every lightweight-tagged member in that cycle. After the version pull request merges, each current version is untagged and gets an annotated tag at the next `release` phase.
- E3. A `0.0.0` tag for `upstream-manifest`. Closed by R31: private members are never release candidates (callee `WorkspaceStoreLive.ts:96`).

---

## Implementation Units

### U3. Versioning config

- **Goal:** the bump versions each package on its own and keeps gritlint and Cargo as one version.
- **Requirements:** R24, R25 (KTD4).
- **Dependencies:** none.
- **Files:** `release.jsonc`, `package.json`.
- **Approach:** replace the `versioning` block per R24, rewriting its comment to say that each package versions on its own and that `Cargo.toml` follows the launcher's intents. Drop the `distribution` comment's claim that a bump stamps optional dependencies (see Risks), then add the root `version` per R25.
- **Test scenarios:** Test expectation: none -- configuration. The R29 probe is the proof.
- **Verification:** R29.

### U4. Baseline intent and first-cycle changelog

- **Goal:** no tagged publishable member reaches `plan` without a releasing intent, and every version the first cycle tags has its release notes.
- **Requirements:** R26, R30 (KTD5).
- **Dependencies:** U6, which fixes the cycle's members.
- **Files:** one `.changeset/<slug>.md`, `.changeset/changelogs/@systemfsoftware!oxlint-config-rule-authoring@1.1.0.md`.
- **Approach:** recompute the uncovered set at the pull request head, read each package's change since its last tag, and write one intent naming each uncovered package with a consumer-observable body. Restore the 1.1.0 changelog from `2816ee0349`.
- **Test scenarios:** Test expectation: none -- an intent and release notes. The R29 `plan`, `tag` and `release` rows are the proof.
- **Verification:** R29.

### U5. Release workflow pin

- **Goal:** the Release workflow starts and runs the tools at #683's SHA.
- **Requirements:** R27 (KTD6).
- **Dependencies:** #683 merged (done, `4e84270d`).
- **Files:** `.github/workflows/release.yml`.
- **Approach:** set `uses:` to the SHA, drop `tools-ref`, add `ci-workflow: ci.yml`, add `actions: write` to the job permissions.
- **Test scenarios:** Test expectation: none -- workflow configuration. AE16 and AE17 are the proof, from GitHub's own runs.
- **Verification:** AE16, AE17, AE18.

### U6. Private `upstream-manifest`

- **Goal:** the first cycle never tags `upstream-manifest@0.0.0`, and the flake's checks keep a public subject.
- **Requirements:** R31 (KTD7).
- **Dependencies:** none.
- **Files:** `packages/upstream-manifest/package.json`, `flake.nix`.
- **Approach:** add `"private": true`, then change `package = "upstream-manifest"` to `package = "tsconfig"` in the `consumer-store` check and its `sabotage` twin.
- **Test scenarios:** Test expectation: none -- configuration. The Nix workflow builds the `consumer-store` check on the pull request.
- **Verification:** R29 (`this_cycle`), the Nix workflow on the pull request.

### U7. Intent doctrine

- **Goal:** an intent author reads the pipeline that runs.
- **Requirements:** R32.
- **Dependencies:** U3, U5.
- **Files:** `.changeset/README.md`, `CONTRIBUTING.md`.
- **Approach:** rewrite it from the callee README at `8cd6e83` and this repository's `release.jsonc`: how intents are written and gated, and the order of the Release workflow's phases.
- **Test scenarios:** Test expectation: none -- documentation.
- **Verification:** review.

---

## Verification Contract

| Gate                                                        | When                            | Proves                |
| ----------------------------------------------------------- | ------------------------------- | --------------------- |
| R29 probe in a separate full clone at the pull request head | before the pull request opens   | R24 to R26, R30, R31  |
| `pnpm check:local`                                          | after the last edit (`REPO-D1`) | the tree still passes |
| Changeset Check, CI, Nix and Commitlint on the pull request | pull request                    | the change itself     |
| First and second Release runs on `main`                     | after merge                     | AE16, AE17            |

No mutation run (`REPO-D3`).

## Definition of Done

- R24 to R32 hold, and AE18 is in the pull request body with the R29 probe output.
- The pull request body names the Q-K tool fix as a follow-up, not opened.
- AE16 and AE17 hold on `main` and are reported to the conductor.
- The probe clone is deleted. The probe pushed, tagged and opened nothing.

---

## Open Questions

None. Rulings 07 and 08 settled Q-J to Q-Q.
