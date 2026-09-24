import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer, Match } from 'effect'

const Feature = makeFeature({ it })

const Environment = Layer.merge(
  Layer.provideMerge(SocketMedium.layer({ readyPollMillis: 5 }), Readiness.NodeHostProber.layer),
  Conformance.FiberReferenceLayer,
)

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

Feature('Supervising scripted connections as the fibre medium does')
  .live('the kit plays its scripted lifecycles against real loopback peers in this process')
  .withLayer(Environment)
  .body(({ scenario }) => {
    scenario(
      'Every scripted lifecycle the kit holds a medium to matches the fibre reference',
      Gherkin.Do.pipe(
        Given('the scripted lifecycles the conformance kit holds every medium to')(
          'lifecycles',
          () => Effect.succeed(Conformance.Scenarios.map((scripted) => scripted.name)),
        ),
        When('the kit proves the socket medium against the fibre reference')(
          'report',
          () => Conformance.prove(SocketMedium.conformanceDriver),
        ),
        Then('every scripted lifecycle is compared and conforming')(({ report, lifecycles }) => {
          expect(report.results.length).toBe(lifecycles.length)
          expect(report.results.map(labelOf)).toEqual(lifecycles.map((name) => `${name}:conform`))
        }),
        And('the report names the declaration the socket medium claims')(({ report }) => {
          expect(report.declaration).toEqual({ reporting: 'exit', groupStop: 'atomic' })
        }),
      ),
    )
  })
