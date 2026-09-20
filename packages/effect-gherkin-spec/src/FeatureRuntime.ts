/// <reference types="vitest/importMeta" />
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import type { GherkinEffect, GivenStage, ScopeIdentifiers, ScopeMap, ScopeServices, ThenStage } from './DoNotation.js'
import { expandOutline } from './OutlineExpand.js'
import { StepError } from './StepError.schema.js'

export type ScenarioOptions<RScenario = never, RExtra = never> = {
  readonly scenarioLayer?: Layer.Layer<RScenario>
  readonly layer?: Layer.Layer<RExtra>
}

export type ScenarioBody<R = never> = Effect.Effect<unknown, StepError, R>

export type RegisterMode = 'run' | 'skip' | 'only'

const applyWhenBothPresent = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  scenarioLayer: Layer.Layer<never>,
  extra: Layer.Layer<never> | undefined,
): Effect.Effect<A, E, R> => {
  if (extra === void 0) {
    return effect.pipe(Effect.provide(Layer.fresh(scenarioLayer)))
  }
  return effect.pipe(Effect.provide(Layer.mergeAll(Layer.fresh(scenarioLayer), extra)))
}

const applyWhenScenarioMissing = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  extra: Layer.Layer<never> | undefined,
): Effect.Effect<A, E, R> => {
  if (extra === void 0) return effect
  return effect.pipe(Effect.provide(extra))
}

const applyDefinedOpts = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  opts: ScenarioOptions<never, never>,
): Effect.Effect<A, E, R> => {
  if (opts.scenarioLayer === void 0) return applyWhenScenarioMissing(effect, opts.layer)
  return applyWhenBothPresent(effect, opts.scenarioLayer, opts.layer)
}

const applyScenarioOpts = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  opts: ScenarioOptions<never, never> | null,
): Effect.Effect<A, E, R> => {
  if (opts === null) return effect
  return applyDefinedOpts(effect, opts)
}

const normalizePipeline = <R>(
  pipeline: Effect.Effect<unknown, StepError, R>,
): Effect.Effect<void, StepError, R> => pipeline.pipe(Effect.asVoid)

const composeWithBackground = <R>(
  pipeline: Effect.Effect<unknown, StepError, R>,
  background: Effect.Effect<unknown, StepError, R> | null,
): Effect.Effect<void, StepError, R> => {
  const normalized = normalizePipeline(pipeline)
  if (background === null) return normalized
  return normalizePipeline(background).pipe(Effect.flatMap(() => normalized))
}

const buildScenarioNoFresh = <R>(
  pipeline: Effect.Effect<unknown, StepError, R>,
  opts: ScenarioOptions<never, never> | null,
  background: Effect.Effect<unknown, StepError, R> | null,
): Effect.Effect<void, StepError, R> => {
  const effect = composeWithBackground(pipeline, background)
  return applyScenarioOpts(effect, opts)
}

const provideFreshOptional = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<never> | undefined,
): Effect.Effect<A, E, R> => {
  if (layer === void 0) return effect
  return effect.pipe(Effect.provide(Layer.fresh(layer)))
}

const layersFromOpts = (
  opts: ScenarioOptions<never, never> | null,
): ScenarioOptions<never, never> => {
  if (opts === null) return {}
  return opts
}

const buildScenarioWithFresh = <RShared, RFresh, RFreshReq>(
  pipeline: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>,
  opts: ScenarioOptions<never, never> | null,
  background: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
): Effect.Effect<void, StepError, RShared | RFreshReq> => {
  const composed = composeWithBackground(pipeline, background)
  const layers = layersFromOpts(opts)
  const withScenario = provideFreshOptional(composed, layers.scenarioLayer)
  const withExtra = applyWhenScenarioMissing(withScenario, layers.layer)
  return withExtra.pipe(Effect.provide(Layer.fresh(featureScenarioLayer)))
}

