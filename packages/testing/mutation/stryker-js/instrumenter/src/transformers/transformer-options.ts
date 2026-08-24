import { type IgnorerService } from '@systemfsoftware/stryker-js-plugin-api/ignore'

import { type MutatorOptions } from '../mutators/index.js'

export interface TransformerOptions extends MutatorOptions {
  ignorers: IgnorerService[]
}
