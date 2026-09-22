import { Effect, Layer } from 'effect'

export interface Layers {
  readonly scenarioLayer: Layer.Layer<never> | undefined
  readonly extra: Layer.Layer<never> | undefined
}

export const empty: Layers = { scenarioLayer: void 0, extra: void 0 }

const applyBoth = <B, E, R>(
  body: Effect.Effect<B, E, R>,
  scenarioLayer: Layer.Layer<never>,
  extra: Layer.Layer<never> | undefined,
): Effect.Effect<B, E, R> => {
  if (extra === void 0) {
    return body.pipe(Effect.provide(Layer.fresh(scenarioLayer)))
  }
  return body.pipe(Effect.provide(Layer.mergeAll(Layer.fresh(scenarioLayer), extra)))
}

const applyMissingScenario = <B, E, R>(
  body: Effect.Effect<B, E, R>,
  extra: Layer.Layer<never> | undefined,
): Effect.Effect<B, E, R> => {
  if (extra === void 0) return body
  return body.pipe(Effect.provide(extra))
}

export const compose = <B, E, R>(body: Effect.Effect<B, E, R>, layers: Layers): Effect.Effect<B, E, R> => {
  if (layers.scenarioLayer === void 0) return applyMissingScenario(body, layers.extra)
  return applyBoth(body, layers.scenarioLayer, layers.extra)
}
