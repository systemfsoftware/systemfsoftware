import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as schema from 'mutation-testing-report-schema/api'

import { EvaluatorFailed } from './Evaluator.schema.js'
import type { ExitClass } from './ExitClass.schema.js'

export { EvaluatorFailed } from './Evaluator.schema.js'
export type { ExitClass } from './ExitClass.schema.js'

export interface EvaluatorService {
  readonly evaluate: (report: schema.MutationTestResult) => Effect.Effect<ExitClass | null, EvaluatorFailed>
}

export class Evaluator
  extends Context.Service<Evaluator, EvaluatorService>()('~@systemfsoftware/stryker-js/Evaluator')
{}
