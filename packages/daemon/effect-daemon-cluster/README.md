# @systemfsoftware/effect-daemon-cluster

The `@systemfsoftware/effect-daemon-spec` medium over `effect/unstable/cluster`: cluster entities
and single-owner singletons are supervised with inferred death and eventual group stop.

## Installation

```bash
pnpm add @systemfsoftware/effect-daemon-cluster
```

## Features

- **Entities and single-owner singletons**: a child is either an entity reached by a direct liveness
  call, or a `Singleton.make`-style single-owner effect whose registration lifetime is the
  incarnation.
- **Inferred death, never `RunnerHealth`**: the medium's liveness probe calls the child directly;
  a failing singleton `run` becomes a defect, and a death the medium cannot observe is reported as
  an inferred failure.
- **The declared loss**: the medium declares `{ reporting: 'inferred', groupStop: 'eventual' }`, so
  the conformance kit holds it only to what it can observe and honour.
- **Proven, not asserted**: `ClusterMedium.conformanceDriver` runs the whole scenario catalogue
  against the fiber reference.

## Usage

```ts
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect } from 'effect'
import { SingleRunner } from 'effect/unstable/cluster'

const handleOrders = (ready: Effect.Effect<void>) => Effect.andThen(ready, serveOrders)

const spec = Supervisor.make('cluster-workers').pipe(
  Supervisor.children([
    Supervisor.ChildSpecs.on(ClusterMedium.port)(
      'orders',
      ClusterMedium.singletonChild({ name: 'orders', run: handleOrders }),
      { restartType: 'permanent' },
    ),
  ]),
)

// `ClusterRunner` is `SingleRunner.layer(options)` provided with a `SqlClient` and `Crypto`.
const program = work.pipe(
  Effect.provide(spec.layer),
  Effect.provide(ClusterMedium.layer()),
  Effect.provide(ClusterRunner),
)
```

`ClusterMedium.layer(options?)` binds the port at the composition root, so a tree can mix media;
`options.shardGroup` sets the shard group singleton children register under. An entity child is
declared with `ClusterMedium.entityChild({ entity, entityId, register, probe })`, where `probe` is
the direct liveness call to the entity.

## Conformance

```ts
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Effect } from 'effect'

const report = yield* Conformance.prove(ClusterMedium.conformanceDriver)
Conformance.isConforming(report)
```

## License

Apache-2.0
