import { describe, expect, it } from 'vitest'
import { promoteWarnToError } from '../oxlint-config.base.js'

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

  it('promotes tuple warn severities to error', () => {
    expect(promoteWarnToError({ 'effecttsgo/x': ['warn', { allow: ['foo'] }] } as unknown as Record<string, unknown>))
      .toEqual({
        'effecttsgo/x': 'error',
      })
  })
})