/**
 * A scenario title names a concrete situation in natural-language prose. Two
 * shape checks keep DAMP `Should_[Behavior]_When_[Condition]` unit-test names —
 * and every concatenated-token title shaped like one — out of the call site:
 *  1. the literal must not start with `Should`;
 *  2. the literal must contain at least one ASCII space (a single-word title is
 *     a test name, not prose).
 * Either check failing maps to `ScenarioTitleRejected`, so the call fails to
 * type-check with the rule in the diagnostic. Non-literal titles (widened
 * `string`) pass through untouched — a runtime guard would catch those, but
 * the brand is the contract this skill ships.
 */
export type ScenarioTitleRejected<T extends string> =
  | `Scenario titles are natural-language prose of a concrete situation, not DAMP Should_[Behavior]_When_[Condition] unit-test names. Got: ${T}`
  | `Scenario title must be natural-language prose (at least one space separates words); got: ${T}`

export type ScenarioTitle<T extends string> = T extends `Should${string}` ? ScenarioTitleRejected<T>
  : T extends `${string} ${string}` ? T
  : ScenarioTitleRejected<T>

type OutlineCallable<RShared = never, RFresh = never, RFreshReq = never> = {
  <
    TName extends string,
    const Rows extends readonly Record<string, unknown>[],
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
  >(
    name: ScenarioTitle<TName>,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  <
    TName extends string,
    const Rows extends readonly Record<string, unknown>[],
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: ScenarioTitle<TName>,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
  ): void
}

export type OutlineFn<RShared = never, RFresh = never, RFreshReq = never> =
  & OutlineCallable<RShared, RFresh, RFreshReq>
  & {
    readonly skip: OutlineCallable<RShared, RFresh, RFreshReq>
    readonly only: OutlineCallable<RShared, RFresh, RFreshReq>
  }

const optsOrNull = (
  opts: ScenarioOptions<never, never> | undefined,
): ScenarioOptions<never, never> | null => {
  if (opts === void 0) return null
  return opts
}

type OutlineRowRef<Row> = {
  readonly title: string
  readonly row: Row
}

const registerOutlineRows = <R, Row>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  rows: readonly OutlineRowRef<Row>[],
  mode: RegisterMode,
  build: (row: Row) => Effect.Effect<void, StepError, R>,
): void => {
  for (const { title, row } of rows) {
    register(title, build(row), mode)
  }
}

const registerOutlineResult = <R, Row extends Record<string, unknown>>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  name: string,
  expanded: Result.Result<readonly OutlineRowRef<Row>[], string>,
  mode: RegisterMode,
  build: (row: Row) => Effect.Effect<void, StepError, R>,
): void => {
  if (Result.isFailure(expanded)) {
    register(
      name,
      Effect.fail(StepError.make({ keyword: 'scenarioOutline', text: expanded.failure, cause: void 0 })),
      mode,
    )
    return
  }
  registerOutlineRows(register, expanded.success, mode, build)
}

const makeOutlineCallableNoFresh = <R = never>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, R> | null,
  mode: RegisterMode,
): OutlineCallable<R, never, never> => {
  function outlineFn<const Rows extends readonly Record<string, unknown>[], RPipe extends R | Scope.Scope>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends readonly Record<string, unknown>[],
    RExtra,
    RPipe extends R | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
    opts: ScenarioOptions<R, RExtra>,
  ): void
  function outlineFn<const Rows extends readonly Record<string, unknown>[]>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, R>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    registerOutlineResult(
      register,
      name,
      expandOutline(name, examples),
      mode,
      (row) => buildScenarioNoFresh<R>(stepFactory(row), optsOrNull(opts), getBackground()),
    )
  }
  return outlineFn
}

export const createOutlineFnNoFresh = <R = never>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, R> | null,
): OutlineFn<R, never> => {
  const base = makeOutlineCallableNoFresh<R>(register, getBackground, 'run')
  const skip = makeOutlineCallableNoFresh<R>(register, getBackground, 'skip')
  const only = makeOutlineCallableNoFresh<R>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}

