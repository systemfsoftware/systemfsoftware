---
title: Commit hooks for agent committers write no objects and boot no wrapper
date: 2026-11-19
category: conventions
module: git hooks (husky, lint-staged, commitlint)
problem_type: convention
component: tooling
severity: medium
applies_when:
  - many AI agents commit concurrently from linked worktrees of one repository
  - a pre-commit hook runs lint-staged
  - a hook latency or object-store growth complaint is being investigated
tags:
  - lint-staged
  - husky
  - commitlint
  - git-objects
  - worktrees
---

# Commit hooks for agent committers write no objects and boot no wrapper

## Facts measured

- `lint-staged --no-revert` still creates the backup stash. On one small staged edit
  the old hook wrote 5 loose objects (1 blob, 1 tree, 3 commits); the extra two commits are
  the stash and its index commit. `--no-stash` wrote 3 (blob, tree, the commit itself).
  Objects were counted by pointing `GIT_OBJECT_DIRECTORY` at an empty directory (with the real
  store as an alternate) so that only objects the commit wrote are counted.
- `--no-stash` implies `--no-revert`. Formatters re-stage their edits and only an unfixable
  lint error fails the commit. A partially staged file has its unstaged hunks staged too, which
  is acceptable when an agent commits a whole task from its own worktree.
- `pnpm exec commitlint` cost about 250 ms more than `./node_modules/.bin/commitlint`.
  commitlint's own start is still about 350-500 ms, so the 300 ms target is not met by
  hook wiring alone; the config format (TS or CJS) made no difference.

## Rules that follow

- Invoke hook tools by direct binary path, never through `pnpm exec` or `pnpm run`.
- Skip pre-commit while `MERGE_HEAD`, `REBASE_HEAD` or `CHERRY_PICK_HEAD` exists: the
  staged set belongs to that operation.
- A conflict-marker check must require the whole ordered sequence (`<<<<<<<`, `=======`,
  `>>>>>>>`) in one staged file. A bare `=======` is a setext heading underline and a lone
  marker-like line is prose; matching either rejects ordinary files.
- Keep typecheck, tests and builds out of local hooks; CI is the gate.
