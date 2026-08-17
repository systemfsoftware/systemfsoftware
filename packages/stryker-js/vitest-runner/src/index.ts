import { declareFactoryPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { vitestSectionJsonSchema } from './vitest-runner-options.schema.js'
import { vitestTestRunnerFactory } from './vitest-test-runner.js'

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.TestRunner, 'vitest', vitestTestRunnerFactory),
]

export const strykerValidationSchema: Record<string, unknown> = vitestSectionJsonSchema

export { createVitestTestRunnerFactory, VitestTestRunner } from './vitest-test-runner.js'
