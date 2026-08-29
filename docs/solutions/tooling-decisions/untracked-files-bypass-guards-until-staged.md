---
title: Untracked files bypass stateless repo guards and stale turbo cache until first add — run gates after `git add`, not before
date: 2026-08-29
category: tooling-decisions
module: local-verification
problem_type: process_trap
component: tooling
severity: high
symptoms:
  - "`pnpm check:local` exits 0 on the working tree, then the same tree fails the same chain right after `git commit` — with no source change between the two runs"
  - "a turbo per-package task (lint, test) reports success for a package whose newly added files violate package lint — the task hash predates the new files"
  - "a guard reports `N not decodable as text` or skips files an agent created minutes ago"
root_cause: process_error
resolution_type: process_change
tags: [turbo, oxlint, guards, untracked-files, cache, check-local, verification]
---

# Untracked files bypass stateless repo guards and stale turbo cache until first add

## Problem

During the Babel removal, `pnpm check:local` exited 0 while the tree carried three classes of real violations: corpus fixtures with bare `// oxlint-disable` headers (a protected-rule suppression `check-forbidden-lines.ts` rejects), an `oxlint.config.ts`-visible lint failure in a newly added test file, and a typecheck error in a file no cached task had seen. The same chain, re-run after `git commit` without touching a tracked file, failed — and the failure list named files that had existed for hours.

## Root cause

Two mechanisms, same shape:

1. `check-forbidden-lines.ts` scans **tracked** files (`git ls-files`). An untracked file — every file an agent creates before the first `git add` — is invisible to it. The first compliant run is therefore the first run _after_ staging, not after writing.
2. turbo keys each task by its input hash. A package whose task was cached before new files appeared replays the cached success even though `oxlint .` (which reads the working tree, tracked or not) would now fail. The violation surfaces only when something else busts the hash.

The result is a green tree that is green because the checks never looked, not because the tree is clean.

## Resolution

Stage early, gate late: run `git add -A` and then `pnpm check:local` as one step for any change that adds files, and treat a pre-stage pass as no evidence. Never conclude from a cached task line (`cache hit, replaying logs`) that a package passed with its current inputs.

## Detection

- The failing run's guard output names files that `git status --short` shows as untracked-or-new.
- `git stash -u` before a guard run: if the guard's verdict changes, the trigger is working-tree content the last staged state did not include.

## Lesson

Stateless guards only see what git and turbo see. `git add` is what publishes new files to them; anything less is an unverified claim.
