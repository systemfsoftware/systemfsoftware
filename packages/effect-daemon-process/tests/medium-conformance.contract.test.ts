import { expect } from '@effect/vitest'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Match, Schema } from 'effect'
import { plantedDriver, plantedLayer } from './__fixtures__/planted-process-medium.js'
import { mediumLayer, processDriver, referenceLayer, spawnerLayer } from './__fixtures__/process-fixtures.js'

const Feature = makeFeature({ it, layer })

const bound = Layer.mergeAll(referenceLayer, mediumLayer, spawnerLayer, plantedLayer)

const comparedEverywhere = (report: Conformance.ConformanceReport): boolean =>
  report.results.every((result) => Schema.is(Conformance.ScenarioCompared)(result))

const namedMediums = (report: Conformance.ConformanceReport): ReadonlyArray<string> =>
  report.results.flatMap((result) =>
    Match.value(result).pipe(
      Match.tag('ScenarioCompared', (ran) =>
        Match.value(ran.comparison).pipe(
          Match.tag('TracesDiverge', (diverged) => [diverged.medium]),
          Match.orElse((): ReadonlyArray<string> => []),
        )),
      Match.tag('ScenarioStalled', (stalled) => [stalled.medium]),
      Match.exhaustive,
    )
  )

const labelOf = (result: Conformance.ScenarioResult): string =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (ran) =>
      Match.value(ran.comparison).pipe(
        Match.tag('TracesConform', () => `${ran.scenario}: conform`),
        Match.tag(
          'TracesDiverge',
          (diverged) =>
            `${ran.scenario}: diverge at ${diverged.index}\n  reference ${diverged.reference}\n  candidate ${diverged.candidate}`,
        ),
        Match.exhaustive,
      )),
    Match.tag('ScenarioStalled', (stalled) => `${stalled.scenario}: stalled`),
    Match.exhaustive,
  )

Feature('Proving a medium against the reference', { timeout: 240_000 })
  .withLayer(bound)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Every scripted child lifecycle matches the reference',
      Gherkin.Do.pipe(
        Given('a process medium and the fiber reference bound to one harness')(
          'proof',
          () => Effect.succeed(Conformance.prove(processDriver)),
        ),
        When('the whole scenario catalogue runs on both')('report', (s) => s.proof),
        Then('every scenario ran to a matching comparison')((s) => {
          expect(s.report.results.map(labelOf)).toEqual(
            Conformance.Scenarios.map((scripted) => `${scripted.name}: conform`),
          )
          expect(s.report).toSatisfy(comparedEverywhere)
          expect(namedMediums(s.report)).toEqual([])
        }),
      ),
    )

    scenario(
      'A medium that reports its child ready without starting one is named as the divergent one',
      Gherkin.Do.pipe(
        Given('a medium that reports readiness without ever starting anything')(
          'proof',
          () => Effect.succeed(Conformance.prove(plantedDriver)),
        ),
        When('the whole scenario catalogue runs on both')('report', (s) => s.proof),
        Then('the proof fails and names that medium')((s) => {
          expect(namedMediums(s.report)).not.toEqual([])
          expect(namedMediums(s.report)).toContain('process-planted')
          expect(namedMediums(s.report)).not.toContain(processDriver.name)
        }),
      ),
    )
  })
