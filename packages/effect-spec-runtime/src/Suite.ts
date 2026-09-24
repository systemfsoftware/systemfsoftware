/// <reference types="vitest/importMeta" />
import { type Checks, type Expect, type Vitest, VitestTestContext } from '@systemfsoftware/vitest'
import { type Asserted, captureRunBinding, type RunBinding } from '@systemfsoftware/vitest/integration'
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

/**
 * A registered case: the runner's own `expect` arrives as the argument, so a case's assertion
 * steps check through the test's callback rather than an import. `R` is what the case's layer
 * provides; every marked step needs the runner's scope and check service beside it.
 */
export type Scenario<B, E, R> = (expect: Expect) => Effect.Effect<B, E, R | Scope.Scope | Asserted>

export interface RegisterFn<B, E, R> {
  (name: string, scenario: Scenario<B, E, R>, mode: Register.RegisterMode, live?: LiveCase): void
}

const caseEffectOf = <B, E, R, RIn extends Scope.Scope>(
  body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  live: LiveCase | undefined,
): Effect.Effect<B, E, Scope.Scope> => {
  if (live !== undefined) return KernelCase.liveCase(body, env, live.reason)
  return KernelCase.caseProgram(body, env)
}

/**
 * One case's program: the callback's own `expect` builds the scenario Effect, and the case's
 * layers build fresh around it — under the kernel's scheduled exploration, or on the live clock
 * when the case declares a reason.
 */
const caseProgramOf = <B, E, R, RIn extends Scope.Scope>(
  scenario: Scenario<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  live: LiveCase | undefined,
  binding: RunBinding,
): (expect: Expect) => Effect.Effect<B, E, Scope.Scope> =>
(expect) => {
  const bound: Effect.Effect<B, E, R | RIn | Scope.Scope> = binding.bind(scenario(expect))
  return caseEffectOf(bound, env, live)
}

/**
 * The fork's generator body for one case: it hands the callback's `expect` to the scenario, hands
 * the running Vitest task to the step annotations, and runs the program the case declared — under
 * the kernel's explored schedules, or on the live clock.
 */
const caseBody = <B, E, R, RIn extends Scope.Scope>(
  scenario: Scenario<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  live: LiveCase | undefined,
) =>
  function*({ expect }: Checks) {
    const ctx = yield* VitestTestContext
    const binding = yield* captureRunBinding
    const program = TaskRef.provideTaskRef(caseProgramOf(scenario, env, live, binding)(expect), ctx)
    if (live === undefined) {
      yield* Register.exploredProgram(program)
      return
    }
    yield* program
  }

const registerCase = <B, E, R, RIn extends Scope.Scope>(
  register: Vitest.Test<Scope.Scope>,
  name: string,
  scenario: Scenario<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  live: LiveCase | undefined,
): void => {
  if (live === undefined) {
    register(name, caseBody(scenario, env, live), Register.UNTIMED)
    return
  }
  register(name, caseBody(scenario, env, live))
}

const registrarFor = <B, E, R, RIn extends Scope.Scope>(
  methodsIt: Vitest.Methods,
  config: Config,
  env: Layer.Layer<R, never, RIn>,
): RegisterFn<B, E, R | RIn | Scope.Scope> =>
(name, scenario, mode, caseLive) => {
  const live = caseLive ?? config.live
  registerCase(Register.selectCaseRunner(methodsIt, mode, live), name, scenario, env, live)
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
