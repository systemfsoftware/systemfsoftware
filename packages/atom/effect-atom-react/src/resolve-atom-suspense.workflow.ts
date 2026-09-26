/**
 * Resolves how React should read an `AsyncResult` atom under Suspense options.
 *
 * @since 4.0.0
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Boolean, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const ResolveAtomSuspenseDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom-react/ResolveAtomSuspense',
)
type ResolveAtomSuspenseDecisionTypeId = typeof ResolveAtomSuspenseDecisionTypeId

export class AtomSuspended extends Schema.TaggedClass<AtomSuspended>()('AtomSuspended', {}) {
  readonly [ResolveAtomSuspenseDecisionTypeId] = ResolveAtomSuspenseDecisionTypeId
}

export class AtomReady extends Schema.TaggedClass<AtomReady>()('AtomReady', {}) {
  readonly [ResolveAtomSuspenseDecisionTypeId] = ResolveAtomSuspenseDecisionTypeId
}

export class AtomRefused extends Schema.TaggedClass<AtomRefused>()('AtomRefused', {}) {
  readonly [ResolveAtomSuspenseDecisionTypeId] = ResolveAtomSuspenseDecisionTypeId
}

export const ResolveAtomSuspenseDecision = Schema.Union([AtomSuspended, AtomReady, AtomRefused])
export type ResolveAtomSuspenseDecision = typeof ResolveAtomSuspenseDecision.Type

export class ResolveAtomSuspense extends Schema.TaggedClass<ResolveAtomSuspense>()('ResolveAtomSuspense', {
  initial: Schema.Boolean,
  waiting: Schema.Boolean,
  suspendOnWaiting: Schema.Boolean,
  failure: Schema.Boolean,
  includeFailure: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const resolveAtomSuspense = Workflow.make({
  command: ResolveAtomSuspense,
  decision: ResolveAtomSuspenseDecision,
  error: Schema.Never,
  decide: (command): Result.Result<ResolveAtomSuspenseDecision, never> =>
    Match.value(Boolean.or(command.initial, Boolean.and(command.suspendOnWaiting, command.waiting))).pipe(
      Match.when(true, (): Result.Result<ResolveAtomSuspenseDecision, never> => Result.succeed(AtomSuspended.make())),
      Match.when(
        false,
        (): Result.Result<ResolveAtomSuspenseDecision, never> =>
          Match.value(Boolean.and(command.failure, Boolean.not(command.includeFailure))).pipe(
            Match.when(
              true,
              (): Result.Result<ResolveAtomSuspenseDecision, never> => Result.succeed(AtomRefused.make()),
            ),
            Match.when(
              false,
              (): Result.Result<ResolveAtomSuspenseDecision, never> => Result.succeed(AtomReady.make()),
            ),
            Match.exhaustive,
          ),
      ),
      Match.exhaustive,
    ),
})
