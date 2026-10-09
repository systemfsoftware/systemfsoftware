---
title: Changeset Check Pin - Plan
type: fix
date: 2026-10-09
supersedes: docs/plans/2026-10-09-0234-ci-changeset-check-pin-plan.md
topic: changeset-check-pin
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Changeset Check Pin - Plan

## Goal Capsule

- **Objective:** every pull request gets a Changeset Check verdict again, from a `pnpm-release-management` revision that cannot be deleted from under this repository.
- **Means:** pin the Changeset Check call and the Nix input to one full commit SHA on `pnpm-release-management` `main`, chosen by a probe of that SHA against this repository.
- **Authority:** conductor rulings 04, 05 and 06 on the 2026-10-08 harness brainstorm. Ruling 06 split the release pipeline pin: this plan is Layer 1b, the Changeset Check half. The release half (`release.yml`) is Layer 1c and is out of scope here. `.github/workflows/` is Evaluator surface (`AGENTS.md` "Surface Classes"), so the change ships in its own pull request, red before and green after.
- **Stop conditions:** stop and report if the R21 probe fails at both candidate SHAs (KTD1).
- **Execution profile:** configuration only. The R21 probe runs before the pull request opens. The pull request's own Changeset Check run proves AE11.
- **Ships as:** one pull request cut from `main`, with this plan as its only plan file (`REPO-D2`). The conductor merges it.

---

## Product Contract

### Summary

`changeset-check.yml` calls `pnpm-release-management` at a commit SHA instead of the deleted `prm/toolchain` branch, and the Nix input names the same SHA. Before the pull request opens, a probe shows that SHA's check passes against this repository.

### Problem Frame

