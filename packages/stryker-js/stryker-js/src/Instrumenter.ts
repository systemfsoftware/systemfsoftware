import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

import type { IgnorerService } from './Ignorer.js'
import { InstrumenterFailed } from './Instrumenter.schema.js'
import type { FileDescription, Mutant } from './Mutant.js'

export interface InstrumenterFile extends FileDescription {
  readonly name: string
  readonly content: string
}

export interface InstrumenterOptions {
  readonly excludedMutations: readonly string[]
  readonly ignorers: readonly IgnorerService[]
  readonly noHeader?: boolean
}

export interface InstrumenterResult {
  readonly files: readonly InstrumenterFile[]
  readonly mutants: readonly Mutant[]
}

export interface InstrumenterService {
  readonly instrument: (
    files: readonly InstrumenterFile[],
    options: InstrumenterOptions,
  ) => Effect.Effect<InstrumenterResult, InstrumenterFailed>
  readonly disableTypeChecks: (file: InstrumenterFile) => Effect.Effect<InstrumenterFile, InstrumenterFailed>
}

export class Instrumenter
  extends Context.Service<Instrumenter, InstrumenterService>()('~@systemfsoftware/stryker-js/Instrumenter')
{}

export { InstrumenterFailed }
