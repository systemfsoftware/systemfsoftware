/**
 * Verdict-kernel tests (R11) — the pure wait decision cell. The kernel takes
 * (probe result, elapsed, budget) and names Continue | Ready | Timeout(tail);
 * these tests pin the three-way rule, the one-shot ordering (a successful
 * probe wins at/after the deadline — upstream's do-while), the vacuous-ready
 * strategies, and the setup validation the interpreter runs before touching
 * the runtime (negative/zero startup timeout, ForHttp port/status ranges,
 * ForLogMessage count/pattern, ForShell command).
 */
import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import type { ForLogMessage } from '../../model/wait.schema.js'
import { decideVerdict, InvalidWaitStrategyError, isTriviallyReady, validateWaitSetup } from '../verdict.kernel.js'

const port = { _tag: 'ForPort' } as const
const logMsg = (pattern: string, count?: number): ForLogMessage => ({
  _tag: 'ForLogMessage',
  pattern,
  ...(count === undefined ? {} : { count }),
})
const validSetup = { strategy: port, startupTimeoutMs: 120_000, pollIntervalMs: 250 }

describe('decideVerdict — one round', () => {
  it('Should_BeReady_When_ProbeSucceedsAfterTheDeadline', () => {
    // upstream's do-while: a sub-interval deadline still gets its one probe,
    // and a successful probe wins outright — Ready, not Timeout.
    expect(decideVerdict({ probeOk: true, elapsedMs: 99_000, timeoutMs: 250, tail: '' })).toEqual({ _tag: 'Ready' })
  })

  it('Should_BeReady_When_ProbeSucceedsBeforeTheDeadline', () => {
    expect(decideVerdict({ probeOk: true, elapsedMs: 100, timeoutMs: 120_000, tail: '' })).toEqual({ _tag: 'Ready' })
  })

  it('Should_Timeout_When_ProbeFailsAtTheDeadline', () => {
    expect(decideVerdict({ probeOk: false, elapsedMs: 500, timeoutMs: 500, tail: 'tail' })).toEqual({
      _tag: 'Timeout',
      tail: 'tail',
    })
  })

  it('Should_Timeout_When_ProbeFailsPastTheDeadline', () => {
    expect(decideVerdict({ probeOk: false, elapsedMs: 501, timeoutMs: 500, tail: 'tail' })).toEqual({
      _tag: 'Timeout',
      tail: 'tail',
    })
  })

  it('Should_Continue_When_ProbeFailsBeforeTheDeadline', () => {
    expect(decideVerdict({ probeOk: false, elapsedMs: 250, timeoutMs: 120_000, tail: '' })).toEqual({
      _tag: 'Continue',
    })
  })

  it('Should_CarryTheTail_When_TimingOut', () => {
    const verdict = decideVerdict({ probeOk: false, elapsedMs: 9_000, timeoutMs: 1_000, tail: 'boot failed\n' })
    expect(verdict).toEqual({ _tag: 'Timeout', tail: 'boot failed\n' })
  })
})

describe('isTriviallyReady — vacuous strategies need no probe', () => {
  it('Should_BeReady_When_ForPortHasNoExposedPorts', () => {
    expect(isTriviallyReady({ _tag: 'ForPort' }, 0)).toBe(true)
  })

  it('Should_NotBeVacuouslyReady_When_ForPortHasExposedPorts', () => {
    expect(isTriviallyReady({ _tag: 'ForPort' }, 2)).toBe(false)
  })

  it('Should_BeReady_When_ForLogMessageCountIsZero', () => {
    expect(isTriviallyReady(logMsg('anything', 0), 0)).toBe(true)
  })

  it('Should_NotBeVacuouslyReady_When_LogMessageCountIsOneOrUnset', () => {
    expect(isTriviallyReady(logMsg('anything', 1), 0)).toBe(false)
    expect(isTriviallyReady(logMsg('anything'), 0)).toBe(false)
  })

  it('Should_NotBeVacuouslyReady_When_StrategyIsHttpHealthOrShell', () => {
    expect(isTriviallyReady({ _tag: 'ForHttp', path: '/' }, 1)).toBe(false)
    expect(isTriviallyReady({ _tag: 'ForHealthCheck' }, 1)).toBe(false)
    expect(isTriviallyReady({ _tag: 'ForShell', command: 'true' }, 1)).toBe(false)
  })
})

