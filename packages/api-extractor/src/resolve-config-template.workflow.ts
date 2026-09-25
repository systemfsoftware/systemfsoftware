import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

/** The template target: where `init` would write, and whether that path is already occupied. */
export class ConfigTarget extends Schema.TaggedClass<ConfigTarget>()('ConfigTarget', {
  targetPath: Schema.String,
  occupied: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigTemplateDecision')
type DecisionTypeId = typeof DecisionTypeId

/** The target was free, so the template is written there. */
export class TemplateWritten extends Schema.TaggedClass<TemplateWritten>()('TemplateWritten', {
  targetPath: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

/** The target already holds a file, so `init` refuses to overwrite it. */
export class TemplateRefused extends Schema.TaggedClass<TemplateRefused>()('TemplateRefused', {
  targetPath: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const ConfigTemplateDecision = Schema.Union([TemplateWritten, TemplateRefused])
export type ConfigTemplateDecision = typeof ConfigTemplateDecision.Type

export const resolveConfigTemplate = Workflow.make({
  command: ConfigTarget,
  decision: ConfigTemplateDecision,
  error: Schema.Never,
  decide: (target: ConfigTarget): Result.Result<ConfigTemplateDecision, never> =>
    Match.value(target.occupied).pipe(
      Match.when(true, () => Result.succeed(new TemplateRefused({ targetPath: target.targetPath }))),
      Match.when(false, () => Result.succeed(new TemplateWritten({ targetPath: target.targetPath }))),
      Match.exhaustive,
    ),
})