const makeOutlineCallableWithFresh = <RShared, RFresh, RFreshReq>(
  register: (name: string, effect: Effect.Effect<void, StepError, RShared | RFreshReq>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  mode: RegisterMode,
): OutlineCallable<RShared, RFresh, RFreshReq> => {
  function outlineFn<
    const Rows extends readonly Record<string, unknown>[],
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends readonly Record<string, unknown>[],
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
  ): void
  function outlineFn<const Rows extends readonly Record<string, unknown>[]>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    registerOutlineResult(
      register,
      name,
      expandOutline(name, examples),
      mode,
      (row) =>
        buildScenarioWithFresh<RShared, RFresh, RFreshReq>(
          stepFactory(row),
          optsOrNull(opts),
          getBackground(),
          featureScenarioLayer,
        ),
    )
  }
  return outlineFn
}

export const createOutlineFnWithFresh = <RShared, RFresh, RFreshReq>(
  register: (name: string, effect: Effect.Effect<void, StepError, RShared | RFreshReq>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
): OutlineFn<RShared, RFresh, RFreshReq> => {
  const base = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'run',
  )
  const skip = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'skip',
  )
  const only = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'only',
  )
  return Object.assign(base, { skip, only })
}

export type HeadlessPipelineRejected =
  'Scenario pipeline must conclude with at least one Then step, not end on Given or When'

export type ValidScenarioPipeline<P> = P extends GherkinEffect<infer S, infer _E, infer _R> ? S extends ThenStage ? P
  : HeadlessPipelineRejected
  : P

type ScenarioCallable<RShared, RFresh, RFreshReq> = {
  <
    TName extends string,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
    P extends Effect.Effect<unknown, StepError, RPipe>,
  >(
    name: ScenarioTitle<TName>,
    pipeline: P & ValidScenarioPipeline<P>,
  ): void
  <
    TName extends string,
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
    P extends Effect.Effect<unknown, StepError, RPipe>,
  >(
    name: ScenarioTitle<TName>,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
    pipeline: P & ValidScenarioPipeline<P>,
  ): void
}

export type ScenarioFn<RShared = never, RFresh = never, RFreshReq = never> =
  & ScenarioCallable<RShared, RFresh, RFreshReq>
  & {
    readonly skip: ScenarioCallable<RShared, RFresh, RFreshReq>
    readonly only: ScenarioCallable<RShared, RFresh, RFreshReq>
  }

type EmptyScopeMap = Readonly<Record<string, never>>

export type FeatureBody<
  RShared = never,
  RFresh = never,
  RFreshReq = never,
  S extends ScopeMap = EmptyScopeMap,
> = (ctx: {
  readonly scenario: ScenarioFn<RShared, RFresh, RFreshReq>
  readonly background: (pipeline: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>) => void
  readonly scenarioOutline: OutlineFn<RShared, RFresh, RFreshReq>
  readonly scope: GherkinEffect<ScopeServices<S> & GivenStage, never, ScopeIdentifiers<S>>
  readonly Do: Effect.Effect<object, never, never>
}) => void

const isObjectValue = (v: unknown): v is object => {
  if (typeof v !== 'object') return false
  return v !== null
}

const hasScenarioOptKey = (v: object): boolean => {
  if ('scenarioLayer' in v) return true
  return 'layer' in v
}

const isScenarioOpts = (v: unknown): v is ScenarioOptions => {
  if (!isObjectValue(v)) return false
  return hasScenarioOptKey(v)
}

const missingPipelineArgs = <R>(): {
  pipeline: Effect.Effect<unknown, StepError, R>
  opts: null
} => ({
  pipeline: Effect.fail(
    StepError.make({ keyword: 'scenario', text: 'pipeline or options required', cause: void 0 }),
  ),
  opts: null,
})

