---
title: Repair Changeset Intents Naming Deleted Packages - Plan
type: fix
date: 2026-08-16
topic: changeset-unknown-package
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Repair Changeset Intents Naming Deleted Packages - Plan

## Goal Capsule

- Objective: unblock the pnpm-native release flow, which aborts on push to `main` because three pending `.changeset/` intents carry bump-target lines for packages the workspace no longer contains. Repair = remove the stale name lines; keep every bump level and body for packages that still exist; delete one intent whose surviving target's effect is already recorded by a pending higher-bump intent.
- Product authority: this plan owns exactly the three files `.changeset/array-type-spelling.md` (trim), `.changeset/executor-vocabulary-direct-import.md` (delete), `.changeset/modern-ends-know.md` (trim), and nothing else. It does not own `scripts/guards/check-changeset.ts` (Evaluator surface), `pnpm version -r`, the release workflow, or any package manifest.
- Verification precondition: branch at `24312aeeee6` (== `main`); the planning artifacts are untracked, but U4's reproductions run in fresh throwaway worktrees, which start clean by construction. `packageManager: pnpm@11.21.0`, corepack 0.35.0 present, no `node_modules/` checked in.
- Stop conditions: `corepack pnpm version -r` reproduces the failure at HEAD (red) and exits 0 on the repaired tree (green), in throwaway worktrees, with the same pnpm engine for both legs; the workspace-wide no-ghost sweep reports zero; `pnpm check:local` green after the last edit; the PR's own range (changeset files only) passes the changeset gate by a `skipping` verdict and CI is green.

## Product Contract

### Summary

`release.yml` consumes all pending `.changeset/` intents on every push to `main` via `corepack pnpm version -r` (see ".github/AGENTS.md" "Release is two-phase pnpm-native" and the `Consume pending change intents` step in `.github/workflows/release.yml`). Three pending intents declare 11 bump-target lines for 8 distinct packages that left the workspace in `166e6bb655c` (`refactor(global)!: delete the cell-role suffix rule fleet`, 2026-08-16 09:36 UTC): `@systemfsoftware/oxlint-plugin-cell-taxonomy`, `oxlint-plugin-effect-acl`, `oxlint-plugin-effect-executor`, `oxlint-plugin-effect-handler`, `oxlint-plugin-effect-middleware`, `oxlint-plugin-effect-policy`, `oxlint-plugin-effect-shape`, `oxlint-plugin-effect-state`. pnpm aborts versioning at the first such name with `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` in the `Run corepack pnpm version -r` step, exit code 1, so the Release PR is never opened. The PR-side gate (`scripts/guards/check-changeset.ts`) never validates declared names against workspace membership — its verdict only reports _missing_ intents — so the wrong names pass review and detonate only in the release flow.

The repair keeps the intents' meaning: for the 20 (array-type-spelling) + 25 (modern-ends-know) packages that still exist, the authored bump levels and bodies are preserved; the executor-vocabulary intent is deleted because both its targets are subsumed elsewhere. The array-spelling change (commit `0631e0ac679`, 2026-08-15) is unreleased as far as the registry shows (e.g. `@systemfsoftware/oxlint-plugin` latest published `0.4.2` on 2026-08-05T10:41 predates it), so its patch records are still live and must not be deleted.

### Problem Frame

The release consumer (`pnpm version -r`) is stricter than the PR gate: it rejects any intent line naming a package the workspace does not contain, and refuses to consume anything until the offending file is repaired. The three files were authored between 2026-08-15 and 2026-08-16 against a 24-package `oxlint-plugins` fleet; the fleet deletion (2026-08-16 09:36) removed 13 plugin packages from the workspace while the intents survived on `main` unmodified. Every push to `main` since then has failed at the consume step.

### Assumptions

- The failing step is `release.yml`'s "Consume pending change intents", triggered by push to `main`; the pending set at HEAD reproduces the reported failure (proved red in U4).
- Deleted packages are gone permanently: their intent lines are vacuous and their last published registry versions stand as-is. pnpm resolves workspace membership from manifests: a directory without a `package.json` under the workspace globs is not a member, so stale untracked `dist/` debris from deleted packages is invisible to both the engine and the no-ghost sweep.
- Local `corepack` may need network to fetch `pnpm@11.21.0`; if it cannot, reproduction falls back to any system pnpm supporting `version -r`. The red and green legs MUST use the same pnpm executable — the fallback applies identically to both legs, so the verdict never mixes engines.

