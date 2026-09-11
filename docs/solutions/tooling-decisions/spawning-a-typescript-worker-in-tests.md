---
title: Spawn the built worker entry, never a TypeScript loader
date: 2026-09-11
category: tooling-decisions
module: stryker-js worker spawn
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - A child process must run this repo's own TypeScript source instead of built output
  - A launcher has to choose between a built entry and a source entry
  - Something is about to be added to the command line a worker child is spawned with
related_components:
  - packages/stryker-js/stryker-js-engine
  - packages/stryker-js/stryker-js-cli
tags:
  - child-process
  - worker
  - spawn
  - typescript-loader
  - node-type-stripping
  - tsdown
  - esm
---

# Spawn the built worker entry, never a TypeScript loader

## Context

The engine's worker IPC channel spawns a child process that hosts the RPC server for checkers and test runners.
Production spawns a built entry, and this repo's own tests must exercise that same path — so the temptation is to point
the spawn at the `.ts` source and give the child a way to execute TypeScript. This record rejects that and states the
arrangement that holds.

The engine declares two ports. `WorkerLauncherShape.spawn` takes an `entryUrl` and starts one child for it;
`WorkerEntriesShape` carries the URLs of the entry files (`checkerWorkerUrl`, `testRunnerWorkerUrl`). The engine knows
no dist layout and imports no host module — the process entry that starts it supplies the addresses its own build
emitted.

## Guidance

Spawn the built entry, unconditionally, with no loader in sight.

**Invariant — one built file per spawn.** The child a test starts is the child a consumer starts: the entry is emitted
by the build, addressed through a port, and spawned with nothing but the runtime's executable, the caller's Node
arguments, and that entry.

`@systemfsoftware/stryker-js-cli` declares the worker entries in its tsdown entry map — the `Checker.worker` and
`child-process-test-runner-worker` entry files, emitted as `.mjs` — and lists them in tsdown's `exports.exclude`, so
they are deliberate no-export entries that never resolve as package specifiers. `workerEntriesLayer` binds their URLs to
the engine's `WorkerEntries`; `nodeWorkerLauncherLayer` spawns one with `ChildProcess.make(process.execPath,
[...execArgv, entryPath])` — the runtime's own executable, the Node arguments the caller configured (`checkerNodeArgs`,
`testRunnerNodeArgs`), and the built entry path. Nothing else rides that command line.

Because the entry URL resolves relative to the built module, the CLI's container integration tests — which drive the
published `stryker` bin, the same build artifact a consumer runs — spawn exactly the entry production spawns. Tests and
production meet on one file, and no from-source branch is left to keep in step.

## Candidates

**Node's own type stripping** (zero dependencies). Node strips types from 22.6 on, and does it with no flag by 24. It
loses anyway: this tree's modules import each other through `.js` specifiers that resolve to `.ts` files on disk, and
type stripping performs no such remap — `WorkerLauncher.ts` importing `./Worker.schema.js` is one such import. Measured,
not assumed: with plain `node`, the worker suite failed with `Timeout waiting for worker to connect`, because the child
died on its first import.

**`tsx` as a devDependency** (one dependency, dev-only). It handles the `.js` → `.ts` remap and stays out of the
published package.

**A network fetch** (`npx --yes tsx`). It fetches and executes whatever the registry serves on every worker start, in
the hot path of the subsystem whose whole purpose is to stop depending on unmaintained npm packages. It was not free
either: removing it took the worker suite, then three cases, from 8.68s to 2.87s, because each spawn had been
resolving packages before the worker could start. A launcher never fetches.

**Spawn the built entry** (the decision). Exercises the exact runtime and the exact file production uses, and needs no
loader at all.

## Why This Matters

A loader is a second runtime between the test and the thing under test. Type stripping, a `tsx` import, or an `npx`
fetch all mean the suite proves something about a path production never takes, so a resolution or transform difference
surfaces as a worker that will not boot. Spawning the built entry deletes the question: the child the test starts is the
child the adopter gets, and its only inputs are the runtime's executable, the caller's Node arguments, and one emitted
file.

## When to Apply

- A child process must run TypeScript from this repo: emit an entry in the build instead of teaching the child a loader.
- A launcher would have to choose between a built and a source entry: do not offer the branch. Declare the entry in the
  build, exclude it from `exports`, and pass its URL through a port.
- Something is about to join the spawn command line: only the caller's Node arguments and the entry path belong there.
- A `dist`-free path looks necessary: treat that as a build gap, never as a reason for a loader.

## Related

- [Stryker engine package split plan](../../plans/2026-09-01-0823-refactor-stryker-engine-package-split-plan.md) — cites
  this record as the pattern "spawn the built dist entry".
- [Composition root cannot self-detect as entry](../build-errors/composition-root-cannot-self-detect-as-entry.md) — a
  worker entry is a dedicated no-export entry.