const missingPipelineWithOpts = <R>(): {
  pipeline: Effect.Effect<unknown, StepError, R>
  opts: null
} => ({
  pipeline: Effect.fail(
    StepError.make({ keyword: 'scenario', text: 'pipeline is required when options are provided', cause: void 0 }),
  ),
  opts: null,
})

const resolveOptsAndPipeline = <R>(
  opts: ScenarioOptions<never, never>,
  third: Effect.Effect<unknown, StepError, R> | undefined,
): { pipeline: Effect.Effect<unknown, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (third === void 0) return missingPipelineWithOpts<R>()
  return { pipeline: third, opts }
}

const resolvePresentSecond = <R>(
  second: Effect.Effect<unknown, StepError, R> | ScenarioOptions<never, never>,
  third: Effect.Effect<unknown, StepError, R> | undefined,
): { pipeline: Effect.Effect<unknown, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (!isScenarioOpts(second)) return { pipeline: second, opts: null }
  return resolveOptsAndPipeline(second, third)
}

export const resolveScenarioArgs = <R>(
  second: Effect.Effect<unknown, StepError, R> | ScenarioOptions<never, never> | undefined,
  third: Effect.Effect<unknown, StepError, R> | undefined,
): { pipeline: Effect.Effect<unknown, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (second === void 0) return missingPipelineArgs<R>()
  return resolvePresentSecond(second, third)
}

const makeScenarioCallableNoFresh = <R>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, R> | null,
  mode: RegisterMode,
): ScenarioCallable<R, never, never> => {
  function scenarioFn<RPipe extends R | Scope.Scope>(
    name: string,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function scenarioFn<RExtra, RPipe extends R | Scope.Scope | RExtra>(
    name: string,
    opts: ScenarioOptions<R, RExtra>,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function scenarioFn(
    name: string,
    second: Effect.Effect<unknown, StepError, R> | ScenarioOptions<never, never>,
    third?: Effect.Effect<unknown, StepError, R>,
  ): void {
    const { pipeline, opts } = resolveScenarioArgs(second, third)
    const background = getBackground()
    register(name, buildScenarioNoFresh<R>(pipeline, opts, background), mode)
  }
  return scenarioFn
}

const makeScenarioCallableWithFresh = <RShared, RFresh, RFreshReq>(
  register: (name: string, effect: Effect.Effect<void, StepError, RShared | RFreshReq>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  mode: RegisterMode,
): ScenarioCallable<RShared, RFresh, RFreshReq> => {
  function scenarioFn<RPipe extends RShared | RFresh | RFreshReq | Scope.Scope>(
    name: string,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function scenarioFn<RExtra, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra>(
    name: string,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function scenarioFn(
    name: string,
    second:
      | Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>
      | ScenarioOptions<never, never>,
    third?: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>,
  ): void {
    const { pipeline, opts } = resolveScenarioArgs(second, third)
    const background = getBackground()
    register(
      name,
      buildScenarioWithFresh<RShared, RFresh, RFreshReq>(pipeline, opts, background, featureScenarioLayer),
      mode,
    )
  }
  return scenarioFn
}

export const createScenarioNoFresh = <R = never>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, R> | null,
): ScenarioFn<R, never> => {
  const base = makeScenarioCallableNoFresh<R>(register, getBackground, 'run')
  const skip = makeScenarioCallableNoFresh<R>(register, getBackground, 'skip')
  const only = makeScenarioCallableNoFresh<R>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}

export const createScenarioWithFresh = <RShared = never, RFresh = never, RFreshReq = never>(
  register: (name: string, effect: Effect.Effect<void, StepError, RShared | RFreshReq>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
): ScenarioFn<RShared, RFresh, RFreshReq> => {
  const base = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'run',
  )
  const skip = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'skip',
  )
  const only = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(
    register,
    getBackground,
    featureScenarioLayer,
    'only',
  )
  return Object.assign(base, { skip, only })
}
