import * as Core from '@alchemy.run/test/Core'
import { evalStack } from 'alchemy/EvalStack'
import type { Input } from 'alchemy/Input'
import { build as buildStack, type CompiledStack, type StackDefinition, type StackEffect } from 'alchemy/Stack'
import * as State from 'alchemy/State'
import { Cause, Context, Effect, Exit, Scope } from 'effect'
import type { ConfigError } from 'effect/Config'
import { DurableStateRequired, StackDeployFailed, StackDestroyFailed } from './StackErrors.schema.js'

export interface Engine {
  readonly options: Core.MakeOptions
  readonly sidecar: Core.SidecarHandle | undefined
  readonly stage: string
  readonly dev: boolean
  readonly scope: Scope.Scope
}

export type StackProgram<A> = Effect.Effect<CompiledStack<A>, ConfigError> & StackDefinition<never>

export type Deploy = <A>(
  stack: StackProgram<A>,
) => Effect.Effect<Input.Resolve<A>, StackDeployFailed | StackDestroyFailed | DurableStateRequired>

const NON_DURABLE_STORES: ReadonlySet<string> = new Set(['local', 'inmemory'])

interface EngineCall<E> {
  readonly engine: Engine
  readonly scope: Scope.Scope | undefined
  readonly onFailure: (reason: string) => E
}

const engineEffect: <A, EIn>(
  effect: StackEffect<A, EIn>,
  options: Core.MakeOptions,
  scope: Scope.Scope | undefined,
  sidecar: Core.SidecarHandle | undefined,
) => Effect.Effect<A, Cause.UnknownError> = Core.toEffect

const inEngine = <E>(call: EngineCall<E>) => <A, EIn>(effect: StackEffect<A, EIn>): Effect.Effect<A, E> =>
  Effect.catchCause(
    engineEffect(effect, call.engine.options, call.scope, call.engine.sidecar),
    (cause) => Effect.fail(call.onFailure(Cause.pretty(cause))),
  )

const deployFailure = (engine: Engine, stack: string) => (reason: string) =>
  new StackDeployFailed({ stack, stage: engine.stage, reason })

const destroyFailure = (engine: Engine, stack: string) => (reason: string) =>
  new StackDestroyFailed({ stack, stage: engine.stage, reason })

const providersOf = <A>(stack: StackProgram<A>) => stack.providers === undefined ? {} : { providers: stack.providers }

const storeIdOf = <A>(engine: Engine, stack: StackProgram<A>): Effect.Effect<string, StackDeployFailed> => {
  if (stack.state === undefined) return Effect.succeed('local')
  const built = buildStack({ name: stack.stackName, state: stack.state, ...providersOf(stack) }).pipe(
    Effect.map((services) => ({ services })),
  )
  const call = { engine, scope: undefined, onFailure: deployFailure(engine, stack.stackName) }
  return inEngine(call)(
    evalStack(
      built,
      ({ services }) => Effect.map(Context.get(services, State.State), (store) => store.id),
      { stage: engine.stage, dev: engine.dev },
    ),
  )
}

const requireDurable = <A>(
  engine: Engine,
  stack: StackProgram<A>,
): Effect.Effect<void, DurableStateRequired | StackDeployFailed> =>
  Effect.flatMap(storeIdOf(engine, stack), (store) =>
    NON_DURABLE_STORES.has(store)
      ? Effect.fail(new DurableStateRequired({ stack: stack.stackName, stage: engine.stage, store }))
      : Effect.void)

const checkDurability = <A>(engine: Engine, stack: StackProgram<A>) =>
  engine.dev ? Effect.void : requireDurable(engine, stack)

const destroyIn = <A, E>(call: EngineCall<E>, stack: StackProgram<A>, child: Scope.Scope) =>
  inEngine(call)(Core.destroy(call.engine.options, stack, { stage: call.engine.stage, scope: child }))

const destroyThenClose = <A>(engine: Engine, stack: StackProgram<A>, child: Scope.Closeable) =>
  destroyIn({ engine, scope: child, onFailure: destroyFailure(engine, stack.stackName) }, stack, child).pipe(
    Effect.orDie,
    Effect.ensuring(Scope.close(child, Exit.void)),
  )

export const deployStack = (engine: Engine): Deploy => <A>(stack: StackProgram<A>) =>
  Effect.gen(function*() {
    yield* checkDurability(engine, stack)
    const child = yield* Scope.fork(engine.scope, 'sequential')
    yield* Scope.addFinalizer(engine.scope, destroyThenClose(engine, stack, child))
    yield* destroyIn({ engine, scope: child, onFailure: destroyFailure(engine, stack.stackName) }, stack, child)
    return yield* inEngine({ engine, scope: child, onFailure: deployFailure(engine, stack.stackName) })(
      Core.deploy(engine.options, stack, { stage: engine.stage, scope: child }),
    )
  })

export const openSidecar = (scope: Scope.Scope) => (options: Core.MakeOptions) =>
  Effect.suspend(() => {
    const sidecar = Core.makeSidecarHandle(options)
    if (sidecar === undefined) return Effect.succeed(sidecar)
    return Scope.addFinalizer(scope, sidecar.close).pipe(Effect.as(sidecar))
  })
