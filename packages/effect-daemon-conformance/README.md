# @systemfsoftware/effect-daemon-conformance

Pairwise conformance for `@systemfsoftware/effect-daemon-spec` media: scripted child lifecycles, a
medium-independent scenario catalogue, trace projection to a medium's declaration, and a comparison
against the fiber reference.

## Installation

```bash
pnpm add @systemfsoftware/effect-daemon-conformance
```

## Features

- **Medium-independent scenarios**: `Conformance.Scenarios` holds supervision-tree shapes and
  per-child `ChildScript`s — become ready, exit normal, exit abnormal, ignore a graceful stop, never
  become ready — with a control sequence that drives them.
- **One call to prove a medium**: `Conformance.prove(driver)` runs the whole catalogue against the
  fiber reference and returns one `ConformanceReport`.
- **Declared loss, not assumed**: both traces are projected through the medium's
  `MediumDeclaration` — its reporting level and group-stop guarantee — before comparison, so a
  medium is held only to what it can observe and honour.
- **Typed mismatches**: `Conformance.compare(reference, candidate, declaration)` returns
  `TracesConform` or `TracesDiverge`, and a divergence names the scenario, the medium and the first
  diverging index.
- **A medium declares its own margins**: a driver whose start costs real time — a VM boot, a process
  spawn — declares `scenario: { millis, startTimeoutMillis }`. Both sides of every comparison then
  run with each child role's start timeout raised to at least `startTimeoutMillis`, and each side is
  bounded by `millis` instead of the catalogue's five seconds.

## Usage

```ts
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Effect } from 'effect'

const report = yield* Conformance.prove({
  name: 'process',
  declaration: { reporting: 'exit', groupStop: 'atomic' },
  port: ProcessMedium.port,
  launch: (childId, script) =>
    Effect.succeed({
      program: processSpecOf(childId, script),
      control: { advance: (step, generation) => writeStepToChild(childId, generation, step) },
    }),
}).pipe(Effect.provide(ProcessMedium.layer(options)))

Conformance.isConforming(report)
```

`launch` turns a `ChildScript` into the medium's own program and hands back the control channel that
advances it — a queue for the fiber reference, stdin or a fixture socket for another medium. The
control channel reaches the child directly and never the supervisor's mailbox, so no control step
appears in a trace.

A step is addressed to the generation of the incarnation it is for. A medium whose incarnation stops
its own consumer when the kernel stops it may ignore the generation, as the fiber reference does; a
medium whose channel outlives the stop it was told about must not, or the step a restarted child is
for reaches the incarnation on its way out.

The reference is `Conformance.FiberReference`, proven against itself by construction:

```ts
Conformance.prove(Conformance.FiberReference).pipe(Effect.provide(Conformance.FiberReferenceLayer))
```

## License

Apache-2.0
