export const globalSetupTemplate = (): string =>
  `import { makeGlobalSetup } from '@systemfsoftware/effect-e2e/runner'

import config from './e2e.config.ts'
import { options } from './runner.ts'

export default makeGlobalSetup(config, options)
`
