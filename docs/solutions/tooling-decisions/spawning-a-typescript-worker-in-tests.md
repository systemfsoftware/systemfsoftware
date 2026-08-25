# Spawning a TypeScript worker entry in this repo's own tests

The worker IPC channel in `@systemfsoftware/stryker-js-mutation-run` spawns a child
process that runs `child-process-proxy-worker-main`. Production spawns the built
`dist/*.mjs` entry, resolved through the package's `exports`. This repo's own test
run has no `dist`, so it spawns the `.ts` source — and something has to execute
TypeScript in that child.

## Candidates

**Node's own type stripping** (zero dependencies). Node strips types from 22.6 on,
and 24 does it with no flag — verified on this machine, `node file.ts` runs. It
still loses: the worker's imports name `./worker-protocol.schema.js` specifiers
that resolve to `.ts` files on disk, and type stripping does not perform that
remap. Measured, not assumed: with plain `node`, `Should_ReturnDerivedValue_When_EchoCalled`
fails with `Timeout waiting for worker to connect` because the child dies on its
first import.

**Spawn the built `dist` entry** (zero dependencies). Strictly the best end state:
the test then exercises the exact runtime and the exact file production uses, and
needs no loader at all. It loses _today_ only because `mutation-run` does not yet
build — the container removal is mid-flight — so the test could not run.

**`tsx` as a devDependency** (one dependency, dev-only). Handles the `.js` → `.ts`
remap, is pinned in the lockfile, and is absent from the published package, so no
adopter ever resolves it.

## Decision

`tsx`, as a devDependency, invoked as `node --import tsx <entry>`.

The deciding criterion was: prove the real worker main works, today, without
fetching anything at run time. Node's stripping fails that on the second clause of
"works"; `dist` fails it on "today".

## What this replaced, and why it mattered

The first implementation shelled out to `npx --yes tsx`. That fetches and executes
whatever the registry serves, on every worker start, in the hot path of the
subsystem whose entire purpose is to stop depending on unmaintained npm packages.
It also meant the tests drove a runtime production never uses.

It was not free either: removing it took the three-case suite from 8.68s to 2.87s,
because each spawn had been doing package resolution before the worker could start.

## The observation that reverses this

`pnpm --filter @systemfsoftware/stryker-js-mutation-run build` exiting 0.

At that point the second candidate becomes available: point the spawn at the
resolved `dist` entry unconditionally, delete the `fromSource` branch in
`child-process-proxy.ts`, and drop `tsx` from `devDependencies`. The test then
exercises production's runtime, which is what it should have done all along.
