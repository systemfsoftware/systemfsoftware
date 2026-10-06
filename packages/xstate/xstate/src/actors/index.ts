import { createActor } from '../createActor.js'
import type { ActorFromLogic } from '../types.js'
import { createLogic } from './logic.js'
export {
  type CallbackActorLogic,
  type CallbackActorRef,
  type CallbackLogicConfig,
  type CallbackLogicFunction,
  type CallbackSnapshot,
  createCallbackLogic,
} from './callback.js'
export {
  createListenerLogic,
  type ListenerActorLogic,
  type ListenerActorRef,
  type ListenerInput,
  listenerLogic,
  type ListenerSnapshot,
} from './listener.js'
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
} from './logic.js'
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
} from './observable.js'
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
} from './promise.js'
export {
  createSubscriptionLogic,
  type SubscriptionActorLogic,
  type SubscriptionActorRef,
  type SubscriptionInput,
  subscriptionLogic,
  type SubscriptionMappers,
  type SubscriptionSnapshot,
} from './subscription.js'

const emptyLogic = /* #__PURE__ */ createLogic<undefined, undefined>({
  context: undefined,
  run: () => undefined,
})

/** @public */
export function createEmptyActor(): ActorFromLogic<typeof emptyLogic> {
  return createActor(emptyLogic)
}
