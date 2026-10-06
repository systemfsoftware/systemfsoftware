import {
  Actor,
  ActorOptions,
  AnyStateMachine,
  type ConditionalRequired,
  type IsNotNever,
  type RequiredActorOptionsFor,
  type RequiredActorOptionsKeys,
  StateFrom,
} from 'xstate'
import { useActor } from './useActor.ts'

/** @alias useActor */
export function useMachine<TMachine extends AnyStateMachine>(
  machine: TMachine,
  ...[options]: ConditionalRequired<
    [options?: ActorOptions<TMachine> & RequiredActorOptionsFor<TMachine>],
    IsNotNever<RequiredActorOptionsKeys<TMachine>>
  >
): [StateFrom<TMachine>, Actor<TMachine>['send'], Actor<TMachine>] {
  return useActor(machine, options)
}
