---
title: The mutation job's cache save spent seven minutes globbing node_modules and saved nothing
date: "2026-11-13"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "`actions/cache/save` in the reusable mutation workflow took 6.5-7.5 minutes on the self-hosted mutation runner"
  - "The mutation step before it took 2 seconds (no package changed, 0 mutants tested)"
  - "The save step ended with `Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved`"
root_cause: config_error
resolution_type: config_change
severity: medium
related_components:
  - .github/workflows/reusable-mutation.yml
tags:
  - ci
  - github-actions
  - actions-cache
  - stryker
  - mutation
---

# The mutation job's cache save spent seven minutes globbing node_modules and saved nothing

## Problem

The incremental-cache restore and save steps took `path: "**/reports/stryker-incremental.json"`. The restore only sends the key to the cache service, so it ran in under a second. The save expands the pattern on disk first, and on the mutation runner that took over seven minutes, even when no report existed and nothing was uploaded.

## Root cause

`actions/cache` expands paths with `@actions/glob`, which follows symbolic links by default. A `**` pattern at the workspace root walks every `node_modules` tree and re-walks each pnpm symlinked package under every link that points to it. Timings on a fresh install of one consumer workspace (2.7 GB `node_modules`, about 4,400 symlinks):

| Pattern                                       | followSymbolicLinks | Time   |
| --------------------------------------------- | ------------------- | ------ |
| `**/reports/stryker-incremental.json`         | true (the default)  | 11.8 s |
| `**/reports/stryker-incremental.json`         | false               | 2.6 s  |
| `packages/*/reports/stryker-incremental.json` | true                | 0.0 s  |

On the runner's disk the same walk took over seven minutes.

## Fix

The report locations are already known: `mutation` writes each package's report to `<package>/reports/stryker-incremental.json`. A step now builds one path per entry of the `packages` input, and the restore and save both take that list. Both steps must get the same paths, because the cache version is derived from them.

## Prevention

Never give `actions/cache` a workspace-root `**` pattern in a pnpm workspace. List the paths, or anchor the glob below a directory that holds no `node_modules`.
