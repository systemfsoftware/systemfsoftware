import { describe, expect, it } from 'vitest'

import { ExitClass, resolveExitCode } from '../../src/utils/object-utils.js'

describe('resolveExitCode', () => {
  it.each(
    [
      [[ExitClass.VerdictFail, ExitClass.RuntimeError], 3],
      [[ExitClass.RuntimeError, ExitClass.InternalError], 4],
      [[ExitClass.ConfigError, ExitClass.VerdictFail], 2],
      [[ExitClass.VerdictFail], 1],
      [[], 0],
    ] as const,
  )('resolves pending %s to %s without a signal', (classes, expected) => {
    expect(resolveExitCode(new Set(classes), null)).toBe(expected)
  })

  it.each(
    [
      [2, 130],
      [15, 143],
    ] as const,
  )('maps signal %s to 128 + %s, winning over every pending class', (signal, expected) => {
    expect(resolveExitCode(new Set(), signal)).toBe(expected)
    expect(
      resolveExitCode(new Set([ExitClass.VerdictFail, ExitClass.InternalError]), signal),
    ).toBe(expected)
  })
})
