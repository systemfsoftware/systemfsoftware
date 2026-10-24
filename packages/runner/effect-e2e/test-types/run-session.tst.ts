import type * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import { describe, expect, it } from 'tstyche'

import type { ActFailure, ActResult } from '../src/agent/mod.js'
import type { CacheStore } from '../src/cache/mod.js'
import type { EnvironmentUnavailable } from '../src/engine/mod.js'
import type { ModelGateway } from '../src/model/mod.js'
import type { Attempt } from '../src/report/mod.js'
import type { ArtifactStore, SessionInput, StepHandle, TestSessionShape } from '../src/run/mod.js'
import { TestSession } from '../src/run/mod.js'

declare const session: TestSessionShape
declare const input: SessionInput

describe('TestSession', () => {
  it('is built per try from the model gateway, the cache store and the artifact store alone', () => {
    expect(TestSession.layer(input)).type.toBe<
      Layer.Layer<TestSession, never, ModelGateway | CacheStore | ArtifactStore>
    >()
  })

  it('starts an act with no requirement and joins it with the act failures plus an unavailable engine', () => {
    expect(session.act({ instruction: 'press Greet' })).type.toBe<
      Effect.Effect<StepHandle<ActResult, ActFailure | EnvironmentUnavailable>>
    >()
  })

  it('ends the try with an attempt and never fails', () => {
    expect(session.endAttempt({ _tag: 'Cancelled' })).type.toBe<Effect.Effect<Attempt>>()
  })
})
