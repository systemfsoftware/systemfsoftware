---
title: Restore Comment Checker Pin - Plan
type: fix
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Restore Comment Checker Pin - Plan

## Goal Capsule

- **Objective:** Restore green Nix and Release runs on the default branch.
- **Means:** Temporarily roll back the top-level comment-checker input (KTD1).
- **Authority:** The request and SYS-1103 govern scope and acceptance; repository and operator rules govern execution.
- **Stop conditions:** Stop and ask if the required checks cannot run, the lockfile needs changes outside R1, or the requested identity cannot be used without reading credentials.
- **Execution:** One unit and one independent PR from `origin/main`; the executor opens the PR, while the conductor handles merging.

## Product Contract

### Summary

Restore the previously working comment-checker revision without changing other root flake inputs or adding CI mechanisms.

### Problem Frame

The user reports that Nix and Release have failed since `df04d9da`, including at `c1a6ab0e29` (runs 41741170844 and 41741171218). The top-level input moved to a revision reported to lack the release manifest that `flake.nix` passes to `nix/comment-checker.nix`. SYS-1103 requires both latest default-branch runs to be green and their URLs posted to the issue.

### Requirements

- R1. Revert the top-level `comment-checker` input in `flake.lock` to revision `3bfedd853c1d6dca666e65e71e9f8a31d47db336`, permitting changes to its own declared sub-inputs but no other root input.
- R2. In `nix develop`, verify flake metadata resolves that input to the requested revision and its source contains `nix/release-hashes.json`.
- R3. Run `pnpm check:local` inside `nix develop`; if it fails for a reason the rollback does not cause, stop and report its output without substituting narrower checks.
- R4. Commit with SYS-1103 in the message, push without force, and open the PR as `systemfsoftware-maker` from branch `sys-1103-comment-checker-revert` based on `origin/main`.
- R5. The PR body states the missing-manifest root cause, the temporary rollback pending SYS-1068, and the dependency of SYS-990's baseline on this fix.
- R6. Once merged by the authorized process, establish that the latest default-branch Nix and Release runs are green and post both run URLs to SYS-1103.

### Scope Boundaries

Do not change `flake.nix`, `.github/`, `.mergify.yml`, `AGENTS.md`, `.omp/`, or other root inputs including nixpkgs, gritlint, and pnpm-release-management. Do not add a test, check, gate, workflow, manifest override, or fallback. Do not read credentials, call Doppler, bypass hooks, or force-push. SYS-1068 owns the permanent fix. Commit this plan file in the PR.

## Planning Contract

### Key Technical Decisions

- KTD1. **Let Nix update the root input and its declared sub-inputs.** Use `nix flake lock --override-input comment-checker github:systemfsoftware/comment-checker/3bfedd853c1d6dca666e65e71e9f8a31d47db336`, not a hand edit. Inspect the resulting graph against R1; a change to another root input is a stop. A manifest fallback is explicitly excluded.
- KTD2. **Separate PR evidence from issue completion.** Opening the PR does not establish green default-branch runs. The conductor owns merge; whoever performs the post-merge verification must record both latest run URLs on SYS-1103.

### Risks and prerequisites

`flake.lock` currently maps the root input to `comment-checker` at `45e50465ef36ec0f096f37882e16a535ddf6520a`. Its input graph includes pnpm-release-management, while the existing older entries do not; Nix may need to update the reverted input's own sub-inputs.

The conductor ruled that `pnpm check:local` is the repo's OP28-permitted local delivery check: static checks and unit tests at `CONFORMANCE_PROFILE=local`, without e2e, journey, or Playwright.

## Implementation Units

### U1. Restore the top-level input

**Goal:** Produce the scoped rollback and evidence required for SYS-1103.

**Requirements:** R1–R6; KTD1–KTD2.

**Dependencies:** SYS-1068 remains separate.

**Files:** Modify `flake.lock` and commit this plan; consult `flake.nix`, `nix/comment-checker.nix`, and `package.json` without modifying them.

**Approach:** Start from the specified branch base. Apply KTD1 and inspect the lockfile diff for changes outside R1. Verify the resolved input and manifest from inside the development environment before running R3. Ship the rollback and plan with the requested identity and PR context, then hand post-merge issue verification to the responsible operator.

**Execution note:** Prefer the requested real Nix metadata and source-path smoke proof over new tests.

**Test expectation:** No new test: this is a lockfile rollback and the real resolved flake is the observable contract.

**Verification:** The resolved metadata identifies the exact requested revision, the manifest exists in that resolved source, the only lockfile changes satisfy R1, and the required local checks actually pass. A failed or unavailable check invokes the stop condition.

## Verification Contract

- From `nix develop`, use `nix flake metadata` to identify the root `comment-checker` input's revision and resolved source path; verify the manifest at that path. Do not infer success from the lockfile text alone.
- Compare the complete lockfile against the `origin/main` baseline, including graph nodes and other root inputs. Apply R1 to the reverted input's subgraph.
- Run `pnpm check:local` inside `nix develop` as required by R3. Do not substitute a narrower check.
- Observe PR CI using the approved REST-based run-watch route. After the authorized merge, verify both latest default-branch workflows are green and attach their URLs to SYS-1103. Do not equate PR CI with R6.

## Definition of Done

U1 is complete only when R1–R5 have evidence and the PR is open. SYS-1103 is complete only after R6. Preserve failing-check output and stop if the execution prerequisites cannot be met; remove any scratch artifacts rather than adding them to the fix.
