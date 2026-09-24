import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema } from 'effect'

const ResolveFingerprintDigestDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/pack-eval/ResolveFingerprintDigestDecision',
)
type ResolveFingerprintDigestDecisionTypeId = typeof ResolveFingerprintDigestDecisionTypeId

export class FingerprintCovered extends Schema.TaggedClass<FingerprintCovered>()('FingerprintCovered', {
  digest: Schema.String,
  fileCount: Schema.Int,
}) {
  readonly [ResolveFingerprintDigestDecisionTypeId] = ResolveFingerprintDigestDecisionTypeId
}

export class FingerprintUncovered extends Schema.TaggedClass<FingerprintUncovered>()('FingerprintUncovered', {}) {
  readonly [ResolveFingerprintDigestDecisionTypeId] = ResolveFingerprintDigestDecisionTypeId
}

export const ResolveFingerprintDigestDecision = Schema.Union([FingerprintCovered, FingerprintUncovered])
export type ResolveFingerprintDigestDecision = typeof ResolveFingerprintDigestDecision.Type

export class ResolveFingerprintDigestCommand
  extends Schema.Class<ResolveFingerprintDigestCommand>('ResolveFingerprintDigestCommand')({
    digest: Schema.String,
    fileCount: Schema.Int,
  })
{
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decide = (command: ResolveFingerprintDigestCommand): Result.Result<ResolveFingerprintDigestDecision, never> =>
  Match.value(command.fileCount > 0).pipe(
    Match.when(
      true,
      () => Result.succeed(new FingerprintCovered({ digest: command.digest, fileCount: command.fileCount })),
    ),
    Match.when(false, () => Result.succeed(new FingerprintUncovered())),
    Match.exhaustive,
  )

export const resolveFingerprintDigest = Workflow.make({
  command: ResolveFingerprintDigestCommand,
  decision: ResolveFingerprintDigestDecision,
  error: Schema.Never,
  decide,
})
