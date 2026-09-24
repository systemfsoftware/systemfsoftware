/// <reference types="vitest/importMeta" />
import type { Vitest } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import type { TestOptions } from 'vitest'
import * as KernelCase from './KernelCase.js'
import type { LiveCase } from './KernelCase.js'
import * as Register from './Register.js'
import * as TaskRef from './TaskRef.service.js'

export type { LiveCase } from './KernelCase.js'
export type { DescribeMode, RegisterMode } from './Register.js'

export type Options = Pick<TestOptions, 'tags'> & Partial<TestOptions>

export interface Bindings {
  readonly it: Vitest.Methods
}

export interface Config {
  readonly name: string
  readonly describe: Register.DescribeMode
  readonly options: Options | undefined
  readonly live?: LiveCase
}

export interface Shared<R> {
  readonly layer: Layer.Layer<R>
}

export interface RegisterFn<B, E, R> {
  (name: string, body: Effect.Effect<B, E, R>, mode: Register.RegisterMode, live?: LiveCase): void
}

const caseEffectOf = <B, E, R, RIn extends Scope.Scope>(
  body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  live: LiveCase | undefined,
): Effect.Effect<B, E, Scope.Scope> => {
  if (live !== undefined) return KernelCase.liveCase(body, env, live.reason)
  return KernelCase.caseProgram(body, env)
}

const registerCase = <B, E>(
  register: Vitest.Test<Scope.Scope>,
  name: string,
  program: Effect.Effect<B, E, Scope.Scope>,
  live: LiveCase | undefined,
): void => {
  if (live === undefined) {
    register(name, Register.exploredBody(program), Register.UNTIMED)
    return
  }
  register(name, (ctx) => TaskRef.provideTaskRef(program, ctx))
}

const registrarFor = <B, E, R, RIn extends Scope.Scope>(
  methodsIt: Vitest.Methods,
  config: Config,
  env: Layer.Layer<R, never, RIn>,
): RegisterFn<B, E, R | RIn | Scope.Scope> =>
(name, body, mode, caseLive) => {
  const live = caseLive ?? config.live
  registerCase(
    Register.selectCaseRunner(methodsIt, mode, live),
    name,
    caseEffectOf(body, env, live),
    live,
  )
}

const openImpl = <B, E, C>(
  bindings: Bindings,
  config: Config,
  use: (register: RegisterFn<B, E, Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(registrarFor<B, E, never, never>(bindings.it, config, Layer.empty), bindings.it)
  })
}

export const open: {
  <B, E, C>(
    config: Config,
    use: (register: RegisterFn<B, E, Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): (bindings: Bindings) => void
  <B, E, C>(
    bindings: Bindings,
    config: Config,
    use: (register: RegisterFn<B, E, Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): void
} = dual(3, openImpl)

const openSharedImpl = <B, E, RShared, C>(
  bindings: Bindings,
  config: Config,
  shared: Shared<RShared>,
  use: (register: RegisterFn<B, E, RShared | Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(
      registrarFor<B, E, RShared, never>(bindings.it, config, Layer.fresh(shared.layer)),
      bindings.it,
    )
  })
}

export const openShared: {
  <B, E, RShared, C>(
    config: Config,
    shared: Shared<RShared>,
    use: (register: RegisterFn<B, E, RShared | Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): (bindings: Bindings) => void
  <B, E, RShared, C>(
    bindings: Bindings,
    config: Config,
    shared: Shared<RShared>,
    use: (register: RegisterFn<B, E, RShared | Scope.Scope>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): void
} = dual(4, openSharedImpl)

const openCaseImpl = <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
  bindings: Bindings,
  config: Config,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
  use: (
    register: RegisterFn<B, E, RFresh | RFreshReq | Scope.Scope>,
    propIt: Vitest.MethodsNonLive<never>,
  ) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(
      registrarFor<B, E, RFresh, RFreshReq>(bindings.it, config, Layer.fresh(caseLayer)),
      bindings.it,
    )
  })
}

export const openCase: {
  <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
    config: Config,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (
      register: RegisterFn<B, E, RFresh | RFreshReq | Scope.Scope>,
      propIt: Vitest.MethodsNonLive<never>,
    ) => C,
  ): (bindings: Bindings) => void
  <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
    bindings: Bindings,
    config: Config,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (
      register: RegisterFn<B, E, RFresh | RFreshReq | Scope.Scope>,
      propIt: Vitest.MethodsNonLive<never>,
    ) => C,
  ): void
} = dual(4, openCaseImpl)

const openSharedCaseImpl = <B, E, RShared, RFresh, RFreshReq extends RShared, C>(
  bindings: Bindings,
  config: Config,
  shared: Shared<RShared>,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
  use: (
    register: RegisterFn<B, E, RShared | RFresh | Scope.Scope>,
    propIt: Vitest.MethodsNonLive<never>,
  ) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(
      registrarFor<B, E, RFresh | RShared, never>(
        bindings.it,
        config,
        Layer.fresh(caseLayer).pipe(Layer.provideMerge(shared.layer)),
      ),
      bindings.it,
    )
  })
}

export const openSharedCase: {
  <B, E, RShared, RFresh, RFreshReq extends RShared, C>(
    config: Config,
    shared: Shared<RShared>,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (
      register: RegisterFn<B, E, RShared | RFresh | Scope.Scope>,
      propIt: Vitest.MethodsNonLive<never>,
    ) => C,
  ): (bindings: Bindings) => void
  <B, E, RShared, RFresh, RFreshReq extends RShared, C>(
    bindings: Bindings,
    config: Config,
    shared: Shared<RShared>,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (
      register: RegisterFn<B, E, RShared | RFresh | Scope.Scope>,
      propIt: Vitest.MethodsNonLive<never>,
    ) => C,
  ): void
} = dual(5, openSharedCaseImpl)
