import fs from 'fs'

import { declareFactoryPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { vitestTestRunnerFactory } from './vitest-test-runner.js'

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.TestRunner, 'vitest', vitestTestRunnerFactory),
]

export const strykerValidationSchema: Record<string, unknown> = JSON.parse(
  fs.readFileSync(
    new URL('../schema/vitest-runner-options.json', import.meta.url),
    'utf-8',
  ),
)

export { createVitestTestRunnerFactory, VitestTestRunner } from './vitest-test-runner.js'
