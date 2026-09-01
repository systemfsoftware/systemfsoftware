/// <reference types="vitest/importMeta" />
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import type { GherkinEffect, ScopeIdentifiers, ScopeMap, ScopeServices } from './DoNotation.js'
import { expandOutline } from './OutlineExpand.js'
import { StepError } from './StepError.schema.js'

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
    const expanded = expandOutline(name, examples)
    if (Result.isFailure(expanded)) {
      register(
        name,
        Effect.fail(StepError.make({ keyword: 'scenarioOutline', text: expanded.failure, cause: void 0 })),
        mode,
      )
      return
    }
    for (const { title, row } of expanded.success) {
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
    const expanded = expandOutline(name, examples)
    if (Result.isFailure(expanded)) {
      register(
        name,
        Effect.fail(StepError.make({ keyword: 'scenarioOutline', text: expanded.failure, cause: void 0 })),
        mode,
      )
      return
    }
    for (const { title, row } of expanded.success) {
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
  <TName extends string, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope>(
    name: ScenarioTitle<TName>,
    pipeline: Effect.Effect<unknown, StepError, RPipe>,
  ): void
  <TName extends string, RExtra, RPipe extends RShared | RFresh | RFreshReq | Scope.Scope | RExtra>(
    name: ScenarioTitle<TName>,
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

export const resolveScenarioArgs = <R>(
  second: Effect.Effect<unknown, StepError, R> | ScenarioOptions<never, never> | undefined,
  third: Effect.Effect<unknown, StepError, R> | undefined,
): { pipeline: Effect.Effect<unknown, StepError, R>; opts: ScenarioOptions<never, never> | null } => {
  if (second === void 0) {
    return {
      pipeline: Effect.fail(
        StepError.make({ keyword: 'scenario', text: 'pipeline or options required', cause: void 0 }),
      ),
      opts: null,
    }
  }
  if (!isScenarioOpts(second)) {
    return { pipeline: second, opts: null }
  }
  if (third === void 0) {
    return {
      pipeline: Effect.fail(
        StepError.make({ keyword: 'scenario', text: 'pipeline is required when options are provided', cause: void 0 }),
      ),
      opts: null,
    }
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

  describe('buildScenarioNoFresh', () => {
    it.effect('Should_ApplyLayer_When_OptsHasLayer', () =>
      EffectModule.gen(function*() {
        class BuildSvc3 extends Context.Service<BuildSvc3, string>()(
          '@systemfsoftware/effect-gherkin-spec/FeatureRuntime/BuildSvc3',
        ) {}
        const layer = LayerModule.effect(BuildSvc3, EffectModule.succeed('ok'))
        const pipeline = EffectModule.void
        yield* buildScenarioNoFresh(pipeline, { layer }, null)
      }))
  })

  describe('buildScenarioWithFresh', () => {
    it.effect('Should_ApplyFreshLayerPerCall_When_FeatureScenarioLayerProvided', () =>
      EffectModule.gen(function*() {
        let counter = 0
        class BuildSvc4 extends Context.Service<BuildSvc4, number>()(
          '@systemfsoftware/effect-gherkin-spec/FeatureRuntime/BuildSvc4',
        ) {}
        const freshLayer = LayerModule.effect(BuildSvc4, EffectModule.sync(() => ++counter))
        const pipeline = EffectModule.void
        yield* buildScenarioWithFresh(pipeline, null, null, freshLayer)
        yield* buildScenarioWithFresh(pipeline, null, null, freshLayer)
        expect(counter).toMatchInlineSnapshot(`2`)
      }))

    it.effect('Should_RunBackgroundAndApplyFresh_When_BothProvided', () =>
      EffectModule.gen(function*() {
        let counter = 0
        class BuildSvc5 extends Context.Service<BuildSvc5, number>()(
          '@systemfsoftware/effect-gherkin-spec/FeatureRuntime/BuildSvc5',
        ) {}
        const freshLayer = LayerModule.effect(BuildSvc5, EffectModule.sync(() => ++counter))
        const background = EffectModule.void
        const pipeline = EffectModule.void
        yield* buildScenarioWithFresh(pipeline, null, background, freshLayer)
        expect(counter).toMatchInlineSnapshot(`1`)
      }))
  })

  describe('createScenarioNoFresh', () => {
    const record = () => {
      const registered: { name: string; mode: RegisterMode }[] = []
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
      scenario('A base scenario call registers under run mode', EffectModule.void)
      expect(registered).toMatchInlineSnapshot(`
        [
          {
            "mode": "run",
            "name": "A base scenario call registers under run mode",
          },
        ]
      `)
    })

    it('Should_CallRegisterWithSkipMode_When_SkipCalled', () => {
      const { registered, scenario } = record()
      scenario.skip('A skipped scenario registers under skip mode', EffectModule.void)
      expect(registered).toMatchInlineSnapshot(`
        [
          {
            "mode": "skip",
            "name": "A skipped scenario registers under skip mode",
          },
        ]
      `)
    })

    it('Should_CallRegisterWithOnlyMode_When_OnlyCalled', () => {
      const { registered, scenario } = record()
      scenario.only('An only scenario registers under only mode', EffectModule.void)
      expect(registered).toMatchInlineSnapshot(`
        [
          {
            "mode": "only",
            "name": "An only scenario registers under only mode",
          },
        ]
      `)
    })

    it('Should_AcceptScenarioOptions_When_SecondArgIsOpts', () => {
      const { registered, scenario } = record()
      scenario('A scenario with options registers under run mode', { layer: LayerModule.empty }, EffectModule.void)
      expect(registered.length).toMatchInlineSnapshot(`1`)
      expect(registered[0]?.mode).toMatchInlineSnapshot(`"run"`)
    })
  })

  describe('createOutlineFnNoFresh', () => {
    it('Should_RegisterOneTestPerExample_When_ExamplesProvided', () => {
      const registered: { name: string; mode: RegisterMode }[] = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => {
          registered.push({ name, mode })
        },
        () => null,
      )
      outline('An outline example registers a scenario per row', [{ x: '1' }, { x: '2' }], () => EffectModule.void)
      expect(registered.map((r) => r.mode)).toMatchInlineSnapshot(`
        [
          "run",
          "run",
        ]
      `)
    })

    it('Should_PassTypedRow_When_ExamplesExpand', () => {
      type Row = { role: string; id: string }
      const receivedRows: Row[] = []
      const outline = createOutlineFnNoFresh(
        () => void 0,
        () => null,
      )
      outline(
        'An outline passes its typed row to the factory',
        [{ role: 'admin', id: '1' }, { role: 'user', id: '2' }] satisfies readonly Row[],
        (row: Row) => {
          receivedRows.push(row)
          return EffectModule.void
        },
      )
      expect(receivedRows).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "role": "admin",
          },
          {
            "id": "2",
            "role": "user",
          },
        ]
      `)
    })

    it('Should_ExpandTemplateTitles_When_NameHasPlaceholders', () => {
      const registered: string[] = []
      const outline = createOutlineFnNoFresh(
        (name) => {
          registered.push(name)
        },
        () => null,
      )
      outline(
        'A <role> example expands into one scenario',
        [{ role: 'admin' }, { role: 'user' }],
        () => EffectModule.void,
      )
      expect(registered).toMatchInlineSnapshot(`
        [
          "A admin example expands into one scenario",
          "A user example expands into one scenario",
        ]
      `)
    })

    it('Should_CallRegisterWithSkipMode_When_SkipCalled', () => {
      const registered: { name: string; mode: RegisterMode }[] = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => registered.push({ name, mode }),
        () => null,
      )
      outline.skip('A skipped outline registers under skip mode', [{ x: '1' }], () => EffectModule.void)
      expect(registered).toMatchInlineSnapshot(`
        [
          {
            "mode": "skip",
            "name": "A skipped outline registers under skip mode",
          },
        ]
      `)
    })

    it('Should_CallRegisterWithOnlyMode_When_OnlyCalled', () => {
      const registered: { name: string; mode: RegisterMode }[] = []
      const outline = createOutlineFnNoFresh(
        (name, _effect, mode) => registered.push({ name, mode }),
        () => null,
      )
      outline.only('A focused outline registers under only mode', [{ x: '1' }], () => EffectModule.void)
      expect(registered).toMatchInlineSnapshot(`
        [
          {
            "mode": "only",
            "name": "A focused outline registers under only mode",
          },
        ]
      `)
    })
  })

  describe('composeWithBackground', () => {
    it.effect('Should_DiscardBackgroundScope_When_ScenarioRuns', () =>
      EffectModule.gen(function*() {
        const background = EffectModule.succeed({ bgData: 'should be discarded' })
        const pipeline = EffectModule.succeed('scenario-result')
        const result = yield* composeWithBackground(pipeline, background)
        expect(result).toMatchInlineSnapshot(`undefined`)
      }))
  })

  describe('normalizePipeline', () => {
    it.effect('Should_ReturnVoidEffect_When_GivenAnyEffect', () =>
      EffectModule.gen(function*() {
        const pipeline = EffectModule.succeed({ data: 42 })
        const result = yield* normalizePipeline(pipeline)
        expect(result).toMatchInlineSnapshot(`undefined`)
      }))
  })

  describe('isScenarioOpts', () => {
    const falseInputs = [null, void 0, 'string', 42, true, {}, { name: 'test' }] as const
    for (const v of falseInputs) {
      it(`Should_ReturnFalse_When_${JSON.stringify(v)}`, () => {
        expect(isScenarioOpts(v)).toMatchInlineSnapshot(`false`)
      })
    }

    it('Should_ReturnTrue_When_ObjectHasScenarioLayer', () => {
      expect(isScenarioOpts({ scenarioLayer: LayerModule.empty })).toMatchInlineSnapshot(`true`)
    })

    it('Should_ReturnTrue_When_ObjectHasLayer', () => {
      expect(isScenarioOpts({ layer: LayerModule.empty })).toMatchInlineSnapshot(`true`)
    })

    it('Should_ReturnTrue_When_ObjectHasBothLayerKeys', () => {
      expect(isScenarioOpts({ scenarioLayer: LayerModule.empty, layer: LayerModule.empty })).toMatchInlineSnapshot(
        `true`,
      )
    })
  })
}
