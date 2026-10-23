import type * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

import type { ModelAnswer, ModelFailure, ModelRequest, ModelResponse } from '../src/model/model.schema.js'
import type { ModelGatewayShape } from '../src/model/model.service.js'
import type { AssertionFailed } from '../src/verdict/failure.schema.js'

type ToolCallsAnswer = Extract<ModelAnswer, { readonly _tag: 'ToolCalls' }>

describe('ModelGateway.complete', () => {
  it('answers a response and fails only with a model failure', () => {
    expect<ModelGatewayShape['complete']>().type.toBe<
      (request: ModelRequest) => Effect.Effect<ModelResponse, ModelFailure>
    >()
  })
})

describe('ModelFailure', () => {
  it('is exactly the four model failure codes', () => {
    expect<ModelFailure['_tag']>().type.toBe<
      'MODEL_PROVIDER_FAILED' | 'MODEL_REFUSED' | 'MODEL_OUTPUT_INVALID' | 'CONTEXT_OVERFLOW'
    >()
  })

  it('admits no product failure', () => {
    expect<ModelFailure>().type.not.toBeAssignableFrom<AssertionFailed>()
  })
})

describe('ModelRequest', () => {
  it('fixes the temperature at zero', () => {
    expect<ModelRequest>().type.not.toBeAssignableFrom<Omit<ModelRequest, 'temperature'> & { temperature: 0.2 }>()
  })
})

describe('ModelAnswer', () => {
  it('has at least one call when it answers with tool calls', () => {
    expect<ToolCallsAnswer>().type.not.toBeAssignableFrom<{ _tag: 'ToolCalls'; calls: [] }>()
  })
})
