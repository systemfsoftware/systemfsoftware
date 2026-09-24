import { expect } from '@effect/vitest'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match } from 'effect'
import { TestClock } from 'effect/testing'
import { LateStopMedium, LateStopMediumLayer } from './__fixtures__/late-stop-medium.js'
import { PlantedMedium, PlantedMediumLayer } from './__fixtures__/planted-medium.js'

const Feature = makeFeature({ it })

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

const EXPECTED_CATALOGUE_COMPARISONS: ReadonlyArray<string> = [
  'ready-then-exit-normal:conform',
  'ready-then-exit-abnormal:conform',
  'never-become-ready:conform',
  'ignores-graceful-stop:conform',
  'one-for-all-group-stop:conform',
]

const advancing = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provide(
    Effect.raceFirst(effect, Effect.forever(TestClock.adjust(Duration.millis(20)))),
    TestClock.layer(),
  )

const budgetedReference = (
  scenario: Conformance.ScenarioBudget,
): Conformance.ConformanceDriver<Supervisor.FiberProgram, never, never> => ({
  ...Conformance.FiberReference,
  scenario,
})

const budgetedProve = (scenario: Conformance.ScenarioBudget) =>
  Conformance.prove(budgetedReference(scenario)).pipe(
    Effect.provide(Conformance.FiberReferenceLayer),
    advancing,
  )

const reference = Conformance.prove(Conformance.FiberReference).pipe(
  Effect.provide(Conformance.FiberReferenceLayer),
  advancing,
)

const planted = Conformance.prove(PlantedMedium).pipe(
  Effect.provide(Layer.merge(Conformance.FiberReferenceLayer, PlantedMediumLayer)),
  advancing,
)

const lateStop = Conformance.prove(LateStopMedium).pipe(
  Effect.provide(Layer.merge(Conformance.FiberReferenceLayer, LateStopMediumLayer)),
  advancing,
)

Feature('Comparing a medium against the in-process reference over the scripted catalogue', { timeout: 60_000 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'The in-process reference conforms on every scripted lifecycle',
      Gherkin.Do.pipe(
        Given('the in-process reference proven over the whole scripted catalogue')('report', () => reference),
        Then('no lifecycle names a medium that diverged or stalled')((s) => {
          expect(namedMediums(s.report)).toEqual([])
        }),
        And('every lifecycle of the catalogue was compared')((s) => {
          expect(s.report.results.length).toBe(Conformance.Scenarios.length)
        }),
        And('each comparison is the catalogue’s conforming outcome')((s) => {
          expect(s.report.results.map(labelOf)).toEqual(EXPECTED_CATALOGUE_COMPARISONS)
        }),
      ),
    )

    scenario(
      'A medium that reports a child ready without running it is named as diverging',
      Gherkin.Do.pipe(
        Given('a medium that reports a child ready without running it, proven against the reference')(
          'report',
          () => planted,
        ),
        Then('at least one lifecycle names the medium that failed to conform')((s) => {
          expect(namedMediums(s.report)).not.toEqual([])
        }),
        And('the medium named is the one that reported the child ready')((s) => {
          expect(namedMediums(s.report)).toContain('planted')
        }),
      ),
    )

    scenario(
      'A medium whose stop outlives the step that ordered it still conforms on every lifecycle',
      Gherkin.Do.pipe(
        Given('a medium whose stop outlives the step that ordered it, proven against the reference')(
          'report',
          () => lateStop,
        ),
        Then('each comparison is the catalogue’s conforming outcome')((s) => {
          expect(s.report.results.map(labelOf)).toEqual(EXPECTED_CATALOGUE_COMPARISONS)
        }),
      ),
    )

    scenario(
      'A declared scenario floor below the catalogue leaves every comparison as the catalogue left it',
      Gherkin.Do.pipe(
        Given(
          'a reference driver whose declared start timeout expires before every scenario floor, proven over the catalogue',
        )(
          'report',
          () => budgetedProve({ millis: 20_000, startTimeoutMillis: 1 }),
        ),
        Then('each comparison is the catalogue’s conforming outcome')((s) => {
          expect(s.report.results.map(labelOf)).toEqual(EXPECTED_CATALOGUE_COMPARISONS)
        }),
      ),
    )

    scenario(
      'A declared scenario bound shorter than its declared floor stalls the lifecycle it cannot cover',
      Gherkin.Do.pipe(
        Given(
          'a reference driver whose declared scenario bound is shorter than its declared floor, proven over the catalogue',
        )(
          'report',
          () => budgetedProve({ millis: 500, startTimeoutMillis: 10_000 }),
        ),
        Then('only the lifecycle the bound cannot cover stalls, and it is named')((s) => {
          expect(s.report.results.map(labelOf)).toEqual([
            'ready-then-exit-normal:conform',
            'ready-then-exit-abnormal:conform',
            'never-become-ready:stalled',
            'ignores-graceful-stop:conform',
            'one-for-all-group-stop:conform',
          ])
        }),
      ),
    )
  })
