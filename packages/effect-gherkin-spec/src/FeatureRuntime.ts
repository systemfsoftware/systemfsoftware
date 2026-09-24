/// <reference types="vitest/importMeta" />
import type { Suite } from '@systemfsoftware/effect-spec-runtime'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import * as CaseLayers from './CaseLayers.js'
import type { GherkinEffect, GivenStage, ScopeIdentifiers, ScopeMap, ScopeServices, ThenStage } from './DoNotation.js'
import { makeFreshSoftContext, SoftFailuresRef } from './DoNotation.js'
import { expandOutline } from './OutlineExpand.js'
import { StepError } from './StepError.schema.js'

export type ScenarioOptions<RScenario = never, RExtra = never> = {
  readonly scenarioLayer?: Layer.Layer<RScenario>
  readonly layer?: Layer.Layer<RExtra>
  readonly live?: string
}

type Top<T = unknown> = T

export type ScenarioBody<R = never> = Effect.Effect<Top, StepError, R>

export type RegisterMode = Suite.RegisterMode
const caseLayersFrom = (opts: ScenarioOptions<never, never> | null): CaseLayers.Layers => {
  if (opts === null) return CaseLayers.empty
  return { scenarioLayer: opts.scenarioLayer, extra: opts.layer }
}

const liveOf = (opts: ScenarioOptions<never, never> | null): Suite.LiveCase | undefined =>
  Option.fromNullishOr(opts?.live).pipe(
    Option.map((reason) => ({ reason })),
    Option.getOrUndefined,
  )

export const checkSoftFailures = <R>(
  effect: Effect.Effect<void, StepError, R>,
): Effect.Effect<void, StepError, R> =>
  Effect.gen(function*() {
    yield* effect
    const soft = yield* SoftFailuresRef
    const failures = soft.getFailures()
    if (failures.length > 0) {
      const messages = failures.map((f) => `${f.keyword} ${f.text}: ${String(f.cause)}`)
      return yield* StepError.make({
        keyword: 'then',
        text: 'soft assertions failed',
        cause: messages.join('\n'),
      })
    }
  }).pipe(Effect.provideService(SoftFailuresRef, makeFreshSoftContext()))

const normalizePipeline = <R>(
  pipeline: Effect.Effect<Top, StepError, R>,
): Effect.Effect<void, StepError, R> => checkSoftFailures(pipeline.pipe(Effect.asVoid))

const composeWithBackground = <R>(
  pipeline: Effect.Effect<Top, StepError, R>,
  background: Effect.Effect<Top, StepError, R> | null,
): Effect.Effect<void, StepError, R> => {
  const normalized = normalizePipeline(pipeline)
  if (background === null) return normalized
  return normalizePipeline(background).pipe(Effect.flatMap(() => normalized))
}

const buildScenario = <R>(
  pipeline: Effect.Effect<Top, StepError, R>,
  opts: ScenarioOptions<never, never> | null,
  background: Effect.Effect<Top, StepError, R> | null,
): Effect.Effect<void, StepError, R> =>
  CaseLayers.compose(composeWithBackground(pipeline, background), caseLayersFrom(opts))

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
    const Rows extends readonly Record<string, Top>[],
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
  >(
    name: ScenarioTitle<TName>,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
  ): void
  <
    TName extends string,
    const Rows extends readonly Record<string, Top>[],
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: ScenarioTitle<TName>,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
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
  register: Register4<Effect.Effect<void, StepError, R>>,
  live: Suite.LiveCase | undefined,
  rows: readonly OutlineRowRef<Row>[],
  mode: RegisterMode,
  build: (row: Row) => Effect.Effect<void, StepError, R>,
): void => {
  for (const { title, row } of rows) {
    register(title, build(row), mode, live)
  }
}

const registerOutlineResult = <R, Row extends Record<string, Top>>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  name: string,
  expanded: Result.Result<readonly OutlineRowRef<Row>[], string>,
  mode: RegisterMode,
  opts: ScenarioOptions<never, never> | null,
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
  registerOutlineRows(register, liveOf(opts), expanded.success, mode, build)
}

const makeOutlineCallableNoFresh = <R = never>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  getBackground: () => Effect.Effect<Top, StepError, R> | null,
  mode: RegisterMode,
): OutlineCallable<R, never, never> => {
  function outlineFn<const Rows extends readonly Record<string, Top>[], RPipe extends R | Scope.Scope>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends readonly Record<string, Top>[],
    RExtra,
    RPipe extends R | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
    opts: ScenarioOptions<R, RExtra>,
  ): void
  function outlineFn<const Rows extends readonly Record<string, Top>[]>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, R>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    registerOutlineResult(
      register,
      name,
      expandOutline(name, examples),
      mode,
      optsOrNull(opts),
      (row) => buildScenario<R>(stepFactory(row), optsOrNull(opts), getBackground()),
    )
  }
  return outlineFn
}

