import { describe, expect, it } from 'vitest'
import { promoteWarnToError } from '../promote-warn-to-error.js'

describe('promoteWarnToError', () => {
  it('maps warn to error and preserves error/off', () => {
    expect(
      promoteWarnToError({
        'effecttsgo/a': 'warn',
        'effecttsgo/b': 'error',
        'effecttsgo/c': 'off',
      }),
    ).toEqual({
      'effecttsgo/a': 'error',
      'effecttsgo/b': 'error',
      'effecttsgo/c': 'off',
    })
  })

  it('promotes no rule to warn', () => {
    const out = promoteWarnToError({ 'effecttsgo/x': 'warn' } as unknown as Record<string, 'warn'>)
    expect((Object.values(out) as Array<string>).every((v) => v !== 'warn')).toBe(true)
  })
})
