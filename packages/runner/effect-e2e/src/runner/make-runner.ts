import * as Function from 'effect/Function'
import type { SerializedConfig, VitestTestRunner } from 'vitest'

import type { E2EConfigInput } from '../Config/config.schema.js'
import { providedRunId } from './run-identity.js'
import { E2EVitestRunner } from './vitest-runner.js'
import { type RunnerOptions, wiringOf } from './wiring.js'

export type E2ERunnerClass = new(config: SerializedConfig) => VitestTestRunner

export const makeRunner: {
  (options: RunnerOptions): (config: E2EConfigInput) => E2ERunnerClass
  (config: E2EConfigInput, options: RunnerOptions): E2ERunnerClass
} = Function.dual(
  2,
  (config: E2EConfigInput, options: RunnerOptions): E2ERunnerClass =>
    class extends E2EVitestRunner {
      constructor(serialized: SerializedConfig) {
        super(serialized, wiringOf({ config, options, root: serialized.root, runId: providedRunId() }))
      }
    },
)
