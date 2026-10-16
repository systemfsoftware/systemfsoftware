import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  CLOCK_ACTUAL,
  CLOCK_EXPECTED,
  CLOCK_FIX,
  CLOCK_NAME,
  dispatchActual,
  dispatchName,
  MATCH_ACTUAL,
  MATCH_FIX,
  MATCH_NAME,
  SHELL_CONTROL_FIX,
  SHELL_CONTROL_NAME,
  SHELL_DISPATCH_FIX,
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

const dispatchError = (callee: string, phase: 'read' | 'write') => ({
  messageId: 'dispatchInShell' as const,
  data: {
    name: dispatchName(callee),
    expected: SHELL_EXPECTED,
    actual: dispatchActual(phase),
    fix: SHELL_DISPATCH_FIX,
  },
})

const dispatchCell = (imports: string, handler: string): string =>
  `${imports}
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: ${handler},
  })
`

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
      // A fallback supplier over the same value is not a branch: getOrElse
      // takes one lazy argument, not two callbacks.
      name: 'Should_Pass_When_WriteHandlerFallsBackWithOptionGetOrElse',
      code: `import { Effect, Option } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: Option.Option<string>, command: { readonly id: string }) =>
      Effect.succeed(Option.getOrElse(decision, () => command.id)),
  })
`,
      filename: PROD,
    },
    {
      // The dispatcher belongs to the decide workflow, and the shell rule
      // never enters a Workflow.make body.
      name: 'Should_Pass_When_OptionMatchSitsInAWorkflowMakeBody',
      code: `import { Effect, Option } from 'effect'
import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'

const decideStep = Workflow.make({
  command: {},
  decision: {},
  error: {},
  decide: (command: { readonly id: string }) =>
    Option.match(Option.some(command.id), {
      onNone: () => command.id,
      onSome: (value) => value,
    }),
})

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide(decideStep)
  .write(${straightWrite})
`,
      filename: PROD,
    },
    {
      // A `.match` on a module that is not `effect` is nobody's branch.
      name: 'Should_Pass_When_MatchBelongsToANonEffectModule',
      code: `import { Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

const routes = {
  match: (path: string) => path.length,
}

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (_decision: unknown, command: { readonly id: string }) =>
      Effect.succeed(\`\${command.id}:\${routes.match(command.id)}\`),
  })
`,
      filename: PROD,
    },
    {
      // `effect/Cron` exports a real `match`, and it is a cron predicate, not
      // a branch dispatcher: the module gate keeps it lawful.
      name: 'Should_Pass_When_CronMatchRunsInAWriteHandler',
      code: `import { Effect } from 'effect'
import * as Cron from 'effect/Cron'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (decision: { readonly cron: Cron.Cron; readonly at: unknown }, command: { readonly id: string }) =>
      Effect.succeed(\`\${command.id}:\${Cron.match(decision.cron, decision.at)}\`),
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
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectWhen',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.when(Effect.succeed(command.id.length > 0))(Effect.succeed(command))`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.when', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchEffect',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.matchEffect(Effect.succeed(command), {
        onFailure: () => Effect.succeed(command),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchEffect', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchEager',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.matchEager(Effect.succeed(command.id), {
        onFailure: () => 'refused',
        onSuccess: (value) => value,
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchEager', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchCause',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.matchCause(Effect.succeed(command), {
        onFailure: () => command,
        onSuccess: (value) => value,
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchCause', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchCauseEager',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.succeed(Effect.matchCauseEager(Effect.succeed(command), {
        onFailure: () => command.id,
        onSuccess: (value) => value.id,
      }))`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchCauseEager', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchCauseEffect',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.matchCauseEffect(Effect.succeed(command), {
        onFailure: () => Effect.succeed(command),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchCauseEffect', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithEffectMatchCauseEffectEager',
      code: dispatchCell(
        `import { Effect } from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.matchCauseEffectEager(Effect.succeed(command.id), {
        onFailure: () => Effect.succeed('refused'),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Effect.matchCauseEffectEager', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_EffectIsImportedAsTheRootNamespace',
      code: dispatchCell(
        `import * as Effect from 'effect'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Effect.match(Effect.succeed(command), {
        onFailure: () => Effect.succeed(command),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithArrayMatch',
      code: dispatchCell(
        `import * as Arr from 'effect/Array'`,
        `(_decision: unknown, command: { readonly ids: ReadonlyArray<string> }) =>
      Arr.match(command.ids, {
        onEmpty: () => Effect.succeed('none'),
        onNonEmpty: (head) => Effect.succeed(head),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Array.match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithArrayMatchLeft',
      code: dispatchCell(
        `import * as Arr from 'effect/Array'`,
        `(_decision: unknown, command: { readonly ids: ReadonlyArray<string> }) =>
      Arr.matchLeft(command.ids, {
        onEmpty: () => Effect.succeed('none'),
        onNonEmpty: (head) => Effect.succeed(head),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Array.matchLeft', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithArrayMatchRight',
      code: dispatchCell(
        `import * as Arr from 'effect/Array'`,
        `(_decision: unknown, command: { readonly ids: ReadonlyArray<string> }) =>
      Arr.matchRight(command.ids, {
        onEmpty: () => Effect.succeed('none'),
        onNonEmpty: (last) => Effect.succeed(last),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Array.matchRight', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_ReadDispatchesWithOptionMatch',
      code: `import { Effect, Option } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

export const stepCell = Sandwich.named('supervisor.step')((envelope: { readonly id: Option.Option<string> }) =>
  Effect.succeed(Option.match(envelope.id, {
    onNone: () => ({ at: 0 }),
    onSome: (value) => ({ at: value.length }),
  })),
)
  .decide((command) => command)
  .write(${straightWrite})
`,
      filename: PROD,
      errors: [dispatchError('Option.match', 'read')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithOptionMatch',
      code: dispatchCell(
        `import { Effect, Option } from 'effect'`,
        `(decision: Option.Option<string>, command: { readonly id: string }) =>
      Option.match(decision, {
        onNone: () => Effect.succeed(command),
        onSome: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Option.match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithResultMatch',
      code: dispatchCell(
        `import * as Result from 'effect/Result'`,
        `(_decision: unknown, command: { readonly id: string }) =>
      Result.match(Result.succeed(command.id), {
        onFailure: () => Effect.succeed(command),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Result.match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteCallsAHelperThatRunsBooleanMatch',
      code: `import { Boolean, Effect } from 'effect'
import { Sandwich } from '@systemfsoftware/effect-cell-types'

const describeReadiness = (ready: boolean) =>
  Boolean.match(ready, {
    onFalse: () => Effect.succeed('not-ready'),
    onTrue: () => Effect.succeed('ready'),
  })

export const stepCell = Sandwich.named('supervisor.step')(${straightRead})
  .decide((command) => command)
  .write({
    Restarted: (_decision: unknown, command: { readonly id: string }) =>
      describeReadiness(command.id.length > 0),
  })
`,
      filename: PROD,
      errors: [dispatchError('Boolean.match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_WriteHandlerDispatchesWithExitMatch',
      code: dispatchCell(
        `import { Effect, Exit } from 'effect'`,
        `(decision: Exit.Exit<string, string>, command: { readonly id: string }) =>
      Exit.match(decision, {
        onFailure: () => Effect.succeed(command),
        onSuccess: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Exit.match', 'write')],
    },
    {
      name: 'Should_ReportViolation_When_OptionIsImportedUnderAnAlias',
      code: dispatchCell(
        `import { Effect, Option as O } from 'effect'`,
        `(decision: O.Option<string>, command: { readonly id: string }) =>
      O.match(decision, {
        onNone: () => Effect.succeed(command),
        onSome: (value) => Effect.succeed(value),
      })`,
      ),
      filename: PROD,
      errors: [dispatchError('Option.match', 'write')],
    },
  ],
})
