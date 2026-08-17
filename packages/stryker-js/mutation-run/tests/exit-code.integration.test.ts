/**
 * The process exit code contract (R6): the final code is decided once, at
 * teardown, by the precedence `signal > 4 > 3 > 2 > 1 > 0`. Verdict gates
 * record pending classes and teardown resolves them — a terminating signal
 * wins over every pending class and maps to the POSIX `128 + n` convention;
 * otherwise the highest pending class wins; nothing pending and no signal
 * is 0.
 */
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { type LogLevel } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { ExitClass, resolveExitCode } from '../src/exit-classification.js'

const Feature = makeFeature({ it, layer })

Feature('Resolving the process exit code')
  .body(({ scenario }) => {
    scenario(
      'Should_StayZero_When_NothingIsPendingAndNoSignalArrived',
      Gherkin.Do.pipe(
        Given('no pending exit classes and no signal')(
          'pending',
          () => Effect.succeed(new Set<ExitClass>()),
        ),
        Then('the code is 0')((s) => {
          expect(resolveExitCode(s.pending, null)).toBe(0)
        }),
      ),
    )

    scenario(
      'Should_ResolveThePendingClass_When_VerdictFailStandAloneIsPending',
      Gherkin.Do.pipe(
        Given('a pending VerdictFail class')(
          'pending',
          () => Effect.succeed(new Set<ExitClass>([ExitClass.VerdictFail])),
        ),
        Then('the code is 1')((s) => {
          expect(resolveExitCode(s.pending, null)).toBe(1)
        }),
      ),
    )

    scenario(
      'Should_ResolveTheHighestPendingClass_When_RuntimeAndInternalArePending',
      Gherkin.Do.pipe(
        Given('pending RuntimeError and InternalError classes')(
          'pending',
          () =>
            Effect.succeed(
              new Set<ExitClass>([ExitClass.RuntimeError, ExitClass.InternalError]),
            ),
        ),
        Then('the highest class wins')((s) => {
          expect(resolveExitCode(s.pending, null)).toBe(4)
        }),
      ),
    )

    scenario(
      'Should_ResolveConfigError_When_VerdictFailAndConfigErrorArePending',
      Gherkin.Do.pipe(
        Given('pending VerdictFail and ConfigError classes')(
          'pending',
          () =>
            Effect.succeed(
              new Set<ExitClass>([ExitClass.VerdictFail, ExitClass.ConfigError]),
            ),
        ),
        Then('the config error outranks the verdict failure')((s) => {
          expect(resolveExitCode(s.pending, null)).toBe(2)
        }),
      ),
    )

    scenario(
      'Should_ResolveRuntimeError_When_VerdictFailAndRuntimeErrorArePending',
      Gherkin.Do.pipe(
        Given('pending VerdictFail and RuntimeError classes')(
          'pending',
          () =>
            Effect.succeed(
              new Set<ExitClass>([ExitClass.VerdictFail, ExitClass.RuntimeError]),
            ),
        ),
        Then('the runtime error outranks the verdict failure')((s) => {
          expect(resolveExitCode(s.pending, null)).toBe(3)
        }),
      ),
    )

    scenario(
      'Should_ResolveSignalTo128PlusItsNumber_When_ASignalArrives',
      Gherkin.Do.pipe(
        Given('a SIGINT-class signal 2')(
          'signal',
          () => Effect.succeed(2),
        ),
        Then('the code is 130')((s) => {
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
              pending: new Set<ExitClass>([ExitClass.VerdictFail, ExitClass.InternalError]),
            }),
        ),
        Then('the signal wins over every pending class')((s) => {
          expect(resolveExitCode(s.args.pending, s.args.signal)).toBe(143)
        }),
      ),
    )
  })
