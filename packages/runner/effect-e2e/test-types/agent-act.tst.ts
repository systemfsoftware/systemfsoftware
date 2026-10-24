import type * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

import type { ActContext, ActFailure, ActionEvent, ActResult, SecretLedger } from '../src/agent/mod.js'
import { act } from '../src/agent/mod.js'
import type { CacheStore } from '../src/cache/mod.js'
import type { Engine } from '../src/engine/mod.js'
import type { ModelGateway } from '../src/model/mod.js'

declare const context: ActContext

describe('act', () => {
  it('needs exactly the engine, the model gateway, the cache store and the secret ledger', () => {
    expect(act({ context, instruction: 'press Greet' })).type.toBe<
      Effect.Effect<ActResult, ActFailure, Engine | ModelGateway | CacheStore | SecretLedger>
    >()
  })

  it('fails only with the act step failures', () => {
    expect<ActFailure['_tag']>().type.toBe<
      | 'SECRET_UNAVAILABLE'
      | 'STEP_BUDGET_EXHAUSTED'
      | 'STEP_TIMEOUT'
      | 'UNSUPPORTED_CAPABILITY'
      | 'POLICY_DENIED'
      | 'MODEL_PROVIDER_FAILED'
      | 'MODEL_REFUSED'
      | 'MODEL_OUTPUT_INVALID'
      | 'CONTEXT_OVERFLOW'
      | 'APP_NOT_OPEN'
      | 'APP_UNREACHABLE'
      | 'AUTOMATION_UNSUPPORTED'
      | 'ARTIFACT_WRITE_FAILED'
    >()
  })

  it('reports action events from the model or a replay only', () => {
    expect<ActionEvent['source']>().type.toBe<'model' | 'replay'>()
  })
})