const createOutlineFnNoFreshImpl = <R = never>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  getBackground: () => Effect.Effect<Top, StepError, R> | null,
): OutlineFn<R, never> => {
  const base = makeOutlineCallableNoFresh<R>(register, getBackground, 'run')
  const skip = makeOutlineCallableNoFresh<R>(register, getBackground, 'skip')
  const only = makeOutlineCallableNoFresh<R>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}

export const createOutlineFnNoFresh: {
  <R = never>(
    getBackground: () => Effect.Effect<Top, StepError, R> | null,
  ): (
    register: Register4<Effect.Effect<void, StepError, R>>,
  ) => OutlineFn<R, never>
  <R = never>(
    register: Register4<Effect.Effect<void, StepError, R>>,
    getBackground: () => Effect.Effect<Top, StepError, R> | null,
  ): OutlineFn<R, never>
} = dual(2, createOutlineFnNoFreshImpl)

const makeOutlineCallableWithFresh = <RShared, RFresh, RFreshReq>(
  register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  mode: RegisterMode,
): OutlineCallable<RShared, RFresh, RFreshReq> => {
  function outlineFn<
    const Rows extends readonly Record<string, Top>[],
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends readonly Record<string, Top>[],
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RPipe>,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
  ): void
  function outlineFn<const Rows extends readonly Record<string, Top>[]>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    registerOutlineResult(
      register,
      name,
      expandOutline(name, examples),
      mode,
      optsOrNull(opts),
      (row) => buildScenario<RShared | RFresh | RFreshReq>(stepFactory(row), optsOrNull(opts), getBackground()),
    )
  }
  return outlineFn
}
const createOutlineFnWithFreshImpl = <RShared, RFresh, RFreshReq>(
  register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
): OutlineFn<RShared, RFresh, RFreshReq> => {
  const base = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'run')
  const skip = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'skip')
  const only = makeOutlineCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}
export const createOutlineFnWithFresh: {
  <RShared, RFresh, RFreshReq>(
    getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  ): (
    register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  ) => OutlineFn<RShared, RFresh, RFreshReq>
  <RShared, RFresh, RFreshReq>(
    register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
    getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  ): OutlineFn<RShared, RFresh, RFreshReq>
} = dual(2, createOutlineFnWithFreshImpl)

export type HeadlessPipelineRejected =
  'Scenario pipeline must conclude with at least one Then step, not end on Given or When'

export type ValidScenarioPipeline<P> = P extends GherkinEffect<infer S, infer _E, infer _R> ? S extends ThenStage ? P
  : HeadlessPipelineRejected
  : P

type ScenarioCallable<RShared, RFresh, RFreshReq> = {
  <
    TName extends string,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
    P extends Effect.Effect<Top, StepError, RPipe>,
  >(
    name: ScenarioTitle<TName>,
    pipeline: P & ValidScenarioPipeline<P>,
  ): void
  <
    TName extends string,
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
    P extends Effect.Effect<Top, StepError, RPipe>,
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
  readonly background: (pipeline: Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq>) => void
  readonly scenarioOutline: OutlineFn<RShared, RFresh, RFreshReq>
  readonly scope: GherkinEffect<ScopeServices<S> & GivenStage, never, ScopeIdentifiers<S>>
  readonly Do: Effect.Effect<object, never, never>
}) => void

const isObjectValue = (v: unknown): v is object => {
  if (typeof v !== 'object') return false
  return v !== null
}

const SCENARIO_OPT_KEYS: ReadonlyArray<string> = ['scenarioLayer', 'layer', 'live']

const hasScenarioOptKey = (v: object): boolean => SCENARIO_OPT_KEYS.some((key) => key in v)

const isScenarioOpts = (v: unknown): v is ScenarioOptions => {
  if (!isObjectValue(v)) return false
  return hasScenarioOptKey(v)
}

const missingPipelineArgs = <R>(): {
  pipeline: Effect.Effect<Top, StepError, R>
  opts: null
} => ({
  pipeline: Effect.fail(
    StepError.make({ keyword: 'scenario', text: 'pipeline or options required', cause: void 0 }),
  ),
  opts: null,
})

const missingPipelineWithOpts = <R>(): {
  pipeline: Effect.Effect<Top, StepError, R>
  opts: null
} => ({
  pipeline: Effect.fail(
    StepError.make({ keyword: 'scenario', text: 'pipeline is required when options are provided', cause: void 0 }),
  ),
  opts: null,
})

const resolveOptsAndPipeline = <R>(
  opts: ScenarioOptions<never, never>,
  third: Effect.Effect<Top, StepError, R> | undefined,
): { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (third === void 0) return missingPipelineWithOpts<R>()
  return { pipeline: third, opts }
}

const resolvePresentSecond = <R>(
  second: Effect.Effect<Top, StepError, R> | ScenarioOptions<never, never>,
  third: Effect.Effect<Top, StepError, R> | undefined,
): { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (!isScenarioOpts(second)) return { pipeline: second, opts: null }
  return resolveOptsAndPipeline(second, third)
}

