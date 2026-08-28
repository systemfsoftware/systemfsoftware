---
title: Fix omp-claude-compat hook subprocess PATH inheritance - Plan
type: fix
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
origin: https://github.com/systemfsoftware/systemfsoftware/issues/290
---

# Fix omp-claude-compat hook subprocess PATH inheritance - Plan

## Goal Capsule

**Objective.** A `PostToolUse` (and any event) command hook spawned by `runHookScript` in `omp/plugins/omp-claude-compat` inherits the outer `PATH` so a `#!/usr/bin/env <tool>` shebang resolves, fixing the dead marketplace comment-checker hook (`${CLAUDE_PLUGIN_ROOT}/hooks/run.js` with `#!/usr/bin/env -S deno`).

**Authority hierarchy.** Issue 290 > `CONSTITUTION.md` > root `AGENTS.md` > this plan > implementer judgement. `REPO-P1` is absolute.

**Stop conditions.**

- Stop if a unit would edit `repos/` (`REPO-S3`).
- Stop before merging to `main` without human approval (`REPO-P1`).
- Do not start a mutation run (`REPO-D3`).

**Execution profile.** Two units. U1 fixes the child env to inherit PATH (and optionally full env) and adds a gatekeeper assertion. U2 adds a PATH-resolved fixture hook integration test through `runHookScript`. Both can land in one branch.

**Tail ownership.** LFG owns commit, push, PR, and CI watch after this plan returns.

---

## Product Contract

### Summary

`omp/plugins/omp-claude-compat/src/hooks/hooks.ts:331-337` builds `options.env` as only `{ OMP_PROJECT_DIR, CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_ROOT }`. Node `spawn` semantics replace `process.env` wholesale when `env` is provided (`https://nodejs.org/api/child_process.html` — "Environment key-value pairs. Default: `process.env`" and "The command lookup is performed using the `options.env.PATH` ... If `options.env` is set without `PATH`, lookup on Unix is performed on a default search path of `/usr/bin:/bin`"). `ChildProcessSpawner` from `effect/unstable/process/ChildProcess` passes `env` through with same replacement semantics. Result: any hook command that relies on `#!/usr/bin/env deno` (or `sh -c 'command -v deno'`) fails with `env: 'deno': No such file or directory`. The marketplace comment-checker hook is exactly this case and is dead on install.

### Problem Frame

The bridge should inherit the normal environment so shebang resolution works, while still stamping the three bridge keys. Fix belongs in the bridge env construction, not in the hook's wrapper or docs.

### Key Decisions

- **Inherit, don't hard-code.** Merge the outer env so any tool on `PATH` resolves, not just `deno`. Governs R1.
- **Fix at `runHookScript` options.env construction.** Single site covers both shell-form (`sh -c`) and exec-form (`args`) hook commands. Governs R1, R2.

### Requirements

**Behavior**

- R1. A command hook spawned by `runHookScript` executes with the outer `PATH` reachable, so `#!/usr/bin/env <tool>` resolves when `<tool>` is on the outer `PATH`.
- R2. Existing bridge keys remain set: `OMP_PROJECT_DIR` and `CLAUDE_PROJECT_DIR` equal `cwd`, and `CLAUDE_PLUGIN_ROOT` equals `hook.pluginRoot` when defined (absent otherwise).
- R3. The change does not alter hook payload encoding (`encodeHookPayload`) or shell vs exec-form dispatch semantics.

**Verification**

- R4. `pnpm --filter @systemfsoftware/omp-claude-compat test` exits 0 and includes a test that fails when the child's env lacks `PATH` (regression gate).
- R5. A fixture `PostToolUse` hook using a PATH-resolved shebang exits 0 via `runHookScript` in the integration test.

### Actors

- A1. OMP session with `@systemfsoftware/omp-claude-compat` bridge.
- A2. Marketplace or project `PostToolUse` hook command using `#!/usr/bin/env` shebang.

### Key Flows

- F1. PATH-resolved hook execution
  - **Trigger:** Hook `command` is a file with `#!/usr/bin/env -S deno` (or `sh -c 'command -v deno'`) and `deno` is on the outer `PATH`.
  - **Actors:** A1, A2
  - **Steps:** `runHookScript` builds `options.env` with inherited `PATH`; `ChildProcess.make` + `executor.spawn` launches child; `env` resolves `deno`; hook receives JSON payload on stdin, exits 0.
  - **Covered by:** R1, R4, R5

### Acceptance Examples

