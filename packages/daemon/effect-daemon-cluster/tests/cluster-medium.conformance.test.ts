import { Conformance } from '@systemfsoftware/conformance-spec'
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance as Medium } from '@systemfsoftware/effect-daemon-conformance'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Match } from 'effect'
import type { Scope } from 'effect'
import type { Sharding } from 'effect/unstable/cluster'
import {
  ChildNotReportedAsInferredDeath,
  ChildReportedOtherThanShutdown,
  nothingLeftRegistered,
  RunningChildAnsweredDead,
  scriptedSharding,
} from './__fixtures__/scripted-sharding.fixture.js'

const Feature = makeFeature({ it })

type Project = ClusterMedium.ClusterMediumPort | Sharding.Sharding | Scope.Scope

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

const becomeReady: Medium.ChildStep = { _tag: 'BecomeReady' }

const shutdownOnly = (
  reason: Supervisor.Medium.TerminationReason,
): Effect.Effect<void, ChildReportedOtherThanShutdown> =>
  Match.value(reason).pipe(
    Match.tag('Shutdown', () => Effect.void),
    Match.tag('Normal', () => new ChildReportedOtherThanShutdown({ observed: 'Normal' })),
    Match.tag('Abnormal', () => new ChildReportedOtherThanShutdown({ observed: 'Abnormal' })),
    Match.exhaustive,
  )

const superviseScriptedSingleton: Effect.Effect<
  void,
  ChildReportedOtherThanShutdown | RunningChildAnsweredDead,
  Project
> = Effect.gen(function*() {
  const { medium } = yield* ClusterMedium.port
  const launched = yield* ClusterMedium.conformanceDriver.launch('worker', [becomeReady])
  yield* launched.control.advance(becomeReady, 0)
  const evidence = yield* medium.start(launched.program)
  yield* evidence.ready
  const alive = yield* medium.probe(evidence)
  if (!alive) return yield* new RunningChildAnsweredDead()
  yield* medium.stop(evidence, { _tag: 'Brutal' })
  yield* shutdownOnly(yield* medium.report(evidence))
})

const superviseScriptedEntity: Effect.Effect<void, RunningChildAnsweredDead, Project> = Effect.gen(function*() {
  const { medium } = yield* ClusterMedium.port
  const evidence = yield* medium.start(
    ClusterMedium.entityChild({
      entityId: 'orders/scripted',
      register: Effect.void,
      probe: Effect.succeed(true),
    }),
  )
  yield* evidence.ready
  const alive = yield* medium.probe(evidence)
  if (!alive) return yield* new RunningChildAnsweredDead()
})

const inferredDeathOnly = (
  reason: Supervisor.Medium.TerminationReason,
): Effect.Effect<void, ChildNotReportedAsInferredDeath> =>
  Match.value(reason).pipe(
    Match.tag('Abnormal', (abnormal) =>
      Match.value(abnormal.report).pipe(
        Match.tag('InferredReport', () => Effect.void),
        Match.orElse(() => new ChildNotReportedAsInferredDeath({ observed: 'a report other than inferred' })),
      )),
    Match.orElse(() => new ChildNotReportedAsInferredDeath({ observed: 'a termination other than abnormal' })),
  )

const superviseDyingEntity: Effect.Effect<void, ChildNotReportedAsInferredDeath, Project> = Effect.gen(function*() {
  const { medium } = yield* ClusterMedium.port
  const evidence = yield* medium.start(
    ClusterMedium.entityChild({
      entityId: 'orders/dying',
      register: Effect.die(new globalThis.Error('the entity died before it became ready')),
      probe: Effect.succeed(false),
    }),
  )
  yield* inferredDeathOnly(yield* medium.report(evidence))
})

Feature('Supervising children hosted by the cluster', { timeout: 120_000 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A scripted singleton child is gone once the supervision that started it stops',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'environment',
          () => Layer.build(Layer.merge(ClusterMedium.layer(), scriptedSharding)),
        ),
        When('a scripted singleton is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseScriptedSingleton, s.environment), {
              probe: Effect.provide(nothingLeftRegistered, s.environment),
            }),
        ),
        Then('the child answered its liveness probe and no name stays held once the supervision stops')((s, expect) =>
          expect(s.checked).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'An entity child that finishes registering is announced ready',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'environment',
          () => Layer.build(Layer.merge(ClusterMedium.layer(), scriptedSharding)),
        ),
        When('a child that finishes registering is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseScriptedEntity, s.environment), {
              probe: Effect.provide(nothingLeftRegistered, s.environment),
            }),
        ),
        Then('the child was announced ready and no name stays held once the supervision stops')((s, expect) =>
          expect(s.checked).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'An entity child that dies before it becomes ready is reported as an inferred death',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'environment',
          () => Layer.build(Layer.merge(ClusterMedium.layer(), scriptedSharding)),
        ),
        When('a child that dies before it becomes ready is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseDyingEntity, s.environment), {
              probe: Effect.provide(nothingLeftRegistered, s.environment),
            }),
        ),
        Then(
          'the death the medium cannot observe is reported as inferred, and no name stays held once the supervision stops',
        )((s, expect) => expect(s.checked).toMatchObject({ _tag: 'Pass' })),
      ),
    )
  })
