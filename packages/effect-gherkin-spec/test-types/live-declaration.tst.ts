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
  Then('the basket is saved')((s) => {
    expect(s.basket.owner).type.toBe<string>()
  }),
)

describe('Feature live declaration', () => {
  it('carries the reason string on every builder stage and keeps the builder type', () => {
    expect(Feature('opening a store checkout').live).type.toBeCallableWith(
      'the browser suite waits on real page events',
    )
    expect(Feature('opening a store checkout').live('waiting on a container')).type.toBe<
      FeatureBuilder<Readonly<Record<string, never>>>
    >()
  })

  it('rejects a live declaration without a reason', () => {
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith()
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith(42)
    expect(Feature('opening a store checkout').live).type.not.toBeCallableWith(true)
  })

  it('stages the reason through withLayer and withScenarioLayer with the same reason law', () => {
    expect(Feature('opening a store checkout').live('waiting on a container').withLayer).type.toBeCallableWith(
      layerShared,
    )
    expect(Feature('opening a store checkout').withScenarioLayer).type.toBeCallableWith(scenarioFresh)
  })
})

declare const scenario: ScenarioFn

describe('Scenario live declaration', () => {
  it('accepts options that carry a reason and rejects a reasonless flag', () => {
    expect(scenario).type.toBeCallableWith('two clerks shelve at once', { live: 'needs real wall time' }, pipeline)
    expect(scenario).type.not.toBeCallableWith('two clerks shelve at once', { live: true }, pipeline)
    expect(scenario).type.not.toBeCallableWith('two clerks shelve at once', { live: undefined }, pipeline)
  })

  it('keeps the options object optional', () => {
    expect(scenario).type.toBeCallableWith('two clerks shelve at once', pipeline)
    expect<{ readonly live: string }>().type.toBeAssignableTo<ScenarioOptions>()
    expect<{ readonly live: boolean }>().type.not.toBeAssignableTo<ScenarioOptions>()
  })
})

declare const bindings: EffectVitestBindings

describe('Feature bindings', () => {
  it('names only the vitest it methods after the layered runner removal', () => {
    expect(bindings.it).type.toBe<Vitest.Methods>()
    expect(itOnly).type.toBeAssignableTo<EffectVitestBindings>()
    expect(makeFeature(bindings)).type.toBe<FeatureFn>()
  })
})

declare const layerShared: Layer.Layer<string>
declare const scenarioFresh: Layer.Layer<string, never, Scope.Scope>
declare const itOnly: { readonly it: typeof vitestIt }
