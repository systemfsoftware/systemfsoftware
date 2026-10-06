import { createActor } from '../createActor.ts'
import type { ActorFromLogic } from '../types.ts'
import { createLogic } from './logic.ts'
export {
  type CallbackActorLogic,
  type CallbackActorRef,
  type CallbackLogicConfig,
  type CallbackLogicFunction,
  type CallbackSnapshot,
  createCallbackLogic,
} from './callback.ts'
export {
  createListenerLogic,
  type ListenerActorLogic,
  type ListenerActorRef,
  type ListenerInput,
  listenerLogic,
  type ListenerSnapshot,
} from './listener.ts'
export {
  createLogic,
  type LogicActorLogic,
  type LogicActorRef,
  type LogicArgs,
  type LogicConfig,
  type LogicEffect,
  type LogicEffectState,
  type LogicEnqueue,
  type LogicFunction,
  type LogicPatch,
  type LogicSnapshot,
} from './logic.ts'
export {
  createEventObservableLogic,
  createObservableLogic,
  type EventObservableLogicConfig,
  type EventObservableLogicFunction,
  type ObservableActorLogic,
  type ObservableActorRef,
  type ObservableLogicConfig,
  type ObservableLogicFunction,
  type ObservableSnapshot,
} from './observable.ts'
export {
  type AsyncActorLogic,
  type AsyncActorRef,
  type AsyncSnapshot,
  createAsyncLogic,
  type LogicArgs as AsyncLogicArgs,
  type LogicConfig as AsyncLogicConfig,
  type LogicEnqueue as AsyncLogicEnqueue,
  type LogicFunction as AsyncLogicFunction,
  TimeoutError,
} from './promise.ts'
export {
  createSubscriptionLogic,
  type SubscriptionActorLogic,
  type SubscriptionActorRef,
  type SubscriptionInput,
  subscriptionLogic,
  type SubscriptionMappers,
  type SubscriptionSnapshot,
} from './subscription.ts'

const emptyLogic = /* #__PURE__ */ createLogic<undefined, undefined>({
  context: undefined,
  run: () => undefined,
})

/** @public */
export function createEmptyActor(): ActorFromLogic<typeof emptyLogic> {
  return createActor(emptyLogic)
}
