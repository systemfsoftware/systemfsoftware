import type { Vitest } from '@effect/vitest'
import { it as vitestIt } from '@effect/vitest'
import type {
  EffectVitestBindings,
  FeatureBuilder,
  FeatureFn,
  ScenarioFn,
  ScenarioOptions,
} from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import type * as Scope from 'effect/Scope'
import { describe, expect, it } from 'tstyche'

declare const Feature: FeatureFn

const pipeline = Gherkin.Do.pipe(
  Given('a saved basket on the counter')('basket', () => Effect.succeed({ owner: 'the visiting shopper' })),
  Then('the basket is saved')((s, exp) => {
    expect(s.basket.owner).type.toBe<string>()
    return exp(s.basket.owner).toBe('the visiting shopper')
  }),
)

describe('Feature live declaration', () => {
  it('Should_CarryTheReasonStringOnEveryBuilderStage_When_DeclaredLive', () => {
    expect(Feature('opening a store checkout').live).type.toBeCallableWith(
      'the browser suite waits on real page events',
    )
    expect(Feature('opening a store checkout').live('waiting on a container')).type.toBe<
      FeatureBuilder<Readonly<Record<string, never>>>
    >()
  })

  it('Should_RejectALiveDeclaration_When_NoReasonIsGiven', () => {
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith()
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith(42)
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith(true)
  })

  it('Should_StageTheReasonThroughLayerAndScenarioLayer_When_DeclaredLive', () => {
    expect(Feature('opening a store checkout').live('waiting on a container').withLayer).type.toBeCallableWith(
      layerShared,
    )
    expect(Feature('opening a store checkout').withScenarioLayer).type.toBeCallableWith(scenarioFresh)
  })
})

declare const scenario: ScenarioFn

describe('Scenario live declaration', () => {
  it('Should_AcceptOptionsThatCarryAReason_When_DeclaringTheScenarioLive', () => {
    expect(scenario).type.toBeCallableWith('two clerks shelve at once', { live: 'needs real wall time' }, pipeline)
    expect(scenario).type.not.toBeCallableWith('two clerks shelve at once', { live: true }, pipeline)
    expect(scenario).type.not.toBeCallableWith('two clerks shelve at once', { live: undefined }, pipeline)
  })

  it('Should_KeepTheOptionsObjectOptional_When_NoLiveOptionsAreGiven', () => {
    expect(scenario).type.toBeCallableWith('two clerks shelve at once', pipeline)
    expect<{ readonly live: string }>().type.toBeAssignableTo<ScenarioOptions>()
    expect<{ readonly live: boolean }>().type.not.toBeAssignableTo<ScenarioOptions>()
  })
})

declare const bindings: EffectVitestBindings

describe('Feature bindings', () => {
  it('Should_NameOnlyTheVitestItMethods_When_TheLayeredRunnerIsRemoved', () => {
    expect(bindings.it).type.toBe<Vitest.Methods>()
    expect(itOnly).type.toBeAssignableTo<EffectVitestBindings>()
    expect(makeFeature(bindings)).type.toBe<FeatureFn>()
  })
})

declare const layerShared: Layer.Layer<string>
declare const scenarioFresh: Layer.Layer<string, never, Scope.Scope>
declare const itOnly: { readonly it: typeof vitestIt }
