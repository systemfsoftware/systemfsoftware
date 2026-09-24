import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Match } from 'effect'
import { expect } from 'vitest'
import { childScriptWorkload } from './__fixtures__/child-script.js'
import { featureNameOf, kvmGate } from './__fixtures__/kvm-gate.js'

const Feature = makeFeature({ it, layer })

const labelOf = (result: Conformance.ScenarioResult): string =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) =>
      Match.value(compared.comparison).pipe(
        Match.tag('TracesConform', () => `${compared.scenario}: conform`),
        Match.orElse((diverged) => `${compared.scenario}: diverged at ${JSON.stringify(diverged)}`),
      )),
    Match.tag('ScenarioStalled', (stalled) => `${stalled.scenario}: stalled`),
    Match.exhaustive,
  )

const MicroVMLayer = Layer.mergeAll(
  MicroVMMedium.layer(),
  Conformance.FiberReferenceLayer,
  nodeServicesLayer,
  Readiness.NodeHostProber.layer,
)

const ContractFeature = kvmGate.available ? Feature : Feature.skip

ContractFeature(
  featureNameOf('Supervising a workload in a microVM matches supervising it in process'),
)
  .liveClock()
  .withLayer(MicroVMLayer)
  .body(({ scenario }) => {
    scenario(
      'Every scripted child lifecycle behaves the same on both media',
      Gherkin.Do.pipe(
        Given(
          'a workload scripted to become ready, exit cleanly, fail, ignore a graceful stop, and never become ready',
        )(
          'driver',
          () => Effect.succeed(MicroVMMedium.conformanceDriver(childScriptWorkload)),
        ),
        When('the same supervision tree runs over the microVM medium and over the in-process reference')(
          'report',
          (s) => Conformance.prove(s.driver),
        ),
        Then('all five lifecycles compared as conforming')((s) => {
          expect(s.report.results.map(labelOf)).toEqual([
            'ready-then-exit-normal: conform',
            'ready-then-exit-abnormal: conform',
            'never-become-ready: conform',
            'ignores-graceful-stop: conform',
            'one-for-all-group-stop: conform',
          ])
        }),
      ),
    )
  })