## Requirements

- R1. Every `.changeset/*.md` pending on `main` declares only names that exist in the workspace at head.
- R2. The repair is minimal: only deleted-package name lines are removed, one file is deleted whose surviving line (a `patch` for `@systemfsoftware/oxlint-plugin-effect-dmmf`) is shadowed by the `major` already recorded in `.changeset/cell-suffix-fleet-deleted.md` (the executor package is deleted; dmmf's loss of that member is narrated there), and `array-type-spelling.md`'s body drops a repository-internal review-process sentence that the author-changesets changeset-body validator rejects (banned review vocabulary, rule B8 — not a repo gate). All other surviving entries keep their bump levels and bodies byte-identical.
- R3. `corepack pnpm version -r` exits 0 on the repaired tree with all pending intents consumed — shown red-before-green in throwaway worktrees, same engine for both legs.
- R4. The PR itself passes the changeset gate (no package `build` hash moves between base and head — changeset-only diff) and `pnpm check:local`.
- R5. The PR ships no Evaluator changes, no package source/manifest edits, and no version bumps; the release cut itself stays in the release flow on the next push to `main`.

## Planning Contract

### Key Decisions

- KTD1. **Trim the live intents, delete the subsumed one.** For `array-type-spelling.md` (20 live + 7 dead lines) and `modern-ends-know.md` (25 live + 3 dead): remove only the dead lines — their records describe unreleased changes whose bump levels are still owned. For `executor-vocabulary-direct-import.md`: delete the file outright — its executor target is dead, and its dmmf `patch` line is shadowed by the `major` in `cell-suffix-fleet-deleted.md`: the executor package itself is deleted, so its vocabulary-derivation narrative has no surviving audience, and dmmf's loss of that member is recorded by the fleet cut. Deleting a file whose targets are wholly dead or fully recorded elsewhere is the repo's precedent class ("drop the changeset the gate no longer asks for", `86f533e9cd1`; "drop the changeset nothing will consume", `c71de4d2d`).
- KTD2. **The verification predicate is the failing command itself, red→green, in throwaway worktrees.** `corepack pnpm version -r` is the terminal ground truth for what the release flow will do; a copied parser ("does every declared name exist in the workspace?") is a second engine that can disagree (REPO-W7). The no-ghost sweep in U4 is an artifact check, not the verdict. No new permanent tests: this is a data repair of release inputs, is not code, has no new observable contract to pin, and the guard's existing selftest stays untouched and green.
- KTD3. **Never re-classify a living bump.** The repair removes only weightless ghost lines and one subsumed duplicate; the array-spelling `patch`, the v4 cutover `minor`, and the fleet-deletion `major` are untouched in their files. No surviving declaration changes level; where a package is declared in both trimmed intents (17 packages at `patch` in `array-type-spelling.md` and `minor` in `modern-ends-know.md`), pnpm consumes the higher level at release — the fix does not re-classify any declaration.

### Deferred to Follow-Up Work

- Validate declared changeset names against workspace membership in `scripts/guards/check-changeset.ts` (an Evaluator change needing its own red-before-green selftest fixtures — the guard currently accepts any declared name). This is the upstream gap that let the ghosts ship; out of scope here.
- Re-audit the pending set on the next release cut with the same no-ghost sweep.

## Implementation Units

### U1. Trim `.changeset/array-type-spelling.md`

**Goal:** Remove the seven deleted-package name lines; keep the other 20 entries; trim the body's final repository-internal sentence (the author-changesets changeset-body validator's B8 rule rejects the word `reviewer`), leaving a consumer-voice statement of the observable spelling change.

**Files:** `.changeset/array-type-spelling.md`

Approach:

1. Delete exactly these frontmatter lines:
   - `"@systemfsoftware/oxlint-plugin-cell-taxonomy": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-acl": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-executor": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-handler": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-middleware": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-policy": patch`
   - `"@systemfsoftware/oxlint-plugin-effect-shape": patch`
2. Leave ordering, quoting, and bump levels untouched; the body drops only the internal review-process sentence.

**Test expectation:** none — frontmatter data repair; the observable contract (pnpm consumption) is exercised end-to-end in U4.

**Verification:** the file declares exactly 20 names, all present in the workspace; the seven names above are absent.

### U2. Delete `.changeset/executor-vocabulary-direct-import.md`

