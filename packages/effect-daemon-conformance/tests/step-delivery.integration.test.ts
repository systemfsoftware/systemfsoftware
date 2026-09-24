import { expect } from '@effect/vitest'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Match } from 'effect'
import { SharedChannelMedium, SharedChannelMediumLayer } from './__fixtures__/shared-channel-medium.js'

const Feature = makeFeature({ it, layer })

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

Feature('Proving that a step reaches the incarnation it is for', { timeout: 240_000 })
  .withLayer(Layer.merge(Conformance.FiberReferenceLayer, SharedChannelMediumLayer))
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A medium that reports a stop before its child stops, driven over one channel per child, fails the proof',
      Gherkin.Do.pipe(
        Given('a medium that reports a stop the moment it is asked for')(
          'proof',
          () => Effect.succeed(Conformance.prove(SharedChannelMedium)),
        ),
        When('the whole scenario catalogue runs on both')('report', (s) => s.proof),
        Then('the proof fails and names that medium')((s) => {
          expect(namedMediums(s.report)).not.toEqual([])
          expect(namedMediums(s.report)).toContain('shared-channel')
        }),
      ),
    )
  })
