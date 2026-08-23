import { type Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'

import { type File } from './file.js'

export interface InstrumentResult {
  files: readonly File[]
  mutants: readonly Mutant[]
}
