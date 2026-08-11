import type * as Scope from 'effect/Scope'
import type * as TestServices from 'effect/TestServices'
import { But as _But } from './do-notation.kernel.js'
import type * as DoNotation from './do-notation.kernel.js'
import { pairwiseFor as _pairwiseFor } from './extensions/pairwise.kernel.js'
import type * as Pairwise from './extensions/pairwise.kernel.js'
import { resolveScenarioArgs as _resolveScenarioArgs } from './feature-runtime.kernel.js'
import type * as Runtime from './feature-runtime.kernel.js'
import type * as Harness from './feature.harness.js'
import {
  expandOutline as _expandOutline,
  renderTitle as _renderTitle,
  stringifyForTitle as _stringifyForTitle,
  tokenizeTemplate as _tokenizeTemplate,
} from './outline-expand.kernel.js'
import type * as Outline from './outline-expand.kernel.js'
import { StepError as _StepError } from './step-error.kernel.js'

/**
 * The supporting Spec vocabulary, chunked behind one namespace so the entry
 * stays at nine names. Each name is re-bound from its kernel home — the home
 * keeps the definition, this module keeps the entry small.
 */

type EmptyScopeMap = Readonly<Record<string, never>>

export const But = _But
export const pairwiseFor = _pairwiseFor
export const resolveScenarioArgs = _resolveScenarioArgs
export const expandOutline = _expandOutline
export const renderTitle = _renderTitle
export const stringifyForTitle = _stringifyForTitle
export const tokenizeTemplate = _tokenizeTemplate
export const StepError = _StepError
export type StepError = InstanceType<typeof _StepError>

export type GherkinEffect<A extends object, E, R> = DoNotation.GherkinEffect<A, E, R>
export type GherkinScope<A extends object> = DoNotation.GherkinScope<A>
export type ScopeIdentifiers<S extends ScopeMap> = DoNotation.ScopeIdentifiers<S>
export type ScopeMap = DoNotation.ScopeMap
export type ScopeServices<S extends ScopeMap> = DoNotation.ScopeServices<S>
export type StepText<A extends object = object> = DoNotation.StepText<A>

export type PairwiseMatrix<Identifier = unknown, RA = never, RB = never> = Pairwise.PairwiseMatrix<Identifier, RA, RB>
export type PairwiseResult<A> = Pairwise.PairwiseResult<A>

export type FeatureBody<RShared = never, RFresh = never, RFreshReq = never, S extends ScopeMap = EmptyScopeMap> =
  Runtime.FeatureBody<RShared, RFresh, RFreshReq, S>
export type OutlineFn<RShared = never, RFresh = never, RFreshReq = never> = Runtime.OutlineFn<
  RShared,
  RFresh,
  RFreshReq
>
export type ScenarioBody<R = never> = Runtime.ScenarioBody<R>
export type ScenarioFn<RShared = never, RFresh = never, RFreshReq = never> = Runtime.ScenarioFn<
  RShared,
  RFresh,
  RFreshReq
>
export type ScenarioOptions<RScenario = never, RExtra = never> = Runtime.ScenarioOptions<RScenario, RExtra>

export type EffectVitestDeps = Harness.EffectVitestDeps
export type FeatureBuilder<S extends ScopeMap = EmptyScopeMap> = Harness.FeatureBuilder<S>
export type FeatureBuilderBoth<
  RShared,
  RFresh,
  RFreshReq extends RShared | TestServices.TestServices | Scope.Scope,
  S extends ScopeMap = EmptyScopeMap,
> = Harness.FeatureBuilderBoth<RShared, RFresh, RFreshReq, S>
export type FeatureBuilderWithLayer<RShared, S extends ScopeMap = EmptyScopeMap> = Harness.FeatureBuilderWithLayer<
  RShared,
  S
>
export type FeatureBuilderWithScenarioLayer<
  RFresh,
  RFreshReq extends TestServices.TestServices | Scope.Scope,
  S extends ScopeMap = EmptyScopeMap,
> = Harness.FeatureBuilderWithScenarioLayer<RFresh, RFreshReq, S>
export type FeatureFn = Harness.FeatureFn
export type FeatureLayerOptions = Harness.FeatureLayerOptions
export type FeatureSuiteOptions = Harness.FeatureSuiteOptions

export type OutlineRow<Row> = Outline.OutlineRow<Row>
export type TemplateToken = Outline.TemplateToken
