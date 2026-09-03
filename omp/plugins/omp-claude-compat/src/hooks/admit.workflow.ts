import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

export class AdmitError extends S.TaggedError<AdmitError>()('AdmitImpossible', {
  reason: S.String,
}) {}

export class AdmitHooksCommand extends S.TaggedClass<AdmitHooksCommand>()('AdmitHooksCommand', {
  present: S.Boolean,
}) {}

const HookDispatchDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/HookDispatchDecision',
)
type HookDispatchDecisionTypeId = typeof HookDispatchDecisionTypeId

export class SkipHooks extends S.TaggedClass<SkipHooks>()('SkipHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export class RunHooks extends S.TaggedClass<RunHooks>()('RunHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export type AdmitCommand = InstanceType<typeof AdmitHooksCommand>
export type HookDispatchDecision = InstanceType<typeof SkipHooks> | InstanceType<typeof RunHooks>

/** Whether loaded settings admit hook dispatch at all. */
export const admitLoadedSettings = Workflow.make(
  AdmitHooksCommand,
  (command): Result.Result<HookDispatchDecision, AdmitError> =>
    Match.value(command.present).pipe(
      Match.when(true, () => Result.succeed(new RunHooks())),
      Match.when(false, () => Result.succeed(new SkipHooks())),
      Match.exhaustive,
    ),
)
