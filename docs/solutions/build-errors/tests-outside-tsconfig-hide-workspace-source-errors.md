---
title: Tests outside a package's tsconfig hide workspace-source type errors
date: 2026-09-22
category: build-errors
module: effect-memfs, npm-package
problem_type: build_error
component: tooling
symptoms:
  - "type-aware lint reports `no-unsafe-call` / `no-unsafe-member-access` on an `error` typed value for every published-name workspace import under `tests/`"
  - "`tsc --noEmit` exits 0 and `vitest run` passes on the same files"
  - "once the tests join the project, the consumer's typecheck fails inside the dependency's `src/` with `TS2591: Cannot find name 'Buffer'`"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [tsconfig, include, customconditions, source-condition, tsgolint, consumer-safe, ambient-globals, workspace]
---

# Tests outside a package's tsconfig hide workspace-source type errors

## Problem

`packages/effect-memfs` and `packages/npm-package` both had `"include": ["src"]` in `tsconfig.json`, while their integration tests live in `tests/` and import workspace packages by their published names. Nothing type-checked those tests, and the dependency's source was never compiled under a consumer's settings.

## Symptoms

- oxlint's type-aware pass reported every `@systemfsoftware/effect-memfs` import in `packages/npm-package/tests/` as an `error` typed value.
- `tsc --noEmit` stayed green, because `tests/` was not part of the program.
- Vitest stayed green, because it resolves the `@systemfsoftware/source` condition through `resolve.conditions` / `ssr.resolve.conditions` from `@systemfsoftware/vitest-config`, independent of tsconfig.
- The tests kept calling a removed API (`MemoryFileSystem.make(contents)` used as a `FileSystem`) until a runtime `TypeError` surfaced it.

## What Didn't Work

- Reading the lint findings as lint-config noise. They were the only signal that the test files resolved no types at all.
- Adding `"node"` to `npm-package`'s `types`. That package's source is deliberately Node-free (`types: []`, plus a local `declare const Buffer` beside `Package`), and widening `types` for the whole project would erase that guarantee.
- Importing `Buffer` from `node:buffer` in `effect-memfs`. The lint gate rejects it with `eslint(no-restricted-imports)` and `effecttsgo(node-builtin-import)`.

## Solution

1. Put the tests in the project: `"include": ["src", "tests"]` in each package's `tsconfig.json`. `tsconfig.build.json` narrows `include` back to `src/**/*.ts`, so the emitted `dist` and `.d.ts` do not change.
2. Keep the dependency's source consumer-safe. Once a consumer's tests are type-checked, `tsc` compiles the dependency's `src/` through the source condition under the consumer's `compilerOptions`. `effect-memfs/src` used the ambient global `Buffer`, which `npm-package` (with `types: []`) cannot see. The fix went in the provider:
   - Byte buffers became `Uint8Array` (`Buffer` is a `Uint8Array` subclass, so the memfs driver's results still fit the narrower type).
   - One spot needed a real `Buffer`: memfs's `Superblock.fromJSON` treats a value that is not a string or `instanceof Buffer` as a directory. The mount instead writes an empty placeholder file through `fromJSON`, so memfs creates the parent folders, then writes the bytes with the volume's `writeFileSync`, which accepts a `Uint8Array`.

## Why This Works

A file outside `include` belongs to no configured program. `tsc -p` never checks it, and type-aware lint checks it with defaults that lack `customConditions`. A published-name import there then resolves through `types` to a `dist/` that a clean checkout does not have, and the import becomes an error type. Bringing the file into the project gives it the package's `customConditions`, so the import resolves to the dependency's source, the same module Vitest runs.

That same resolution makes the consumer compile the provider's source. Any ambient type the provider leans on (a global from `@types/node`, a `vitest/globals` reference) must also be present in every consumer's `types`. Otherwise the provider is not consumer-safe, and the error surfaces in the provider's files from inside the consumer's typecheck.

### Architectural Invariants

1. **Every importer is checked.** For each file $f$ that imports a workspace package by its published name: $f \in \text{include}(\texttt{tsconfig.json})$. Otherwise no program type-checks it, and the only signal is the lint's error-type findings.
2. **The provider's ambient types fit every consumer.** $\text{ambient}(\text{provider/src}) \subseteq \bigcap_{c} \text{types}(c)$. A source condition makes each consumer compile the provider's source, so the provider may lean only on globals that all consumers declare. With a `types: []` consumer, that intersection is empty.

Code smell to grep for: `"include": ["src"]` in a package that has a `tests/` directory, and bare `Buffer` (no import) in a package that exports a source condition.

## Prevention

- Any package whose `tests/` import a workspace package by its published name keeps `tests` in `tsconfig.json#include`. Delete the dependency's `dist/` and run the consumer's `typecheck` and `lint`. Both must pass.
- Provider source used through the source condition refers to no ambient global that a consumer with `types: []` lacks. Prefer `Uint8Array` and web-standard APIs over Node globals.

## Related Issues

- `docs/solutions/build-errors/turbo-verdicts-under-stale-cache-and-strict-env.md`: another way `check:local` goes green while code does not compile.
