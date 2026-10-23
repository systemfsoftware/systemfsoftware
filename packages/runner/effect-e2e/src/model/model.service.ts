import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { ModelFailure, ModelRequest, ModelResponse } from './model.schema.js'

export interface ModelGatewayShape {
  readonly complete: (request: ModelRequest) => Effect.Effect<ModelResponse, ModelFailure>
}

export class ModelGateway extends Context.Service<ModelGateway, ModelGatewayShape>()(
  '@systemfsoftware/effect-e2e/ModelGateway',
) {}
