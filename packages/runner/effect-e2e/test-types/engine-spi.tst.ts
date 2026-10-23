import type * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import { describe, expect, it } from 'tstyche'

import type { Action, Engine, EngineError, EngineShape, MemorySite } from '../src/engine/mod.js'
import type { FailureError, LocatorAmbiguous, ModelRefused } from '../src/verdict/failure.schema.js'

describe('Engine', () => {
  it('cannot be served by a shape missing an operation', () => {
    expect<EngineShape>().type.not.toBeAssignableFrom<Omit<EngineShape, 'logs'>>()
  })

  it('needs nothing to build its in-memory layer', () => {
    expect<(site: MemorySite) => Layer.Layer<Engine>>().type.toBeAssignableFrom<typeof Engine.layerTest>()
  })
})

describe('EngineError', () => {
  it('is a closed subset of the failure codes', () => {
    expect<FailureError>().type.toBeAssignableFrom<EngineError>()
  })

  it('lets act fail with an ambiguous locator but never with a model failure', () => {
    expect<EngineShape['act']>().type.toBeAssignableFrom<(action: Action) => Effect.Effect<void, LocatorAmbiguous>>()
    expect<EngineShape['act']>().type.not.toBeAssignableFrom<(action: Action) => Effect.Effect<void, ModelRefused>>()
  })
})
