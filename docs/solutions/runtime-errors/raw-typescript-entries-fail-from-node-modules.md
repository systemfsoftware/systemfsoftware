---
title: "Raw TypeScript entries load in the workspace and fail from node_modules"
date: 2026-10-10
category: runtime-errors
module: tsdown-config
problem_type: runtime_error
component: tooling
symptoms:
  - "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING when a consumer imports a package entry that is a .ts file"
  - "tsdown fails to load a consumer tsdown.config.ts that imports a published .ts config fragment"
  - "every in-repo check stays green, because workspace symlinks resolve outside node_modules"
root_cause: missing_tooling
resolution_type: tooling_addition
severity: high
framework_version: node 24.21.0
retire_when: "nodejs/node#63853 (lift type stripping under node_modules) merges and ships in the Node line the devShell pins; check the PR state and `node --version` in the devShell"
tags:
  - type-stripping
  - node-modules
  - workspace-symlink
  - consumer-load
  - flake-tarball
  - shipped-surface
  - silent-pass
---

# Raw TypeScript entries load in the workspace and fail from node_modules

## Problem

`@systemfsoftware/tsdown-config` published its `quiet-build` subpath and its `api-extractor-quiet` bin as raw `.ts` files. Inside the monorepo both loaded, because Node 24 strips types. Once the package was installed from its tarball, neither loaded: Node refuses to strip types for any file whose real path is under `node_modules`, and tsdown's own config loader inherits the refusal. Fixed in PR #707.

## Symptoms

- `import('@systemfsoftware/tsdown-config/quiet-build')` from an installed copy throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
- `tsdown -l warn` with a `tsdown.config.ts` that spreads `quietBuild` fails with "Failed to load the config file due to a known Node.js bug".
- The `api-extractor-quiet` bin fails the same way through its `node_modules/.bin` shim.

## What Didn't Work

- In-repo tests, typecheck, `attw --pack .` and `pnpm pack:all` all passed. A workspace sibling resolves the package through a symlink whose real path is the source directory, not `node_modules`, so Node strips types and nothing fails. `attw` checks type resolution, not whether the runtime can load the entry.
- A Bun-run check would also pass, because Bun has no such refusal. The consumer runtime here is Node.

## Solution

- Ship JavaScript entries. tsdown-config's entries became plain ES modules with hand-written `.d.ts`/`.d.mts` files, type-checked by `tsc` with `allowJs`/`checkJs`. That is the same shape vitest-config and stryker-config already used, so the package needs no build step and no build output directory.
- Prove it from outside: the flake check `checks.<system>.consumer-load` installs the flake's workspace tarballs offline into a consumer outside the monorepo through `lib.mkConsumerStore`. Under Node, it imports every `exports` subpath, runs every `bin` with `--help`, builds an entry through tsdown's config loader, and exercises vitest-config's `defineConfig`. At the commit before the fix it failed with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`; after the fix it is green.

## Why This Works

The refusal is keyed on the file's real path, so only an install where the package really lives under `node_modules` can observe it. The packed tarball, installed by pnpm into a separate root, is the artifact an outside consumer gets. Checking that artifact under Node closes the gap that workspace symlinks open.

## Prevention

- A published entry (`exports` target or `bin`) must be JavaScript. TypeScript belongs behind the private source export condition, never in `default`.
- A package that joins `workspace-tarballs.members` and is meant for outside consumers gets loaded by `consumer-load`. The check derives its package set from the consumer fixture's own `package.json`, so a new package means adding it there and regenerating the fixture lockfile; the steps are in the header comment of the check's derivation.
- Do not peer a published config package on an in-repo package that builds with it. vitest-config peering on the `@systemfsoftware/vitest` fork made the flake's tarball builder fail with `ERR_PNPM_TASK_CYCLE`: it runs `pnpm -r --filter <pkg>... run build`, which treats peers as edges, while turbo tolerates the same edge.

## Related Issues

- `docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md`: another way a built artifact breaks only for an installed consumer.
- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md`: shipped surface diverging while in-repo gates pass.
