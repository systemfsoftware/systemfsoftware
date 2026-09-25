# @systemfsoftware/effect-daemon-microvm

A microVM medium for [`@systemfsoftware/effect-daemon-spec`](../effect-daemon-spec): a supervision
tree supervises a workload running inside a hardware-isolated microVM, booted through
[`@systemfsoftware/effect-microsandbox`](../../effect-microsandbox). One incarnation is one booted
sandbox running one workload; the incarnation's scope owns the sandbox, so closing it leaves no
virtual machine behind.

The package also ships the conformance driver for that medium, so any scenario in
`@systemfsoftware/effect-daemon-conformance` can be run against a real microVM and compared with the
in-process fiber reference.

## Installation

```bash
pnpm add @systemfsoftware/effect-daemon-microvm @systemfsoftware/effect-daemon-spec
```

## Quick start

A program names an image and the workload to run in it. `readyOnStdout` is the text the workload
writes to stdout when it is ready for work; a workload that names none is ready as soon as it
starts.

```ts
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'

const workload = new MicroVMMedium.MicroVMWorkload({
  image: 'alpine:3.20',
  command: ['sh', '-c', 'printf ready; exec sleep 3600'],
  readyOnStdout: 'ready',
})

const tree = Supervisor.make('worker').pipe(
  Supervisor.children([
    Supervisor.ChildSpecs.on(MicroVMMedium.port)('worker', { workload }, {
      restartType: 'permanent',
      shutdown: { _tag: 'Graceful', millis: 5_000 },
    }),
  ]),
)

const supervised = Effect.scoped(tree.scoped).pipe(
  Effect.provide(
    Layer.mergeAll(MicroVMMedium.layer(), nodeServicesLayer, Readiness.NodeHostProber.layer),
  ),
)
```

`MicroVMMedium.layer(options)` binds the port; `MicroVMMedium.declaration` states what the medium
can report (`reporting: 'exit'`) and honour (`groupStop: 'atomic'`). A program may also carry
`stdin`, a stream of bytes the medium writes to the workload's stdin.

## What the medium reports

- `start` boots the image as a sandbox and starts the workload inside it. The returned evidence is
  ready when the workload writes its readiness token, which the kernel races against the child's
  start deadline.
- `report` resolves with the workload's exit code: `0` is a normal termination, anything else is an
  abnormal termination carrying an `ExitReport`. Microsandbox's exec channel reports no signal
  number, so the report's `signal` field says `unreported` rather than guessing.
- `probe` is a single liveness check against the guest agent.
- `stop` follows the declared mode through microsandbox's own teardown: `brutal` kills, a timed
  `graceful` stop escalates to a kill when its budget elapses, and `infinity` waits for a graceful
  stop without forcing. Closing the incarnation's scope destroys the sandbox and its record.

A workload cannot observe a graceful stop: the medium stops the sandbox, not the workload. The
declared shutdown mode decides how long a graceful stop is given.

## Conformance

```ts
const proof = Effect.gen(function*() {
  const report = yield* Conformance.prove(MicroVMMedium.conformanceDriver(workload))
  return Conformance.isConforming(report)
})
```

`conformanceDriver(workload)` returns a driver whose control channel is the workload's stdin:
`MicroVMMedium.ChildStepLines` maps each scripted step to the line that step sends.

| Step                 | Line on the workload's stdin |
| -------------------- | ---------------------------- |
| `BecomeReady`        | `ready`                      |
| `ExitNormal`         | `exit-normal`                |
| `ExitAbnormal`       | `exit-abnormal`              |
| `IgnoreGracefulStop` | `ignore-graceful-stop`       |
| `NeverBecomeReady`   | `never-become-ready`         |

The driver declares `scenario: { millis: 60_000, startTimeoutMillis: 3_000 }`, because a VM boot
costs more than the catalogue's in-process start timeouts.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-microvm typecheck
pnpm --filter @systemfsoftware/effect-daemon-microvm test
pnpm --filter @systemfsoftware/effect-daemon-microvm test:contract   # needs /dev/kvm
pnpm --filter @systemfsoftware/effect-daemon-microvm build
```

`test:contract` runs the `contract` project and needs hardware virtualization. On a host without an
accessible `/dev/kvm` it skips, naming the reason in every skipped suite title; `test` runs the
`unit` and `conformance` projects and never boots a VM. In CI (`CI` set) a missing `/dev/kvm` fails
the contract project from its `globalSetup` instead — `.github/workflows/reusable-contract.yml`
grants access to it.

### Fixture provenance

The contract suite's fixture workload is `sh` in `alpine:3.20`, pinned by content digest:

```
alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
```

That is the index digest Docker Hub's registry reported for the `3.20` tag on 2026-09-24, read with
`HEAD https://registry-1.docker.io/v2/library/alpine/manifests/3.20` and the `docker-content-digest`
header (media type `application/vnd.oci.image.index.v1+json`). The script the fixture runs is
`tests/__fixtures__/child-script.ts`, built from `MicroVMMedium.ChildStepLines`.

## License

Apache-2.0
