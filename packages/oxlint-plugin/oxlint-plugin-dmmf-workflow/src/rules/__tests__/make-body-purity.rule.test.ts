import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeBodyPurity } from '../make-body-purity.js'
import {
  CONTROL_ACTUAL,
  CONTROL_EXPECTED,
  CONTROL_FIX,
  controlError,
  makeWorkflow,
  MUTABLE_LOCAL_ACTUAL,
  MUTABLE_LOCAL_FIX,
  PRELUDE,
  referenceError,
  UNRESOLVABLE_ACTUAL,
  UNRESOLVABLE_FIX,
} from './make-body-purity.fixtures.js'

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

ruleTester.run('make-body-purity', makeBodyPurity, {
  valid: [
    {
      name: 'Should_Pass_When_OnlyTheFirstStatementIsAConvergingGuard',
      code: makeWorkflow(`(command: { readonly n?: number }) => {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_FunctionExpressionBodyHasAConvergingFirstGuard',
      code: makeWorkflow(`function (command: { readonly n?: number }) {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_GuardTestUsesOrAndNullishCoalescing',
      code: makeWorkflow(`(command: { readonly n?: number }) => {
  if (command.n === undefined || command.n === null) {
    throw new Error('unreachable: property-tested')
  }
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_BodyUsesNullishCoalescingOutsideAGuard',
      code: makeWorkflow(`(command: { readonly n?: number }) => Result.succeed(command.n ?? 0)`),
    },
  ],
  invalid: [
    {
      name: 'Should_ReportControlFlow_When_AConvergingGuardBlockHoldsASecondStatement',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  if (command.n === 0) {
    return Result.succeed('zero')
    Result.succeed('unreachable')
  }
  return Result.fail('other' as never)
}`),
      errors: [controlError('an if statement inside the decision body')],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesALogicalOr',
      code: makeWorkflow(
        `(command: { readonly n: number }) => Result.succeed(Number(command.n > 0 || command.n === 0))`,
      ),
      errors: [controlError('a logical expression (&& or ||) inside the decision body')],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyNullishCoalescesAnUnboundName',
      code: makeWorkflow(`(command: { readonly n?: number }) => Result.succeed(String(command.n ?? mystery))`),
      errors: [
        referenceError('unresolvableReference', 'a reference to mystery', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_AConvergingGuardTestHoldsATernary',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  if (command.n === 0 ? Result.fail('zero' as never) : Result.succeed('zero')) {
    return Result.succeed('ok')
  }
  return Result.fail('other' as never)
}`),
      errors: [controlError('a ternary (? :) inside the decision body')],
    },
    {
      name: 'Should_ReportControlFlow_When_AConvergingGuardConsequentHoldsALogicalAnd',
      code: makeWorkflow(`(command: { readonly left: boolean; readonly right: boolean }) => {
  if (command.left) return Result.succeed(command.left && command.right)
  return Result.fail('other' as never)
}`),
      errors: [controlError('a logical expression (&& or ||) inside the decision body')],
    },
    {
      name: 'Should_ReportControlFlow_When_AConvergingGuardAlternateHoldsALogicalAnd',
      code: makeWorkflow(`(command: { readonly left: boolean; readonly right: boolean }) => {
  if (command.left) return Result.succeed('a')
  else return Result.succeed(command.left && command.right)
}`),
      errors: [controlError('a logical expression (&& or ||) inside the decision body')],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyHasAnIfPastTheFirstStatement',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  const doubled = command.n * 2
  if (doubled === 0) return Result.succeed('zero')
  return Result.succeed('other')
}`),
      errors: [
        controlError('an if statement inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_GuardDoesNotConvergeImmediately',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  if (command.n === 0) {
    Result.succeed('zero')
  }
  return Result.succeed('other')
}`),
      errors: [
        {
          messageId: 'controlFlowBanned',
          data: {
            name: 'an if statement inside the decision body',
            expected: CONTROL_EXPECTED,
            actual: CONTROL_ACTUAL,
            fix: CONTROL_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesATernary',
      code: makeWorkflow(`(command: { readonly n: number }) =>
  command.n === 0 ? Result.succeed('zero') : Result.succeed('other')`),
      errors: [
        controlError('a ternary (? :) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAndOrOr',
      code: makeWorkflow(`(command: { readonly n?: number }) => Result.succeed(command.n && command.n)`),
      errors: [
        controlError('a logical expression (&& or ||) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAForLoop',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  let sum = 0
  for (let i = 0; i < command.n; i++) sum += i
  return Result.succeed(sum)
}`),
      errors: [
        referenceError('mutableLocalReference', 'a reference to sum', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
        controlError('a for loop inside the decision body'),
        referenceError('mutableLocalReference', 'a reference to i', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesASwitchStatement',
      code: makeWorkflow(`(command: { readonly tag: string }) => {
  switch (command.tag) {
    case 'a': return Result.succeed('a')
    default: return Result.succeed('other')
  }
}`),
      errors: [
        controlError('a switch statement inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportEachControlFlowOnce_When_TwoMakesShareATernaryDecide',
      code: `${PRELUDE}
const decide = (command: { readonly n: number }): Result.Result<string, never> =>
  command.n === 0 ? Result.succeed('a') : Result.succeed('b')
export const a = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })
export const b = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
      errors: [controlError('a ternary (? :) inside the decision body')],
    },
  ],
})
