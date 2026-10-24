export const vitestConfigTemplate = (): string =>
  `import { e2eTestFiles, exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'
import { sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { configDefaults, defineConfig } from 'vitest/config'

import config, { baseUrl, output } from './e2e.config.ts'

const setExitCode = (code: number): void => {
  process.exitCode = code
}

export default defineConfig({
  ...sourceResolveConditions,
  test: {
    include: [...e2eTestFiles.include],
    exclude: [...configDefaults.exclude, ...e2eTestFiles.exclude],
    includeSource: [],
    env: { BASE_URL: baseUrl, E2E_OUTPUT: output },
    runner: './runner.ts',
    globalSetup: ['./global-setup.ts'],
    reporters: ['default', exitCodeReporter(setExitCode)],
    testTimeout: config.timeout ?? 120_000,
  },
})
`
