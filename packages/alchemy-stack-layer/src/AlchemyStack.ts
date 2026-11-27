import * as Core from '@alchemy.run/test/Core'
import { TestFile } from '@systemfsoftware/effect-spec-runtime'
import type { Input } from 'alchemy/Input'
import { Context, Effect, Layer, Option, type Scope } from 'effect'
import * as Digest from 'effect/crypto/Digest'
import { dual } from 'effect/Function'
import {
  type DurableStateRequired,
  type StackDeployFailed,
  type StackDestroyFailed,
  StageUnresolved,
} from './StackErrors.schema.js'
import { type Deploy, deployStack, type Engine, openSidecar, type StackProgram } from './StackLifecycle.js'
import { fileStage } from './StageName.js'

export type { Deploy, StackProgram } from './StackLifecycle.js'

export type StackKey<Name extends string> = `@systemfsoftware/alchemy-stack-layer/${Name}`

export interface AlchemyStack<Name extends string, Outputs>
  extends Context.ServiceClass.Shape<StackKey<Name>, Outputs>
{}

export interface EngineConfig {
  readonly dev?: boolean
  readonly stage?: string
  readonly sidecar?: boolean | Core.SidecarOptions
  readonly profile?: string
}

export type StackSetup<Outputs, E, R> = (deploy: Deploy) => Effect.Effect<Outputs, E, R>

export interface StandaloneConfig<A, Outputs, E> extends EngineConfig {
  readonly deploy: StackProgram<A> | StackSetup<Outputs, E, Scope.Scope>
  readonly setup?: undefined
}

export interface SetupLayerConfig<Outputs, E, R, ESetup> extends EngineConfig {
  readonly deploy: StackSetup<Outputs, E, R | Scope.Scope>
  readonly setup: Layer.Layer<R, ESetup>
}

export type StackLayerError = StackDeployFailed | StackDestroyFailed | DurableStateRequired | StageUnresolved

export interface AlchemyStackTag<Name extends string, Outputs, E>
  extends Context.ServiceClass<AlchemyStack<Name, Outputs>, StackKey<Name>, Outputs>
{
  readonly layer: Layer.Layer<AlchemyStack<Name, Outputs>, E>
}

type AcquireError<E> = E | StackDeployFailed | StackDestroyFailed | DurableStateRequired

type AnyConfig<A, Outputs, E, R, ESetup> = StandaloneConfig<A, Outputs, E> | SetupLayerConfig<Outputs, E, R, ESetup>

class StackOwnProviders extends Context.Service<StackOwnProviders, true>()(
  '@systemfsoftware/alchemy-stack-layer/StackOwnProviders',
) {}

const stackOwnProviders: Core.MakeOptions['providers'] = Layer.succeed(StackOwnProviders, true)

const stageOfRunningFile = (name: string) =>
  Effect.flatMap(TestFile, (file) =>
    Option.match(file, {
      onNone: () => Effect.fail(new StageUnresolved({ stack: name })),
      onSome: (testFile) =>
        fileStage({ baseStage: Core.resolveStage({}), testFile }).pipe(Effect.provide(Digest.layerWebCrypto)),
    }))

const resolveStage = (name: string, configured: string | undefined) =>
  configured === undefined ? stageOfRunningFile(name) : Effect.succeed(configured)

const engineOptionsOf = (config: EngineConfig): Omit<EngineConfig, 'stage'> => {
  const { stage: _stage, ...engine } = config
  return engine
}

const makeEngine = (name: string, config: EngineConfig) =>
  Effect.gen(function*() {
    const scope = yield* Effect.scope
    const stage = yield* resolveStage(name, config.stage)
    const options: Core.MakeOptions = { ...engineOptionsOf(config), providers: stackOwnProviders, stage }
    const sidecar = yield* openSidecar(scope)(options)
    const engine: Engine = { options, sidecar, stage, dev: Core.resolveDev(config), scope }
    return engine
  })

const setupOf = <A, Outputs, E, R>(
  deploy: StackProgram<A> | StackSetup<Outputs, E, R>,
): StackSetup<Input.Resolve<A> | Outputs, AcquireError<E>, R> => {
  if (typeof deploy === 'function') return deploy
  return (run) => run(deploy)
}

const acquireOf = <Outputs, E, R>(name: string, config: EngineConfig, setup: StackSetup<Outputs, E, R>) =>
  Effect.flatMap(makeEngine(name, config), (engine) => setup(deployStack(engine)))

const keyOf = <Name extends string>(name: Name): StackKey<Name> => `@systemfsoftware/alchemy-stack-layer/${name}`

const standaloneImpl = <const Name extends string, A, Outputs, E>(
  name: Name,
  config: StandaloneConfig<A, Outputs, E>,
): AlchemyStackTag<Name, Input.Resolve<A> | Outputs, StackLayerError | E> => {
  class Tag extends Context.Service<Tag, Input.Resolve<A> | Outputs>()(keyOf(name)) {}
  return Object.assign(Tag, { layer: Layer.effect(Tag, acquireOf(name, config, setupOf(config.deploy))) })
}

const withSetupImpl = <const Name extends string, Outputs, E, R, ESetup>(
  name: Name,
  config: SetupLayerConfig<Outputs, E, R, ESetup>,
): AlchemyStackTag<Name, Outputs, StackLayerError | E | ESetup> => {
  class Tag extends Context.Service<Tag, Outputs>()(keyOf(name)) {}
  return Object.assign(Tag, {
    layer: Layer.provide(Layer.effect(Tag, acquireOf(name, config, config.deploy)), config.setup),
  })
}

const alchemyStackImpl = <const Name extends string, A, Outputs, E, R, ESetup>(
  name: Name,
  config: AnyConfig<A, Outputs, E, R, ESetup>,
) => config.setup === undefined ? standaloneImpl(name, config) : withSetupImpl(name, config)

export const alchemyStack: {
  <A = never, Outputs = never, E = never>(
    config: StandaloneConfig<A, Outputs, E>,
  ): <const Name extends string>(name: Name) => AlchemyStackTag<Name, Input.Resolve<A> | Outputs, StackLayerError | E>
  <Outputs, E, R, ESetup>(
    config: SetupLayerConfig<Outputs, E, R, ESetup>,
  ): <const Name extends string>(name: Name) => AlchemyStackTag<Name, Outputs, StackLayerError | E | ESetup>
  <const Name extends string, A = never, Outputs = never, E = never>(
    name: Name,
    config: StandaloneConfig<A, Outputs, E>,
  ): AlchemyStackTag<Name, Input.Resolve<A> | Outputs, StackLayerError | E>
  <const Name extends string, Outputs, E, R, ESetup>(
    name: Name,
    config: SetupLayerConfig<Outputs, E, R, ESetup>,
  ): AlchemyStackTag<Name, Outputs, StackLayerError | E | ESetup>
} = dual(2, alchemyStackImpl)
