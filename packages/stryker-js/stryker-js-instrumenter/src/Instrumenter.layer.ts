import {
  Instrumenter,
  InstrumenterFailed,
  type InstrumenterFile,
  type InstrumenterOptions,
} from '@systemfsoftware/stryker-js/Instrumenter'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { disableTypeChecks, instrument } from './Instrument.js'

const toInternalOptions = (options: InstrumenterOptions) => ({
  excludedMutations: [...options.excludedMutations],
  ignorers: [...options.ignorers],
  ...(options.noHeader === undefined ? {} : { noHeader: options.noHeader }),
})

export const instrumenterLayer: Layer.Layer<Instrumenter> = Layer.succeed(Instrumenter, {
  instrument: (files: readonly InstrumenterFile[], options: InstrumenterOptions) =>
    instrument(files, toInternalOptions(options)).pipe(
      Effect.mapError((error) => new InstrumenterFailed({ message: error.message, cause: error.cause })),
    ),
  disableTypeChecks: (file: InstrumenterFile) =>
    Effect.tryPromise({
      try: () => disableTypeChecks(file),
      catch: (cause) => new InstrumenterFailed({ message: `Failed to disable type checks for ${file.name}`, cause }),
    }),
})
