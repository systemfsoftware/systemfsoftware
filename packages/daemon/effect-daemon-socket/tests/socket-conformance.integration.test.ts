import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
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
        Then('every scripted lifecycle is compared and conforming, and the report names the socket declaration')(
          (state, expect) =>
            expect({
              resultCount: state.report.results.length,
              labels: state.report.results.map(labelOf),
              declaration: state.report.declaration,
            }).toMatchObject({
              resultCount: state.lifecycles.length,
              labels: state.lifecycles.map((name) => `${name}:conform`),
              declaration: { reporting: 'exit', groupStop: 'atomic' },
            }),
        ),
      ),
    )
  })
