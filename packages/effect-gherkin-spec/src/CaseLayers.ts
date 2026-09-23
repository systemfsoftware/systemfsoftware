import { Effect, Layer, Option } from 'effect'

export interface Layers {
  readonly scenarioLayer: Layer.Layer<never> | undefined
  readonly extra: Layer.Layer<never> | undefined
}

export const empty: Layers = { scenarioLayer: void 0, extra: void 0 }

const withScenarioLayer = (
  scenarioLayer: Layer.Layer<never>,
  extra: Layer.Layer<never> | undefined,
): Layer.Layer<never> =>
  Option.match(Option.fromUndefinedOr(extra), {
    onNone: () => Layer.fresh(scenarioLayer),
    onSome: (extraLayer) => Layer.mergeAll(Layer.fresh(scenarioLayer), extraLayer),
  })

const layerToProvide = (layers: Layers): Option.Option<Layer.Layer<never>> =>
  Option.match(Option.fromUndefinedOr(layers.scenarioLayer), {
    onNone: () => Option.fromUndefinedOr(layers.extra),
    onSome: (scenarioLayer) => Option.some(withScenarioLayer(scenarioLayer, layers.extra)),
  })

/**
 * Freshens the scenario layer around every composition, keeps the extra layer
 * shared, and leaves the body untouched when neither is declared.
 */
export const compose = <B, E, R>(body: Effect.Effect<B, E, R>, layers: Layers): Effect.Effect<B, E, R> =>
  Option.match(layerToProvide(layers), {
    onNone: () => body,
    onSome: (layer) => body.pipe(Effect.provide(layer)),
  })