- AE1. Covers R1, R2, R4. Given outer `process.env.PATH` is non-empty, when `runHookScript` spawns a hook that prints `process.env.PATH` (or `PATH` env var), then the child's observed `PATH` equals the outer `PATH` (or contains it) and `OMP_PROJECT_DIR`/`CLAUDE_PROJECT_DIR` still equal `cwd`.
- AE2. Covers R1, R5. Given a fixture hook file with `#!/usr/bin/env -S sh -c 'command -v deno >/dev/null && echo ok'` (or `sh` probe of a tool known on `PATH`), when dispatched through `runHookScript`, then exit code is 0 and `stdout` contains `ok`.
- AE3. Covers R2. Given `hook.pluginRoot` is set, when `runHookScript` spawns, then child's `CLAUDE_PLUGIN_ROOT` equals that path and `PATH` is still present.

### Scope Boundaries

**Deferred for later**

- None required by issue 290.

**Outside this product's identity**

- Fixing only the comment-checker hook's shebang or wrapper (`Non-Counting: fixing only the hook`).
- Hard-coding `/usr/local/bin/deno` into any path (`Non-Counting: hard-coding interpreter path`).
- Passing `PATH` via command string interpolation rather than bridge env (`Non-Counting: command-string PATH`).
- Documentation-only change without env change (`Non-Counting: docs only`).
- Editing `repos/oh-my-pi` (`REPO-S3`).

### Sources

- Issue 290 body (goal, evidence snippet at `omp/plugins/omp-claude-compat/src/hooks/hooks.ts:331-337`, orientation, non-counting outcomes, acceptance criteria).
- `omp/plugins/omp-claude-compat/src/hooks/hooks.ts:312-384` (`runHookScript`, `options.env`, `ChildProcess.make`, `ChildProcessSpawner`).
- Node.js `child_process` docs `https://nodejs.org/api/child_process.html` — `options.env` default `process.env`, replacement semantics, and `PATH` lookup rule (web, 2026-08-28).
- Wiki queries: `ChildProcessSpawner env PATH process.env hook runHookScript` and `spawn env PATH Node child_process` (software-wiki, 2026-08-28, nil direct hit on env merge).

Product Contract preservation: Product Contract authored here (`product_contract_source: ce-plan-bootstrap`).

---

## Planning Contract

### Key Technical Decisions

- KTD1. Merge the outer environment into the child env at `hooks.ts:331-337`. Preferred: `{ ...process.env, OMP_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd, ...(pluginRoot ? { CLAUDE_PLUGIN_ROOT: pluginRoot } : {}) }` — covers `PATH` plus any other vars the hook may rely on and matches Node's default when `env` is omitted. Minimal alternative `...process.env` → override bridge keys is equivalent; `PATH: process.env.PATH` alone also satisfies R1 but is narrower. Choose the spread-full-env form unless a KTD in review narrows it for determinism. Fixes both shell and exec forms because both use the same `options`.
- KTD2. Preserve type safety: `process.env` is `NodeJS.ProcessEnv` (`string | undefined` values). Spread is valid for `Record<string, string | undefined>` expected by `ChildProcess` options. Bridge keys remain `string` and overwrite any outer same-named key.
- KTD3. Test placement: extend the existing `omp/plugins/omp-claude-compat` test suite, not a new package. Gatekeeper assertion lives alongside the hook dispatcher tests (e.g., `tests/hooks/`); fixture hook uses a temp file with `#!/usr/bin/env` shebang and `command -v` probe so the test is not deno-specific if deno absent, but deno probe is preferred per issue 290 AE.

### High-Level Technical Design

```mermaid
flowchart LR
  run[runHookScript] --> env[build options.env]
  env --> spawn[ChildProcess.make + spawn]
  spawn --> child[hook child]
  child --> resolve[env resolves shebang]
```

Single-line change: `env: { ...process.env, OMP_PROJECT_DIR, CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_ROOT? }` replaces the three-key literal. Both `hook.args === undefined` (shell) and `hook.args` (exec) paths inherit it.

### Assumptions

- `process.env.PATH` is defined in CI and dev (standard on Unix). If undefined, child will have no `PATH` — acceptable fallback to `/usr/bin:/bin` per Node docs.
- `ChildProcessSpawner` does not inject `PATH` itself — it forwards `options.env` to Node `spawn`.
- No secret leakage concern from spreading `process.env` — child is same-user hook execution.

### Implementation Constraints

- `ChildProcessSpawner` is the existing I/O port; no new requirement.
- Do not add a second projection of the env (`REPO-A3`).
- Tests must be observable contracts, not constructor restatements (`OP12`).

