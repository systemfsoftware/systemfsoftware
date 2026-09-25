import { Gherkin, Given, it, makeFeature, type StepError, Then } from '@systemfsoftware/effect-gherkin-spec'
import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { captureRunBinding } from '@systemfsoftware/vitest/integration'
import { Effect, Layer } from 'effect'
import { failingLayer, layerBuildFixture, layerSpec, MissingLedger } from './__fixtures__/failure-corpus/layer-build.js'
import { Ledger, ledgerLayer } from './__fixtures__/failure-corpus/ledger.js'
import { type CorpusFixture, FIRST_LOCATION } from './__fixtures__/failure-corpus/record.js'
import { stepErrorFixture, stepSpec } from './__fixtures__/failure-corpus/step-error.js'

const Feature = makeFeature({ it })

const messageOf = (thrown: Error): string => thrown.message

const runSpec = <A, R>(
  body: Effect.Effect<A, StepError, R>,
  layer: Layer.Layer<R, never, never>,
): Effect.Effect<string> =>
  Effect.promise(() => KernelCase.explore(KernelCase.caseProgram(body, layer)).then(() => '', messageOf))

const verdictOf = (fixture: CorpusFixture, record: string): Record<string, boolean | string | undefined> => {
  const first = FIRST_LOCATION.exec(record)?.[0]
  return {
    fixture: fixture.name,
    defectFile: fixture.defectFile,
    namesDefectFile: record.includes(fixture.defectFile),
    expectedFirstLocationFile: fixture.raisingFile,
    foundFirstLocationFile: first === undefined ? undefined : first.replace(/:\d+$/u, ''),
    foundFirstLocation: first,
  }
}

Feature('The gherkin spec prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the corpus drives the simulation kernel itself, and a kernel run cannot happen inside another kernel run')
  .body(({ scenario }) => {
    scenario(
      'A defective spec yields a record naming its defect file and starting at the raising frame',
      Gherkin.Do.pipe(
        Given('two defective specs whose failures the corpus renders')('reports', () =>
          Effect.gen(function*() {
            const binding = yield* captureRunBinding
            const layerBody: Effect.Effect<object, StepError, MissingLedger> = binding.bind(layerSpec)
            const stepBody: Effect.Effect<object, StepError, Ledger> = binding.bind(stepSpec)
            const layer = yield* runSpec(layerBody, failingLayer)
            const step = yield* runSpec(stepBody, ledgerLayer)
            return { layer, step }
          })),
        Then('each record names its defect file and starts at its raising frame')((s, expect) =>
          expect({
            layer: verdictOf(layerBuildFixture, s.reports.layer),
            step: verdictOf(stepErrorFixture, s.reports.step),
          }).toMatchObject({
            layer: {
              fixture: layerBuildFixture.name,
              defectFile: layerBuildFixture.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: layerBuildFixture.raisingFile,
            },
            step: {
              fixture: stepErrorFixture.name,
              defectFile: stepErrorFixture.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: stepErrorFixture.raisingFile,
            },
          })
        ),
      ),
    )
  })
