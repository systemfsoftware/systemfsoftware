---
title: A lifecycle build that runs during install must resolve its compiler by module resolution, never through PATH
date: 2026-08-21
category: build-errors
module: arethetypeswrong-cli
problem_type: build_error
component: tooling
severity: high
symptoms:
  - "`corepack pnpm <script>` aborts mid-install; an immediate re-run of the same command succeeds"
  - "`[plugin rolldown-plugin-dts:generate] Error: spawn tsc ENOENT` during a package's `prepare` stage"
  - "`ELIFECYCLE  Command failed with exit code 1` attributed to a workspace package's `prepare`, not to the script the user invoked"
  - "the abort happens only when the module tree was purged and recreated, never on a warm tree"
root_cause: incorrect_dependency_resolution
resolution_type: config_change
tags:
  [
    pnpm,
    lifecycle-scripts,
    prepare,
    path-resolution,
    module-resolution,
    bin-linking,
    tsdown,
    rolldown-plugin-dts,
    declaration-emit,
    peer-keyed-store,
    verification-fidelity,
  ]
---

# A lifecycle build that runs during install must resolve its compiler by module resolution, never through PATH

## Problem & Observable Boundary

A workspace package whose `bin` points at gitignored build output must build that output from a `prepare`
script, because pnpm links bin shims around lifecycle scripts rather than before them (see
`docs/solutions/build-errors/pnpm-bin-shim-skipped-for-gitignored-build-target.md`). That build is
therefore legitimate and load-bearing. The defect is not that it runs — it is _how it locates its
compiler_. When the declaration generator is pinned to a bare command name, the lookup goes through
`PATH`, and during a from-scratch install the workspace `.bin` directory that would satisfy it does not
yet exist. The install aborts, and because the aborted pass already materialized the package tree, the
next invocation succeeds — making the failure look transient and scheduler-dependent when it is neither.

The boundary is exact: the failure requires a purged module tree. On a warm tree the bare name resolves
and nothing is observably wrong, so the hazard is invisible in local development and surfaces only on a
clean checkout, in CI, or when a package-manager deps-status check silently triggers a purge-and-recreate
behind an unrelated command such as a formatter.

## Mechanism & Failure Modes

1. **Pass ordering makes `PATH` a moving target.** Let $L_1$ be the first bin-link pass, $S$ the
   lifecycle scripts, and $L_2$ the second link pass. pnpm's ordering is $L_1 < S < L_2$. A tool $t$ is
   visible to a script in $S$ only if $t \in L_1$. Module resolution is immune to this ordering because
   it reads the materialized package tree, which precedes $L_1$ entirely. A bare-name lookup is not.

2. **A truthy generator option short-circuits generator selection.** In `rolldown-plugin-dts`,
   `resolveOptions` picks the declaration generator in precedence order: an explicit `tsgo` option wins
   first; otherwise `oxc` is selected when the `oxc` option or `isolatedDeclarations` is set; otherwise
   `tsgo` is selected when `isTS70Installed` holds; otherwise `tsc`. Supplying `dts.tsgo.path` therefore
   forces the `tsgo` generator _before_ any compiler-version test runs, which is why the failure is
   independent of which TypeScript the package resolves.

3. **The pin is passed to the process spawner verbatim.** `runTsgo` uses the supplied path when present
   and calls `getTsgoPathFromNodeModules` only when it is absent. The former spawns whatever string was
   configured; the latter resolves the compiler package and calls `getExePath`, which locates the
   platform binary by module resolution and verifies it exists. Both paths reach the same executable on
   a warm tree, so the pin buys a `PATH` dependency and two extra process hops for zero behavioural
   difference — and a hard failure on a cold one.

4. **Install-time and post-install builds use different compiler states.** The root `prepare` that
   patches the platform compiler runs _after_ the per-package `prepare` scripts, so declarations emitted
   during install come from the unpatched binary and declarations emitted by a later build come from the
   patched one. In the measured case both emitted identical declarations; the asymmetry is structural,
   not currently observable, and is recorded here because it bounds what an install-time artifact proves.

5. **Generator selection is coupled to an inherited compiler option.** Because `isolatedDeclarations` is
   resolved through the tsconfig `extends` chain, enabling it in a _shared_ preset silently moves every
   inheriting package from the `tsgo` generator to `oxc`. The absence of that option from a package's
   own config is not sufficient evidence of stability; the whole inherited chain is the input.

