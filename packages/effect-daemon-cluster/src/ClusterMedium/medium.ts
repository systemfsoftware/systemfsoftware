import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Cause, Deferred, Duration, Effect, Exit, Layer, Match, Option, Scope } from 'effect'
import { Sharding } from 'effect/unstable/cluster'
import type { ClusterProgram, ClusterProgramRequirements, EntityChild, SingletonChild } from './ClusterProgram.js'

export type ClusterMediumRequirement = ClusterProgramRequirements

export const declaration: Supervisor.Medium.MediumDeclaration = {
  reporting: 'inferred',
  groupStop: 'eventual',
}

const LIVENESS_PROBE_MILLIS = 1_000

const ClusterStartedTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-cluster/ClusterMedium/Started')
type ClusterStartedTypeId = typeof ClusterStartedTypeId

interface ClusterStarted extends Supervisor.Medium.Started {
  readonly [ClusterStartedTypeId]: ClusterStartedTypeId
  readonly registration: Scope.Closeable
  readonly ended: Deferred.Deferred<Exit.Exit<void, never>>
  readonly probe: Effect.Effect<boolean, never, ClusterMediumRequirement>
}

const clusterStarted = (
  ready: Effect.Effect<void>,
  registration: Scope.Closeable,
  ended: Deferred.Deferred<Exit.Exit<void, never>>,
  probe: Effect.Effect<boolean, never, ClusterMediumRequirement>,
): ClusterStarted => ({
  ...Supervisor.Medium.started(ready),
  [ClusterStartedTypeId]: ClusterStartedTypeId,
  registration,
  ended,
  probe,
})

const isClusterStarted = (evidence: Supervisor.Medium.Started): evidence is ClusterStarted =>
  ClusterStartedTypeId in evidence

const clusterOf = (evidence: Supervisor.Medium.Started): Option.Option<ClusterStarted> =>
  Option.filter(Option.some(evidence), isClusterStarted)

const shutdownTermination: Supervisor.Medium.TerminationReason = { _tag: 'Shutdown' }
const normalTermination: Supervisor.Medium.TerminationReason = { _tag: 'Normal' }
const inferredDeath: Supervisor.Medium.TerminationReason = {
  _tag: 'Abnormal',
  report: { _tag: 'InferredReport', failedProbes: 1 },
}

const terminationOf = (exit: Exit.Exit<void, never>): Supervisor.Medium.TerminationReason =>
  Exit.match(exit, {
    onSuccess: () => normalTermination,
    onFailure: (cause) => (Cause.hasInterruptsOnly(cause) ? shutdownTermination : inferredDeath),
  })

const startSingleton = (
  program: SingletonChild<ClusterMediumRequirement>,
  shardGroup: string | undefined,
): Effect.Effect<ClusterStarted, never, ClusterMediumRequirement> =>
  Effect.gen(function*() {
    const evidenceScope = yield* Effect.scope
    const registration = yield* Scope.fork(evidenceScope)
    const signalled = yield* Deferred.make<void>()
    const ended = yield* Deferred.make<Exit.Exit<void, never>>()
    const sharding = yield* Sharding.Sharding
    const run = program.run(Deferred.succeed(signalled, void 0)).pipe(
      Effect.onExit((exit) => Effect.asVoid(Deferred.succeed(ended, exit))),
    )
    yield* sharding.registerSingleton(program.name, run, { shardGroup }).pipe(
      Effect.provideService(Scope.Scope, registration),
    )
    const probe = Deferred.isDone(ended).pipe(Effect.map((done) => done === false))
    return clusterStarted(Deferred.await(signalled), registration, ended, probe)
  })

const startEntity = (
  program: EntityChild<ClusterMediumRequirement>,
): Effect.Effect<ClusterStarted, never, ClusterMediumRequirement> =>
  Effect.gen(function*() {
    const evidenceScope = yield* Effect.scope
    const registration = yield* Scope.fork(evidenceScope)
    const signalled = yield* Deferred.make<void>()
    const ended = yield* Deferred.make<Exit.Exit<void, never>>()
    const watch = Effect.gen(function*() {
      const exit = yield* Effect.exit(program.register.pipe(Effect.provideService(Scope.Scope, registration)))
      yield* Exit.match(exit, {
        onSuccess: () => Effect.asVoid(Deferred.succeed(signalled, void 0)),
        onFailure: () => Effect.asVoid(Deferred.succeed(ended, exit)),
      })
      return yield* Effect.never
    })
    yield* Effect.forkIn(watch, evidenceScope)
    const probe = program.probe.pipe(
      Effect.timeoutOption(Duration.millis(LIVENESS_PROBE_MILLIS)),
      Effect.map((answered) => Option.getOrElse(answered, () => false)),
    )
    return clusterStarted(Deferred.await(signalled), registration, ended, probe)
  })

const startOf = (
  program: ClusterProgram,
  shardGroup: string | undefined,
): Effect.Effect<ClusterStarted, never, ClusterMediumRequirement> =>
  Match.value(program).pipe(
    Match.tag('Singleton', (child) => startSingleton(child, shardGroup)),
    Match.tag('Entity', (child) => startEntity(child)),
    Match.exhaustive,
  )

const reportOf = (evidence: Supervisor.Medium.Started) =>
  Option.match(clusterOf(evidence), {
    onNone: () => Effect.succeed(shutdownTermination),
    onSome: (self) => Deferred.await(self.ended).pipe(Effect.map(terminationOf)),
  })

const probeOf = (
  evidence: Supervisor.Medium.Started,
): Effect.Effect<boolean, never, ClusterMediumRequirement> =>
  Option.match(clusterOf(evidence), {
    onNone: () => Effect.succeed(false),
    onSome: (self) => self.probe,
  })

const stopOf = (
  evidence: Supervisor.Medium.Started,
): Effect.Effect<Supervisor.Medium.Stopped, never, ClusterMediumRequirement> =>
  Option.match(clusterOf(evidence), {
    onNone: () => Effect.succeed(Supervisor.Medium.stopped),
    onSome: (self) => Effect.as(Scope.close(self.registration, Exit.void), Supervisor.Medium.stopped),
  })

export interface ClusterMediumOptions {
  readonly shardGroup?: string | undefined
}

export const mediumFor = (
  options: ClusterMediumOptions,
): Supervisor.Medium.Medium<ClusterProgram, never, ClusterMediumRequirement> =>
  Supervisor.Medium.make<ClusterProgram, never, ClusterMediumRequirement>({
    declaration,
    start: (program) => startOf(program, options.shardGroup),
    report: reportOf,
    probe: probeOf,
    stop: stopOf,
  })

export type ClusterMediumPort = Supervisor.Medium.MediumPortShape<
  ClusterProgram,
  never,
  ClusterMediumRequirement
>

export const port = Supervisor.Medium.MediumPort<ClusterProgram, never, ClusterMediumRequirement>('ClusterMedium')

export const layer = (options?: ClusterMediumOptions): Layer.Layer<ClusterMediumPort> =>
  Layer.succeed(port, { medium: mediumFor(options ?? {}) })
