import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Count } from '../verdict/step-record.schema.js'

const NextJudgmentDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/NextJudgmentDecision')
type NextJudgmentDecisionTypeId = typeof NextJudgmentDecisionTypeId

export class JudgmentPassed extends Schema.TaggedClass<JudgmentPassed>()('JudgmentPassed', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export class JudgmentFailed extends Schema.TaggedClass<JudgmentFailed>()('JudgmentFailed', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export class JudgmentInconclusive extends Schema.TaggedClass<JudgmentInconclusive>()('JudgmentInconclusive', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export class JudgmentResolve extends Schema.TaggedClass<JudgmentResolve>()('JudgmentResolve', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export class JudgmentPoll extends Schema.TaggedClass<JudgmentPoll>()('JudgmentPoll', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export class JudgmentExhausted extends Schema.TaggedClass<JudgmentExhausted>()('JudgmentExhausted', {}) {
  readonly [NextJudgmentDecisionTypeId] = NextJudgmentDecisionTypeId
}

export const NextJudgmentDecision = Schema.Union([
  JudgmentPassed,
  JudgmentFailed,
  JudgmentInconclusive,
  JudgmentResolve,
  JudgmentPoll,
  JudgmentExhausted,
])
export type NextJudgmentDecision = typeof NextJudgmentDecision.Type

export class NextJudgment extends Schema.TaggedClass<NextJudgment>()('NextJudgment', {
  mode: Schema.Literals(['assert', 'waitFor']),
  source: Schema.Literals(['recorded', 'fresh']),
  evaluation: Schema.Literals(['Holds', 'DoesNotHold', 'Unevaluable']),
  changed: Schema.Boolean,
  modelCalls: Count,
  maxModelCalls: Count,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    mode: 'app.e2e.agent.judgment-mode',
    evaluation: 'app.e2e.agent.judgment-evaluation',
  } as const
}

const budgetFreeOf = (command: NextJudgment): boolean => command.modelCalls < command.maxModelCalls

const resolveOrExhaustedOf = (command: NextJudgment): NextJudgmentDecision =>
  Match.value(budgetFreeOf(command)).pipe(
    Match.when(true, (): NextJudgmentDecision => new JudgmentResolve({})),
    Match.when(false, (): NextJudgmentDecision => new JudgmentExhausted({})),
    Match.exhaustive,
  )

const assertEvaluationOf = (command: NextJudgment): NextJudgmentDecision =>
  Match.value(command.evaluation).pipe(
    Match.when('Holds', (): NextJudgmentDecision => new JudgmentPassed({})),
    Match.when('DoesNotHold', (): NextJudgmentDecision => new JudgmentFailed({})),
    Match.when('Unevaluable', (): NextJudgmentDecision =>
      Match.value(command.source).pipe(
        Match.when('fresh', (): NextJudgmentDecision => new JudgmentInconclusive({})),
        Match.when('recorded', (): NextJudgmentDecision => resolveOrExhaustedOf(command)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const waitUnevaluableOf = (command: NextJudgment): NextJudgmentDecision =>
  Match.value(command.changed).pipe(
    Match.when(false, (): NextJudgmentDecision => new JudgmentPoll({})),
    Match.when(true, (): NextJudgmentDecision => resolveOrExhaustedOf(command)),
    Match.exhaustive,
  )

const waitEvaluationOf = (command: NextJudgment): NextJudgmentDecision =>
  Match.value(command.evaluation).pipe(
    Match.when('Holds', (): NextJudgmentDecision => new JudgmentPassed({})),
    Match.when('DoesNotHold', (): NextJudgmentDecision => new JudgmentPoll({})),
    Match.when('Unevaluable', (): NextJudgmentDecision => waitUnevaluableOf(command)),
    Match.exhaustive,
  )

const decide = (command: NextJudgment): Result.Result<NextJudgmentDecision, never> =>
  Result.succeed(
    Match.value(command.mode).pipe(
      Match.when('assert', (): NextJudgmentDecision => assertEvaluationOf(command)),
      Match.when('waitFor', (): NextJudgmentDecision => waitEvaluationOf(command)),
      Match.exhaustive,
    ),
  )

export const nextJudgment = Workflow.make({
  command: NextJudgment,
  decision: NextJudgmentDecision,
  error: Schema.Never,
  decide,
})
