import isDevelopment from '#is-development'
import type { Actor, ActorOptions, AnyActorLogic, Snapshot, SnapshotFrom } from '@systemfsoftware/xstate'
import {
  type ConditionalRequired,
  createActor,
  type IsNotNever,
  type RequiredActorOptionsFor,
  type RequiredActorOptionsKeys,
} from '@systemfsoftware/xstate'
import { useCallback } from 'react'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import { useActorLifecycle, useIdleActorRef } from './useActorRef.js'

export function useActor<TLogic extends AnyActorLogic>(
  logic: TLogic,
  ...[options]: ConditionalRequired<
    [options?: ActorOptions<TLogic> & RequiredActorOptionsFor<TLogic>],
    IsNotNever<RequiredActorOptionsKeys<TLogic>>
  >
): [SnapshotFrom<TLogic>, Actor<TLogic>['send'], Actor<TLogic>] {
  if (
    isDevelopment &&
    !!logic &&
    'send' in logic &&
    typeof logic.send === 'function'
  ) {
    throw new Error(
      `useActor() expects actor logic (e.g. a machine), but received an ActorRef. Use the useSelector(actorRef, ...) hook instead to read the ActorRef's snapshot.`,
    )
  }

  const [actorRef, setActorRef] = useIdleActorRef(
    logic,
    ...(options === undefined ? [] : [options]),
  )

  const getSnapshot = useCallback(() => {
    return actorRef.getSnapshot()
  }, [actorRef])

  const subscribe = useCallback(
    (handleStoreChange: () => void) => {
      const { unsubscribe } = actorRef.subscribe({
        next: handleStoreChange,
        error: handleStoreChange,
      })
      return unsubscribe
    },
    [actorRef],
  )

  const actorSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )

  const snapshotWithStatus = 'status' in actorSnapshot
    ? (actorSnapshot as Snapshot<unknown>)
    : undefined
  if (snapshotWithStatus?.status === 'error') {
    throw snapshotWithStatus.error
  }

  useActorLifecycle(actorRef, setActorRef, () => createActor(actorRef.logic, options as ActorOptions<TLogic>))

  return [actorSnapshot, actorRef.send, actorRef]
}
