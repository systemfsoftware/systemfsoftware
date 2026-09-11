---
title: attw fixtures are constructed in memory, never read from committed tarballs
date: 2026-08-23
module: npm-package
problem_type: tooling_decision
component: fixtures
tags: [attw, arethetypeswrong, fixtures, snapshots, in-memory, tarball, memfs, silent-pass]
---

# attw fixtures are constructed in memory, never read from committed tarballs

## Context

The attw analysis tests (`@systemfsoftware/arethetypeswrong-core`, since moved out of this tree with the rest of the attw packages) previously fed its `checkPackage` entrypoint ~79 committed `.tgz` files plus 36 recorded JSON snapshots. The tarballs were opaque binaries that could not be reviewed, diffed, or constructed in memory; the snapshots embedded the TypeScript compiler version string (churn on every `catalog:attw` bump).

The fix publishes an in-memory package DSL on `@systemfsoftware/npm-package` (`packages/npm-package`, the tree half of the split):

- `createPackage` builds a `Package` from an authored file tree (relative keys prefix `/node_modules/<name>/`).
- `toDirectoryJSON` renders the same tree for an effect-memfs `DirectoryJSON`.
- `recipes` exports one synthetic package per `Problem` kind, plus a types-companion pair and a known-bad tree — it came from the private `arethetypeswrong-recipes` workspace package, which left this tree with the rest of attw.
- `packPackage` / `packTree` write tarball bytes in-process (ustar + `fflate` gzip, `mtime: 0`), so `createPackageFromTarballData` and the attw CLI's contract lane can construct their own inputs. The CLI has since left this tree; the pack/extract pair has not.

The snapshot suite then drove recipes (14 file snapshots) instead of extracting archives; committed fixture tarballs and the 36 published-package snapshots were deleted.

## Guidance

Two traps surfaced during review and both are load-bearing for anyone writing fixture/snapshot code here:

1. **A text-decode cache corrupts byte bodies.** `Package.tryReadFile` decodes `Uint8Array` bodies to a string with a non-fatal `TextDecoder` and caches the result. Routing a _pack/serialize_ path through `tryReadFile` therefore re-encodes a lossy string (`0xFF` etc. become `U+FFFD`) and mutates the package. A byte-preserving read (`tryReadBytes`, returning `string | Uint8Array` unchanged) must sit between the raw map and any packer; encode only `string` bodies. Verify with a byte-level round-trip assertion, not `tryReadFile` equality, because the original and extracted sides both go through the same lossy decode and would mask the corruption.

2. **A snapshot that self-generates from the system under test is a silent pass.** `toMatchFileSnapshot` writes the produced output on first run, so a recipe that regresses to zero problems still green-passes forever. The remedy is an independent assertion the byte snapshot cannot carry: assert each kind-named recipe's analysis reports its own `Problem` kind, and assert the recipe set covers every literal of the `ProblemKind` schema union — both the kind union and the recipes belong to the attw packages, which have left this tree. A parity gate keyed on the legacy input set is dead once that input is deleted in the same change — key coverage on the schema, not on the removed corpus.

## Applicability

Any place a test fixture is built in memory instead of read from a committed binary, and anywhere a recorded-snapshot test would otherwise certify its own regression. The two traps hold independently of ATTW: bytes vs. decode-cache ordering in a mutable file map, and schema-keyed coverage vs. self-satisfying snapshots.
