import { Conformance } from '@systemfsoftware/conformance-spec'
import { Conformance as DaemonConformance } from '@systemfsoftware/effect-daemon-conformance'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Match } from 'effect'
import { fibreProofModel, ProveFibreReference } from './__fixtures__/fibre-proof.model.js'
import type { Verdict } from './__fixtures__/fibre-proof.model.js'

const Feature = makeFeature({ it })

type Outcome = 'conform' | 'diverge' | 'stalled'

const stalledVerdict = (scenario: string): Verdict => ({ scenario, outcome: 'stalled' })

class FibreProof extends Context.Service<
  FibreProof,
  { readonly catalogueVerdicts: Effect.Effect<ReadonlyArray<Verdict>> }
>()('@systemfsoftware/effect-daemon-conformance/tests/fibre-reference.conformance.test/FibreProof') {}

const outcomeOf = (comparison: DaemonConformance.TraceComparison): Outcome =>
  Match.value(comparison).pipe(
    Match.tag('TracesConform', (): Outcome => 'conform'),
    Match.orElse((): Outcome => 'diverge'),
  )

const verdictOf = (result: DaemonConformance.ScenarioResult): Verdict =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) => ({
      scenario: compared.scenario,
      outcome: outcomeOf(compared.comparison),
    })),
    Match.tag('ScenarioStalled', (stalled) => stalledVerdict(stalled.scenario)),
    Match.exhaustive,
  )

const fibreProofLayer: Layer.Layer<FibreProof> = Layer.succeed(FibreProof, {
  catalogueVerdicts: DaemonConformance.prove(DaemonConformance.FiberReference).pipe(
    Effect.provide(DaemonConformance.FiberReferenceLayer),
    Effect.map((report) => report.results.map(verdictOf)),
  ),
})

const run = (_command: ProveFibreReference): Effect.Effect<ReadonlyArray<Verdict>, never, FibreProof> =>
  Effect.flatMap(FibreProof, (proof) => proof.catalogueVerdicts)

const check = Conformance.sequential(fibreProofLayer, {
  commands: ProveFibreReference,
  model: fibreProofModel,
  run,
  sequences: 2,
  operations: 1,
})

const passedHistories = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new Error(
        `expected every run to report the verdicts the catalogue declares, but the check read: ${
          Conformance.render(report)
        }`,
      )
    }),
  )

Feature('Judging the fibre reference with the conformance harness', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A run of the fibre reference reports the verdicts the scenario catalogue declares',
      Gherkin.Do.pipe(
        Given('the conformance harness with the fibre reference bound to its own port')(
          'check',
          () => Effect.succeed(check),
        ),
        When('the harness runs the fibre reference through the scenario catalogue')('report', (s) => s.check),
        Then('the run reports the verdicts the scenario catalogue declares')((s) => {
          passedHistories(s.report)
        }),
      ),
    )
  })
