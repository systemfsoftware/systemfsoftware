---
title: Deno config discovery follows the entrypoint, so runner commands must pin --config
date: 2026-08-29
category: conventions
module: agent-plugins oxlint-guard (and any deno hook/runner command)
problem_type: convention
component: tooling
severity: medium
applies_when:
  - a hook or runner command invokes deno run on a script outside the user's cwd
  - a deno script imports bare specifiers from an import map that lives in a config file
  - a command string is executed by a host that sets its own cwd
tags:
  - deno
  - claude-code-hooks
  - config-resolution
  - claude-plugin-root
  - import-map
---

# Deno config discovery follows the entrypoint, so runner commands must pin --config

## Problem

A Claude Code plugin hook command runs as a shell command whose cwd is the user's project, never the plugin install root. The oxlint-guard hooks invoked `deno run` without a `--config` flag, relying on auto-discovery to find the plugin's `deno.jsonc` import map (`@std/path`, `@std/jsonc`) for the guard scripts.

The observable failure: a deno command run from a foreign cwd may not resolve the bare imports the script loads at module top level. The edit proceeds with no lint feedback and no config veto, on the hook's documented non-blocking exit channel. Whether it resolves depends on undocumented, version-dependent Deno discovery semantics.

## Mechanism & Failure Modes

1. **Discovery follows the entrypoint, not the cwd.** Empirical, not derived: Deno 2.9.4 discovers `deno.jsonc` from the **entrypoint script's directory**. A probe from `/tmp` running a script under `/tmp/probe-no-config/src/` with no config anywhere above either path failed to resolve a bare `@std/path` import; the same script run from the plugin's own directory resolved it. The mechanism is version-dependent and not part of a stable contract.

2. **A bare name in a runner command is a silent hazard.** The command string is executed by a host that sets its own cwd; whether the import map resolves then depends on where the script happens to live relative to the config, not on any property the command asserts. When it fails, the failure is a module-load error on the non-blocking exit-1 channel — loud to a human reading stderr, invisible to the agent whose edit was just accepted.

3. **Relative config paths re-enter the dependence.** A `--config` value that is not absolute still resolves against the runner's cwd, so only an absolute path (interpolated from the host-stamped plugin root) removes the dependence.

## Architectural Invariant

**A command executed by a runner that chooses the cwd must resolve every path it uses against a mechanism outside that cwd.** The import map is one such path. For a deno command:

```bash
exec deno run --quiet --config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc" --allow-read "<plugin-root>/src/guard.ts"
```

- `--config <absolute-path>` comes before the permission flags and the script path.
- The config path is interpolated from the host-stamped plugin root (`${CLAUDE_PLUGIN_ROOT}`), so it is absolute and cwd-independent.
- The runtime-missing case stays a loud, non-blocking precheck (`command -v deno`), never a silent spawn failure.

This is the pattern comment-checker's plugin already shipped: its hook command passes `--config "${CLAUDE_PLUGIN_ROOT}/hooks/deno.jsonc"`.

## Why This Works

The flag converts an implicit, environment-dependent lookup into a named assertion. When resolution cannot happen, the error names the config path instead of surfacing as an ambient import failure, so the failure mode is diagnosable rather than invisible. The guard's enforcement surface (PostToolUse lint feedback, PreToolUse config veto) no longer depends on where the hook process happens to start.

## When to Apply

- Any hook or runner command that executes a deno script whose imports rely on a config import map: pass `--config` with an absolute path.
- Any audit of an agent-plugin's hook commands: every deno command should carry the flag. A sibling plugin (the git-subtrees guard) still runs without it and carries the same latent defect; cf. issues #311/#312 (filed 2026-08-29) for the regression-test and parity follow-ups.
- Any environment where the invoking host is a moving baseline: pinning the config decouples the hook from Deno discovery semantics.

## Code Smell

A hook or runner command string containing `deno run` with **no** `--config` flag, where the invoked script imports bare specifiers from an import map. The AST shape is a command whose `--allow-*` flags and script path are present but whose config is left to discovery.

## Verification

The two-sided probe that settles the mechanism, run from a foreign cwd on a script under a config-less directory: without `--config`, the run fails with `Import "@std/path" not a dependency`; with `--config <plugin>/deno.jsonc`, it resolves. The post-fix smoke: both hook commands, executed from a foreign cwd, exit 0 on contentless payloads (branch `oxlint-guard-cleanup`, PR pending).

## Related

- `docs/solutions/runtime-errors/hook-subprocess-drops-path.md` — the child-environment invariant: bridge env keys (including `CLAUDE_PLUGIN_ROOT`) are stamped onto the hook child, which is what makes the absolute interpolated path valid
- `docs/solutions/integration-issues/settings-catalog-cannot-see-plugin-hooks.md` — a plugin's hook file is only active when the plugin is enabled; the plugin root env names the root
- `docs/solutions/build-errors/install-time-tool-resolution-must-not-use-path.md` — the sibling discipline: an executed tool is resolved by a mechanism outside the ambient environment, not left to lookup
