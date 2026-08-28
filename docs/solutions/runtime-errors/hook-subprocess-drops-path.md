---
title: Hook subprocess loses PATH and shebang resolution fails
date: 2026-08-28
category: runtime-errors
module: omp-claude-compat
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "PostToolUse command hook with env shebang fails: env: 'deno': No such file or directory"
  - "Marketplace comment-checker hook dead on install despite enabled plugin"
  - "sh -c 'command -v <tool>' in hook returns non-zero when tool is on outer PATH"
root_cause: missing_workflow_step
resolution_type: code_fix
related_components:
  - ChildProcess
  - ChildProcessSpawner
tags:
  - hook-bridge
  - child-env
  - extendEnv
  - shebang
---

# Hook subprocess loses PATH and shebang resolution fails

## Problem

The hook bridge spawns command hooks as child processes to evaluate tool-use events. Hooks that rely on interpreter discovery via `env` shebang never executed when the interpreter lived on the outer `PATH`. The child environment was constructed as a replacement dictionary rather than an extension, so `PATH` was absent.

## Failure Modes

1. **Replacement vs extension.** The platform's `CommandOptions` merges with the parent environment only when `extendEnv` is enabled; otherwise providing `env` replaces it. A replacement dictionary containing only bridge keys removes `PATH`, so `execve` fallback resolves to the OS default search path and `env` cannot locate the interpreter.

2. **Manual env spread duplicates platform logic.** Spreading `process.env` at the call site reproduces the merge that `resolveEnvironment` already implements. It couples the caller to Node's global and breaks in runtimes where that global is absent, while the platform flag remains the single source of truth.

3. **Bridge keys must override.** Correct behavior is not pure inheritance. `OMP_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, and `CLAUDE_PLUGIN_ROOT` must take precedence over any outer values with the same names. A merge that puts outer values last silently breaks plugin root stamping.

## Architectural Invariants

**Invariant 1 — Additive child environment.** A hook child environment is always `outer ⊕ bridge` where `⊕` merges outer into bridge with bridge winning on collision. Providing `env` without merging violates the invariant. Formulate as:

```
childEnv = { ...outer, ...bridge }  // bridge overrides outer
```

Enforced by setting `extendEnv` on the command description and keeping `env` minimal to bridge keys only. The spawner's `resolveEnvironment` then performs the outer merge.

**Invariant 2 — Single owner for env merge.** Only the spawner implementation owns the merge. Call sites never read `process.env` directly. This avoids duplicating the merge and keeps the runtime-specific source (`globalThis.process.env` on Node, injected bindings on Workers) behind the spawner boundary.

```ts
// Before — replacement, loses PATH
const options = { env: { OMP_PROJECT_DIR, CLAUDE_PROJECT_DIR } }

// After — extension, bridge wins
const options = { env: { OMP_PROJECT_DIR, CLAUDE_PROJECT_DIR }, extendEnv: true }
```

## Solution

Stamp only bridge keys in `runHookScript` and set `extendEnv` on the command options. Remove any direct `process.env` spread at the call site. Both shell-form and exec-form commands share the same options, so a single site covers all hook invocations. No hand-rolled interpreter path or wrapper script is needed; `env` resolves from the inherited `PATH`.

## Verification

- Gatekeeper scenario: a hook that prints its observed `PATH` must see the outer `PATH` value. Reverting the `extendEnv` flag must make this gate fail while bridge keys still equal the working directory.
- Shebang scenario: a fixture hook file with `env` shebang probing `command -v <tool>` must exit zero via `runHookScript` when the tool is on the outer `PATH`.
- Existing unit and integration suites remain green; the bridge payload encoding and shell vs exec dispatch semantics are unchanged.

## Prevention

- Require `extendEnv` whenever a command supplies `env` and must preserve `PATH` or other inherited variables. Lint or review should flag `env` without `extendEnv` on `ChildProcess.make`.
- Keep child env construction minimal — only bridge keys. Never spread the full outer environment at the call site.
- Cover with a dedicated gatekeeper test that asserts `PATH` presence, not just hook success, so reversion is immediately visible.
