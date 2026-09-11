export { EvaluatorFailedSchema, EvaluatorVerdictSchema } from './Evaluator.schema.js'
export type { EvaluatorFailed, EvaluatorVerdict } from './Evaluator.schema.js'

import type { EvaluatorVerdict } from './Evaluator.schema.js'
import type { PluginInit, StrykerOptions } from './Options.js'
import type { MutationTestResult } from './Report.schema.js'

export type Evaluator = (
  report: MutationTestResult,
  options: StrykerOptions,
) => EvaluatorVerdict | Promise<EvaluatorVerdict>

export type EvaluatorFactory = (options: StrykerOptions, init: PluginInit) => Evaluator
