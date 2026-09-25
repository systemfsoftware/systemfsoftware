import { Match, Schema } from 'effect'

export const DECLARED = 1

export const LifecycleCommand = Schema.Literals(['Status', 'Start', 'Stop'])
export type LifecycleCommand = typeof LifecycleCommand.Type

export const LifecycleState = Schema.Struct({ running: Schema.Int })
export type LifecycleState = typeof LifecycleState.Type

export type LifecycleResponse = string | number

export const lifecycleModel = {
  state: LifecycleState,
  initial: { running: DECLARED } satisfies LifecycleState,
  precondition: (state: LifecycleState, command: LifecycleCommand): boolean =>
    Match.value(command).pipe(
      Match.when('Status', () => true),
      Match.when('Start', () => state.running === DECLARED),
      Match.when('Stop', () => state.running === DECLARED + 1),
      Match.exhaustive,
    ),
  step: (state: LifecycleState, command: LifecycleCommand): readonly [LifecycleState, LifecycleResponse] =>
    Match.value(command).pipe(
      Match.when('Status', (): readonly [LifecycleState, LifecycleResponse] => [state, state.running]),
      Match.when(
        'Start',
        (): readonly [LifecycleState, LifecycleResponse] => [{ running: DECLARED + 1 }, 'accepted'],
      ),
      Match.when('Stop', (): readonly [LifecycleState, LifecycleResponse] => [{ running: DECLARED }, 'stopped']),
      Match.exhaustive,
    ),
}

export const ExhaustCommand = Schema.TaggedStruct('ExhaustChild', {})
export type ExhaustCommand = typeof ExhaustCommand.Type

export const ExhaustState = Schema.Struct({ exhausted: Schema.Boolean })
export type ExhaustState = typeof ExhaustState.Type

export const exhaustModel = {
  state: ExhaustState,
  initial: { exhausted: false } satisfies ExhaustState,
  precondition: (state: ExhaustState, _command: ExhaustCommand): boolean => !state.exhausted,
  step: (_state: ExhaustState, _command: ExhaustCommand): readonly [ExhaustState, boolean] => [
    { exhausted: true },
    true,
  ],
}
