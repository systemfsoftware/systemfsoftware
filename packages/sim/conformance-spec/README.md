# @systemfsoftware/conformance-spec

Concurrency conformance checks for [Effect](https://github.com/Effect-TS/effect) v4:
judge a real implementation's concurrent behaviour against a pure model through
its public operations, under the
[`@systemfsoftware/effect-sim-kernel`](../effect-sim-kernel#readme)'s generated
schedules. The kernel owns the in-process execution environment; this package
owns the judgement, never the reverse.

## Install

```bash
pnpm add @systemfsoftware/conformance-spec effect
```

## Usage

```ts
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Effect } from 'effect'

const report = await Effect.runPromise(
  Conformance.linearizable(implementation, {
    commands: Commands, // an Effect Schema; every command list is generated from it
    model: { state: ModelState, initial: emptyModel, step: nextState }, // pure, Schema-declared state
    run: (command) => runOne(implementation, command), // one public operation
    fibers: 2,
    operations: 4,
  }),
)
```

`Conformance.linearizable` is dual: `linearizable(implementation, spec)` and
`linearizable(spec)(implementation)` are the same check. It forks `fibers` workers
that issue generated commands through the real implementation as a Layer,
records each command's invocation and response in a harness-owned history, and
judges every history the kernel's preemption-bounded search produces against
the model. The first failing history shrinks to a minimal failing schedule and
command sequence, both replayable from the reported seed and path.

Pass and failure are data: a `Pass` carries the bound it explored (fibers,
operations, preemptions, depth, runs, pruning); a `Fail` carries the R10
judgement, the shrunk schedule, each fiber's operations with their observed
responses, and the bound. `Conformance.render` turns either into the text a run
log shows, and a test that asserts on the report passes it as the assertion's
message — `expect(report, Conformance.render(report)).toMatchObject({ _tag: 'Pass' })` —
so a rejection leads the failure with what broke instead of a matcher diff.

The model state must be a Schema value with structural `Equal` and `Hash`
equality, so the search can memoise on model states. A model that pins its
state to one object by reference is rejected at definition with a
`Conformance.ModelError` before any schedule runs.

## Sequential model check

```ts
const report = await Effect.runPromise(
  Conformance.sequential(implementation, {
    commands: Commands, // an Effect Schema; every sequence is generated from it
    model: { state: ModelState, initial: emptyModel, precondition: mayRun, step: nextState },
    run: (command) => runOne(implementation, command), // one public operation
    sequences: 1000,
    operations: 10,
  }),
)
```

`Conformance.sequential` is dual: `sequential(implementation, spec)` and
`sequential(spec)(implementation)` are the same check. It runs each generated
sequence on one fiber under the kernel's zero-preemption schedule, skipping
commands the model's precondition refuses, and compares every response with
the model. A divergence names the first step the model stopped explaining,
and the failing sequence shrinks to the shortest one that still diverges with
the schedule fixed.

## Interruption-release check

```ts
const report = await Effect.runPromise(
  Conformance.released(program, { probe }), // the probe fails while the resource is still held
)
```

`Conformance.released` is dual: `released(program, spec)` and
`released(spec)(program)` are the same check. It runs the program once to
count the steps it passes through, then once per step with the program
interrupted there and its scope closed. The probe — any effect, so a real
temporary file on disk reads as well as a fresh `tryAcquire` — runs after
each interruption; the first step that leaves something held fails with the
`interruption-left-held` judgement naming that step. A program that settles
nowhere reports how many interruption points were tried in its pass bound.

## When a check runs and when it does not

A `.conformance.test.ts` calls a check from its own scenario body, and the
feature declares itself live:

```ts
Feature('Proving concurrent callers against a pure model')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself')
  .body(({ scenario }) => { ... })
```

A scenario that drives the simulation kernel cannot itself run inside a kernel
run, so the live declaration keeps it on the live clock with the reason named.

## Development

```bash
pnpm --filter @systemfsoftware/conformance-spec test
pnpm --filter @systemfsoftware/conformance-spec lint
pnpm --filter @systemfsoftware/conformance-spec typecheck
pnpm --filter @systemfsoftware/conformance-spec build
```
