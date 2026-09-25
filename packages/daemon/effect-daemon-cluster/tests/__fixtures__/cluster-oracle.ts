import { NodeCrypto } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Deferred, Effect, Exit, Layer, Scope } from 'effect'
import type { MessageStorage, Runners } from 'effect/unstable/cluster'
import { Sharding, SingleRunner } from 'effect/unstable/cluster'

const Cluster = SingleRunner.layer({
  shardingConfig: { shardsPerGroup: 1 },
  runnerStorage: 'memory',
}).pipe(
  Layer.provide(Layer.merge(Pglite.layer(), NodeCrypto.layer)),
  Layer.orDie,
)

export const ClusterOracle: Layer.Layer<
  | Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
  | ClusterMedium.ClusterMediumPort
  | Sharding.Sharding
  | Runners.Runners
  | MessageStorage.MessageStorage
> = Layer.mergeAll(Conformance.FiberReferenceLayer, ClusterMedium.layer(), Cluster)

export const warmUpCluster: Effect.Effect<void, never, Sharding.Sharding> = Effect.gen(function*() {
  const sharding = yield* Sharding.Sharding
  const started = yield* Deferred.make<void>()
  const registration = yield* Scope.make()
  yield* sharding
    .registerSingleton('cluster-medium-warmup', Deferred.succeed(started, void 0).pipe(Effect.andThen(Effect.never)))
    .pipe(Effect.provideService(Scope.Scope, registration))
  yield* Deferred.await(started)
  yield* Scope.close(registration, Exit.void)
})
