/**
 * Port-conflict workflow tests — classification of raw backend failures
 * into the bounded retry decision vs the terminal outcomes (R7, F1).
 *
 * The decision is pure: failures are classified over their recorded shape
 * (typed tags, daemon wording, cause chains) with no backend in sight —
 * zero I/O by construction.
 */
import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { ContainerLaunchError, PortBindConflictError } from '../../model/errors.js'
import {
  classifyBindFailure,
  decidePortConflict,
  LaunchPropagate,
  LaunchRetry,
  MAX_LAUNCH_ATTEMPTS,
  type PortConflictCommand,
} from '../port-conflict.workflow.js'

const conflictCommand = (
  overrides: Partial<Omit<Extract<PortConflictCommand, { readonly _tag: 'ClassifyLaunchFailure' }>, '_tag'>> = {},
): PortConflictCommand => ({
  _tag: 'ClassifyLaunchFailure',
  image: 'redis:8.6-alpine',
  error: undefined,
  attemptsUsed: 1,
  ...overrides,
})

const expectRetry = (input: PortConflictCommand, nextAttempt: number) => {
  const decision = decidePortConflict(input)
  expect(Result.isSuccess(decision)).toBe(true)
  expect(Result.getOrThrow(decision)).toBeInstanceOf(LaunchRetry)
  expect((Result.getOrThrow(decision) as LaunchRetry).nextAttempt).toBe(nextAttempt)
}

const expectPropagate = (input: PortConflictCommand, cause: unknown) => {
  const decision = decidePortConflict(input)
  expect(Result.isSuccess(decision)).toBe(true)
  const decided = Result.getOrThrow(decision) as LaunchPropagate
  expect(decided).toBeInstanceOf(LaunchPropagate)
  expect(decided.cause).toBe(cause)
}

describe('classifyBindFailure — the pure classifier', () => {
  it('Should_ClassifyTypedPortConflict_When_InstanceProvided', () => {
    const typed = PortBindConflictError.make({ message: 'bind: address already in use' })
    expect(classifyBindFailure(typed)).toBe(typed)
  })

  it('Should_ClassifyAddressAlreadyInUse_When_WordingPresent', () => {
    const classified = classifyBindFailure(new Error('EADDRINUSE: Address already in use'))
    expect(classified).toBeInstanceOf(PortBindConflictError)
    expect(classified?.message).toBe('EADDRINUSE: Address already in use')
  })

  it('Should_ClassifyAlreadyAllocated_When_WordingPresent', () => {
    expect(classifyBindFailure(new Error('port is already allocated'))).toBeInstanceOf(PortBindConflictError)
  })

  it('Should_FindConflictInCauseChain_When_WrappingFailure', () => {
    const wrapped = new Error('docker could not start container', {
      cause: new Error('driver failed programming external connectivity: bind: address already in use'),
    })
    expect(classifyBindFailure(wrapped)).toBeInstanceOf(PortBindConflictError)
  })

  it('Should_NotClassifyUnrelatedFailure_When_NoConflictWording', () => {
    expect(classifyBindFailure(new Error('boom: unrelated start failure'))).toBeUndefined()
    expect(classifyBindFailure('port is 80')).toBeUndefined()
  })

  it('Should_NotLoopForever_When_CauseChainCycles', () => {
    const cycle = new Error('address already in use')
    cycle.cause = cycle
    const classified = classifyBindFailure(cycle)
    expect(classified).toBeInstanceOf(PortBindConflictError)
    // Terminates: the depth budget breaks the cycle.
    expect(classified?.message).toBe('address already in use')
  })
})

describe('decidePortConflict — retry accounting against the ≤5 budget (R7)', () => {
  it('Should_RetryAtAttempt2_When_Attempt1FailsWithTypedConflict', () => {
    expectRetry(conflictCommand({ error: PortBindConflictError.make({ message: 'address already in use' }) }), 2)
  })

  it('Should_Retry_When_TheConflictIsDaemonWording', () => {
    expectRetry(conflictCommand({ error: new Error('port is already allocated') }), 2)
  })

  it('Should_Retry_When_TheConflictIsDeepInTheCauseChain', () => {
    const wrapped = new Error('msb run for sandbox could not bind a host port', {
      cause: new Error('bind: address already in use'),
    })
    expectRetry(conflictCommand({ error: wrapped }), 2)
  })

  it('Should_AllowTheFifthAttempt_When_FourConflictsConsumed', () => {
    expectRetry(conflictCommand({ error: new Error('address already in use'), attemptsUsed: 4 }), 5)
  })

  it('Should_FailWithContainerLaunchError_When_TheFifthAttemptAlsoConflicts', () => {
    const decision = decidePortConflict(
      conflictCommand({ error: new Error('address already in use'), attemptsUsed: 5 }),
    )
    expect(Result.isFailure(decision)).toBe(true)
    const failureOption = Result.getFailure(decision)
    expect(Option.isSome(failureOption)).toBe(true)
    const failure = Option.getOrThrow(failureOption)
    expect(failure).toBeInstanceOf(ContainerLaunchError)
    expect(failure.message).toContain(`Failed to start 'redis:8.6-alpine' after 5 attempts`)
    expect(failure.message).toContain('every attempt hit a host port already in use by another process')
  })

  it('Should_PropagateTheOriginalError_When_NotAPortConflict', () => {
    const unrelated = new Error('boom: unrelated start failure')
    expectPropagate(conflictCommand({ error: unrelated }), unrelated)
  })

  it('Should_TrackTheBudgetAcrossAttempts_When_EveryAttemptConflicts', () => {
    // The complete retry-accounting loop: conflict on attempts 1..5 —
    // retry before each of the first four, exhausted on the fifth.
    for (let attempt = 1; attempt < MAX_LAUNCH_ATTEMPTS; attempt++) {
      expectRetry(
        conflictCommand({
          error: PortBindConflictError.make({ message: 'address already in use' }),
          attemptsUsed: attempt,
        }),
        attempt + 1,
      )
    }
    const last = decidePortConflict(
      conflictCommand({ error: PortBindConflictError.make({ message: 'address already in use' }), attemptsUsed: 5 }),
    )
    expect(Result.isFailure(last)).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(last))).toBeInstanceOf(ContainerLaunchError)
  })
})
