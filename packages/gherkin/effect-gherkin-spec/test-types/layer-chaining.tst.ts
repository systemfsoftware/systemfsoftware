import type { FeatureFn } from '@systemfsoftware/effect-gherkin-spec'
import type { Layer } from 'effect'
import { describe, expect, it } from 'tstyche'

declare const Feature: FeatureFn

declare const layerA: Layer.Layer<'A'>
declare const layerB: Layer.Layer<'B', never, 'A'>
declare const layerMissing: Layer.Layer<'M', never, 'Z'>
declare const scenarioFresh: Layer.Layer<'X'>

describe('withLayer chaining', () => {
  it('Should_AcceptALaterLayerThatRequiresAnEarlierService_When_Chained', () => {
    expect(Feature('f').withLayer(layerA).withLayer).type.toBeCallableWith(layerB)
    expect(Feature('f').withScenarioLayer(scenarioFresh).withLayer(layerA).withLayer).type.toBeCallableWith(layerB)
  })

  it('Should_RejectALaterLayerWhoseRequirementIsMissing_When_Chained', () => {
    expect(Feature('f').withLayer(layerA).withLayer).type.not.toBeCallableWith(layerMissing)
    expect(Feature('f').withScenarioLayer(scenarioFresh).withLayer(layerA).withLayer).type.not.toBeCallableWith(
      layerMissing,
    )
  })

  it('Should_RejectAFirstSharedLayerThatRequiresAnotherService_When_NoLayerPrecedesIt', () => {
    expect(Feature('f').withLayer).type.not.toBeCallableWith(layerB)
  })

  it('Should_AcceptAScenarioLayerAfterASharedLayer_When_TheScenarioRequiresNothingExtra', () => {
    expect(Feature('f').withLayer(layerA).withScenarioLayer).type.toBeCallableWith(scenarioFresh)
  })
})