**Goal:** remove the file. Its `@systemfsoftware/oxlint-plugin-effect-executor` line is dead; its `@systemfsoftware/oxlint-plugin-effect-dmmf: patch` line is shadowed by the `major` in `.changeset/cell-suffix-fleet-deleted.md` — the executor package is deleted, so dmmf's loss of that member is already narrated there; keeping the patch would double-record it under a weaker bump.

**Files:** `.changeset/executor-vocabulary-direct-import.md` (deleted)

**Approach** `git rm .changeset/executor-vocabulary-direct-import.md` within the working tree.

**Test expectation:** none — same class as U1; dmmf's `major` intent remains the single authoritative record (bnf verified in U2/U4 green run).

**Verification:** file absent from the tree and from the consumed set; `.changeset/cell-suffix-fleet-deleted.md` still declares `"@systemfsoftware/oxlint-plugin-effect-dmmf": major`.

### U3. Trim `.changeset/modern-ends-know.md`

**Goal:** delete the three deleted-package lines; keep the other 25 entries with `minor` and the body untouched.

**Files:** `.changeset/modern-ends-know.md`

Approach: delete exactly these frontmatter lines:

- `"@systemfsoftware/oxlint-plugin-effect-acl": minor`
- `"@systemfsoftware/oxlint-plugin-effect-handler": minor`
- `"@systemfsoftware/oxlint-plugin-effect-state": minor`

**Test expectation:** none — same as U1.

**Verification:** remaining names all exist; deletions limited to those three lines.

### U4. Empirical consumption proof (red → green)

**Goal:** prove R1–R3 with the actual engine: reproduce the failure at HEAD, then show the repaired tree consumes the full pending set cleanly.

Approach:

1. `git worktree add` a throwaway scratch dir at current HEAD; mount the tree clean; run `corepack pnpm version -r` there. Expected: exit 1 with `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` — the red leg, run BEFORE any edit.
2. After U1–U3 land in the working tree, create a second throwaway worktree from the branch head and run the identical command with the SAME pnpm executable. Expected: exit 0; the consumed set includes the 28 surviving packages from the two trimmed intents (deduplicated: 20 + 25 minus the 17 declared in both), at the highest authored level per package; the ghost names appear nowhere in the ledger/changelogs; no second-order complaint (e.g. a private-package target pnpm refuses).
3. If the green run surfaces any further unresolvable target, repair that line the same way (trim or delete) and re-run on a fresh scratch — the criterion is exit 0 on the full pending set.
4. Workspace-wide no-ghost sweep: a one-off script (ephemeral, not committed) that reads every `.changeset/*.md` (minus `.changeset/README.md`) frontmatter, extracts declared names (the same regex the gate uses), and compares against the workspace name set derived by reading the `name` field of every `git ls-files '*/package.json'` manifest. pnpm resolves members by manifest, so this set is exactly the engine's; stale untracked dirs are not members. Expect zero names outside.

**Test expectation:** none — the verdict is the CLI exit code plus the sweep; no test file is added (OP12 / REPO test bar).

**Verification:** red observed before edits; green after; sweep zero; the consumed bump-level map matches the surviving declarations.

## Verification Contract

| Check                      | Command / action                                        | Applies           | Done when                                                        |
| -------------------------- | ------------------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| Red leg                    | `pnpm version -r` in fresh scratch worktree at HEAD     | U4 step 1         | exit 1, `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE`                    |
| Green leg                  | same command at branch head, same engine                | U4 step 2         | exit 0, full pending set consumed                                |
| No-ghost sweep             | ephemeral name-vs-name cross-check                      | U1–U3             | zero unknown declared names                                      |
| Guard selftest (unchanged) | `deno run scripts/guards/check-changeset.ts --selftest` | regression sanity | selftest ok                                                      |
| Repo gate                  | `pnpm check:local` after the last edit                  | REPO-D1           | exit 0                                                           |
| PR gate                    | changeset-check on the PR                               | R4                | `no publishable package changed its turbo build hash — skipping` |

## Definition of Done

- U1–U4 complete: two files trimmed, one deleted, the full pending intent set consumed by an exit-0 `pnpm version -r` run in scratch, zero ghost names, `pnpm check:local` green after the last edit.
- The tree is restartable: the PR contains only the three changeset changes (two edits + one deletion), no committed scratch artifacts, no leaked changelog or bumped manifests from the scratch run.
- REPO-D1: the work is delivered as a PR watched to green; the release cut itself is the repo's normal flow on the next push to `main` (human-gated), not part of this PR.
