import { Context, Layer } from 'effect'

export class Ledger extends Context.Service<Ledger, string>()(
  '@systemfsoftware/effect-gherkin-spec/tests/failure-corpus/Ledger',
) {}

export const ledgerLayer: Layer.Layer<Ledger, never, never> = Layer.succeed(Ledger, 'the ledger the spec read')
