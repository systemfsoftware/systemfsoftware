---
title: A template builds, tests and deploys after being copied out of the monorepo alone, with published dependencies and no monorepo tooling
applies_when:
  - creating or changing a project template, starter or scaffold
  - adding a dependency, lint preset, tsconfig base or test harness to a template
  - a template references a workspace package or a catalog entry
tags: [composition, template, isolation, scaffold]
---

## Rule

A template (`"unit": "template"`) is what someone receives as their own repository, so it works with nothing around it:

- every dependency is a published version: no `workspace:*`, no path, no `catalog:` reference;
- no tooling that exists only in this workspace (a shared lint preset, tsconfig base, test harness or hook package) unless it is a published package pinned by version; otherwise the config is inline;
- one obvious `dev`, `build`, `test` and `deploy` script;
- the libraries it builds on are published packages.

## Why

The first person to copy a template that leans on the workspace gets a repository that does not install. younna-ai's app template (`younna-ai/packages/app-template/package.json`, read 2026-10-23) carries its own configs, but every one of its 12 dependencies is a `catalog:` reference that only this workspace's `pnpm-workspace.yaml` can resolve, one of them is the workspace-only `@younna/oxlint-preset`, and its only scripts are `typecheck` and `lint`: copied out, it does not install, and it has nothing to deploy ((pack: composition, evidence/FINDINGS.md) Cycle 006, finding 10; (pack: composition, evidence/PACK.md) rule 13).

## Evidence

- Stead's `ui/template` is a complete workspace package with its own configs and versioned `@stead/shell` and `@stead/sdk` dependencies: it is what `stead init` writes ((pack: composition, evidence/FINDINGS.md) Cycle 004, finding 11).
- Effect's published manifests carry no `workspace:` reference; packages install standalone against a peer `effect` ((pack: composition, evidence/FINDINGS.md) Cycle 003).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```jsonc
// WRONG: packages/app-template/package.json
"devDependencies": { "@younna/oxlint-preset": "workspace:*", "vitest": "catalog:" }

// RIGHT
"devDependencies": { "oxlint": "1.77.0", "vitest": "4.1.2" },
"scripts": { "dev": "...", "build": "...", "test": "...", "deploy": "..." }
```

## Gate

Gate: none yet. `repo-checks composition-unit-kinds` checks only that a template declares its kind. The isolation gate would be a CI job that copies the template into an empty directory outside the workspace, installs from the registry only, and runs its `build`, `test` and a preview `deploy`; the facts it reads are the install's resolution errors (any `workspace:`, path or `catalog:` specifier fails) and each script's exit code.
