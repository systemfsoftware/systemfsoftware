/// <reference types="vitest/globals" />
import type * as EffectVitest from '@effect/vitest'
import type { Vitest } from '@effect/vitest'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import * as TestServices from 'effect/TestServices'
import type { TestOptions } from 'vitest'
import { Gherkin, type ScopeMap } from './do-notation.js'
import {
  createOutlineFnNoFresh,
  createOutlineFnWithFresh,
  createScenarioNoFresh,
  createScenarioWithFresh,
  type FeatureBody,
  type RegisterMode,
  type ScenarioBody,
} from './feature-runtime.js'

export {
  type FeatureBody,
  type OutlineFn,
  type ScenarioBody,
  type ScenarioFn,
  type ScenarioOptions,
} from './feature-runtime.js'

type DescribeMode = 'describe' | 'skip' | 'only'
type EmptyScopeMap = Readonly<Record<string, never>>

export { type RegisterMode } from './feature-runtime.js'

export type FeatureLayerOptions = {
  readonly excludeTestServices?: boolean
}

export type FeatureSuiteOptions = Pick<TestOptions, 'tags'> & Partial<TestOptions>

export type EffectVitestDeps = Pick<typeof EffectVitest, 'layer'> & {
  readonly it: Vitest.Methods
}

const selectDescribeMode = (mode: DescribeMode) => {
  if (mode === 'skip') {
    return describe.skip
  }
  if (mode === 'only') {
    return describe.only
  }
  return describe
}

const invokeDescribe = (
  mode: DescribeMode,
  suiteName: string,
  suiteOpts: FeatureSuiteOptions | undefined,
  fn: () => void,
): void => {
  const d = selectDescribeMode(mode)
  if (typeof suiteOpts === 'undefined') {
    d(suiteName, fn)
    return
  }
  d(suiteName, suiteOpts, fn)
}

const pickMode = <R>(
  family: Vitest.Tester<R>,
  mode: RegisterMode,
) => {
  if (mode === 'skip') {
    return family.skip
  }
  if (mode === 'only') {
    return family.only
  }
  return family
}

function selectUnlayeredMode(
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: true,
): Vitest.Test<Scope.Scope>
function selectUnlayeredMode(
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: false,
): Vitest.Test<TestServices.TestServices | Scope.Scope>
function selectUnlayeredMode(
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: boolean,
): Vitest.Test<Scope.Scope> | Vitest.Test<TestServices.TestServices | Scope.Scope>
function selectUnlayeredMode(
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: boolean,
): Vitest.Test<Scope.Scope> | Vitest.Test<TestServices.TestServices | Scope.Scope> {
  if (useLiveClock) {
    return pickMode(methodsIt.scopedLive, mode)
  }
  return pickMode(methodsIt.scoped, mode)
}

const selectLayeredMode = <R>(
  methodsIt: Pick<Vitest.MethodsNonLive<R, boolean>, 'scoped'>,
  mode: RegisterMode,
) => pickMode(methodsIt.scoped, mode)

export type FeatureBuilderBoth<
  RShared,
  RFresh,
  RFreshReq extends RShared | TestServices.TestServices | Scope.Scope,
  S extends ScopeMap = EmptyScopeMap,
> = {
  readonly liveClock: () => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S>
  body: (body: FeatureBody<RShared, RFresh, RFreshReq, S>) => void
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S2>
}

export type FeatureBuilderWithLayer<RShared, S extends ScopeMap = EmptyScopeMap> = {
  readonly liveClock: () => FeatureBuilderWithLayer<RShared, S>
  body: (body: FeatureBody<RShared, never, never, S>) => void
  withScenarioLayer: <RFresh, RFreshReq extends RShared | TestServices.TestServices | Scope.Scope = never>(
    layer: Layer.Layer<RFresh, never, RFreshReq>,
  ) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderWithLayer<RShared, S2>
}

export type FeatureBuilderWithScenarioLayer<
  RFresh,
  RFreshReq extends TestServices.TestServices | Scope.Scope,
  S extends ScopeMap = EmptyScopeMap,
> = {
  readonly liveClock: () => FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S>
  body: (body: FeatureBody<never, RFresh, RFreshReq, S>) => void
  withLayer: <RShared>(
    layer: Layer.Layer<RShared>,
    opts?: FeatureLayerOptions,
  ) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S2>
}

