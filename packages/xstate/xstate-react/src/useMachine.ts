import type { Actor, ActorOptions, AnyStateMachine, StateFrom } from '@systemfsoftware/xstate'
import {
  type ConditionalRequired,
  type IsNotNever,
  type RequiredActorOptionsFor,
  type RequiredActorOptionsKeys,
} from '@systemfsoftware/xstate'
import { useActor } from './useActor.js'

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
