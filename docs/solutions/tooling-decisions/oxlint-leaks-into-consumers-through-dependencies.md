---
title: Core's oxlint version reached every consumer through runtime dependencies
date: "2026-11-11"
module: oxlint-presets
problem_type: tooling_decision
component: packages/oxlint-plugin, packages/oxlint-presets
severity: medium
applies_when:
  - A published package needs oxlint or an oxlint plugin at lint time
  - Choosing between dependencies and peerDependencies for lint tooling
  - Bumping oxlint or a vendored patch in a repo that consumers install
root_cause: tooling_declared_as_runtime_dependency
resolution_type: move_to_peer_dependency
tags: [oxlint, dependencies, peer-dependencies, lockfile, release-age]
---

# Core's oxlint version reached every consumer through runtime dependencies

## Problem

Several core packages list `oxlint` under `dependencies`. Each published tarball therefore installs its own copy of oxlint in a consumer. Consumer lockfiles ended up holding two oxlint versions side by side.

What the source shows:

- `@systemfsoftware/oxlint-plugin-dmmf-workflow` and `@systemfsoftware/oxlint-plugin-effect-platform` list `oxlint` under `dependencies`. Their `src/index.ts` imports it type-only (`import type ... from 'oxlint'`), so the runtime never needs it.
- `oxlint-config-dmmf`, `oxlint-config-cell-architecture`, `oxlint-config-rule-authoring` and `oxlint-config-recommended` list `oxlint` under both `dependencies` and `peerDependencies`.
- `@oxlint/plugins` is a real runtime dependency. The dmmf-workflow plugin imports `defineRule` from it.
- `oxlint/plugins-dev` is imported only by test files in the effect-schema plugin.

## Why it chained

An oxlint bump in core now changes what every consumer installs. Core held oxlint back in commit `e5c8066a2b` (#945), which changed the workspace catalog from `~1.93.0` to `~1.89.0`. The commit's stated reason was to let consumers inside the release-age window install core. The window is `minimumReleaseAge: 4320` (3 days).

## Rules

- Tooling a consumer already has goes in `peerDependencies`. A type-only import needs no runtime dependency.
- A relock starts from the existing lockfile and changes only what moved. Never run `pnpm clean --lockfile`.
- Check a vendored patch against upstream before every bump of the package it patches.

## The rolldown-plugin-dts patch

- `00a368d3d7` (#624) added a patch to `rolldown-plugin-dts` so published declarations export only declared exports.
- `71b49c768d` (#948) dropped the patch. Its full lockfile re-resolution also moved `effect` from 4.1.2 to 4.1.4.
- `02f35deab4` (#950) relocked only `rolldown-plugin-dts`. `effect` stayed at 4.1.2, and the lock now holds `rolldown-plugin-dts` 0.28.8.
- The upstream fix is commit `004032fb7` in `sxzz/rolldown-plugin-dts`, titled "prevent implicit exports of private declarations". npm publishes 0.28.7.

Removing a patch is a bump like any other. Relock the one package it touched.
