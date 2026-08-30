---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
title: Deno project setup + worktrunk scripts conversion
created: 2026-08-30
---

# Deno Project + Worktrunk Scripts Conversion

## Objective

Initialize this repo as a Deno project and port the 10 bash hook scripts from
`https://github.com/systemfsoftware/systemfsoftware/tree/main/scripts/tools/worktrunk` to Deno
TypeScript, preserving behavior for `wt.toml` integration.

Wiki query ran: `deno project setup deno.json conventions`,
`converting bash shell scripts to Deno TypeScript worktrunk hooks`,
`worktrunk wt.toml hook scripts Deno vs bash implementation` against software-wiki (7 results, none
directly on Deno project conventions; closest #32318f module-resolution). Web-equivalent: local
`deno --version` 2.9.5 verified; primary Deno docs would be fetched via ctx7 if needed during
implementation.

## Context

- Repo `worktrunk-config` is empty (no commits, only `.git` + remote `origin`).
- Source: 10 files in `systemfsoftware/systemfsoftware/scripts/tools/worktrunk` (listed via GitHub
  API 2026-08-30):
  - `lib.sh`, `pre-start.sh`, `copy-codegraph.sh`, `codegraph-worktree-mcp.sh`,
    `convert-to-relative-paths.sh`, `generate-artifacts.sh`, `install-deps.sh`, `post-switch.sh`,
    `pre-merge.sh`, `worktree-to-relative.sh`
- Requirements: 1) `deno.json` project setup, 2) copy+convert scripts to Deno.

## Requirements

### Functional

- R1: `deno.json` exists at repo root with tasks, fmt/lint config, imports for `@std/*` as needed.
- R2: All 10 bash scripts have Deno equivalents under `scripts/tools/worktrunk/` (or
  `scripts/worktrunk/`) as `.ts` files with `#!/usr/bin/env -S deno run --allow-*` shebangs, exact
  allow scopes, and no `--allow-all`.
- R3: Each Deno script preserves observable behavior: gitdir relative conversion, shared dir
  symlinking, codegraph warm-copy fallback chain (sqlite .backup → reflink → cp), MCP provisioning,
  dep detection, artifact generation, pre-merge cleanup, post-switch config unset, bulk conversion.
- R4: `wt.toml` / `.config/wt.toml` updated to invoke `deno run` scripts (or shim) if required for
  hook integration.

### Non-functional

- N1: `deno check`, `deno lint`, `deno fmt --check` pass.
- N2: Executable permissions preserved; async I/O awaited, no `*Sync` in async paths.

## Units

### U1: Deno project scaffold

- Files: `deno.json`, `deno.lock` (after `deno install`/`deno cache`), `.gitignore` entry for
  `.deno/` if needed.
- Tasks: `deno task` entries for `check`, `lint`, `fmt`, `test` as applicable.
- Verification: `deno --version` ok, `deno task check` runs `deno check`/`lint`/`fmt`.

### U2: Shared lib.ts (port of lib.sh)

- Source `lib.sh: resolve_primary_repo` →
  `lib.ts: resolvePrimaryRepo(worktreeRoot: string): Promise<string | null>` using `Deno.Command`
  `git rev-parse`.
- Verification: unit test or manual `deno run` with temp worktree fixture.

### U3: pre-start.ts, post-switch.ts, pre-merge.ts, convert-to-relative-paths.ts, worktree-to-relative.ts

- Port path-conversion logic (`realpath --relative-to` → `std/path` relative + `Deno.realPath`),
  gitdir file I/O, symlink handling.
- Keep idempotency.
- Verification: run each with fixture dirs, assert file contents.

### U4: copy-codegraph.ts + codegraph-worktree-mcp.ts

- Port warm-copy chain, integrity check via `sqlite3` if present, `cp --reflink` fallback via
  `Deno.Command`.
- MCP provisioning: `Deno.Command` for codegraph CLI, Python-like JSON merge rewritten in TS via
  `@std/json`/`Deno.readTextFile`.
- Verification: dry-run with mocked `codegraph`/`sqlite3` not present paths covered.

### U5: install-deps.ts + generate-artifacts.ts

- Detect lockfiles (`pnpm-lock.yaml`, `package-lock.json`, etc.) and run equivalent `Deno.Command`
  with correct args.
- Verification: `deno check` type-checks; manual invocation in repo with no lockfile → skips.

## Verification

- `deno check scripts/tools/worktrunk/*.ts`
- `deno lint`
- `deno fmt --check`
- Manual smoke:
  `deno run --allow-read --allow-run --allow-write scripts/tools/worktrunk/pre-start.ts --help` or
  with temp dir.
- Ensure `git ls-files` shows new `.ts` files, no `.sh` left unless shim retained.

## Risks

- `realpath --relative-to` semantics differ on missing paths → handle via `std/path.relative`.
- Worktree detection depends on `git rev-parse` output normalization.
- `codegraph` binary absent → must be best-effort, not failure.

## Out of Scope

- Publishing to JSR, CI workflow changes beyond basic `deno task` verification.
