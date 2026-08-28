/**
 * The process exit code contract (R6): the final code is decided once, at
 * teardown, by the precedence `signal > 4 > 3 > 2 > 1 > 0`. Verdict gates
 * record pending classes and teardown resolves them — a terminating signal
 * wins over every pending class and maps to the POSIX `128 + n` convention;
 * otherwise the highest pending class wins; nothing pending and no signal
 * is 0.
 */
import { expect } from 'vitest'

import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { type ExitClass, resolveExitCode, verdictExitClass } from '@systemfsoftware/stryker-js/ExitClass'

const Feature = makeFeature({ it, layer })

Feature('Resolving the process exit code').body(({ scenario }) => {
  scenario(
    'Should_StayZero_When_NothingIsPendingAndNoSignalArrived',
    Gherkin.Do.pipe(
      Given('no pending exit classes and no signal')('pending', () => Effect.succeed(new Set<ExitClass>())),
      Then('the code is 0')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(0)
      }),
    ),
  )

  scenario(
    'Should_ResolveThePendingClass_When_VerdictFailStandAloneIsPending',
    Gherkin.Do.pipe(
      Given('a pending VerdictFail class')('pending', () => Effect.succeed(new Set<ExitClass>(['VerdictFail']))),
      Then('the code is 1')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(1)
      }),
    ),
  )

  scenario(
    'Should_ResolveTheHighestPendingClass_When_RuntimeAndInternalArePending',
    Gherkin.Do.pipe(
      Given('pending RuntimeError and InternalError classes')(
        'pending',
        () => Effect.succeed(new Set<ExitClass>(['RuntimeError', 'InternalError'])),
      ),
      Then('the highest class wins')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(4)
      }),
    ),
  )

  scenario(
    'Should_ResolveConfigError_When_VerdictFailAndConfigErrorArePending',
    Gherkin.Do.pipe(
      Given('pending VerdictFail and ConfigError classes')(
        'pending',
        () => Effect.succeed(new Set<ExitClass>(['VerdictFail', 'ConfigError'])),
      ),
      Then('the config error outranks the verdict failure')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(2)
      }),
    ),
  )

  scenario(
    'Should_ResolveRuntimeError_When_VerdictFailAndRuntimeErrorArePending',
    Gherkin.Do.pipe(
      Given('pending VerdictFail and RuntimeError classes')(
        'pending',
        () => Effect.succeed(new Set<ExitClass>(['VerdictFail', 'RuntimeError'])),
      ),
      Then('the runtime error outranks the verdict failure')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(3)
      }),
    ),
  )

  scenario(
    'Should_ResolveSignalTo128PlusItsNumber_When_ASignalArrives',
    Gherkin.Do.pipe(
      Given('a SIGINT-class signal 2')('signal', () => Effect.succeed(2)),
      Then('the code is 130')((s: { signal: number }) => {
        expect(resolveExitCode(new Set(), s.signal)).toBe(130)
      }),
    ),
  )

  scenario(
    'Should_WinOverPendingClasses_When_ASignalArrives',
    Gherkin.Do.pipe(
      Given('a SIGTERM-class signal 15 and pending VerdictFail and InternalError')(
        'args',
        () =>
          Effect.succeed({
            signal: 15,
            pending: new Set<ExitClass>(['VerdictFail', 'InternalError']),
          }),
      ),
      Then('the signal wins over every pending class')((s: {
        args: { signal: number; pending: Set<ExitClass> }
      }) => {
        expect(resolveExitCode(s.args.pending, s.args.signal)).toBe(143)
      }),
    ),
  )
  scenario(
    'Should_ResolveVerdictFail_When_EvaluatorReturnsVerdictFailWhileScorePasses',
    Gherkin.Do.pipe(
      Given('a passing score and an evaluator returning VerdictFail')('pending', () => {
        const scoreVerdict = verdictExitClass(80, 60)
        const evaluatorVerdicts: readonly ExitClass[] = ['VerdictFail']
        const pending = new Set<ExitClass>(
          [scoreVerdict, ...evaluatorVerdicts].filter(
            (value): value is ExitClass => value !== null,
          ),
        )
        return Effect.succeed(pending)
      }),
      Then('the code is 1')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(1)
      }),
    ),
  )

  scenario(
    'Should_StayZero_When_EvaluatorReturnsNullWhileScorePasses',
    Gherkin.Do.pipe(
      Given('a passing score and an evaluator returning null')('pending', () => {
        const scoreVerdict = verdictExitClass(80, 60)
        const evaluatorVerdicts: readonly (ExitClass | null)[] = [null]
        const pending = new Set<ExitClass>(
          [scoreVerdict, ...evaluatorVerdicts].filter(
            (value): value is ExitClass => value !== null,
          ),
        )
        return Effect.succeed(pending)
      }),
      Then('the code is 0')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(0)
      }),
    ),
  )

  scenario(
    'Should_ResolveVerdictFail_When_ScoreIsBelowThreshold',
    Gherkin.Do.pipe(
      Given('a score below its breaking threshold')('pending', () => {
        const scoreVerdict = verdictExitClass(59, 60)
        const pending = new Set<ExitClass>(
          [scoreVerdict].filter((value): value is ExitClass => value !== null),
        )
        return Effect.succeed(pending)
      }),
      Then('the code is 1')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(1)
      }),
    ),
  )

  scenario(
    'Should_StayZero_When_ScoreEqualsThreshold',
    Gherkin.Do.pipe(
      Given('a score exactly equal to its breaking threshold')('pending', () => {
        const scoreVerdict = verdictExitClass(60, 60)
        const pending = new Set<ExitClass>(
          [scoreVerdict].filter((value): value is ExitClass => value !== null),
        )
        return Effect.succeed(pending)
      }),
      Then('the code is 0')((s: { pending: Set<ExitClass> }) => {
        expect(resolveExitCode(s.pending, null)).toBe(0)
      }),
    ),
  )
})
