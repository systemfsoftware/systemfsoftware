import { describe, it } from '@effect/vitest'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { drawnDecision } from '../DrawnDecision.workflow.js'

describe('drawnDecision', () => {
  it.prop('∀i_DrawnDecision_≡TraceAndRoute', [fc.boolean(), fc.integer()], ([injected, error]) => {
    const trace: string[] = []
    const decide = drawnDecision(trace, 'decide', { injected, error })
    const result = decide(0)
    const traced = trace[0] === 'decide'
    const routed = Result.match(result, {
      onFailure: (e) => injected && e.code === error,
      onSuccess: () => !injected,
    })
    return traced && routed
  })
})
