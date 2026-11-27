import { Suite } from '@systemfsoftware/effect-spec-runtime'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import { Gherkin, type ScopeMap } from './DoNotation.js'
import {
  type BackgroundEffect,
  createOutlineFnNoFresh,
  createOutlineFnWithFresh,
  createScenarioNoFresh,
  createScenarioWithFresh,
  type FeatureBody,
} from './FeatureRuntime.js'
import type { StepError } from './StepError.js'

export {
  type FeatureBody,
  type OutlineFn,
  type ScenarioBody,
  type ScenarioFn,
  type ScenarioOptions,
} from './FeatureRuntime.js'

type DescribeMode = Suite.DescribeMode
type EmptyScopeMap = Readonly<Record<string, never>>

export { type RegisterMode } from './FeatureRuntime.js'

export type FeatureSuiteOptions = Suite.Options

export type EffectVitestBindings = Suite.Bindings

export type FeatureBuilderBoth<
  RShared,
  RFresh,
  RFreshReq extends RShared,
  S extends ScopeMap = EmptyScopeMap,
  EShared = never,
> = {
  readonly live: (reason: string) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S, EShared>
  body: (body: FeatureBody<RShared, RFresh, RFreshReq, S>) => void
  withLayer: <R2, E2, RIn extends RShared = never>(
    layer: Layer.Layer<R2, E2, RIn>,
  ) => FeatureBuilderBoth<RShared | R2, RFresh, RFreshReq, S, EShared | E2>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S2, EShared>
}

export type FeatureBuilderWithLayer<RShared, S extends ScopeMap = EmptyScopeMap, EShared = never> = {
  readonly live: (reason: string) => FeatureBuilderWithLayer<RShared, S, EShared>
  body: (body: FeatureBody<RShared, never, never, S>) => void
  withLayer: <R2, E2, RIn extends RShared = never>(
    layer: Layer.Layer<R2, E2, RIn>,
  ) => FeatureBuilderWithLayer<RShared | R2, S, EShared | E2>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderWithLayer<RShared, S2, EShared>
  withScenarioLayer: <RFresh, RFreshReq extends RShared = never>(
    layer: Layer.Layer<RFresh, never, RFreshReq>,
  ) => FeatureBuilderBoth<RShared, RFresh, RFreshReq, S, EShared>
}
export type FeatureBuilderWithScenarioLayer<
  RFresh,
  RFreshReq extends Scope.Scope,
  S extends ScopeMap = EmptyScopeMap,
> = {
  readonly live: (reason: string) => FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S>
  body: (body: FeatureBody<never, RFresh, RFreshReq, S>) => void
  withLayer: <R2, E2>(layer: Layer.Layer<R2, E2>) => FeatureBuilderBoth<R2 | RFreshReq, RFresh, RFreshReq, S, E2>
  withScope: <S2 extends ScopeMap>(map: S2) => FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S2>
}

