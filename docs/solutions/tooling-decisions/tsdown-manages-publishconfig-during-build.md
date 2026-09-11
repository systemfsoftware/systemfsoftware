---
title: tsdown manages publishConfig.exports during build
date: 2026-07-19
category: tooling-decisions
module: build-tooling
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Editing package.json in a tsdown-managed package
  - Reviewing a PR that touches publishConfig in a tsdown package
tags:
  - tsdown
  - publish-config
  - build-system
---

# tsdown manages publishConfig.exports during build

## Context

A forked package's `package.json` can arrive with two `publishConfig` blocks — one with `access: public` and another with `exports: {...}` pointing to `dist/` output files. This looks like an error (duplicate JSON keys) but is intentional: tsdown writes the `exports` variant during build when the config names a development export condition.

## Guidance

- **`publishConfig.access`** is set by the developer to control npm publish access. Leave it alone.
- **`publishConfig.exports`** is build-owned: `tsdown` writes it during `pnpm build` from the `exports` option in `tsdown.config.ts` whenever that option names a development export condition, and a build with no such condition leaves the committed block untouched. Either way, do not hand-edit it — the config is the source, and re-enabling the condition regenerates the block.
- After a build, tsdown normalizes both blocks into a single `publishConfig`:
  ```json
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": "./dist/index.mjs",
      ...
    }
  }
  ```
- Reading the source file with `JSON.parse` before a build would silently drop `access: public` (JSON keeps only the last duplicate key). tsdown reads the file with its own parser that handles duplicates.
- This pattern shows up in freshly forked packages, where upstream's `publishConfig` layout wasn't reformatted. First-party packages normally only carry `publishConfig.exports` (set by tsdown) and rely on `pnpm publish --access public` at the CI level.

## Why This Matters

Wasting time merging "duplicate" `publishConfig` blocks or assuming they're a bug is the failure this guidance prevents. The source-level duplicate is harmless — tsdown resolves it on build. The real rule is: never hand-edit `publishConfig.exports` in a tsdown package. Change `tsdown.config.ts` instead.

## When to Apply

- When reviewing a PR that touches `publishConfig` in a `tsdown.config.ts`-managed package — the change should be in the tsdown config, not the package.json body.
- When investigating why a `JSON.parse` + `JSON.stringify` operation (e.g., a version-bump script) produces a file that lost `access: public` — the duplicate was the root cause.
- When forking an upstream package — its publishConfig layout may differ from tsdown conventions; the first build will normalize it.

## Related

- AGENTS.md: "Don't hand-edit package.json#exports on tsdown packages — change tsdown.config.ts."
- `packages/stryker-js/stryker-js-cli/tsdown.config.ts` — its `exports` block excludes the bin entries and declares the `stryker` bin, so the build owns the published map.
