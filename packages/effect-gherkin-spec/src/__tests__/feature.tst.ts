import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'
import { describe, expect, test } from 'tstyche'
import type { OutlineFn } from '../feature-runtime.js'
import { type FeatureBuilderWithScenarioLayer, makeFeature } from '../feature.js'

class External extends Context.Tag('@tst/External')<External, string>() {}
class Provided extends Context.Tag('@tst/Provided')<Provided, number>() {}

declare const feature: ReturnType<typeof makeFeature>
declare const selfContained: Layer.Layer<Provided>
declare const layerNeedingExternal: Layer.Layer<Provided, never, External>
declare const externalLayer: Layer.Layer<External>
declare const outline: OutlineFn

describe('feature.withScenarioLayer accepts layers with TestServices requirements', () => {
  test('Should_AcceptLayer_When_LayerHasNoRequirements', () => {
    expect(feature('f').withScenarioLayer).type.toBeCallableWith(selfContained)
  })

  test('Should_AcceptLayer_When_LayerRequiresOnlyTestServices', () => {
    expect(feature('f').withScenarioLayer).type.toBeCallableWith(TestClock.defaultTestClock)
  })

  test('Should_RejectLayer_When_NoSharedPathLayerRequiresExternalTag', () => {
    expect(feature('f').withScenarioLayer).type.not.toBeCallableWith(layerNeedingExternal)
  })

  test('Should_AcceptLayer_When_BothPathSharedLayerProvidesTheRequirement', () => {
    expect(feature('f').withLayer(externalLayer).withScenarioLayer).type.toBeCallableWith(
      layerNeedingExternal,
    )
  })

  test('Should_InferRFreshReqAsNever_When_LayerIsSelfContained', () => {
    expect(feature('f').withScenarioLayer(selfContained))
      .type.toBe<FeatureBuilderWithScenarioLayer<Provided, never>>()
  })
})

describe('OutlineFn skip and only modifiers', () => {
  test('Should_HaveSkip_When_OutlineFnInspected', () => {
    expect(outline.skip).type.toBeCallableWith(
      'scenario <role>',
      [{ role: 'admin' }],
      (_row: { role: string }) => Effect.void,
    )
  })

  test('Should_HaveOnly_When_OutlineFnInspected', () => {
    expect(outline.only).type.toBeCallableWith(
      'scenario <role>',
      [{ role: 'admin' }],
      (_row: { role: string }) => Effect.void,
    )
  })

  test('Should_InferRowType_When_ExamplesArrayIsLiteral', () => {
    expect(outline).type.toBeCallableWith(
      'scenario <count>',
      [{ count: 1 }, { count: 2 }],
      (_row: { count: number }) => Effect.void,
    )
  })

  test('Should_InferLiteralUnion_When_ExamplesArrayIsInline', () => {
    expect(outline).type.toBeCallableWith(
      'scenario <kind>',
      [{ kind: 'worker' }, { kind: 'supervisor' }],
      (_row: { readonly kind: 'worker' | 'supervisor' }) => Effect.void,
    )
  })
})
