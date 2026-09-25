import { Gherkin, Given, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'
import { LayerDefect } from './corpus-defect.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/gherkin/effect-gherkin-spec/tests/__fixtures__/failure-corpus/layer-build.ts'

export class MissingLedger extends Context.Service<MissingLedger, string>()(
  '@systemfsoftware/effect-gherkin-spec/tests/failure-corpus/MissingLedger',
) {}

export const layerBuildFixture: CorpusFixture = {
  name: 'a scenario layer that fails to build',
  defectFile,
  raisingFile: defectFile,
}

export const failingLayer: Layer.Layer<MissingLedger, never, never> = Layer.effect(
  MissingLedger,
  Effect.die(new LayerDefect({ defectFile, layer: 'the ledger layer' })),
)

export const layerSpec = Gherkin.Do.pipe(
  Given('a ledger the layer was meant to build')('ledger', () => MissingLedger),
  Then('the ledger never arrives')((s, expect) => expect(s.ledger).toEqual('the ledger that was never built')),
)
