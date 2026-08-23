import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import { Instrumenter } from './instrumenter.js'

export function createInstrumenter(logger: Logger): Instrumenter {
  return new Instrumenter(logger)
}