export type FeatureBuilder<S extends ScopeMap = EmptyScopeMap> = {
  readonly live: (reason: string) => FeatureBuilder<S>
  body: (body: FeatureBody<never, never, never, S>) => void
  /**
   * Provide a shared fixture layer across all scenarios in this feature suite.
   *
   * Maps to Vitest's `worker` or file-level fixture scope. Resources acquired in this layer
   * are allocated once when the suite starts and released at suite completion.
   *
   * @example
   * ```ts
   * // Bridging a Vitest callback-based fixture:
   * const DatabaseFixture = Layer.scoped(
   *   Database,
   *   Effect.acquireRelease(
   *     Effect.sync(() => createDatabase()),
   *     (db) => Effect.sync(() => db.teardown())
   *   )
   * )
   *
   * Feature('User management').withLayer(DatabaseFixture)
   * ```
   */
  withLayer: <R2, E2>(layer: Layer.Layer<R2, E2>) => FeatureBuilderWithLayer<R2, S, E2>
  /**
   * Provide a per-scenario fresh fixture layer.
   *
   * Maps to Vitest's `test` fixture scope (`test.extend({ fixture: async ({}, use) => { ... use(val); cleanup(); } })`).
   * Resources are allocated fresh before each scenario and automatically torn down via their
   * `Scope` finalizer (`Effect.acquireRelease`) when the scenario completes, regardless of success or failure.
   *
   * @example
   * ```ts
   * const TempDirFixture = Layer.scoped(
   *   TempDirectory,
   *   Effect.acquireRelease(
   *     Effect.sync(() => makeTempDir()),
   *     (dir) => Effect.sync(() => removeTempDir(dir))
   *   )
   * )
   *
   * Feature('File processing').withScenarioLayer(TempDirFixture)
   * ```
   */
  withScenarioLayer: <RFresh, RFreshReq extends Scope.Scope = never>(
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
const orphanContext = <Missing>(): Context.Context<Missing> => Context.makeUnsafe<Missing>(new Map())
const withOrphanRequirements = <RShared, E, RFreshReq>(
  layerDef: Layer.Layer<RShared, E>,
): Layer.Layer<RShared | RFreshReq, E> =>
  layerDef.pipe(
    Layer.build,
    Effect.map((built) =>
      Layer.succeedContext(
        built.pipe(Context.merge(orphanContext<RFreshReq>()), Context.merge(Context.empty())),
      )
    ),
    Layer.unwrap,
  )

const composeShared = <RShared, EShared, R2, E2, RIn extends RShared>(
  next: Layer.Layer<R2, E2, RIn>,
  prior: Layer.Layer<RShared, EShared>,
): Layer.Layer<RShared | R2, EShared | E2> => next.pipe(Layer.provideMerge(prior))

export const makeFeature = (deps: EffectVitestBindings): FeatureFn => {
  const configOf = (
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
  ): Suite.Config =>
    live === undefined
      ? { name, describe: describeMode, options: suiteOpts }
      : { name, describe: describeMode, options: suiteOpts, live }

  const runNothing = <S extends ScopeMap>(
    name: string,
    scopeMap: S,
    body: FeatureBody<never, never, never, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
  ): void => {
    Suite.open<void, StepError, void>(
      deps,
      configOf(name, describeMode, suiteOpts, live),
      (register) => {
        let bg: BackgroundEffect<never> | null = null
        const scenario = createScenarioNoFresh<never>(register, () => bg)
        const scenarioOutline = createOutlineFnNoFresh<never>(register, () => bg)
        body({
          scenario,
          background: (pipeline) => {
            bg = pipeline
          },
          scenarioOutline,
          scope: Gherkin.scope(scopeMap),
          Do: Gherkin.Do,
        })
      },
    )
  }

  const runWithFresh = <
    RFresh,
    RFreshReq extends Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    scopeMap: S,
    body: FeatureBody<never, RFresh, RFreshReq, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  ): void => {
    Suite.openCase<void, StepError, RFresh, RFreshReq, void>(
      deps,
      configOf(name, describeMode, suiteOpts, live),
      featureScenarioLayer,
      (register) => {
        let bg: BackgroundEffect<RFresh | RFreshReq> | null = null
        const scenario = createScenarioWithFresh<never, RFresh, RFreshReq>(register, () => bg)
        const scenarioOutline = createOutlineFnWithFresh<never, RFresh, RFreshReq>(register, () => bg)
        body({
          scenario,
          background: (pipeline) => {
            bg = pipeline
          },
          scenarioOutline,
          scope: Gherkin.scope(scopeMap),
          Do: Gherkin.Do,
        })
      },
    )
  }

  const runWithLayer = <RShared, EShared, S extends ScopeMap>(
    name: string,
    layerDef: Layer.Layer<RShared, EShared>,
    scopeMap: S,
    body: FeatureBody<RShared, never, never, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
  ): void => {
    Suite.openShared<void, StepError, RShared, EShared, void>(
      deps,
      configOf(name, describeMode, suiteOpts, live),
      { layer: layerDef },
      (register) => {
        let bg: BackgroundEffect<RShared> | null = null
        const scenario = createScenarioNoFresh<RShared>(register, () => bg)
        const scenarioOutline = createOutlineFnNoFresh<RShared>(register, () => bg)
        body({
          scenario,
          background: (pipeline) => {
            bg = pipeline
          },
          scenarioOutline,
          scope: Gherkin.scope(scopeMap),
          Do: Gherkin.Do,
        })
      },
    )
  }

  const runWithBoth = <RShared, EShared, RFresh, RFreshReq extends RShared, S extends ScopeMap>(
    name: string,
    layerDef: Layer.Layer<RShared, EShared>,
    scopeMap: S,
    body: FeatureBody<RShared, RFresh, RFreshReq, S>,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
  ): void => {
    Suite.openSharedCase<void, StepError, RShared, EShared, RFresh, RFreshReq, void>(
      deps,
      configOf(name, describeMode, suiteOpts, live),
      { layer: layerDef },
      featureScenarioLayer,
      (register) => {
        let bg: BackgroundEffect<RShared | RFresh | RFreshReq> | null = null
        const scenario = createScenarioWithFresh<RShared, RFresh, RFreshReq>(register, () => bg)
        const scenarioOutline = createOutlineFnWithFresh<RShared, RFresh, RFreshReq>(register, () => bg)
        body({
          scenario,
          background: (pipeline) => {
            bg = pipeline
          },
          scenarioOutline,
          scope: Gherkin.scope(scopeMap),
          Do: Gherkin.Do,
        })
      },
    )
  }

  const makeBuilderBoth = <
    RShared,
    EShared,
    RFresh,
    RFreshReq extends RShared,
    S extends ScopeMap,
  >(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    layerDef: Layer.Layer<RShared, EShared>,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    scopeMap: S,
  ): FeatureBuilderBoth<RShared, RFresh, RFreshReq, S, EShared> => ({
    live: (reason) =>
      makeBuilderBoth<RShared, EShared, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        { reason },
        layerDef,
        featureScenarioLayer,
        scopeMap,
      ),
    body: (body) => {
      runWithBoth<RShared, EShared, RFresh, RFreshReq, S>(
        name,
        layerDef,
        scopeMap,
        body,
        describeMode,
        suiteOpts,
        live,
        featureScenarioLayer,
      )
    },
    withLayer: <R2, E2, RIn extends RShared = never>(next: Layer.Layer<R2, E2, RIn>) =>
      makeBuilderBoth<RShared | R2, EShared | E2, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        composeShared(next, layerDef),
        featureScenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderBoth<RShared, EShared, RFresh, RFreshReq, S2>(
        name,
        describeMode,
        suiteOpts,
        live,
        layerDef,
        featureScenarioLayer,
        newMap,
      ),
  })

  const makeBuilderWithLayer = <RShared, EShared, S extends ScopeMap>(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    layerDef: Layer.Layer<RShared, EShared>,
    scopeMap: S,
  ): FeatureBuilderWithLayer<RShared, S, EShared> => ({
    live: (reason) =>
      makeBuilderWithLayer<RShared, EShared, S>(
        name,
        describeMode,
        suiteOpts,
        { reason },
        layerDef,
        scopeMap,
      ),
    body: (body) => {
      runWithLayer<RShared, EShared, S>(
        name,
        layerDef,
        scopeMap,
        body,
        describeMode,
        suiteOpts,
        live,
      )
    },
    withLayer: <R2, E2, RIn extends RShared = never>(next: Layer.Layer<R2, E2, RIn>) =>
      makeBuilderWithLayer<RShared | R2, EShared | E2, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        composeShared(next, layerDef),
        scopeMap,
      ),
    withScenarioLayer: <RFresh, RFreshReq extends RShared = never>(
      scenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    ) =>
      makeBuilderBoth<RShared, EShared, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        layerDef,
        scenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderWithLayer<RShared, EShared, S2>(
        name,
        describeMode,
        suiteOpts,
        live,
        layerDef,
        newMap,
      ),
  })

  const makeBuilderWithScenarioLayer = <
    RFresh,
    RFreshReq extends Scope.Scope,
    S extends ScopeMap,
  >(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    featureScenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    scopeMap: S,
  ): FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S> => ({
    live: (reason) =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        { reason },
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
        live,
        featureScenarioLayer,
      )
    },
    withLayer: <R2, E2>(layerDef: Layer.Layer<R2, E2>) =>
      makeBuilderBoth<R2 | RFreshReq, E2, RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        withOrphanRequirements<R2, E2, RFreshReq>(layerDef),
        featureScenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S2>(
        name,
        describeMode,
        suiteOpts,
        live,
        featureScenarioLayer,
        newMap,
      ),
  })

  const makeBuilder = <S extends ScopeMap>(
    name: string,
    describeMode: DescribeMode,
    suiteOpts: FeatureSuiteOptions | undefined,
    live: Suite.LiveCase | undefined,
    scopeMap: S,
  ): FeatureBuilder<S> => ({
    live: (reason) => makeBuilder<S>(name, describeMode, suiteOpts, { reason }, scopeMap),
    body: (body) => {
      runNothing<S>(name, scopeMap, body, describeMode, suiteOpts, live)
    },
    withLayer: <R2, E2>(layerDef: Layer.Layer<R2, E2>) =>
      makeBuilderWithLayer<R2, E2, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        layerDef,
        scopeMap,
      ),
    withScenarioLayer: <RFresh, RFreshReq extends Scope.Scope = never>(
      scenarioLayer: Layer.Layer<RFresh, never, RFreshReq>,
    ) =>
      makeBuilderWithScenarioLayer<RFresh, RFreshReq, S>(
        name,
        describeMode,
        suiteOpts,
        live,
        scenarioLayer,
        scopeMap,
      ),
    withScope: <S2 extends ScopeMap>(newMap: S2) => makeBuilder<S2>(name, describeMode, suiteOpts, live, newMap),
  })

  const emptyMap: EmptyScopeMap = {}

  const starter =
    (describeMode: DescribeMode): FeatureStarter => (suiteName: string, suiteOpts?: FeatureSuiteOptions) =>
      makeBuilder(suiteName, describeMode, suiteOpts, undefined, emptyMap)

  return Object.assign(starter('describe'), {
    skip: starter('skip'),
    only: starter('only'),
  })
}
