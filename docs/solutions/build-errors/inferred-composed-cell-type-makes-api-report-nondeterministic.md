---
title: "An exported composed Cell must declare its type, or the self-hosted API report reorders its error union between builds"
date: 2026-09-22
last_updated: 2026-09-25
category: build-errors
module: api-extractor
problem_type: build_error
component: tooling
severity: medium
symptoms:
  - "`pnpm --filter @systemfsoftware/api-extractor build` leaves `etc/api-extractor.api.md` modified on some builds and clean on others, with no source change"
  - "the only diff is the member order inside the error-channel union of the exported `Extractor.cell` type"
  - "`md5sum etc/api-extractor.api.md` alternates between two or more hashes across repeated identical builds"
  - "`api:check` passes locally and fails in CI (or the reverse) on the same commit"
root_cause: type_definition_drift
resolution_type: code_fix
tags:
  - api-extractor
  - api-report
  - declaration-emit
  - tsdown
  - type-inference
  - union-order
  - effect-cell-types
  - determinism
---

# An exported composed Cell must declare its type, or the self-hosted API report reorders its error union between builds

## Problem

`@systemfsoftware/api-extractor` builds itself, then runs its own CLI over its own emitted declarations to regenerate its committed API report. Its `build` runs the engine in verification mode through `api:check`, which invokes `node dist/main.mjs run --quiet`. After the two Sandwich cells were composed into the exported `Extractor.cell` as `announceRun` piped through `Cell.andThen(extractApi)`, the report changed on some builds but not others, and could never be committed in a stable state.

## Symptoms

- Four back-to-back `pnpm --filter @systemfsoftware/api-extractor build` runs produced three distinct report hashes.
- `diff` between two builds showed only one changed line: the same members of the `Cell.Cell<ExtractorRunInput, ExtractionDecision, PlatformError | ConfigFileNotFound | ... , ...>` error union, in a different order.

## What Didn't Work

- Running the built CLI once, then again over the same `dist/`, produced identical reports. The analyzer is deterministic for a fixed input. The variation is in the emitted `.d.ts`, not in API Extractor.

## Solution

Declare the type of the exported composition `Extractor.cell` in `run-extractor.ts`. Declaration emit then copies the written annotation instead of printing the union the type checker inferred:

```ts
export const cell: Cell.Cell<
  ExtractorRunInput,
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler
> = announceRun.pipe(Cell.andThen(extractApi))
```

The `Extractor` namespace re-exports `cell` from this module; the written annotation is what reaches the report. After the fix, eight consecutive builds produced one report hash.

## Why This Works

With no annotation, the declaration emitter prints the inferred type of `announceRun.pipe(Cell.andThen(extractApi))`. That error channel is a union the checker assembles from both cells' error channels. The checker orders union members by internal type identity, which depends on the order it happened to create those types. [inference: the creation order differs between the declaration-emit passes of repeated builds; this was observed as alternating output, and the checker internals were not traced.] A written annotation is emitted as written, so its order is fixed by the source text. The named `ExtractorError` alias also keeps the report readable.

## Architectural Invariants

- **Public types of generated artifacts are written, never inferred.** Any exported binding whose type a byte-compared artifact renders (an API report, a `.d.ts` rollup, a snapshot) carries a written annotation. Inference may produce the value; the annotation fixes the printed type.
- **A union's print order is not a property of its source text** unless someone wrote that union in the source. An inferred union is ordered by checker internals, so two builds that are semantically identical can still differ in bytes.

Code smell to grep for: `export const <name> = <a>.pipe(` or `export const <name> = <Combinator>(` with no `:` type annotation, in a package that commits an `*.api.md` report.

## Prevention

- Any exported value whose type comes from combinators (`pipe`, `Cell.andThen`, `Layer.merge`, and similar) and ends up in an API report needs a written type annotation. The annotation looks redundant to the type checker, but it is what keeps the report stable. Do not delete it as "inferable".
- To check a report for determinism, run the package's real `build` several times and compare hashes: `for i in 1 2 3 4 5 6 7 8; do pnpm --filter <pkg> build >/dev/null 2>&1; md5sum <pkg>/etc/<name>.api.md; done | sort | uniq -c`. Running the analyzer repeatedly over one fixed `dist/` does not reproduce the flake.

## Related Issues

- `docs/solutions/build-errors/install-time-tool-resolution-must-not-use-path.md`: another case where two declaration emits are semantically identical but differ in member order, which only a byte comparison catches.
