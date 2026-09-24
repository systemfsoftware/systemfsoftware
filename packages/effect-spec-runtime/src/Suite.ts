/// <reference types="vitest/globals" />
/// <reference types="vitest/importMeta" />
import type * as EffectVitest from '@effect/vitest'
import type { Vitest } from '@effect/vitest'
import { Effect, Layer, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import type { TestOptions } from 'vitest'
import * as Register from './Register.js'
import * as TaskRef from './TaskRef.service.js'

export type { DescribeMode, RegisterMode } from './Register.js'

export type Options = Pick<TestOptions, 'tags'> & Partial<TestOptions>

export interface LayerOptions {
  readonly excludeTestServices?: boolean
}

export interface Bindings extends Pick<typeof EffectVitest, 'layer'> {
  readonly it: Vitest.Methods
}

export interface Config {
  readonly name: string
  readonly describe: Register.DescribeMode
  readonly options: Options | undefined
  readonly liveClock: boolean
}

export interface Shared<R> {
  readonly layer: Layer.Layer<R>
  readonly excludeTestServices: boolean
}

export interface RegisterFn<B, E, R> {
  (name: string, body: Effect.Effect<B, E, R>, mode: Register.RegisterMode): void
}

const layerSetupOptions = (
  excludeTestServices: boolean,
  useLiveClock: boolean,
): { readonly excludeTestServices: boolean; readonly shared: true } => ({
  excludeTestServices: excludeTestServices || useLiveClock,
  shared: true,
})

const unlayeredRegister = <B, E, RFresh, RFreshReq extends Scope.Scope>(
  methodsIt: Vitest.Methods,
  config: Config,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
): RegisterFn<B, E, RFresh | RFreshReq> =>
(name, body, mode) => {
  Register.selectCaseRunner(methodsIt, mode, config.liveClock)(
    name,
    (ctx) => TaskRef.provideTaskRef(body.pipe(Effect.provide(Layer.fresh(caseLayer))), ctx),
  )
}

const layeredRegister = <B, E, RShared, RFresh, RFreshReq extends RShared | Scope.Scope>(
  scopedIt: Pick<Vitest.MethodsNonLive<RShared>, 'effect'>,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
): RegisterFn<B, E, RShared | RFresh | RFreshReq> =>
(name, body, mode) => {
  Register.selectLayeredRunner(scopedIt, mode)(
    name,
    (ctx) => TaskRef.provideTaskRef(body.pipe(Effect.provide(Layer.fresh(caseLayer))), ctx),
  )
}

const openImpl = <B, E, C>(
  bindings: Bindings,
  config: Config,
  use: (register: RegisterFn<B, E, never>, propIt: Vitest.MethodsNonLive<never>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(unlayeredRegister<B, E, never, never>(bindings.it, config, Layer.empty), bindings.it)
  })
}

export const open: {
  <B, E, C>(
    config: Config,
    use: (register: RegisterFn<B, E, never>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): (bindings: Bindings) => void
  <B, E, C>(
    bindings: Bindings,
    config: Config,
    use: (register: RegisterFn<B, E, never>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): void
} = dual(3, openImpl)

const openSharedImpl = <B, E, RShared, C>(
  bindings: Bindings,
  config: Config,
  shared: Shared<RShared>,
  use: (register: RegisterFn<B, E, RShared>, propIt: Vitest.MethodsNonLive<RShared>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    bindings.layer(shared.layer, layerSetupOptions(shared.excludeTestServices, config.liveClock))((scopedIt) => {
      use(layeredRegister<B, E, RShared, never, never>(scopedIt, Layer.empty), scopedIt)
    })
  })
}

export const openShared: {
  <B, E, RShared, C>(
    config: Config,
    shared: Shared<RShared>,
    use: (register: RegisterFn<B, E, RShared>, propIt: Vitest.MethodsNonLive<RShared>) => C,
  ): (bindings: Bindings) => void
  <B, E, RShared, C>(
    bindings: Bindings,
    config: Config,
    shared: Shared<RShared>,
    use: (register: RegisterFn<B, E, RShared>, propIt: Vitest.MethodsNonLive<RShared>) => C,
  ): void
} = dual(4, openSharedImpl)

const openCaseImpl = <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
  bindings: Bindings,
  config: Config,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
  use: (register: RegisterFn<B, E, RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<never>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    use(unlayeredRegister<B, E, RFresh, RFreshReq>(bindings.it, config, caseLayer), bindings.it)
  })
}

export const openCase: {
  <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
    config: Config,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (register: RegisterFn<B, E, RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): (bindings: Bindings) => void
  <B, E, RFresh, RFreshReq extends Scope.Scope, C>(
    bindings: Bindings,
    config: Config,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (register: RegisterFn<B, E, RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<never>) => C,
  ): void
} = dual(4, openCaseImpl)

const openSharedCaseImpl = <B, E, RShared, RFresh, RFreshReq extends RShared | Scope.Scope, C>(
  bindings: Bindings,
  config: Config,
  shared: Shared<RShared>,
  caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
  use: (register: RegisterFn<B, E, RShared | RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<RShared>) => C,
): void => {
  Register.invokeDescribe(config.describe, config.name, config.options, () => {
    bindings.layer(shared.layer, layerSetupOptions(shared.excludeTestServices, config.liveClock))((scopedIt) => {
      use(layeredRegister<B, E, RShared, RFresh, RFreshReq>(scopedIt, caseLayer), scopedIt)
    })
  })
}

export const openSharedCase: {
  <B, E, RShared, RFresh, RFreshReq extends RShared | Scope.Scope, C>(
    config: Config,
    shared: Shared<RShared>,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (register: RegisterFn<B, E, RShared | RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<RShared>) => C,
  ): (bindings: Bindings) => void
  <B, E, RShared, RFresh, RFreshReq extends RShared | Scope.Scope, C>(
    bindings: Bindings,
    config: Config,
    shared: Shared<RShared>,
    caseLayer: Layer.Layer<RFresh, never, RFreshReq>,
    use: (register: RegisterFn<B, E, RShared | RFresh | RFreshReq>, propIt: Vitest.MethodsNonLive<RShared>) => C,
  ): void
} = dual(5, openSharedCaseImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀x_LayerSetupOptions_=OrWithLive',
    { of: [Schema.Boolean], subject: layerSetupOptions, runs: 100 },
    (setupOptions, [exclude]) =>
      setupOptions(exclude, true).excludeTestServices === true &&
      setupOptions(exclude, false).excludeTestServices === exclude,
  )
}