6. **A peer-keyed store can hold several instances of one tool version.** This is the mechanism that
   invalidates naive verification. The store addresses a package by name, version, _and peer identity_,
   so two `tsdown` instances of the same version can coexist differing only in which TypeScript they
   peer against. Since generator selection consults `isTS70Installed`, the instance decides the
   generator: the TypeScript 7 peer yields `tsgo` (native binary, spawned) and the TypeScript 6 peer
   yields `tsc` (in-process JS API, imported). Both exit 0 and both emit semantically identical
   declarations, differing only in member ordering — sorted versus declaration order — so the
   substitution is invisible to any check that does not compare bytes.

## Architectural Invariants & Universal Rules

**Invariant — Install-Time Tool Resolution.** A script that runs during dependency installation locates
every executable it needs by module resolution. A bare command name is a `PATH` lookup, and the `PATH` a
lifecycle script sees is populated around it, not before it. This also closes a trust boundary: a
bare-name lookup is steerable by anything that can prepend a directory, while module resolution is fixed
by the lockfile.

```ts
// Anti-pattern: a build-tool option whose value is a bare command name.
dts: {
  tsgo: {
    path: 'tsc'
  }
}

// Invariant: let the tool resolve its own compiler from the package tree.
dts: true
```

**Anti-pattern code smell.** An object property named `path`, `bin`, `command`, or `executable` whose
value is a string literal containing no path separator, inside a build-tool configuration. The AST shape
is a string-literal property value matching `/^[A-Za-z0-9_.-]+$/` — a name, not a location.

**Invariant — Resolution-Context Fidelity.** Verify a build-tool configuration change by driving the
package's own script. Addressing the tool by store path selects an instance whose peer graph may differ
from the one the package resolves, which can change the code path under test while both arms stay green.

```ts
// Non-sample: picks an arbitrary peer-keyed instance.
node <store>/<tool>@<version>_<peer-hash>/dist/run.mjs

// Valid sample: the resolution context the package actually uses.
pnpm --filter <package> build
```

**Invariant — Byte Equality Under a Held Compiler State.** When a change is claimed to be
behaviour-preserving, both samples must come from the same command against the same module-tree state.
An install-time build and a post-install build do not satisfy this, because the compiler is patched
between them (mechanism 4).

## Verification & Prevention

Two-sided, with the single variable isolated — the tool's presence on `PATH`:

- With the bare-name pin and a `PATH` that excludes the workspace `.bin`, the build fails with
  `spawn tsc ENOENT` attributed to `rolldown-plugin-dts:generate`. This reproduces the install-time
  condition in milliseconds without purging the module tree.
- With module resolution and the _same_ stripped `PATH`, the build succeeds, and its output is
  byte-identical to the same build run with a full `PATH` — which is what resolution independence means.
- Declaration hashes taken before and after the change, both through the package's own build script
  against one module-tree state, are identical; the emitted log names the compiler version so the sample
  records which generator produced it.

Prevention:

- **A lifecycle script never names an executable it does not resolve.** Bare names are for interactive
  shells, where `PATH` is a user's contract; in an install they are a race.
- **Deleting a bare-name pin is not equivalent to changing a compiler.** Confirm equivalence by hashing
  declarations from the package's own script on both sides, never from a store-addressed tool instance.
- **Treat an inherited `isolatedDeclarations` as a generator switch.** Enabling it in a shared tsconfig
  preset changes which compiler emits declarations for every inheriting package.
- **A green arm is not a matching arm.** Two declaration generators both exit 0 on this input; only a
  byte comparison distinguishes them.

## Related Issues

- `docs/solutions/build-errors/pnpm-bin-shim-skipped-for-gitignored-build-target.md` — establishes why
  the `prepare` build exists and must not be deleted. This document is the tool-_location_ axis of the
  same lifecycle window; that one is the tool-_existence_ axis. Neither supersedes the other.
- `docs/solutions/build-errors/pack-lifecycle-hooks-mutate-dist-mid-gate.md` — the pack-time half of the
  same lifecycle surface, and the source of the `prepack`-then-`prepare` ordering.
- `docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md` — why this
  package tree pins its own TypeScript line, which is what makes a peer-keyed store hold two instances
  of one tool version here.
- `docs/plans/2026-08-21-001-fix-attw-cli-dts-compiler-resolution-plan.md` — the plan this fix executed,
  including the alternatives rejected and the derivation of the generator-selection precedence.