const resolveScenarioArgsImpl = <R>(
  second: Effect.Effect<Top, StepError, R> | ScenarioOptions<never, never> | undefined,
  third: Effect.Effect<Top, StepError, R> | undefined,
): { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (second === void 0) return missingPipelineArgs<R>()
  return resolvePresentSecond(second, third)
}

export const resolveScenarioArgs: {
  <R = never>(
    third: Effect.Effect<Top, StepError, R> | undefined,
  ): (
    second: Effect.Effect<Top, StepError, R> | ScenarioOptions<never, never> | undefined,
  ) => { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null }
  <R = never>(
    second: Effect.Effect<Top, StepError, R> | ScenarioOptions<never, never> | undefined,
    third: Effect.Effect<Top, StepError, R> | undefined,
  ): { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null }
} = dual(2, resolveScenarioArgsImpl)

type Register4<Body> = (name: string, effect: Body, mode: RegisterMode, live?: Suite.LiveCase) => void
const registerResolved = <R>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  name: string,
  mode: RegisterMode,
  background: Effect.Effect<Top, StepError, R> | null,
  resolved: { pipeline: Effect.Effect<Top, StepError, R>; opts: ScenarioOptions<never, never> | null },
): void => {
  register(name, buildScenario<R>(resolved.pipeline, resolved.opts, background), mode, liveOf(resolved.opts))
}

const makeScenarioCallableNoFresh = <R>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  getBackground: () => Effect.Effect<Top, StepError, R> | null,
  mode: RegisterMode,
): ScenarioCallable<R, never, never> => {
  function scenarioFn<RPipe extends R | Scope.Scope>(
    name: string,
    pipeline: Effect.Effect<Top, StepError, RPipe>,
  ): void
  function scenarioFn<RExtra, RPipe extends R | Scope.Scope | RExtra>(
    name: string,
    opts: ScenarioOptions<R, RExtra>,
    pipeline: Effect.Effect<Top, StepError, RPipe>,
  ): void
  function scenarioFn(
    name: string,
    second: Effect.Effect<Top, StepError, R> | ScenarioOptions<never, never>,
    third?: Effect.Effect<Top, StepError, R>,
  ): void {
    return registerResolved(register, name, mode, getBackground(), resolveScenarioArgs(second, third))
  }
  return scenarioFn
}

const makeScenarioCallableWithFresh = <RShared, RFresh, RFreshReq>(
  register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  mode: RegisterMode,
): ScenarioCallable<RShared, RFresh, RFreshReq> => {
  function scenarioFn<RPipe extends RShared | RFresh | RFreshReq | Scope.Scope>(
    name: string,
    pipeline: Effect.Effect<Top, StepError, RPipe>,
  ): void
  function scenarioFn<RExtra, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra>(
    name: string,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
    pipeline: Effect.Effect<Top, StepError, RPipe>,
  ): void
  function scenarioFn(
    name: string,
    second:
      | Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq>
      | ScenarioOptions<never, never>,
    third?: Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq>,
  ): void {
    return registerResolved(register, name, mode, getBackground(), resolveScenarioArgs(second, third))
  }
  return scenarioFn
}

const createScenarioNoFreshImpl = <R = never>(
  register: Register4<Effect.Effect<void, StepError, R>>,
  getBackground: () => Effect.Effect<Top, StepError, R> | null,
): ScenarioFn<R, never> => {
  const base = makeScenarioCallableNoFresh<R>(register, getBackground, 'run')
  const skip = makeScenarioCallableNoFresh<R>(register, getBackground, 'skip')
  const only = makeScenarioCallableNoFresh<R>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}

export const createScenarioNoFresh: {
  <R = never>(
    getBackground: () => Effect.Effect<Top, StepError, R> | null,
  ): (
    register: Register4<Effect.Effect<void, StepError, R>>,
  ) => ScenarioFn<R, never>
  <R = never>(
    register: Register4<Effect.Effect<void, StepError, R>>,
    getBackground: () => Effect.Effect<Top, StepError, R> | null,
  ): ScenarioFn<R, never>
} = dual(2, createScenarioNoFreshImpl)

const createScenarioWithFreshImpl = <RShared = never, RFresh = never, RFreshReq = never>(
  register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
): ScenarioFn<RShared, RFresh, RFreshReq> => {
  const base = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'run')
  const skip = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'skip')
  const only = makeScenarioCallableWithFresh<RShared, RFresh, RFreshReq>(register, getBackground, 'only')
  return Object.assign(base, { skip, only })
}

export const createScenarioWithFresh: {
  <RShared = never, RFresh = never, RFreshReq = never>(
    getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  ): (
    register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
  ) => ScenarioFn<RShared, RFresh, RFreshReq>
  <RShared = never, RFresh = never, RFreshReq = never>(
    register: Register4<Effect.Effect<void, StepError, RShared | RFresh | RFreshReq>>,
    getBackground: () => Effect.Effect<Top, StepError, RShared | RFresh | RFreshReq> | null,
  ): ScenarioFn<RShared, RFresh, RFreshReq>
} = dual(2, createScenarioWithFreshImpl)
