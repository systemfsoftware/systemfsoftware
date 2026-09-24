import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema } from 'effect'
import { ContradictionNotEvaluated } from './eval-report.schema.js'

const ResolveRunOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/ResolveRunOutcome')
type ResolveRunOutcomeTypeId = typeof ResolveRunOutcomeTypeId

export class ContradictionValidated extends Schema.TaggedClass<ContradictionValidated>()('ContradictionValidated', {
  witnessedFailures: Schema.Int,
}) {
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class ContradictionUnvalidated
  extends Schema.TaggedClass<ContradictionUnvalidated>()('ContradictionUnvalidated', {
    witnessedFailures: Schema.Int,
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class ContradictionValidityRefused
  extends Schema.TaggedClass<ContradictionValidityRefused>()('ContradictionValidityRefused', {
    reason: Schema.NonEmptyString,
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export const ContradictionState = Schema.Union([
  ContradictionNotEvaluated,
  ContradictionValidated,
  ContradictionUnvalidated,
  ContradictionValidityRefused,
])
export type ContradictionState = typeof ContradictionState.Type

export class RunInputRefused extends Schema.TaggedClass<RunInputRefused>()('RunInputRefused', {
  detail: Schema.NonEmptyString,
}) {
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunProviderError extends Schema.TaggedClass<RunProviderError>()('RunProviderError', {
  detail: Schema.NonEmptyString,
}) {
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export const RunFault = Schema.Union([RunInputRefused, RunProviderError])
export type RunFault = typeof RunFault.Type

export class ResolveRunOutcomeCommand extends Schema.Class<ResolveRunOutcomeCommand>('ResolveRunOutcomeCommand')({
  contradiction: ContradictionState,
  fault: Schema.optional(RunFault),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class RunNotYetEvaluated extends Schema.TaggedClass<RunNotYetEvaluated>()('RunNotYetEvaluated', {
  outcome: Schema.Literal(0),
}) {
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunFailedOnWitnessedContradiction
  extends Schema.TaggedClass<RunFailedOnWitnessedContradiction>()('RunFailedOnWitnessedContradiction', {
    outcome: Schema.Literal(1),
    witnessedFailures: Schema.Int,
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunCleanUnderValidatedJudge
  extends Schema.TaggedClass<RunCleanUnderValidatedJudge>()('RunCleanUnderValidatedJudge', {
    outcome: Schema.Literal(0),
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunCleanUnderUnvalidatedJudge
  extends Schema.TaggedClass<RunCleanUnderUnvalidatedJudge>()('RunCleanUnderUnvalidatedJudge', {
    outcome: Schema.Literal(0),
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunCleanUnderRefusedValidity
  extends Schema.TaggedClass<RunCleanUnderRefusedValidity>()('RunCleanUnderRefusedValidity', {
    outcome: Schema.Literal(0),
  })
{
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export class RunRefused extends Schema.TaggedClass<RunRefused>()('RunRefused', {
  outcome: Schema.Literal(2),
  fault: RunFault,
}) {
  readonly [ResolveRunOutcomeTypeId] = ResolveRunOutcomeTypeId
}

export const ResolveRunOutcomeDecision = Schema.Union([
  RunNotYetEvaluated,
  RunFailedOnWitnessedContradiction,
  RunCleanUnderValidatedJudge,
  RunCleanUnderUnvalidatedJudge,
  RunCleanUnderRefusedValidity,
  RunRefused,
])
export type ResolveRunOutcomeDecision = typeof ResolveRunOutcomeDecision.Type

const validatedFailuresToDecision = (witnessedFailures: number): ResolveRunOutcomeDecision =>
  Match.value(witnessedFailures > 0).pipe(
    Match.when(true, () => new RunFailedOnWitnessedContradiction({ outcome: 1, witnessedFailures })),
    Match.when(false, () => new RunCleanUnderValidatedJudge({ outcome: 0 })),
    Match.exhaustive,
  )

const contradictionToDecision = (state: ContradictionState): ResolveRunOutcomeDecision =>
  Match.value(state).pipe(
    Match.tag('ContradictionNotEvaluated', () => new RunNotYetEvaluated({ outcome: 0 })),
    Match.tag('ContradictionValidated', (validated) => validatedFailuresToDecision(validated.witnessedFailures)),
    Match.tag('ContradictionUnvalidated', () => new RunCleanUnderUnvalidatedJudge({ outcome: 0 })),
    Match.tag('ContradictionValidityRefused', () => new RunCleanUnderRefusedValidity({ outcome: 0 })),
    Match.exhaustive,
  )

const decide = (command: ResolveRunOutcomeCommand): Result.Result<ResolveRunOutcomeDecision, never> =>
  Match.value(Option.fromUndefinedOr(command.fault)).pipe(
    Match.when(Option.isSome, (fault) => Result.succeed(new RunRefused({ outcome: 2, fault: fault.value }))),
    Match.when(Option.isNone, () => Result.succeed(contradictionToDecision(command.contradiction))),
    Match.exhaustive,
  )

export const resolveRunOutcome = Workflow.make({
  command: ResolveRunOutcomeCommand,
  decision: ResolveRunOutcomeDecision,
  error: Schema.Never,
  decide,
})
