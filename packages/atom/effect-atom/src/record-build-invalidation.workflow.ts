import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { BatchPhaseName } from './batch-phase.schema.js'

const BuildInvalidationDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/BuildInvalidationDecision',
)
type BuildInvalidationDecisionTypeId = typeof BuildInvalidationDecisionTypeId

export class RecordDuringBuild extends Schema.TaggedClass<RecordDuringBuild>()('RecordDuringBuild', {}) {
  readonly [BuildInvalidationDecisionTypeId] = BuildInvalidationDecisionTypeId
}

export class SkipRecording extends Schema.TaggedClass<SkipRecording>()('SkipRecording', {}) {
  readonly [BuildInvalidationDecisionTypeId] = BuildInvalidationDecisionTypeId
}

export const BuildInvalidationDecision = Schema.Union([RecordDuringBuild, SkipRecording])
export type BuildInvalidationDecision = typeof BuildInvalidationDecision.Type

export class BuildInvalidation extends Schema.TaggedClass<BuildInvalidation>()('BuildInvalidation', {
  building: Schema.Boolean,
  batchPhase: BatchPhaseName,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const records = (command: BuildInvalidation): boolean =>
  ![command.building, command.batchPhase === 'collect'].includes(false)

export const recordBuildInvalidation = Workflow.make({
  command: BuildInvalidation,
  decision: BuildInvalidationDecision,
  error: Schema.Never,
  decide: (command): Result.Result<BuildInvalidationDecision, never> =>
    Result.succeed(
      Match.value(records(command)).pipe(
        Match.when(true, () => RecordDuringBuild.make({})),
        Match.when(false, () => SkipRecording.make({})),
        Match.exhaustive,
      ),
    ),
})
