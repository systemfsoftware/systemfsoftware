import { it } from '@effect/vitest'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Duration, Effect, Layer, Match } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { PlantedMedium, PlantedMediumLayer } from './__fixtures__/planted-medium.js'

const namingMedium = (result: Conformance.ScenarioResult): ReadonlyArray<string> =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) =>
      Match.value(compared.comparison).pipe(
        Match.tag('TracesDiverge', (diverge) => [diverge.medium]),
        Match.orElse(() => []),
      )),
    Match.tag('ScenarioStalled', (stalled) => [stalled.medium]),
    Match.exhaustive,
  )

const namedMediums = (report: Conformance.ConformanceReport): ReadonlyArray<string> =>
  report.results.flatMap(namingMedium)

const labelOf = (result: Conformance.ScenarioResult): string =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) =>
      `${compared.scenario}:${
        Match.value(compared.comparison).pipe(
          Match.tag('TracesConform', () => 'conform'),
          Match.orElse(() => 'diverge'),
        )
      }`),
    Match.tag('ScenarioStalled', (stalled) => `${stalled.scenario}:stalled`),
    Match.exhaustive,
  )

const advancing = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provide(
    Effect.raceFirst(effect, Effect.forever(TestClock.adjust(Duration.millis(20)))),
    TestClock.layer(),
  )

const reference = Conformance.prove(Conformance.FiberReference).pipe(
  Effect.provide(Conformance.FiberReferenceLayer),
  advancing,
)

const planted = Conformance.prove(PlantedMedium).pipe(
  Effect.provide(Layer.merge(Conformance.FiberReferenceLayer, PlantedMediumLayer)),
  advancing,
)

it.effect(
  'The fiber reference conforms on every scenario',
  () =>
    Effect.map(reference, (report) => {
      expect(Conformance.isConforming(report)).toBe(true)
      expect(report.results.length).toBe(Conformance.Scenarios.length)
      expect(report.results.map(labelOf)).toEqual([
        'ready-then-exit-normal:conform',
        'ready-then-exit-abnormal:conform',
        'never-become-ready:conform',
        'ignores-graceful-stop:conform',
        'one-for-all-group-stop:conform',
      ])
    }),
  60_000,
)

it.effect(
  'A medium that reports ready without running its program fails and names itself',
  () =>
    Effect.map(planted, (report) => {
      expect(Conformance.isConforming(report)).toBe(false)
      expect(namedMediums(report)).toContain('planted')
    }),
  60_000,
)
