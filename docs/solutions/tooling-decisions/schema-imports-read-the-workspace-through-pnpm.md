---
title: schema-file-imports-pure-modules-only reads the enclosing workspace through pnpm's own readers
date: "2026-10-20"
module: oxlint-plugin-effect-schema
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Changing how a lint rule decides that an import names a workspace package
  - Bumping the @pnpm/workspace.* catalog entries
  - A consumer reports a workspace package refused, or a non-workspace package admitted, in a *.schema.ts
root_cause: documented_behavior_not_implemented
resolution_type: dependency_adoption
related_components:
  - packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/workspace-packages.ts
  - packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-file-imports-pure-modules-only.ts
  - pnpm-workspace.yaml
tags:
  - oxlint
  - pnpm
  - workspace
  - schema
  - dependency
---

# schema-file-imports-pure-modules-only reads the enclosing workspace through pnpm's own readers

## Context

The rule's docs said a `*.schema.ts` may import "workspace packages", but the code admitted only the `@systemfsoftware/*` prefix. A consumer with its own scope (`@product/*`) had every schema-to-schema import across packages refused, and carried a `patchedDependencies` patch over the built `dist/index.mjs` that parsed `pnpm-workspace.yaml` with line regexes. The fix lives in the rule: an import whose package name is a project of the pnpm workspace enclosing the linted file is admitted.

An oxlint rule's `create` is synchronous, so whatever reads the workspace must have a synchronous API.

## Candidates

1. **pnpm 10 line `@pnpm/workspace.find-packages` + `@pnpm/workspace.read-manifest`** (1000.x, CJS). Rejected: both export only async functions (`findWorkspacePackages`, `readWorkspaceManifest`), which a synchronous `create` cannot await.
2. **A YAML parser (`yaml` or `js-yaml`) + `tinyglobby`.** Few packages, but it rewrites pnpm's semantics by hand: root discovery (realpath, `PNPM_CONFIG_WORKSPACE_DIR`, a project the workspace does not include standing alone), the `packages` default when the field is absent (`['.']`), pattern normalisation to `package.{json,yaml,json5}`, negated patterns matching dot directories, the root project always counting, and the modules-directory ignores. Each is a place to drift from what `pnpm install` links.
3. **Resolve the import through `node_modules` and test whether the target sits in the workspace.** No manifest read at all, but the verdict depends on install state and fails for injected workspace dependencies, which are copies under the virtual store rather than symlinks into the workspace.
4. **pnpm 11 line `@pnpm/workspace.root-finder` + `@pnpm/workspace.workspace-manifest-reader` + `@pnpm/workspace.projects-reader`** (1100.x/1101.x, ESM, Node ≥ 22.13). Chosen. They publish `findWorkspaceDirSync`, `readWorkspaceManifestSync` and `findWorkspaceProjectsNoCheckSync`, the same functions pnpm's CLI uses to find the root, validate the manifest and list projects.

Deciding criterion: the set of packages admitted is the set pnpm itself treats as the workspace, with no pnpm rule re-implemented here. The cost is the install footprint: `projects-reader` pulls `@pnpm/cli.utils` and its graph, about 90 packages and 9 MB in a consumer's store, against 17 packages for the root finder and manifest reader alone. The plugin is a lint-time devDependency, so the footprint never reaches a consumer's runtime. `@pnpm/logger` is a peer of `projects-reader` and is a direct dependency of the plugin so the peer is always met.

## Guidance

- The workspace is read lazily, only for a bare import the static allowlist did not already admit, and its project names are cached per workspace root for the life of the process. A long-running oxlint language server sees a project added after its first schema-file lint only after a restart.
- A malformed `pnpm-workspace.yaml`, or one named `pnpm-workspace.yml`, raises the same `PnpmError` pnpm raises; the rule does not swallow it.
- The repo pins pnpm 12, whose CLI is Rust; these libraries are the maintained TypeScript pnpm 11 line. Both read the same `pnpm-workspace.yaml` contract.

## Reversing observation

Reverse to candidate 2 if the pnpm 11 `@pnpm/workspace.*` line stops publishing, or if its project set diverges from what the pinned pnpm links. Either shows up as a workspace package the rule refuses while `pnpm install` links it.
