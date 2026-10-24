import { e2eTestFiles, exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'
import { defineConfig } from 'vitest/config'

const setExitCode = (code: number): void => {
  process.exitCode = code
}

export const suiteConfigOf = (runner: string) =>
  defineConfig({
    test: {
      include: [...e2eTestFiles.include],
      exclude: [...e2eTestFiles.exclude],
      runner,
      reporters: ['default', ['json', { outputFile: '.e2e/vitest.json' }], exitCodeReporter(setExitCode)],
    },
  })
