import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Predicate, Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import type { MessageRouter } from './collector/message-router.js'
import type { SourceMapper } from './collector/SourceMapper.js'
import { Verbosity } from './collector/verbosity.schema.js'
import type { CompilerState } from './compiler/typescript-program.js'
import { ApiReportVariant } from './config/config-file.schema.js'
import type { ExtractorConfig } from './config/extractor-config.js'

export interface RunRuntime {
  readonly config: ExtractorConfig
  readonly compilerState: CompilerState
  readonly router: MessageRouter
  readonly sourceMapper: SourceMapper
}

const RunRuntimeSchema = Schema.declare<RunRuntime>(
  (value: unknown): value is RunRuntime => Predicate.isObject(value),
)

export const RunPlan = Schema.Struct({
  configFilePath: Schema.String,
  projectFolder: Schema.String,
  compilerVersion: Schema.String,
  verbosity: Verbosity,
  reportVariants: Schema.Array(ApiReportVariant),
  rollupTargets: Schema.Array(Schema.String),
  printApiReportDiff: Schema.Boolean,
})
export type RunPlan = typeof RunPlan.Type

export class RunPlanCommand extends Schema.TaggedClass<RunPlanCommand>()('RunPlanCommand', {
  plan: RunPlan,
  localBuild: Schema.Boolean,
  runtime: RunRuntimeSchema,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['localBuild'] as const
}

const RunDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/RunPlanDecision')
type RunDecisionTypeId = typeof RunDecisionTypeId

export class ReportUpdatedPlanned extends Schema.TaggedClass<ReportUpdatedPlanned>()('ReportUpdatedPlanned', {
  plan: RunPlan,
}) {
  readonly [RunDecisionTypeId] = RunDecisionTypeId
}

export class ReportVerifiedPlanned extends Schema.TaggedClass<ReportVerifiedPlanned>()('ReportVerifiedPlanned', {
  plan: RunPlan,
}) {
  readonly [RunDecisionTypeId] = RunDecisionTypeId
}

export type RunPlanDecision = ReportUpdatedPlanned | ReportVerifiedPlanned

const ruleRunPlan = (localBuild: boolean, plan: RunPlan): RunPlanDecision =>
  Match.value(localBuild).pipe(
    Match.when(true, () => ReportUpdatedPlanned.make({ plan })),
    Match.when(false, () => ReportVerifiedPlanned.make({ plan })),
    Match.exhaustive,
  )

export const planExtractorRun = Workflow.total(
  RunPlanCommand,
  (command: RunPlanCommand): Result.Result<RunPlanDecision, never> =>
    Result.succeed(ruleRunPlan(command.localBuild, command.plan)),
)

if (import.meta.vitest !== void 0) {
  // Exception: in-source tests load @effect/vitest dynamically to avoid bundling test libraries
  const { it } = await import('@effect/vitest')

  it.prop('∀p_Mode_≡LocalBuildFlag', [RunPlan, Schema.Boolean], ([plan, localBuild]) => {
    const decision = ruleRunPlan(localBuild, plan)
    return Schema.is(ReportUpdatedPlanned)(decision) === localBuild
  })
}
