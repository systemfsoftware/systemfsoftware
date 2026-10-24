import { e2eTestFiles, exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'
import type { ViteUserConfig } from 'vitest/config'

const setExitCode = (code: number): void => {
  process.exitCode = code
}

export interface SuiteModules {
  readonly runner: string
  readonly globalSetup: string
}

export const suiteTestOf = (modules: SuiteModules): NonNullable<ViteUserConfig['test']> => ({
  include: [...e2eTestFiles.include],
  exclude: [...e2eTestFiles.exclude],
  runner: modules.runner,
  globalSetup: modules.globalSetup,
  pool: 'forks',
  maxWorkers: 2,
  reporters: ['default', ['json', { outputFile: '.e2e/vitest.json' }], exitCodeReporter(setExitCode)],
})
