---
title: A stack layer's default stage must isolate linked git worktrees
date: 2026-11-27
category: logic-errors
module: alchemy-stack-layer
problem_type: logic_error
component: tooling
severity: high
applies_when:
  - changing how alchemy-stack-layer resolves a stage when the config gives none
  - running a stack layer's tests outside `@alchemy.run/test`'s CLI
tags: [alchemy, stage, worktree, destroy, data-loss]
---

## Problem

Without a configured `stage`, the layer deploys to a base stage followed by a suffix that hashes the test file's Vitest project name, root directory name and path from the root. None of those depend on which checkout runs the file, so the suffix is the same in every worktree.

The base stage came from `Core.resolveStage({})`, which is `ALCHEMY_TEST_STAGE` or `test_$USER` (`repos/alchemy/packages/alchemy-test/src/Core.ts:188-189`). Only `@alchemy.run/test`'s CLI adds a per-worktree base, and it does that by setting `ALCHEMY_TEST_STAGE` from `worktreeStage(process.cwd())` before the run (`repos/alchemy/packages/alchemy-test/src/cli.ts:226-235`). The layer runs under plain Vitest, so two linked worktrees running the same cloud file at once got one stage. Each deploy starts by destroying whatever is left at its stage, so one run destroyed the other's live deployment.

## Fix

When `ALCHEMY_TEST_STAGE` is unset or empty, the shell resolves the base itself with `worktreeStage(process.cwd())` from `@alchemy.run/test/WorktreeStage` and falls back to `Core.resolveStage({})`. `fileStage` stays pure and takes the base as input. A configured `stage` is still used verbatim.

## Why not fail instead

Failing in cloud mode when `ALCHEMY_TEST_STAGE` is unset would make local and cloud resolve the stage differently, though one code path serves both, and it would not isolate anything: it only moves the burden to every caller.
