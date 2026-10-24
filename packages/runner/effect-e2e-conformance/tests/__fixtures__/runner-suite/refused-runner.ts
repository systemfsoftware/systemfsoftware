import { makeRunner } from '@systemfsoftware/effect-e2e/runner'

import { options } from './composition.js'
import config from './refused.e2e-config.js'

export default makeRunner(config, options)