export type FeatureBuilder<S extends ScopeMap = EmptyScopeMap> = {
  readonly liveClock: () => FeatureBuilder<S>
  body: (body: FeatureBody<never, never, never, S>) => void
  withLayer: <RShared>(layer: Layer.Layer<RShared>, opts?: FeatureLayerOptions) => FeatureBuilderWithLayer<RShared, S>
  withScenarioLayer: <RFresh, RFreshReq extends TestServices.TestServices | Scope.Scope = never>(
    layer: Layer.Layer<RFresh, never, RFreshReq>,
  ) => FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilder<S2>
}

type FeatureStarter = (
  suiteName: string,
  suiteOpts?: FeatureSuiteOptions,
) => FeatureBuilder

export type FeatureFn = FeatureStarter & {
  readonly skip: FeatureStarter
  readonly only: FeatureStarter
}

export const makeFeature = (deps: EffectVitestDeps): FeatureFn => {
  const { it: effectIt, layer: effectVitestLayer } = deps

  const runNothing = <S extends ScopeMap>(
    name: string,
    scopeMap: S,
    body: FeatureBody<never, never, never, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
  ): void => {
    invokeDescribe(describeMode, name, suiteOpts, () => {
      let bg: ScenarioBody<never> | null = null
      const scenario = createScenarioNoFresh<never>((scenName, effect, mode) => {
        selectUnlayeredMode(effectIt, mode, useLiveClock)(
          scenName,
          () => effect,
        )
      }, () => bg)
      const scenarioOutline = createOutlineFnNoFresh<never>((scenName, effect, mode) => {
        selectUnlayeredMode(effectIt, mode, useLiveClock)(
          scenName,
          () => effect,
        )
      }, () => bg)
      body({
        scenario,
        background: (pipeline) => {
          bg = pipeline
        },
        scenarioOutline,
        scope: Gherkin.scope(scopeMap),
        Do: Gherkin.Do,
      })
    })
  }

  const runWithFresh = <
    RFresh,
    RFreshReq extends TestServices.TestServices | Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    scopeMap: S,
    body: FeatureBody<never, RFresh, RFreshReq, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  ): void => {
    invokeDescribe(describeMode, name, suiteOpts, () => {
      let bg: ScenarioBody<RFresh | RFreshReq> | null = null
      const scenario = createScenarioWithFresh<never, RFresh, RFreshReq>(
        (scenName, effect, mode) => {
          if (useLiveClock) {
            selectUnlayeredMode(effectIt, mode, true)(
              scenName,
              () => effect.pipe(Effect.provide(TestServices.liveServices)),
            )
            return
          }
          selectUnlayeredMode(effectIt, mode, false)(scenName, () => effect)
        },
        () => bg,
        featureScenarioLayer,
      )
      const scenarioOutline = createOutlineFnWithFresh<never, RFresh, RFreshReq>(
        (scenName, effect, mode) => {
          if (useLiveClock) {
            selectUnlayeredMode(effectIt, mode, true)(
              scenName,
              () => effect.pipe(Effect.provide(TestServices.liveServices)),
            )
            return
          }
          selectUnlayeredMode(effectIt, mode, false)(scenName, () => effect)
        },
        () => bg,
        featureScenarioLayer,
      )
      body({
        scenario,
        background: (pipeline) => {
          bg = pipeline
        },
        scenarioOutline,
        scope: Gherkin.scope(scopeMap),
        Do: Gherkin.Do,
      })
    })
  }

  const runWithLayer = <RShared, S extends ScopeMap>(
    name: string,
    layerDef: Layer.Layer<RShared>,
    excludeTestServices: boolean,
    scopeMap: S,
    body: FeatureBody<RShared, never, never, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
  ): void => {
    const layerSetup = effectVitestLayer(layerDef, { excludeTestServices })
    let bg: ScenarioBody<RShared> | null = null

    const wireBody = (scopedIt: Vitest.MethodsNonLive<RShared, boolean>): void => {
      const scenario = createScenarioNoFresh<RShared>((scenName, effect, mode) => {
        let wrapped = effect
        if (useLiveClock) {
          wrapped = effect.pipe(Effect.provide(TestServices.liveServices))
        }
        selectLayeredMode(scopedIt, mode)(
          scenName,
          () => wrapped,
        )
      }, () => bg)
      const scenarioOutline = createOutlineFnNoFresh<RShared>((scenName, effect, mode) => {
        let wrapped = effect
        if (useLiveClock) {
          wrapped = effect.pipe(Effect.provide(TestServices.liveServices))
        }
        selectLayeredMode(scopedIt, mode)(
          scenName,
          () => wrapped,
        )
      }, () => bg)
      body({
        scenario,
        background: (pipeline) => {
          bg = pipeline
        },
        scenarioOutline,
        scope: Gherkin.scope(scopeMap),
        Do: Gherkin.Do,
      })
    }

    invokeDescribe(describeMode, name, suiteOpts, () => {
      layerSetup(wireBody)
    })
  }

  const runWithBoth = <
    RShared,
    RFresh,
    RFreshReq extends RShared | TestServices.TestServices | Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    layerDef: Layer.Layer<RShared>,
    excludeTestServices: boolean,
    scopeMap: S,
    body: FeatureBody<RShared, RFresh, RFreshReq, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  ): void => {
    const layerSetup = effectVitestLayer(layerDef, { excludeTestServices })
    let bg: ScenarioBody<RShared | RFresh | RFreshReq> | null = null

    const wireBody = (scopedIt: Vitest.MethodsNonLive<RShared, boolean>): void => {
      const scenario = createScenarioWithFresh<RShared, RFresh, RFreshReq>(
        (scenName, effect, mode) => {
          let wrapped = effect
          if (useLiveClock) {
            wrapped = effect.pipe(Effect.provide(TestServices.liveServices))
          }
          selectLayeredMode(scopedIt, mode)(
            scenName,
            () => wrapped,
          )
        },
        () => bg,
        featureScenarioLayer,
      )
      const scenarioOutline = createOutlineFnWithFresh<RShared, RFresh, RFreshReq>(
        (scenName, effect, mode) => {
          let wrapped = effect
          if (useLiveClock) {
            wrapped = effect.pipe(Effect.provide(TestServices.liveServices))
          }
          selectLayeredMode(scopedIt, mode)(
            scenName,
            () => wrapped,
          )
        },
        () => bg,
        featureScenarioLayer,
      )
      body({
        scenario,
        background: (pipeline) => {
          bg = pipeline
        },
        scenarioOutline,
        scope: Gherkin.scope(scopeMap),
        Do: Gherkin.Do,
      })
    }

    invokeDescribe(describeMode, name, suiteOpts, () => {
      layerSetup(wireBody)
    })
  }

  const makeBuilderBoth = <
    RShared,
    RFresh,
    RFreshReq extends RShared | TestServices.TestServices | Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    layerDef: Layer.Layer<RShared>,
    excludeTestServices: boolean,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    scopeMap: S,
  ): FeatureBuilderBoth<RShared, RFresh, RFreshReq, S> => ({
    liveClock: () =>
      makeBuilderBoth<RShared, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        true,
        layerDef,
        excludeTestServices,
        featureScenarioLayer,
        scopeMap,
      ),
    body: (body) => {
      runWithBoth<RShared, RFresh, RFreshReq, S>(
        name,
        layerDef,
        excludeTestServices,
        scopeMap,
        body,
        describeMode,
        suiteOpts,
        useLiveClock,
        featureScenarioLayer,
      )
    },
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderBoth<RShared, RFresh, RFreshReq, S2>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        layerDef,
        excludeTestServices,
        featureScenarioLayer,
        newMap,
      ),
  })

  const makeBuilderWithLayer = <RShared, S extends ScopeMap>(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    layerDef: Layer.Layer<RShared>,
    excludeTestServices: boolean,
    scopeMap: S,
  ): FeatureBuilderWithLayer<RShared, S> => ({
    liveClock: () =>
      makeBuilderWithLayer<RShared, S>(
        name,
        describeMode,
        suiteOpts,
        true,
        layerDef,
        excludeTestServices,
        scopeMap,
      ),
    body: (body) => {
      runWithLayer<RShared, S>(
        name,
        layerDef,
        excludeTestServices,
        scopeMap,
        body,
        describeMode,
        suiteOpts,
        useLiveClock,
      )
    },
    withScenarioLayer: <RFresh, RFreshReq extends RShared | TestServices.TestServices | Scope.Scope = never>(
      scenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    ) =>
      makeBuilderBoth<RShared, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        layerDef,
        excludeTestServices,
        scenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderWithLayer<RShared, S2>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        layerDef,
        excludeTestServices,
        newMap,
      ),
  })

  const makeBuilderWithScenarioLayer = <
    RFresh,
    RFreshReq extends TestServices.TestServices | Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    scopeMap: S,
  ): FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S> => ({
    liveClock: () =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        true,
        featureScenarioLayer,
        scopeMap,
      ),
    body: (body) => {
      runWithFresh<RFresh, RFreshReq, S>(
        name,
        scopeMap,
        body,
        describeMode,
        suiteOpts,
        useLiveClock,
        featureScenarioLayer,
      )
    },
    withLayer: <RShared>(layerDef: Layer.Layer<RShared>, opts?: FeatureLayerOptions) =>
      makeBuilderBoth<RShared, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        layerDef,
        opts?.excludeTestServices ?? false,
        featureScenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S2>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        featureScenarioLayer,
        newMap,
      ),
  })

  const makeBuilder = <S extends ScopeMap>(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    useLiveClock: boolean,
    scopeMap: S,
  ): FeatureBuilder<S> => ({
    liveClock: () => makeBuilder<S>(name, describeMode, suiteOpts, true, scopeMap),
    body: (body) => {
      runNothing<S>(name, scopeMap, body, describeMode, suiteOpts, useLiveClock)
    },
    withLayer: <RShared>(layerDef: Layer.Layer<RShared>, opts?: FeatureLayerOptions) =>
      makeBuilderWithLayer<RShared, S>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        layerDef,
        opts?.excludeTestServices ?? false,
        scopeMap,
      ),
    withScenarioLayer: <RFresh, RFreshReq extends TestServices.TestServices | Scope.Scope = never>(
      scenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    ) =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        useLiveClock,
        scenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilder<S2>(name, describeMode, suiteOpts, useLiveClock, newMap),
  })

  const emptyMap: EmptyScopeMap = {}

  const starter =
    (describeMode: DescribeMode): FeatureStarter => (suiteName: string, suiteOpts?: FeatureSuiteOptions) =>
      makeBuilder(suiteName, describeMode, suiteOpts, false, emptyMap)

  return Object.assign(starter('describe'), {
    skip: starter('skip'),
    only: starter('only'),
  })
}

