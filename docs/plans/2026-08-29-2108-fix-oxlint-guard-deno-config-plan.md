---
title: Oxlint Guard Deno Config in Hook Commands - Plan
type: fix
date: 2026-08-29
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Oxlint Guard Deno Config in Hook Commands - Plan

## Goal Capsule

- **Objective:** `agent-plugins/oxlint-guard` works out of the box after `/plugin install`: both hooks run on a clean checkout where the user's project cwd is not the plugin directory.
- **Means:** Pass `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` in both hook commands in `agent-plugins/oxlint-guard/hooks/hooks.json` (KTD1).
- **Authority hierarchy:** The user's instruction is the product contract: the only thing that matters is that the hooks specify the config file. Repo rules bind (`REPO-D1` gates, plugin lives outside the pnpm workspace).
- **Stop conditions:** Both hook commands carry `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"`; a smoke run from a foreign cwd resolves the `@std/*` imports; the plugin's own `deno check`/`deno test` stay green.
- **Tail ownership:** ce-work executes; no npm publish (out of scope per the plugin's 2026-08-05 plan and `plugin.json`).

## Product Contract

### Summary

The oxlint-guard hooks invoke `deno run` without a config argument. Deno discovers `deno.jsonc` by walking up from the process cwd. The hook process cwd is the user's project, not the plugin directory, so the plugin's `deno.jsonc` — which carries the `@std/*` import map — is never found, and the bare `@std/jsonc`/`@std/path` imports in `src/guard-config.ts` and `src/guard-lint.ts` fail to resolve at runtime. The hooks therefore do not run out of the box. The fix is to name the plugin's own config file in each hook command.

### Problem Frame

A Claude Code plugin hook command's process cwd is the user's project directory, never the plugin install root. Deno's config auto-discovery walks up from that cwd, so the plugin's import map is invisible unless the command names it explicitly. comment-checker's plugin solves this exact problem by passing `--config "${CLAUDE_PLUGIN_ROOT}/hooks/deno.jsonc"` in its hook command. oxlint-guard omitted the flag.

### Requirements

- R1. Both hook commands in `agent-plugins/oxlint-guard/hooks/hooks.json` pass `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` so Deno resolves the plugin's `@std/*` import map regardless of the hook process cwd.
- R2. The permission flags, `--quiet`, the `command -v deno` guard, the matchers, and the timeouts (30 s config guard, 120 s lint guard) are unchanged.
- R3. The hooks run out of the box on a clean install; the README's existing prerequisite claims stay accurate.

### Scope Boundaries

- **In scope:** `agent-plugins/oxlint-guard/hooks/hooks.json` only.
- **Out of scope:** hook-runner scripts, direnv fallbacks, non-blocking failure modes, `README.md` rewording, and any change to the guards' exit contract — the deny-by-default guard behavior stays as documented.

## Planning Contract

### Key Technical Decisions

- KTD1. **Name the plugin config file in the hook command.** Both hook commands gain `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` before the script path. (session-settled: user-directed — chosen over adding a `hooks/` runner shim with direnv fallbacks and non-blocking exits: the root cause is Deno config discovery from a foreign cwd, not a missing Deno runtime, so the fix is the flag, not a launcher.) Template: comment-checker's hook command, which passes `--config "${CLAUDE_PLUGIN_ROOT}/hooks/deno.jsonc"`; confirmed against the Claude Code hooks reference (`code.claude.com/docs/en/hooks`) which documents that hooks do not run with the plugin root as cwd.

### Assumptions

- A1. The plugin-root `deno.jsonc` is the intended Deno config; it carries the `@std/*` import map both guards import from.
- A2. First run still needs network access to warm Deno's registry cache, exactly as the README's "How It Works" documents; this change does not alter that.

## Implementation Units

### U1. Add the config flag to both hook commands

- **Goal:** Both hooks resolve the plugin's import map from any cwd.
- **Requirements:** R1, R2, R3
- **Dependencies:** none
- **Files:**
  - `agent-plugins/oxlint-guard/hooks/hooks.json`
- **Approach:**
  1. In the `PostToolUse` command, insert `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` between `--quiet` and `--allow-read`.
  2. In the `PreToolUse` command, insert the same flag in the same position.
  3. Leave matchers, timeouts, permission flags, and the `command -v deno` guard byte-identical.
- **Patterns to follow:** comment-checker's `hooks/hooks.json` command form (`deno run --config "${CLAUDE_PLUGIN_ROOT}/hooks/deno.jsonc" --allow-read ...`) for both the flag and the `${CLAUDE_PLUGIN_ROOT}` placeholder.
- **Test scenarios:**
  - `Test expectation: none -- pure static configuration; correctness is the Verification Contract's smoke run.`
- **Verification:** `hooks.json` parses; both commands contain `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"`; a smoke run of each exact command from a foreign cwd resolves the imports and behaves per the existing contract.

## Verification Contract

- Plugin type check: `deno check src/` from `agent-plugins/oxlint-guard/` passes (unchanged).
- Plugin tests: `deno test src/` from `agent-plugins/oxlint-guard/` passes (unchanged).
- Hook smoke, from a temp cwd outside the plugin: pipe a contentless fixture payload into each exact command string from `hooks.json` and require exit 0 (skip path) — this is the out-of-the-box repro, because the failure only manifests when the cwd is not the plugin root. Before the fix this smoke fails on the unresolved `@std/*` import; after the fix it passes.
- Root baseline: the plugin sits outside the pnpm workspace; `pnpm check` at the root is unaffected (no workspace file touched).

## Definition of Done

- Both hook commands in `agent-plugins/oxlint-guard/hooks/hooks.json` carry `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` (verbatim).
- The foreign-cwd smoke of both commands exits 0 on a skip payload.
- `deno check src/` and `deno test src/` are green in the plugin directory.
- No file outside `agent-plugins/oxlint-guard/hooks/hooks.json` changed; no abandoned-attempt code in the diff.
