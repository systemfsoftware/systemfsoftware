import { sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

import config from './e2e.config.js'
import { suiteTestOf } from './suite-config.js'

export default defineConfig({
  ...sourceResolveConditions,
  test: suiteTestOf({ runner: './runner.ts', globalSetup: './global-setup.ts', config }),
})
