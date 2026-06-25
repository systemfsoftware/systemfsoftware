export * from '@effect/vitest'
export { And, But, Gherkin, Given, Then, When } from './do-notation.js'
export type { GherkinEffect, GherkinScope, ScopeIdentifiers, ScopeMap, ScopeServices, StepText } from './do-notation.js'
export type { PairwiseMatrix, PairwiseResult } from './extensions/pairwise.js'
export { pairwiseFor } from './extensions/pairwise.js'
export type { OutlineFn, ScenarioBody, ScenarioFn, ScenarioOptions } from './feature-runtime.js'
export {
  type EffectVitestDeps,
  type FeatureBody,
  type FeatureBuilder,
  type FeatureBuilderBoth,
  type FeatureBuilderWithLayer,
  type FeatureBuilderWithScenarioLayer,
  type FeatureFn,
  type FeatureLayerOptions,
  type FeatureSuiteOptions,
  makeFeature,
} from './feature.js'
export { StepError } from './step-error.js'
