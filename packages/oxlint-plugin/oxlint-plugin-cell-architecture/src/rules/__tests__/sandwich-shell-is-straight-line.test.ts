import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  CLOCK_ACTUAL,
  CLOCK_EXPECTED,
  CLOCK_FIX,
  CLOCK_NAME,
  MATCH_ACTUAL,
  MATCH_FIX,
  MATCH_NAME,
  SHELL_CONTROL_FIX,
  SHELL_CONTROL_NAME,
  SHELL_EXPECTED,
  SHELL_LOGICAL_NAME,
  shellControlActual,
} from '../sandwich-shell-is-straight-line.config.js'
import { sandwichShellIsStraightLine } from '../sandwich-shell-is-straight-line.js'

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

const PROD = 'src/supervisor-step.cell.ts'

const controlError = (kind: keyof typeof SHELL_CONTROL_NAME, phase: 'read' | 'write') => ({
  messageId: 'controlFlowInShell' as const,
  data: {
    name: SHELL_CONTROL_NAME[kind],
    expected: SHELL_EXPECTED,
    actual: shellControlActual(phase),
    fix: SHELL_CONTROL_FIX,
  },
})

const logicalError = (phase: 'read' | 'write') => ({
  messageId: 'controlFlowInShell' as const,
  data: {
    name: SHELL_LOGICAL_NAME,
    expected: SHELL_EXPECTED,
    actual: shellControlActual(phase),
    fix: SHELL_CONTROL_FIX,
  },
})

const matchError = {
  messageId: 'matchPipelineInShell' as const,
  data: { name: MATCH_NAME, expected: SHELL_EXPECTED, actual: MATCH_ACTUAL, fix: MATCH_FIX },
}

const clockError = {
  messageId: 'clockReadInWrite' as const,
  data: { name: CLOCK_NAME, expected: CLOCK_EXPECTED, actual: CLOCK_ACTUAL, fix: CLOCK_FIX },
}

const PRELUDE = `import { Effect } from 'effect'
import * as Clock from 'effect/Clock'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
`

const straightRead = `(envelope: { readonly at: number }) => Effect.succeed({ at: envelope.at })`
const straightWrite = `{
    Restarted: (decision: { readonly id: string }, command: { readonly id: string }) => Effect.succeed(command),
    Stopped: (_decision: unknown, command: { readonly id: string }) => Effect.succeed(command),
  }`

const cellOf = (read: string, handlers: string): string =>
  `${PRELUDE}
export const stepCell = Sandwich.named('supervisor.step')(${read})
  .decide((command) => command)
  .write(${handlers})
`

