import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

export class ConfigTarget extends Schema.TaggedClass<ConfigTarget>()('ConfigTarget', {
  targetPath: Schema.String,
  occupied: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigTemplateDecision')
type DecisionTypeId = typeof DecisionTypeId

export class TemplateWritten extends Schema.TaggedClass<TemplateWritten>()('TemplateWritten', {
  targetPath: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class TemplateRefused extends Schema.TaggedClass<TemplateRefused>()('TemplateRefused', {
  targetPath: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export type ConfigTemplateDecision = TemplateWritten | TemplateRefused

export const resolveConfigTemplate = Workflow.total(
  ConfigTarget,
  (target): Result.Result<ConfigTemplateDecision, never> =>
    Match.value(target.occupied).pipe(
      Match.when(true, () => Result.succeed(new TemplateRefused({ targetPath: target.targetPath }))),
      Match.when(false, () => Result.succeed(new TemplateWritten({ targetPath: target.targetPath }))),
      Match.exhaustive,
    ),
)
