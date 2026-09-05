# AGENTS.md — Worktrunk Scripts

Deno worktree hooks for `worktrunk` automating environment setup, warm-copy indexing, and path isolation.

## Standing Law

Read `CONSTITUTION.md` before architecture or rule authoring.

Startup: confirm working directory and active task; run `deno task check` and repair failures before adding scope.

## Routing

Load docs on-demand when triggers fire; do not perform eager multi-spec reads at startup.

| Doc                                                     | Trigger                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CONSTITUTION.md`                                       | architecture changes, rule authoring, or design disputes                           |
| `CONSTITUTION-ARTICLES.md`                              | editing source files (pure core, types, boundaries, testing)                       |
| `docs/solutions/tooling/bash-to-deno-port-semantics.md` | modifying path mapping, git command wrappers, or cross-platform Deno CLI semantics |
| `subtrees.toml`                                         | updating or adding vendored git subtrees                                           |

## Stack & Conventions

- Deno 2.x (`deno task check`, `deno task test`).
- Hook scripts under `scripts/` are standalone CLIs (no exports).
- Shared utilities live under `scripts/lib/`.
- Lint via `deno lint`; formatting via `dprint`. Gate: `deno task check`.

## Surface Classes

| Surface       | Examples                                | Rule                                                                                            |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Evaluator** | `.github/workflows/`                    | Its own commit, never shared with the work it judges; gate observed red before and green after. |
| **Doctrine**  | `CONSTITUTION.md`, `AGENTS.md`, `docs/` | Editable, but never an input to a gate.                                                         |
| **Editable**  | `scripts/`, `deno.json`, `dprint.json`  | Edit freely within active task.                                                                 |

## Directory Map

Root doctrine files `CONSTITUTION.md`, `CONSTITUTION-ARTICLES.md`.

| Directory      | What it is                                                | Governance        |
| -------------- | --------------------------------------------------------- | ----------------- |
| `scripts/`     | Standalone lifecycle CLI entrypoints invoked by worktrunk | Root              |
| `scripts/lib/` | Shared git, path, and filesystem utilities                | Root              |
| `repos/`       | Vendored third-party trees (`subtrees.toml`), read-only   | `WT-S3` read-only |
| `docs/`        | Solutions, plans, and technical documentation             | Editable          |

## Rules — Must Hold At Done

Every row is load-bearing and names its runnable gate.

| ID        | Rule                                                                                                                                               | Gate                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **WT-S3** | `repos/` is a vendored third-party reference subtree; never edit it.                                                                               | `review — git status check`          |
| **WT-R1** | Hook scripts in `scripts/` must declare explicit Deno permission shebangs (`#!/usr/bin/env -S deno run --allow-...`) and avoid `-A`/`--allow-all`. | `deno task check`                    |
| **WT-R2** | Shared utilities belong in `scripts/lib/`; hook entrypoints under `scripts/` are standalone CLIs with no exports.                                  | `deno task check`                    |
| **WT-R3** | Code formatting and linting pass with zero diagnostics.                                                                                            | `deno task check`                    |
| **WT-C1** | `type(scope): subject` with no trailing period. Keep subjects concise.                                                                             | `review — commit message inspection` |

## Verification Commands

```bash
deno task check
```
