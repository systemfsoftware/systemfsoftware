import { sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

import { suiteTestOf } from './suite-config.js'

export default defineConfig({
  ...sourceResolveConditions,
  test: suiteTestOf({ runner: './runner.ts', globalSetup: './global-setup.ts' }),
})