if (import.meta.vitest !== void 0) {
  const { it, expect, describe } = await import('@effect/vitest')

  describe('selectDescribeMode', () => {
    it('Should_ReturnDistinctFunctions_When_CalledWithAllModes', () => {
      const modes = ['describe', 'skip', 'only'] as const
      const fns = modes.map((m) => selectDescribeMode(m))
      expect(new Set(fns).size).toBe(3)
    })
  })

  describe('selectUnlayeredMode', () => {
    it('Should_ReturnScopedSkip_When_ModeIsSkip', () => {
      expect(selectUnlayeredMode(it, 'skip', false)).toBe(it.scoped.skip)
    })

    it('Should_ReturnScopedOnly_When_ModeIsOnly', () => {
      expect(selectUnlayeredMode(it, 'only', false)).toBe(it.scoped.only)
    })

    it('Should_ReturnScoped_When_ModeIsRun', () => {
      expect(selectUnlayeredMode(it, 'run', false)).toBe(it.scoped)
    })

    it('Should_UseScopedLive_When_UseLiveClock', () => {
      expect(selectUnlayeredMode(it, 'run', true)).toBe(it.scopedLive)
    })
  })

  describe('selectLayeredMode', () => {
    const methods = { scoped: it.scoped } satisfies Pick<Vitest.MethodsNonLive<never, boolean>, 'scoped'>

    it('Should_ReturnScopedSkip_When_ModeIsSkip', () => {
      expect(selectLayeredMode(methods, 'skip')).toBe(it.scoped.skip)
    })

    it('Should_ReturnScopedOnly_When_ModeIsOnly', () => {
      expect(selectLayeredMode(methods, 'only')).toBe(it.scoped.only)
    })

    it('Should_ReturnScoped_When_ModeIsRun', () => {
      expect(selectLayeredMode(methods, 'run')).toBe(it.scoped)
    })
  })
}