### Sequencing

U1 (env fix + gatekeeper) → U2 (PATH-resolved fixture hook). U2 can land with U1 in one commit since the fixture's green depends on U1.

### System-Wide Impact

Only `runHookScript`'s `options.env` object changes. Callers of `runHookScript` and dispatchers (`runHooksForEvent`, `runLifecycleHooks`, etc.) are unaffected. No settings load or `collectSettingsGaps` change.

### Risks

- **Env overshare.** Spreading full `process.env` exposes vars beyond `PATH`. Mitigation: hook already runs as same user with project `cwd`; alternative narrowed to `PATH` only if reviewers require it.
- **Windows `PATH` vs `Path`.** Node sorts env keys case-insensitively on Windows (Node docs). Spreading preserves whatever outer key exists; no extra handling needed for Linux primary target.

---

## Implementation Units

### U1. Inherit outer PATH in hook child env

- **Goal.** `runHookScript` child inherits outer `PATH` so `#!/usr/bin/env` resolves.
- **Requirements.** R1, R2, R3, R4.
- **Files.**
  - `omp/plugins/omp-claude-compat/src/hooks/hooks.ts` (env at ~331-337)
- **Approach.** At `options` construction, spread `process.env` before bridge keys: `env: { ...process.env, OMP_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd, ...(pluginRoot ? { CLAUDE_PLUGIN_ROOT: pluginRoot } : {}) }`. Verify both `ChildProcess.make(shell, [evalFlag, expand(hook.command)], options)` and `ChildProcess.make(expand(hook.command), hook.args.map(expand), options)` use it.
- **Patterns.** Existing bridge-key object with `pluginRoot` conditional spread.
- **Test scenarios.** AE1, AE3. Gatekeeper: spawn a hook that echoes `PATH` and assert it contains outer `PATH`; fails when env reverted to three keys.
- **Verification.** `pnpm --filter @systemfsoftware/omp-claude-compat test` exits 0; reverting the spread makes the new test fail.
- **Dependencies.** None.

### U2. PATH-resolved fixture hook integration test

- **Goal.** Prove a shebang-based hook resolves via `PATH` through `runHookScript`.
- **Requirements.** R1, R5.
- **Files.**
  - `omp/plugins/omp-claude-compat/tests/hooks/` — new or extended integration test file using existing `HookScopeLive` fixture
- **Approach.** Create temp hook script file with `#!/usr/bin/env -S sh -c 'command -v deno >/dev/null && echo ok'` or `#!/usr/bin/env sh` probe; if `deno` absent fallback to `sh` probe of a known tool. Invoke `runHookScript` directly or via tool-result dispatch; assert exit 0 and `ok` in stdout/stderr.
- **Patterns.** `makeShellHookScript` and Gherkin `HookScopeLive` from `plugin-hooks.integration.test.ts`.
- **Test scenarios.** AE2.
- **Verification.** Test green with U1, red without (gate fails if reverted per R4 gatekeeper).
- **Dependencies.** U1.

## Verification Contract

| Gate          | Command                                                              | Applies                                                             | Done signal                                                                               |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Package tests | `pnpm --filter @systemfsoftware/omp-claude-compat test`              | After U1 (expect AE1/AE3 green, AE2 needs U2); after U2 (all green) | Exit 0; gatekeeper fails if env reverted                                                  |
| Local check   | `pnpm check:local`                                                   | After last edit                                                     | Exit 0                                                                                    |
| Changeset     | `pnpm change --bump patch` when turbo `build` hash moves (`REPO-R2`) | After behavior change                                               | Intent names consumer-visible: hooks now inherit PATH so env shebangs resolve (`REPO-R3`) |

Do not run mutation (`REPO-D3`).

---

## Definition of Done

- `options.env` in `hooks.ts:331-337` contains outer `PATH` (via spread or explicit `PATH`).
- `OMP_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` semantics preserved (R2).
- AE1–AE3 pass; `pnpm --filter @systemfsoftware/omp-claude-compat test` exits 0 and gate fails if reverted.
- `pnpm check:local` exits 0 after last edit.
- Changeset present if build hash moved; body states hooks inherit `PATH` so `#!/usr/bin/env` shebangs resolve.
- LFG opens PR and watches CI.

### Per-unit done

- U1. Env fix landed; AE1/AE3 green; reverting `process.env` spread makes gatekeeper fail.
- U2. PATH-resolved fixture hook test green; exits 0 via `runHookScript`.
