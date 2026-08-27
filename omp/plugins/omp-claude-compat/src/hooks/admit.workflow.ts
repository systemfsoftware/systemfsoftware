import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

export class AdmitError extends S.TaggedError<AdmitError>()('AdmitImpossible', {
  reason: S.String,
}) {}

class AdmitHooksCommand extends S.TaggedClass<AdmitHooksCommand>()('AdmitHooksCommand', {
  present: S.Boolean,
}) {}

class SkipHooks extends S.TaggedClass<SkipHooks>()('SkipHooks', {}) {}

class RunHooks extends S.TaggedClass<RunHooks>()('RunHooks', {}) {}

export type AdmitCommand = InstanceType<typeof AdmitHooksCommand>
export type HookDispatchDecision = InstanceType<typeof SkipHooks> | InstanceType<typeof RunHooks>

export const skipHooks = (): HookDispatchDecision => new SkipHooks()
export const admitPresent = (present: boolean): AdmitCommand => new AdmitHooksCommand({ present })

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
