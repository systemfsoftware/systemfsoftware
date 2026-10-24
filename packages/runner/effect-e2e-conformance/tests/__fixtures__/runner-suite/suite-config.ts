import type { E2EConfigInput } from '@systemfsoftware/effect-e2e'
import { e2eRunShape, e2eTestFiles, exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'
import type { ViteUserConfig } from 'vitest/config'

import { options } from './composition.js'

const setExitCode = (code: number): void => {
  process.exitCode = code
}

export interface SuiteModules {
  readonly runner: string
  readonly globalSetup: string
  readonly config: E2EConfigInput
}

export const suiteTestOf = (modules: SuiteModules): NonNullable<ViteUserConfig['test']> => ({
  include: [...e2eTestFiles.include],
  exclude: [...e2eTestFiles.exclude],
  runner: modules.runner,
  globalSetup: modules.globalSetup,
  pool: 'forks',
  ...e2eRunShape(modules.config, options),
  reporters: ['default', ['json', { outputFile: '.e2e/vitest.json' }], exitCodeReporter(setExitCode)],
})