ruleTester.run('sandwich-shell-is-straight-line', sandwichShellIsStraightLine, {
  valid: [
    {
      name: 'Should_Pass_When_WriteHandlerIsStraightLine',
      code: cellOf(straightRead, straightWrite),
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ReadGathersStateAndClock',
      code: cellOf(
        `(envelope: { readonly id: string }) => Effect.map(Clock.currentTimeMillis, (at: number) => ({ id: envelope.id, at }))`,
        straightWrite,
      ),
      filename: PROD,
    },
    {
      // The Match pipeline belongs to the decide workflow, and the shell rule
      // never enters a Workflow.make body - only the read argument and the
      // write handlers are shell phases.
      name: 'Should_Pass_When_MatchExhaustiveSitsInAWorkflowMakeBody',
      code: `import { Effect } from 'effect'
import * as Match from 'effect/Match'
import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'

const decideStep = Workflow.make({
  command: {},
  decision: {},
  error: {},
  decide: (command: { readonly tag: 'a' | 'b' }) =>
    Match.value(command).pipe(
      Match.when({ tag: 'a' }, () => 'a'),
      Match.orElse(() => 'b'),
      Match.exhaustive,
    ),
})

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide(decideStep)
  .write(${straightWrite})
`,
      filename: PROD,
    },
    {
      // Type positions are erased before anything runs: a Clock or Effect
      // annotation on a handler signature is not a clock read.
      name: 'Should_Pass_When_ClockAndEffectAppearOnlyInTypePositions',
      code: `import { Effect } from 'effect'
import * as Clock from 'effect/Clock'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: Clock.Clock, command: { readonly id: string }): Effect.Effect<{ readonly id: string }> =>
      Effect.succeed(command),
  })
`,
      filename: PROD,
    },
    {
      // A local binding named Clock shadows nothing: it is not an import, so
      // the origin resolver proves it is not the effect Clock module.
      name: 'Should_Pass_When_LocalBindingShadowsTheClockName',
      code: cellOf(
        straightRead,
        `{
    Restarted: (_decision: unknown, command: { readonly id: string }) => {
      const Clock = { currentTimeMillis: 0 }
      return Effect.succeed(\`\${command.id}:\${Clock.currentTimeMillis}\`)
    },
  }`,
      ),
      filename: PROD,
    },
    {
      // Option.match is a value dispatcher over a closed type, not a Match
      // pipeline and not an AST control-flow form; the shell may run it.
      name: 'Should_Pass_When_WriteHandlerDispatchesWithOptionMatch',
      code: `import { Effect, Option } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: Option.Option<string>, command: { readonly id: string }) =>
      Option.match(decision, {
        onNone: () => Effect.succeed(command),
        onSome: (value) => Effect.succeed(command),
      }),
  })
`,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_CellSitsInATestFile',
      code: cellOf(
        `(envelope: { readonly ready: boolean }) => (envelope.ready ? Effect.succeed(1) : Effect.succeed(0))`,
        `{
    Restarted: (decision: { readonly restarts: number }, command: { readonly id: string }) => {
      if (decision.restarts > 3) {
        return Effect.succeed(command)
      }
      return Effect.succeed(command)
    },
  }`,
      ),
      filename: 'src/supervisor-step.cell.test.ts',
    },
    {
      // A read helper in another file is outside the lint-visible boundary
      // (KTD15); the whole-package aim is the backstop there.
      name: 'Should_Pass_When_ReadHelperLivesInAnotherFile',
      code: `import { Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { readEnvelope } from './read-envelope.js'

export const stepCell = Sandwich.named('supervisor.step')(readEnvelope)
  .decide((command) => command)
  .write(${straightWrite})
`,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_DecideArgumentIsASameFileHelper',
      code: `import { Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

const decideStep = (command: { readonly id: string }) => command

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide(decideStep)
  .write(${straightWrite})
`,
      filename: PROD,
    },
  ],
  invalid: [
    {
      // AE9: the restart-intensity decision branches inside the write phase.
      name: 'Should_ReportViolation_When_WriteHandlerBranchesOnARestartCount',
      code: cellOf(
        straightRead,
        `{
    Restarted: (decision: { readonly restarts: number }, command: { readonly id: string }) => {
      if (decision.restarts > 3) {
        return Effect.succeed(command)
      }
      return Effect.succeed(command)
    },
    Stopped: (_decision: unknown, command: { readonly id: string }) => Effect.succeed(command),
  }`,
      ),
      filename: PROD,
      errors: [controlError('IfStatement', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_ReadAnswersWithATernary',
      code: cellOf(
        `(envelope: { readonly ready: boolean }) => (envelope.ready ? Effect.succeed({ at: 1 }) : Effect.succeed({ at: 0 }))`,
        straightWrite,
      ),
      filename: PROD,
      errors: [controlError('ConditionalExpression', 'read')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerRunsAMatchPipeline',
      code: `import { Effect } from 'effect'
import * as Match from 'effect/Match'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: { readonly tag: 'a' | 'b' }) =>
      Match.value(decision).pipe(
        Match.when({ tag: 'a' }, () => Effect.succeed('a')),
        Match.orElse(() => Effect.succeed('b')),
      ),
  })
`,
      filename: PROD,
      errors: [matchError],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerReadsTheClock',
      code: cellOf(
        straightRead,
        `{
    Restarted: () => Effect.map(Clock.currentTimeMillis, (at: number) => ({ at })),
  }`,
      ),
      filename: PROD,
      errors: [clockError],
    },
    {
      // The switch lives in a same-file helper the handler calls; the phase is
      // still where the branch runs.
      name: 'Should_ReportViolation_When_WriteCallsASameFileHelperWithASwitch',
      code: `import { Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

const executePolicy = (policy: string) => {
  switch (policy) {
    case 'one-for-one': {
      return Effect.succeed(policy)
    }
    default: {
      return Effect.succeed(policy)
    }
  }
}

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: { readonly policy: string }) => executePolicy(decision.policy),
  })
`,
      filename: PROD,
      errors: [controlError('SwitchStatement', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerIteratesWithForOf',
      code: cellOf(
        straightRead,
        `{
    Restarted: (_decision: unknown, command: { readonly id: string }) => {
      const batch = [command]
      for (const one of batch) {
        Effect.runSync(Effect.succeed(one))
      }
      return Effect.succeed(command)
    },
  }`,
      ),
      filename: PROD,
      errors: [controlError('ForOfStatement', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_ReadShortCircuitsAValueWithLogicalAnd',
      code: cellOf(
        `(envelope: { readonly ready: boolean; readonly seen: boolean }) =>
          Effect.succeed(envelope.ready && envelope.seen)`,
        straightWrite,
      ),
      filename: PROD,
      errors: [logicalError('read')],
    },
    {
      name: 'Should_ReportViolation_When_ReadRunsAMatchPipeline',
      code: `import { Effect } from 'effect'
import * as Match from 'effect/Match'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')((envelope: { readonly tag: 'a' | 'b' }) =>
    Match.value(envelope).pipe(Match.when({ tag: 'a' }, () => 1), Match.orElse(() => 2)),
  )
  .decide((command) => command)
  .write(${straightWrite})
`,
      filename: PROD,
      errors: [matchError],
    },
    {
      // The branch hides one lambda deeper, inside a callback the handler runs.
      name: 'Should_ReportViolation_When_TheBranchHidesInANestedCallback',
      code: cellOf(
        straightRead,
        `{
    Restarted: (_decision: unknown, command: { readonly ids: ReadonlyArray<string> }) =>
      Effect.forEach(command.ids, (id) => (id.length > 1 ? Effect.succeed(id) : Effect.succeed(''))),
  }`,
      ),
      filename: PROD,
      errors: [controlError('ConditionalExpression', 'write')],
    },
    {
      // The chain is spelled through an aliased import; origin, not spelling.
      name: 'Should_ReportViolation_When_TheChainIsSpelledThroughAnAliasedImport',
      code: `import { Effect } from 'effect'
import { Sandwich as Cell } from '@systemfsoftware/effect-cell-types'

export const stepCell = Cell.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: { readonly restarts: number }, command: { readonly id: string }) => {
      if (decision.restarts > 3) {
        return Effect.succeed(command)
      }
      return Effect.succeed(command)
    },
  })
`,
      filename: PROD,
      errors: [controlError('IfStatement', 'write')],
    },
    {
      // The read is a same-file helper handed over by name.
      name: 'Should_ReportViolation_When_TheReadIsASameFileHelperWithATernary',
      code: `import { Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

const readEnvelope = (envelope: { readonly ready: boolean }) =>
  envelope.ready ? Effect.succeed({ at: 1 }) : Effect.succeed({ at: 0 })

export const stepCell = Sandwich.named('supervisor.step')(readEnvelope)
  .decide((command) => command)
  .write(${straightWrite})
`,
      filename: PROD,
      errors: [controlError('ConditionalExpression', 'read')],
    },
  ],
})
