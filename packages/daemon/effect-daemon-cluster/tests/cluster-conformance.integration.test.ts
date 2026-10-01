import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Match } from 'effect'
import { ClusterOracle, warmUpCluster } from './__fixtures__/cluster-oracle.js'

const Feature = makeFeature({ it })

const describeResult = (result: Conformance.ScenarioResult): string =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) =>
      Match.value(compared.comparison).pipe(
        Match.tag('TracesConform', (conform) => `${conform.scenario}:TracesConform`),
        Match.orElse((diverge) => `${diverge.scenario}:TracesDiverge@${diverge.index}`),
      )),
    Match.tag('ScenarioStalled', (stalled) => `${stalled.scenario}:ScenarioStalled`),
    Match.exhaustive,
  )

Feature('Supervising cluster children')
  .withScenarioLayer(ClusterOracle)
  .live('the report compares the medium against a real SingleRunner over PGlite and Crypto')
  .body(({ scenario }) => {
    scenario(
      'Every scripted child lifecycle matches the fiber reference',
      Gherkin.Do.pipe(
        Given('a cluster runner that has taken ownership of its shards')('warm', () => warmUpCluster),
        When('the conformance catalogue is proven against the fiber reference')(
          'report',
          () => Conformance.prove(ClusterMedium.conformanceDriver),
        ),
        Then('every lifecycle compares as conforming and the medium is held to the declaration it infers')(
          (s, expect) =>
            expect({
              results: s.report.results.map(describeResult),
              declaration: s.report.declaration,
            }).toEqual({
              results: [
                'ready-then-exit-normal:TracesConform',
                'ready-then-exit-abnormal:TracesConform',
                'never-become-ready:TracesConform',
                'ignores-graceful-stop:TracesConform',
                'one-for-all-group-stop:TracesConform',
              ],
              declaration: ClusterMedium.declaration,
            }),
        ),
      ),
    )
  })
