import { describe } from '@effect/vitest'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { FastCheck as fc } from 'effect'
import { isModeNone } from '../leader-lock/leader-lock.kernel.js'

describe('isModeNone', () => {
  it.prop(
    '∀m_IsModeNone_=ModeIsNone',
    [fc.oneof(fc.constant('none'), fc.string())],
    ([mode]) => isModeNone({ mode }) === (mode === 'none'),
  )
})