describe('validateWaitSetup — the interpreter refuses bad setups as a typed result', () => {
  it('Should_Accept_When_BudgetAndStrategyAreValid', () => {
    expect(Result.isSuccess(validateWaitSetup(validSetup))).toBe(true)
  })

  it('Should_Refuse_When_StartupTimeoutIsNonPositive', () => {
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, startupTimeoutMs: -1 }))).toBe(true)
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, startupTimeoutMs: 0 }))).toBe(true)
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, startupTimeoutMs: Number.NaN }))).toBe(true)
  })

  it('Should_Refuse_When_PollIntervalIsNonPositive', () => {
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, pollIntervalMs: 0 }))).toBe(true)
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, pollIntervalMs: 2.5 }))).toBe(true)
  })

  it('Should_Refuse_When_ForHttpPortIsOutOfRange', () => {
    for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
      const result = validateWaitSetup({
        ...validSetup,
        strategy: { _tag: 'ForHttp', path: '/', port },
      })
      expect(Result.isFailure(result)).toBe(true)
      expect(Result.isFailure(result) ? result.failure.message : '').toContain('ForHttp.port')
    }
    expect(Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHttp', path: '/', port: 1 } })))
      .toBe(true)
    expect(
      Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHttp', path: '/', port: 65535 } })),
    ).toBe(true)
  })

  it('Should_Refuse_When_ForHttpStatusIsOutOfRange', () => {
    for (const status of [99, 600, 200.5, -1]) {
      expect(Result.isFailure(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHttp', path: '/', status } })))
        .toBe(
          true,
        )
    }
    expect(
      Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHttp', path: '/', status: 100 } })),
    ).toBe(
      true,
    )
    expect(
      Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHttp', path: '/', status: 599 } })),
    ).toBe(
      true,
    )
  })

  it('Should_Refuse_When_LogMessageCountIsInvalid', () => {
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, strategy: logMsg('ready', -1) }))).toBe(true)
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, strategy: logMsg('ready', 1.5) }))).toBe(true)
  })

  it('Should_Accept_When_LogMessageCountIsZero', () => {
    expect(Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: logMsg('ready', 0) }))).toBe(true)
  })

  it('Should_Refuse_When_LogMessagePatternDoesNotCompile', () => {
    const result = validateWaitSetup({ ...validSetup, strategy: logMsg('(', 1) })
    expect(Result.isFailure(result)).toBe(true)
    expect(Result.isFailure(result) ? result.failure.message : '').toContain('regular expression')
  })

  it('Should_Refuse_When_ShellCommandIsEmpty', () => {
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForShell', command: '' } }))).toBe(
      true,
    )
    expect(Result.isFailure(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForShell', command: '   ' } }))).toBe(
      true,
    )
    expect(Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForShell', command: 'true' } })))
      .toBe(true)
  })

  it('Should_Accept_When_StrategyIsForHealthCheck', () => {
    expect(Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHealthCheck' } }))).toBe(true)
    expect(
      Result.isSuccess(validateWaitSetup({ ...validSetup, strategy: { _tag: 'ForHealthCheck', status: 'starting' } })),
    ).toBe(
      true,
    )
  })

  it('Should_FailTyped_When_SetupIsInvalid', () => {
    const result = validateWaitSetup({ ...validSetup, startupTimeoutMs: -5 })
    expect(Result.isFailure(result)).toBe(true)
    expect(Result.isFailure(result) ? result.failure : undefined).toBeInstanceOf(InvalidWaitStrategyError)
  })
})
