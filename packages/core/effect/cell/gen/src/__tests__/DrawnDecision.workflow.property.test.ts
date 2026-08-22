import { describe, it } from '@effect/vitest'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'
import { DrawnCommand, drawnDecision } from '../DrawnDecision.workflow.js'

describe('drawnDecision', () => {
  // The command is generated rather than fixed, and the success arm reads the value
  // back off it: the decider returns `command.value`, so a decider that returned any
  // constant would satisfy the previous form of this property and fails this one.
  it.prop(
    '∀i_DrawnDecision_≡TraceAndRoute',
    [fc.boolean(), fc.integer(), S.toArbitrary(DrawnCommand)(fc)],
    ([injected, error, command]) => {
      const trace: string[] = []
      const decide = drawnDecision(trace, 'decide', { injected, error })
      const result = decide(command)
      const traced = trace[0] === 'decide'
      const routed = Result.match(result, {
        onFailure: (e) => injected && e.code === error,
        onSuccess: (value) => !injected && value === command.value,
      })
      return traced && routed
    },
  )
})
