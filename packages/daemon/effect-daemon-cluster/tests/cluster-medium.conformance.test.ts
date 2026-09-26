import { Conformance } from '@systemfsoftware/conformance-spec'
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance as Medium } from '@systemfsoftware/effect-daemon-conformance'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match, Option, Scope } from 'effect'
import type { Sharding } from 'effect/unstable/cluster'
import {
  ChildNotReportedAsInferredDeath,
  ChildReportedOtherThanShutdown,
  RegistrationLedger,
  RunningChildAnsweredDead,
  scriptedSharding,
} from './__fixtures__/scripted-sharding.fixture.js'

const Feature = makeFeature({ it })

type Project = ClusterMedium.ClusterMediumPort | Sharding.Sharding | Scope.Scope

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

/** A fresh fake world per run: the medium bound to a scripted sharding that holds each registered name. */
const clusterWorld = Effect.gen(function*() {
  const scope = yield* Scope.make()
  return yield* Layer.buildWithScope(Layer.merge(ClusterMedium.layer(), scriptedSharding), scope)
})

const becomeReady: Medium.ChildStep = { _tag: 'BecomeReady' }

const reasonTag = (reason: Supervisor.Medium.TerminationReason): string =>
  Match.value(reason).pipe(
    Match.tag('Shutdown', () => 'Shutdown'),
    Match.tag('Normal', () => 'Normal'),
    Match.tag('Abnormal', (abnormal) => `Abnormal:${abnormal.report._tag}`),
    Match.exhaustive,
  )

const recorded = (reason: Supervisor.Medium.TerminationReason): Effect.Effect<void, never, RegistrationLedger> =>
  Effect.flatMap(Effect.service(RegistrationLedger), (ledger) => ledger.record(reasonTag(reason)))

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
  Project | RegistrationLedger
> = Effect.gen(function*() {
  const { medium } = yield* ClusterMedium.port
  const launched = yield* ClusterMedium.conformanceDriver.launch('worker', [becomeReady])
  yield* launched.control.advance(becomeReady, 0)
  const evidence = yield* medium.start(launched.program)
  yield* evidence.ready
  const alive = yield* medium.probe(evidence)
  if (!alive) return yield* new RunningChildAnsweredDead()
  yield* medium.stop(evidence, { _tag: 'Brutal' })
  const reason = yield* medium.report(evidence)
  yield* recorded(reason)
  yield* shutdownOnly(reason)
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

const superviseDyingEntity: Effect.Effect<
  void,
  ChildNotReportedAsInferredDeath,
  Project | RegistrationLedger
> = Effect.gen(function*() {
  const { medium } = yield* ClusterMedium.port
  const evidence = yield* medium.start(
    ClusterMedium.entityChild({
      entityId: 'orders/dying',
      register: Effect.die(new globalThis.Error('the entity died before it became ready')),
      probe: Effect.succeed(false),
    }),
  )
  const reason = yield* medium.report(evidence)
  yield* recorded(reason)
  yield* inferredDeathOnly(reason)
})

const releasedWithin = (
  expected: Option.Option<string>,
): Effect.Effect<void, Conformance.RuleBroken, RegistrationLedger> =>
  Effect.gen(function*() {
    const ledger = yield* Effect.service(RegistrationLedger)
    const names = yield* ledger.held
    if (names.length > 0) {
      return yield* new Conformance.RuleBroken({
        message: `${names.length} registered name(s) stay held after the stop: ${names.join(', ')}`,
      })
    }
    if (Option.isSome(expected)) {
      const reasons = yield* ledger.reasons
      const last = reasons[reasons.length - 1]
      if (last !== expected.value) {
        return yield* new Conformance.RuleBroken({
          message: `the child was reported ${last ?? 'nothing'}, not ${expected.value}`,
        })
      }
    }
  })

const clusterSpec = <E>(
  program: Effect.Effect<void, E, Project | RegistrationLedger>,
  expected: Option.Option<string>,
): Effect.Effect<Conformance.Report<never, never>> =>
  Conformance.stopped({
    unit: ClusterMedium.port,
    world: clusterWorld,
    program: (world) => Effect.provide(program, world),
    restart: (world) => Effect.provide(program, world),
    rule: (world) => Effect.provide(releasedWithin(expected), world),
    stopWithin: Duration.zero,
  })

const singletonScenario = { program: superviseScriptedSingleton, expected: Option.some('Shutdown') }

const entityScenario = { program: superviseScriptedEntity, expected: Option.none<string>() }

const dyingScenario = { program: superviseDyingEntity, expected: Option.some('Abnormal:InferredReport') }

Feature('Supervising children hosted by the cluster', { timeout: 0 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A scripted singleton child is gone once the supervision that started it stops',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'scenario',
          () => Effect.succeed(singletonScenario),
        ),
        When('a scripted singleton is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => clusterSpec(s.scenario.program, s.scenario.expected),
        ),
        Then('the child answered its liveness probe and no name stays held once the supervision stops')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'An entity child that finishes registering is announced ready',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'scenario',
          () => Effect.succeed(entityScenario),
        ),
        When('a child that finishes registering is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => clusterSpec(s.scenario.program, s.scenario.expected),
        ),
        Then('the child was announced ready and no name stays held once the supervision stops')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'An entity child that dies before it becomes ready is reported as an inferred death',
      Gherkin.Do.pipe(
        Given('a cluster medium bound to a scripted sharding that holds each registered name')(
          'scenario',
          () => Effect.succeed(dyingScenario),
        ),
        When('a child that dies before it becomes ready is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => clusterSpec(s.scenario.program, s.scenario.expected),
        ),
        Then(
          'the death the medium cannot observe is reported as inferred, and no name stays held once the supervision stops',
        )((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )
  })
