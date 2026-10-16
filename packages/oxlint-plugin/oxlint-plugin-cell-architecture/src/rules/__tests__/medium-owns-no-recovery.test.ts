import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { RECOVERY_ACTUAL, RECOVERY_EXPECTED, RECOVERY_FIX, recoveryName } from '../medium-owns-no-recovery.config.js'
import { mediumOwnsNoRecovery } from '../medium-owns-no-recovery.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const PROD = 'src/medium.ts'

const recoveryError = (callee: string, port: string) => ({
  messageId: 'recoveryInMedium' as const,
  data: {
    name: recoveryName(callee),
    expected: RECOVERY_EXPECTED,
    actual: RECOVERY_ACTUAL(port),
    fix: RECOVERY_FIX,
  },
})

const PRELUDE = `import { Effect } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
`

const mediumOf = (body: string, imports = PRELUDE): string =>
  `${imports}

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
${body}
})
`

ruleTester.run('medium-owns-no-recovery', mediumOwnsNoRecovery, {
  valid: [
    {
      name: 'Should_Pass_When_EveryPortIsStraightLine',
      code: mediumOf(`  start: (program: { readonly id: string }) => Effect.succeed(program),
  probe: (started: { readonly id: string }) => Effect.succeed(started.id),
  stop: (started: { readonly id: string }, mode: string) => Effect.succeed(mode.length > 0),`),
      filename: PROD,
    },
    {
      // KTD17: readiness is a wait, not a recovery, and the readiness
      // conditions are exactly how a medium waits.
      name: 'Should_Pass_When_StartWaitsThroughAnEffectReadinessCondition',
      code: `import { Effect } from 'effect'
import * as Readiness from '@systemfsoftware/effect-readiness'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program: { readonly id: string }) =>
    Effect.flatMap(Readiness.await(Readiness.readyWhen(() => true)), () => Effect.succeed(program)),
})
`,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ChildProgramRetriesOutsideTheMedium',
      code: `import { Effect } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

const child = Effect.retry(Effect.succeed('child'))

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program: { readonly id: string }) => Effect.succeed(program),
})
`,
      filename: PROD,
    },
    {
      // The impostor: a Medium.make from any other module is not this gate's
      // boundary. Origin decides, never the name.
      name: 'Should_Pass_When_MediumMakeComesFromAnotherModule',
      code: `import { Effect } from 'effect'
import { Medium } from '@acme/impostor'

export const medium = Medium.make({
  start: (program: { readonly id: string }) => Effect.retry(program),
})
`,
      filename: PROD,
    },
    {
      // Type annotations are erased before anything runs.
      name: 'Should_Pass_When_EffectAppearsOnlyInTypePositions',
      code: `import * as Effect from 'effect/Effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  start: (program: { readonly id: string }): Effect.Effect<{ readonly id: string }> => Effect.succeed(program),
})
`,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_MediumSitsInATestFile',
      code: mediumOf(`  start: (program: { readonly id: string }) => Effect.retry(program),`),
      filename: 'src/medium.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportViolation_When_StartRetries',
      code: mediumOf(`  start: (program: { readonly id: string }) => Effect.retry(program),`),
      filename: PROD,
      errors: [recoveryError('Effect.retry', 'start')],
    },
    {
      name: 'Should_ReportViolation_When_StartRetriesWithAnElse',
      code: mediumOf(`  start: (program: { readonly id: string }) =>
    Effect.retryOrElse(program, { onFailure: () => program, onRetry: () => 1 }),`),
      filename: PROD,
      errors: [recoveryError('Effect.retryOrElse', 'start')],
    },
    {
      name: 'Should_ReportViolation_When_ProbeRunsForever',
      code: mediumOf(`  probe: (started: { readonly id: string }) => Effect.forever(Effect.succeed(started.id)),`),
      filename: PROD,
      errors: [recoveryError('Effect.forever', 'probe')],
    },
    {
      name: 'Should_ReportViolation_When_StopRetriesAStream',
      code: `import { Effect } from 'effect'
import * as Stream from 'effect/Stream'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  stop: (started: { readonly id: string }) => Stream.retry(Stream.succeed(true)),
})
`,
      filename: PROD,
      errors: [recoveryError('Stream.retry', 'stop')],
    },
    {
      name: 'Should_ReportViolation_When_StreamRetryIsSpelledFromTheRootNamespace',
      code: `import { Stream } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  stop: (started: { readonly id: string }) => Stream.retry(Stream.succeed(true)),
})
`,
      filename: PROD,
      errors: [recoveryError('Stream.retry', 'stop')],
    },
    {
      // The retry hides in a same-file helper the port calls.
      name: 'Should_ReportViolation_When_TheRetryHidesInASameFileHelper',
      code: `import { Effect } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

const bootOnce = (program: { readonly id: string }) => Effect.retry(program)

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program: { readonly id: string }) => bootOnce(program),
})
`,
      filename: PROD,
      errors: [recoveryError('Effect.retry', 'start')],
    },
    {
      // Aliased import: the imported name decides, never the local spelling.
      name: 'Should_ReportViolation_When_EffectIsImportedUnderAnAlias',
      code: `import { Effect as Eff } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program: { readonly id: string }) => Eff.retry(program),
})
`,
      filename: PROD,
      errors: [recoveryError('Effect.retry', 'start')],
    },
    {
      // The namespace subpath spelling of the same combinator.
      name: 'Should_ReportViolation_When_EffectIsImportedFromTheSubpath',
      code: `import * as Effect from 'effect/Effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

export const medium = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program: { readonly id: string }) => Effect.retry(program),
})
`,
      filename: PROD,
      errors: [recoveryError('Effect.retry', 'start')],
    },
    {
      // The ports record is a same-file const handed over by name.
      name: 'Should_ReportViolation_When_ThePortsRecordIsAModuleConst',
      code: `import { Effect } from 'effect'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'

const ports = {
  start: (program: { readonly id: string }) => Effect.retry(program),
}

export const medium = Supervisor.Medium.make(ports)
`,
      filename: PROD,
      errors: [recoveryError('Effect.retry', 'start')],
    },
  ],
})
