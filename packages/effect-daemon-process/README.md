# @systemfsoftware/effect-daemon-process

The `@systemfsoftware/effect-daemon-spec` medium over operating-system child processes: a
supervised command spec spawned through a `ChildProcessSpawner`, its exit status and terminating
signal reported as observed, and its shutdown mapped onto SIGTERM and SIGKILL.

## Installation

```bash
pnpm add @systemfsoftware/effect-daemon-process
```

## Features

- **A command is the child.** The program is a `ChildProcess.Command` — argv, environment, cwd,
  inherited descriptors — and the medium spawns it once per incarnation through whichever
  `ChildProcessSpawner` the composition root provides.
- **Readiness read from standard output.** `readyLine` names the line that counts as ready; without
  it a child is ready as soon as it is spawned. Readiness is raced against the supervisor's start
  deadline like any other medium signal, and a child that never writes its line misses the deadline.
- **Exit status and signal reported as received.** A non-zero exit code and a signal death each
  become an `ExitReport`; a clean exit is `Normal`. Nothing claims a `Cause`, because a process does
  not hand one over.
- **The operating system's own signals.** `Brutal` sends SIGKILL at once, `Graceful` sends SIGTERM
  and lets the mode's window elapse before the force, and `Infinity` sends SIGTERM and waits for the
  child to end.
- **Proven against a real oracle.** `ProcessMedium.conformanceDriver` proves the medium against the
  fibre reference on the whole `Conformance.Scenarios` catalogue, with a Node fixture program whose
  control channel scripts the child's own stdin.

## Usage

```ts
import { NodeChildProcessSpawner, NodeFileSystem, NodePath } from '@effect/platform-node-shared'
import { ProcessMedium } from '@systemfsoftware/effect-daemon-process'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect, Layer } from 'effect'
import { ChildProcess } from 'effect/unstable/process'

const program = ChildProcess.make('node', ['server.js'], { env: { PORT: '8080' } })

const supervisor = Supervisor.make('api').pipe(
  Supervisor.children([
    Supervisor.ChildSpecs.on(ProcessMedium.port)('api', program, {
      restartType: 'transient',
      shutdown: { _tag: 'Graceful', millis: 5_000 },
      startTimeoutMillis: 2_000,
    }),
  ]),
)

const Api = Layer.provide(
  supervisor.layer,
  Layer.merge(
    ProcessMedium.layer({ readyLine: 'listening' }),
    NodeChildProcessSpawner.layer.pipe(Layer.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))),
  ),
)
```

`ProcessMedium.layer(options)` binds the port to a medium; the spawner stays the composition root's
choice, so the same supervisor runs on any platform that provides one. The medium reads `stdout` for
the readiness line, so a program that needs it should write it there.

## What an abnormal termination carries

The medium declares `{ reporting: 'exit', groupStop: 'atomic' }`, so every failure it reports is an
`ExitReport`:

| Child outcome                        | `code`        | `signal`                                                |
| ------------------------------------ | ------------- | ------------------------------------------------------- |
| A clean exit (`0`)                   | —             | — (reported as `Normal`)                                |
| Any other exit code                  | the exit code | empty — no signal ended it                              |
| Killed by a signal                   | `0`           | the signal the platform names, e.g. `SIGKILL`           |
| Stopped by the supervisor            | —             | — (reported as `Shutdown`)                              |
| A spawn failure, e.g. a missing file | —             | — (the start fails with the platform's `PlatformError`) |

## Stopping a child

`stop(evidence, mode)` latches the child's report as `Shutdown` before any signal goes out — the
ordering the fibre medium gives an interrupted fibre — and then sends the mode's signal. The stop
returns only once the platform's `kill` has awaited the process group's exit, which is what the
`atomic` declaration promises: no child is left running once the group stop returns.

## Proving the medium

```ts
const proof = Effect.gen(function*() {
  const report = yield* Conformance.prove(ProcessMedium.conformanceDriver({ fixturePath: './child-script.mjs' }))
  return Conformance.isConforming(report) // every scripted lifecycle matched the fibre reference
})
```

The driver launches `node <fixturePath>` once per incarnation, each with its own stdin channel.
`control.advance(step, generation)` writes the step to exactly that generation's child. A step
for an incarnation that has not started yet is held until it starts, so a child that is still
stopping can never take a step meant for its successor. `ProcessMedium.fixtureReadyLine`
(`READY`) is the line the fixture writes when a `BecomeReady` step reaches it, which is what a
medium under proof reads as readiness.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-process typecheck
pnpm --filter @systemfsoftware/effect-daemon-process lint
pnpm --filter @systemfsoftware/effect-daemon-process test
pnpm --filter @systemfsoftware/effect-daemon-process test:contract
pnpm --filter @systemfsoftware/effect-daemon-process build
```

## License

Apache-2.0
