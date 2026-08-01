import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { HOOK_CEILING_MS, resolveHookBudget, ResolveHookBudgetCommand } from './hook-budget.workflow.js'

const anyEvent = fc.constantFrom('PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop')

const eventWithoutClaudeDefault = fc.constantFrom('PreToolUse', 'PostToolUse', 'SessionStart', 'Stop')

const shortSeconds = fc.integer({ min: 1, max: HOOK_CEILING_MS / 1000 })

const longSeconds = fc.integer({ min: HOOK_CEILING_MS / 1000 + 1, max: 3600 })

const anySeconds = fc.option(fc.integer({ min: 1, max: 3600 }), { nil: undefined })

const budgetOf = (configuredSeconds: number | undefined, event: string, callerIsWaiting: boolean) =>
  resolveHookBudget(new ResolveHookBudgetCommand({ configuredSeconds, event, callerIsWaiting }))

describe('resolveHookBudget', () => {
  it.prop(
    '∀event_AnEventWithNoClaudeDefaultFallsBackToSixHundredSeconds_→SixHundredThousandMs',
    [eventWithoutClaudeDefault],
    ([event]) => budgetOf(undefined, event, false).timeoutMs === 600_000,
  )

  it.prop(
    '∀event_ClaudesUserPromptSubmitDefaultIsThirtySeconds_→ThirtyThousandMs',
    [fc.constant('UserPromptSubmit')],
    ([event]) => budgetOf(undefined, event, false).timeoutMs === 30_000,
  )

  it.prop(
    '∀event_ClaudesUserPromptSubmitDefaultAlreadyOutgrowsTheHookCeiling_→Capped',
    [fc.constant('UserPromptSubmit')],
    ([event]) => {
      const budget = budgetOf(undefined, event, true)
      return budget._tag === 'BudgetCapped' &&
        budget.requestedMs === 30_000 &&
        budget.timeoutMs === HOOK_CEILING_MS
    },
  )

  it.prop(
    '∀boundary_RequestSittingExactlyOnTheCeilingIsNotCapped_→Honoured',
    [fc.constant(HOOK_CEILING_MS / 1000), anyEvent],
    ([seconds, event]) => {
      const budget = budgetOf(seconds, event, true)
      return budget._tag === 'BudgetHonoured' && budget.timeoutMs === HOOK_CEILING_MS
    },
  )

  it.prop(
    '∀seconds_ConfiguredValueOverridesEveryDefault_→RequestedIsSecondsTimesOneThousand',
    [longSeconds, anyEvent],
    ([seconds, event]) => {
      const budget = budgetOf(seconds, event, true)
      return budget._tag === 'BudgetCapped' && budget.requestedMs === seconds * 1000
    },
  )

  it.prop(
    '∀seconds_ShortAwaitedRequest_→HonouredAtExactlyThatBudget',
    [shortSeconds, eventWithoutClaudeDefault],
    ([seconds, event]) => {
      const budget = budgetOf(seconds, event, true)
      return budget._tag === 'BudgetHonoured' && budget.timeoutMs === seconds * 1000
    },
  )

  it.prop(
    '∀seconds_NobodyWaiting_→NeverCapped',
    [fc.oneof(shortSeconds, longSeconds), anyEvent],
    ([seconds, event]) => {
      const budget = budgetOf(seconds, event, false)
      return budget._tag === 'BudgetHonoured' && budget.timeoutMs === seconds * 1000
    },
  )

  it.prop(
    '∀input_AnAwaitedBudgetNeverOutgrowsTheHookCeiling_→Invariant',
    [anySeconds, anyEvent],
    ([seconds, event]) => budgetOf(seconds, event, true).timeoutMs <= HOOK_CEILING_MS,
  )

  it.prop(
    '∀input_TheCapTagAgreesWithTheArithmetic_→Invariant',
    [anySeconds, anyEvent, fc.boolean()],
    ([seconds, event, callerIsWaiting]) => {
      const budget = budgetOf(seconds, event, callerIsWaiting)
      const uncapped = budgetOf(seconds, event, false).timeoutMs
      return budget._tag === 'BudgetCapped'
        ? callerIsWaiting && uncapped > HOOK_CEILING_MS && budget.requestedMs === uncapped &&
          budget.timeoutMs === HOOK_CEILING_MS
        : budget.timeoutMs === uncapped
    },
  )
})
