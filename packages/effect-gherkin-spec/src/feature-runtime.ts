/// <reference types="vitest/importMeta" />
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import type { GherkinEffect, ScopeIdentifiers, ScopeMap, ScopeServices } from './do-notation.js'
import { expandOutline } from './outline-expand.js'
import { StepError } from './step-error.js'

export type ScenarioOptions<RScenario = never, RExtra = never> = {
  readonly scenarioLayer?: Layer.Layer<RScenario>
  readonly layer?: Layer.Layer<RExtra>
}

export type ScenarioBody<R = never> = Effect.Effect<unknown, StepError, R>

export type RegisterMode = 'run' | 'skip' | 'only'

const applyScenarioOpts = <R, A, E>(
  effect: Effect.Effect<A, E, R>,
  opts: ScenarioOptions<never, never> | null,
): Effect.Effect<A, E, R> => {
  if (opts?.scenarioLayer !== void 0 && opts.layer !== void 0) {
    return effect.pipe(
      Effect.provide(Layer.mergeAll(Layer.fresh(opts.scenarioLayer), opts.layer)),
    )
  }
  if (opts?.scenarioLayer !== void 0) {
    return effect.pipe(Effect.provide(Layer.fresh(opts.scenarioLayer)))
  }
  if (opts?.layer !== void 0) {
    return effect.pipe(Effect.provide(opts.layer))
  }
  return effect
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

const buildScenarioWithFresh = <RShared, RFresh, RFreshReq>(
  pipeline: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>,
  opts: ScenarioOptions<never, never> | null,
  background: Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq> | null,
  featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
): Effect.Effect<void, StepError, RShared | RFreshReq> => {
  const composed = composeWithBackground(pipeline, background)
  let result = composed
  if (opts?.scenarioLayer !== void 0) {
    result = result.pipe(Effect.provide(Layer.fresh(opts.scenarioLayer)))
  }
  if (opts?.layer !== void 0) {
    result = result.pipe(Effect.provide(opts.layer))
  }
  return result.pipe(Effect.provide(Layer.fresh(featureScenarioLayer)))
}

type OutlineCallable<RShared = never, RFresh = never, RFreshReq = never> = {
  <const Rows extends ReadonlyArray<Record<string, unknown>>, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  <
    const Rows extends ReadonlyArray<Record<string, unknown>>,
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: string,
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

const makeOutlineCallableNoFresh = <R = never>(
  register: (name: string, effect: Effect.Effect<void, StepError, R>, mode: RegisterMode) => void,
  getBackground: () => Effect.Effect<unknown, StepError, R> | null,
  mode: RegisterMode,
): OutlineCallable<R, never, never> => {
  function outlineFn<const Rows extends ReadonlyArray<Record<string, unknown>>, RPipe extends R | Scope.Scope>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends ReadonlyArray<Record<string, unknown>>,
    RExtra,
    RPipe extends R | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
    opts: ScenarioOptions<R, RExtra>,
  ): void
  function outlineFn<const Rows extends ReadonlyArray<Record<string, unknown>>>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, R>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    const expandedRows = expandOutline(name, examples)
    for (const { title, row } of expandedRows) {
      const pipeline = stepFactory(row)
      const scenarioEffect = buildScenarioNoFresh<R>(pipeline, opts ?? null, getBackground())
      register(title, scenarioEffect, mode)
    }
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
    const Rows extends ReadonlyArray<Record<string, unknown>>,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
  ): void
  function outlineFn<
    const Rows extends ReadonlyArray<Record<string, unknown>>,
    RExtra,
    RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra,
  >(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RPipe>,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
  ): void
  function outlineFn<const Rows extends ReadonlyArray<Record<string, unknown>>>(
    name: string,
    examples: Rows,
    stepFactory: (row: Rows[number]) => Effect.Effect<unknown, StepError, RShared | RFresh | RFreshReq>,
    opts?: ScenarioOptions<never, never>,
  ): void {
    const expandedRows = expandOutline(name, examples)
    for (const { title, row } of expandedRows) {
      const pipeline = stepFactory(row)
      const scenarioEffect = buildScenarioWithFresh<RShared, RFresh, RFreshReq>(
        pipeline,
        opts ?? null,
        getBackground(),
        featureScenarioLayer,
      )
      register(title, scenarioEffect, mode)
    }
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

type ScenarioCallable<RShared, RFresh, RFreshReq> = {
  <RPipe extends RShared | RFresh | RFreshReq | Scope.Scope>(
    name: string,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  <RExtra, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra>(
    name: string,
    opts: ScenarioOptions<RShared | RFresh | RFreshReq, RExtra>,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
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
  readonly scope: GherkinEffect<ScopeServices<S>, never, ScopeIdentifiers<S>>
  readonly Do: Effect.Effect<object, never, never>
}) => void

const isScenarioOpts = (v: unknown): v is ScenarioOptions =>
  typeof v === 'object' && v !== null && ('scenarioLayer' in v || 'layer' in v)

const resolveScenarioArgs = <R>(
  second: Effect.Effect<unknown, StepError, R> | ScenarioOptions<never, never> | undefined,
  third: Effect.Effect<unknown, StepError, R> | undefined,
): { pipeline: Effect.Effect<unknown, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (second === void 0) {
    throw new Error('scenario: pipeline or options required')
  }
  if (!isScenarioOpts(second)) {
    return { pipeline: second, opts: null }
  }
  if (third === void 0) {
    throw new Error('scenario: pipeline is required when options are provided')
  }
  return { pipeline: third, opts: second }
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

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('@effect/vitest')
  const Context = await import('effect/Context')
  const EffectModule = await import('effect/Effect')
  const LayerModule = await import('effect/Layer')

  describe('applyScenarioOpts', () => {
    it('Should_ReturnEffectUnchanged_When_OptsIsNull', () => {
      const effect = EffectModule.void
      const result = applyScenarioOpts(effect, null)
      expect(result).toBe(effect)
    })

    it('Should_ProvideLayer_When_OptsHasLayer', () =>
      EffectModule.gen(function*() {
        class ApplySvc1 extends Context.Tag('ApplySvc1')<ApplySvc1, string>() {}
        const layer = LayerModule.effect(ApplySvc1, EffectModule.succeed('provided'))
        const needs = EffectModule.gen(function*() {
          const svc = yield* ApplySvc1
          return svc
        })
        const result = yield* applyScenarioOpts(needs, { layer })
        expect(result).toBe('provided')
      }))

    it('Should_ProvideFreshLayer_When_OptsHasScenarioLayer', () =>
      EffectModule.gen(function*() {
        class ApplySvc2 extends Context.Tag('ApplySvc2')<ApplySvc2, number>() {}
        let count = 0
        const layer = LayerModule.effect(ApplySvc2, EffectModule.sync(() => ++count))
        const needs = EffectModule.gen(function*() {
          const svc = yield* ApplySvc2
          return svc
        })
        const r1 = yield* applyScenarioOpts(needs, { scenarioLayer: layer })
        const r2 = yield* applyScenarioOpts(needs, { scenarioLayer: layer })
        expect(r1).toBe(1)
        expect(r2).toBe(2)
      }))

    it('Should_ApplyBothProvides_When_OptsHasScenarioLayerAndLayer', () =>
      EffectModule.gen(function*() {
        class ApplyBothSvc extends Context.Tag('ApplyBothSvc')<ApplyBothSvc, string>() {}
        const outerLayer = LayerModule.effect(ApplyBothSvc, EffectModule.succeed('outer'))
        const innerLayer = LayerModule.effect(ApplyBothSvc, EffectModule.succeed('inner'))
        const needs = EffectModule.gen(function*() {
          const svc = yield* ApplyBothSvc
          return svc
        })
        const result = yield* applyScenarioOpts(needs, { scenarioLayer: outerLayer, layer: innerLayer })
        expect(result).toBe('inner')
      }))
  })

  describe('buildScenarioNoFresh', () => {
    it('Should_ExecutePipeline_When_NoOpts', () =>
      EffectModule.gen(function*() {
        const trace: string[] = []
        const pipeline = EffectModule.sync(() => {
          trace.push('step1')
          trace.push('step2')
        })
        yield* buildScenarioNoFresh(pipeline, null, null)
        expect(trace).toEqual(['step1', 'step2'])
      }))

    it('Should_RunBackgroundBeforeScenario_When_BackgroundProvided', () =>
      EffectModule.gen(function*() {
        const trace: string[] = []
        const background = EffectModule.sync(() => {
          trace.push('bg')
        })
        const pipeline = EffectModule.sync(() => {
          trace.push('scenario')
        })
        yield* buildScenarioNoFresh(pipeline, null, background)
        expect(trace).toEqual(['bg', 'scenario'])
      }))

    it('Should_DiscardBackgroundScope_When_ScenarioRuns', () =>
      EffectModule.gen(function*() {
        const trace: string[] = []
        const background = EffectModule.succeed({ bgData: 1 }).pipe(
          EffectModule.tap(() => {
            trace.push('bg')
          }),
        )
        const pipeline = EffectModule.sync(() => {
          trace.push('scenario')
        })
        yield* buildScenarioNoFresh(pipeline, null, background)
        expect(trace).toEqual(['bg', 'scenario'])
      }))

    it('Should_ApplyLayer_When_OptsHasLayer', () =>
      EffectModule.gen(function*() {
        class BuildSvc3 extends Context.Tag('BuildSvc3')<BuildSvc3, string>() {}
        const layer = LayerModule.effect(BuildSvc3, EffectModule.succeed('ok'))
        const pipeline = EffectModule.void
        yield* buildScenarioNoFresh(pipeline, { layer }, null)
      }))
  })

  describe('buildScenarioWithFresh', () => {
    it('Should_ApplyFreshLayerPerCall_When_FeatureScenarioLayerProvided', () =>
      EffectModule.gen(function*() {
        let counter = 0
        class BuildSvc4 extends Context.Tag('BuildSvc4')<BuildSvc4, number>() {}
        const freshLayer = LayerModule.effect(BuildSvc4, EffectModule.sync(() => ++counter))
        const pipeline = EffectModule.void
        yield* buildScenarioWithFresh(pipeline, null, null, freshLayer)
        yield* buildScenarioWithFresh(pipeline, null, null, freshLayer)
        expect(counter).toBe(2)
      }))

    it('Should_RunBackgroundAndApplyFresh_When_BothProvided', () =>
      EffectModule.gen(function*() {
        let counter = 0
        class BuildSvc5 extends Context.Tag('BuildSvc5')<BuildSvc5, number>() {}
        const freshLayer = LayerModule.effect(BuildSvc5, EffectModule.sync(() => ++counter))
        const background = EffectModule.void
        const pipeline = EffectModule.void
        yield* buildScenarioWithFresh(pipeline, null, background, freshLayer)
        expect(counter).toBe(1)
      }))
  })

  describe('createScenarioNoFresh', () => {
    const record = () => {
      const registered: Array<{ name: string; mode: RegisterMode }> = []
      return {
        registered,
        scenario: createScenarioNoFresh(
          (name, _effect, mode) => registered.push({ name, mode }),
          () => null,
        ),
      }
    }

    it('Should_CallRegisterWithRunMode_When_BaseScenarioCalled', () => {
      const { registered, scenario } = record()
      scenario('test', EffectModule.void)
      expect(registered).toEqual([{ name: 'test', mode: 'run' }])
    })

    it('Should_CallRegisterWithSkipMode_When_SkipCalled', () => {
      const { registered, scenario } = record()
      scenario.skip('skipped', EffectModule.void)
      expect(registered).toEqual([{ name: 'skipped', mode: 'skip' }])
    })

    it('Should_CallRegisterWithOnlyMode_When_OnlyCalled', () => {
      const { registered, scenario } = record()
      scenario.only('only', EffectModule.void)
      expect(registered).toEqual([{ name: 'only', mode: 'only' }])
    })

    it('Should_AcceptScenarioOptions_When_SecondArgIsOpts', () => {
      const { registered, scenario } = record()
      scenario('test', { layer: LayerModule.empty }, EffectModule.void)
      expect(registered).toHaveLength(1)
      expect(registered[0]?.mode).toBe('run')
    })
  })

  describe('createOutlineFnNoFresh', () => {
    it('Should_RegisterOneTestPerExample_When_ExamplesProvided', () => {
      const registered: Array<{ name: string; mode: RegisterMode }> = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => {
          registered.push({ name, mode })
        },
        () => null,
      )
      outline('test', [{ x: '1' }, { x: '2' }], () => EffectModule.void)
      expect(registered).toHaveLength(2)
      expect(registered.every((r) => r.mode === 'run')).toBe(true)
    })

    it('Should_PassTypedRow_When_ExamplesExpand', () => {
      type Row = { role: string; id: string }
      const receivedRows: Array<Row> = []
      const outline = createOutlineFnNoFresh(
        () => void 0,
        () => null,
      )
      outline(
        'test',
        [{ role: 'admin', id: '1' }, { role: 'user', id: '2' }] satisfies ReadonlyArray<Row>,
        (row: Row) => {
          receivedRows.push(row)
          return EffectModule.void
        },
      )
      expect(receivedRows).toEqual([{ role: 'admin', id: '1' }, { role: 'user', id: '2' }])
    })

    it('Should_ExpandTemplateTitles_When_NameHasPlaceholders', () => {
      const registered: Array<string> = []
      const outline = createOutlineFnNoFresh(
        (name) => {
          registered.push(name)
        },
        () => null,
      )
      outline('test <role>', [{ role: 'admin' }, { role: 'user' }], () => EffectModule.void)
      expect(registered).toEqual(['test admin', 'test user'])
    })

    it('Should_CallRegisterWithSkipMode_When_SkipCalled', () => {
      const registered: Array<{ name: string; mode: RegisterMode }> = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => registered.push({ name, mode }),
        () => null,
      )
      outline.skip('skipped', [{ x: '1' }], () => EffectModule.void)
      expect(registered).toEqual([{ name: 'skipped', mode: 'skip' }])
    })

    it('Should_CallRegisterWithOnlyMode_When_OnlyCalled', () => {
      const registered: Array<{ name: string; mode: RegisterMode }> = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => registered.push({ name, mode }),
        () => null,
      )
      outline.only('focused', [{ x: '1' }], () => EffectModule.void)
      expect(registered).toEqual([{ name: 'focused', mode: 'only' }])
    })
  })

  describe('composeWithBackground', () => {
    it('Should_ReturnPipelineDirectly_When_NoBackground', () =>
      EffectModule.gen(function*() {
        const trace: string[] = []
        const pipeline = EffectModule.sync(() => {
          trace.push('scenario')
        })
        yield* composeWithBackground(pipeline, null)
        expect(trace).toEqual(['scenario'])
      }))

    it('Should_RunBackgroundBeforeScenario_When_BackgroundProvided', () =>
      EffectModule.gen(function*() {
        const trace: string[] = []
        const background = EffectModule.sync(() => {
          trace.push('bg')
        })
        const pipeline = EffectModule.sync(() => {
          trace.push('scenario')
        })
        yield* composeWithBackground(pipeline, background)
        expect(trace).toEqual(['bg', 'scenario'])
      }))

    it('Should_DiscardBackgroundScope_When_ScenarioRuns', () =>
      EffectModule.gen(function*() {
        const background = EffectModule.succeed({ bgData: 'should be discarded' })
        const pipeline = EffectModule.succeed('scenario-result')
        const result = yield* composeWithBackground(pipeline, background)
        expect(result).toBe(void 0)
      }))
  })

  describe('normalizePipeline', () => {
    it('Should_ReturnVoidEffect_When_GivenAnyEffect', () =>
      EffectModule.gen(function*() {
        const pipeline = EffectModule.succeed({ data: 42 })
        const result = yield* normalizePipeline(pipeline)
        expect(result).toBe(void 0)
      }))
  })

  describe('isScenarioOpts', () => {
    const falseInputs = [null, void 0, 'string', 42, true, {}, { name: 'test' }] as const
    for (const v of falseInputs) {
      it(`Should_ReturnFalse_When_${JSON.stringify(v)}`, () => {
        expect(isScenarioOpts(v)).toBe(false)
      })
    }

    it('Should_ReturnTrue_When_ObjectHasScenarioLayer', () => {
      expect(isScenarioOpts({ scenarioLayer: LayerModule.empty })).toBe(true)
    })

    it('Should_ReturnTrue_When_ObjectHasLayer', () => {
      expect(isScenarioOpts({ layer: LayerModule.empty })).toBe(true)
    })

    it('Should_ReturnTrue_When_ObjectHasBothLayerKeys', () => {
      expect(isScenarioOpts({ scenarioLayer: LayerModule.empty, layer: LayerModule.empty })).toBe(true)
    })
  })

  describe('resolveScenarioArgs', () => {
    it('Should_Throw_When_SecondArgUndefined', () => {
      expect(() => resolveScenarioArgs(void 0, void 0)).toThrow('pipeline or options required')
    })

    it('Should_ReturnPipelineDirectly_When_SecondArgIsEffect', () => {
      const effect = EffectModule.void
      const result = resolveScenarioArgs(effect, void 0)
      expect(result.pipeline).toBe(effect)
      expect(result.opts).toBeNull()
    })

    it('Should_ReturnOptsAndPipeline_When_SecondArgIsOpts', () => {
      const opts = { layer: LayerModule.empty }
      const effect = EffectModule.void
      const result = resolveScenarioArgs(opts, effect)
      expect(result.opts).toBe(opts)
      expect(result.pipeline).toBe(effect)
    })

    it('Should_Throw_When_OptsProvidedButNoPipeline', () => {
      expect(() => resolveScenarioArgs({ layer: LayerModule.empty }, void 0)).toThrow(
        'pipeline is required when options are provided',
      )
    })
  })
}