`.github/workflows/changeset-check.yml:14` calls `systemfsoftware/pnpm-release-management/.github/workflows/changeset-check.yml@prm/toolchain` and passes `tools-ref: prm/toolchain`. That branch was deleted on 2026-10-07T00:43Z. Since then, all 64 Changeset Check runs failed, each with zero jobs (a startup failure on an unresolvable ref). Examples: 37863588012 (#678) and 37873472261. The last green run was 37550996834 (2026-10-07T00:15Z). No pull request has had an intent verdict since then.

`flake.nix:18` pins the `pnpm-release-management` input to `5eb4c5d5a607`, which is on no branch of that repository. The dev shell's `sandbox` and the `workspace-tarballs` packaging come from that input.

### Key Decisions

- **Pin by commit SHA.** Governs R18. (session-settled: user-directed, ruling 04 - chosen over a `prm/*` branch or `@main`: a branch can be deleted, which is the defect; `@main` moves with every callee merge.)
- **Split: only the Changeset Check half ships here.** Governs R18 to R22. (session-settled: user-directed, ruling 06 - chosen over one pull request for both halves: `release plan` refuses this repository's tag history at the probed SHA, and the Changeset Check half does not depend on it.)
- **The Nix input moves to the same SHA in this pull request.** Governs R22. (session-settled: user-directed, ruling 05 Q-G - chosen over leaving `5eb4c5d5a607`: a pin to a commit on no branch is the same defect.)
- **`release.yml` is not touched.** (session-settled: user-directed, ruling 06 - it stays broken until Layer 1c.)
- **Keep `devshell: false`.** `devshell: true` needs a `bootstrap` script in `package.json`, and this repository has none.

### Requirements

- R18. The `uses:` of `changeset-check.yml` names one full commit SHA on `pnpm-release-management` `main`, chosen by KTD1.
- R19. `changeset-check.yml` passes `tools-ref` only if the pinned workflow uses it. If the pinned workflow ignores it, the input is dropped. Permissions stay `contents: read`, `pull-requests: read`.
- R21. Before the pull request opens, the pinned SHA's `release-tools` `changeset-management check` exits 0 against this repository with the pull request's change applied. The probe runs in a separate full clone, with the workspace installed by `pnpm install --frozen-lockfile` as the callee's `devshell: false` path does. The same clone builds the dev shell and `.#workspace-tarballs` with the new Nix pin, and the dev shell's pnpm equals the `packageManager` pin.
- R22. The `pnpm-release-management` input in `flake.nix` names the R18 SHA, and `flake.lock` records it.
- R23. The pull request body cites the zero-job Changeset Check failures as the before-state, and gives the probe output and the reason for the SHA.

### Acceptance Examples

- AE11. The pull request's own Changeset Check.
  - **Covers R18, R19.** **Given** the pull request changes only `.github/workflows/changeset-check.yml`, `flake.nix`, `flake.lock` and this plan file. **Then** its Changeset Check run has jobs and concludes `success`. Today every run concludes `failure` with zero jobs.
- AE15. Nix outputs at the new pin.
  - **Covers R22.** **Given** the pull request. **Then** the Nix workflow's flake-output builds and the "workspace tarballs match across systems" job pass.

### Scope Boundaries

- `release.yml`, the adoption ledger, release tags and the release-tool dry runs belong to Layer 1c.
- No edit to `pnpm-release-management`.
- No new check, lint rule or guard for pin drift (standing boundary: no new gates).
- `reusable-checks.yml` and its consumers are untouched.

### Product Contract preservation

Changed from the 0100 plan, per ruling 06:

- The SHA is chosen by KTD1.
- R18 and R21 narrow to the Changeset Check, and R19 follows the pinned SHA's contract.
- Q-I is resolved by the split. AE15 is added for R22.
- The superseded plan's Q-I referred to options (a), (b) and (c) without spelling them out. They were: (a) pin `main` head `21fe6192e38d`, (b) wait for the callee's own Release to go green and pin that SHA, (c) pin its last green Release SHA `2915f4e48dc0`. KTD1 replaces them for this half.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Which SHA (ruling 06):**
  - First, re-read `pnpm-release-management` `main` and probe its head (R21). If the probe passes, pin that head.
  - If it fails, pin `21fe6192e38d913c2f325d1185dcc14b380cb348` with `tools-ref` equal to it. Its `changeset-management check` exited 0 against `main` at `3ab8edca7` on 2026-10-09.
  - Chosen: `8cd6e83009531de040cd9c03e1370b4966fd2a12`, the head when re-read on 2026-10-09 just before the R21 probe, which passed (R21 result in Sources).
- KTD2. **`tools-ref` is dropped at `8cd6e83`.** At that SHA (callee #51), `changeset-check.yml` declares `tools-ref` as "ignored; the check runs the release tools at this workflow's own revision". Its tools step builds `github:${job.workflow_repository}/${job.workflow_sha}#release-tools`. So the `uses:` SHA alone chooses the tools, and a second literal could only drift.
- KTD3. **The probe runs in a separate full clone.** The shared checkout is shallow. The check computes changes against a base revision, which a full clone has, as CI's `fetch-depth: 0` checkout does.

### Sources and Research

- Callee at `8cd6e83`: `.github/workflows/changeset-check.yml` (inputs, the tools step, the `devshell: false` install and check steps). Callee at `21fe6192e38d`: `.github/workflows/changeset-check.yml:6-9,47-52` (`tools-ref` checks out `.release-tools`).
- This repository: `.github/workflows/changeset-check.yml`, `flake.nix:17-20,126-136`, `turbo.json:4-6` (`globalDependencies` is only `scripts/tools/patch-tsgo-if-needed.mjs`, so workflow and flake edits move no package build hash), `package.json` (`packageManager: pnpm@12.9.0`).
- R21 probe at `21fe6192e38d`, 2026-10-09, full clone of `main` at `3ab8edca7`: `changeset-management check HEAD~1` exited 0 after `pnpm install --frozen-lockfile`. That clone had 42 workspace tarballs, 40 of them with a ledger entry (release-half evidence, carried to Layer 1c).
- R21 probe at `8cd6e83`, 2026-10-09, full clone of `main` with this branch fetched in (head `9d91e5bd2`): `changeset-management check origin/main` exited 0, `changeset gate: no publishable package changed (50 member(s))`.

---

## Implementation Units

### U1. Pin the Changeset Check caller

- **Goal:** the Changeset Check call resolves at the KTD1 SHA, with only the inputs that SHA uses.
- **Requirements:** R18, R19 (KTD1, KTD2).
- **Dependencies:** none.
- **Files:** `.github/workflows/changeset-check.yml`.
- **Approach:** replace `@prm/toolchain` with the SHA. Drop `tools-ref` per KTD2.
- **Test scenarios:** Test expectation: none -- workflow configuration. AE11 is the proof, from GitHub's own run.
- **Verification:** AE11.

### U2. Move the Nix input to the same SHA

- **Goal:** the dev shell and `workspace-tarballs` come from the pinned revision, not an orphaned commit.
- **Requirements:** R22.
- **Dependencies:** none.
- **Files:** `flake.nix`, `flake.lock`.
- **Approach:** set the URL at `flake.nix:18` to the SHA, then regenerate `flake.lock` for that one input.
- **Test scenarios:** Test expectation: none -- input pin. AE15 and the R21 probe's dev-shell rows are the proof.
- **Verification:** AE15.

---

## Verification Contract

| Gate                                                                                      | When                            | Proves                |
| ----------------------------------------------------------------------------------------- | ------------------------------- | --------------------- |
| R21 probe in a full clone with the change applied: pnpm version, tarballs, install, check | before the pull request opens   | R21                   |
| `pnpm check:local`                                                                        | after the last edit (`REPO-D1`) | the tree still passes |
| Changeset Check, CI, Nix and Commitlint on the pull request                               | pull request                    | AE11, AE15            |

No mutation run (`REPO-D3`).

## Definition of Done

- R18, R19, R21, R22 and R23 hold.
- The R21 probe passed before the pull request opened, and its output is in the pull request body beside the R23 evidence.
- AE11 and AE15 hold on the pull request.
- The probe clone is deleted. The probe pushed, tagged and opened nothing.
