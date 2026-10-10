import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeBodyPurity } from '../make-body-purity.js'

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

const PURE_BODY_EXPECTED =
  'a Workflow.make decision body whose references resolve to parameters, const locals, declarations in this same file, benign builtins, or the sealed pure effect surface'
const CONTROL_EXPECTED =
  'a single decision path: one expression of exhaustive dispatch, with at most one defensive guard as the first statement converging immediately'
const CONTROL_ACTUAL = 'a control-flow construct that opens a second path inside the decision'
const CONTROL_FIX =
  'extract the branching into the kernel and dispatch over a closed type; delete the branch when it guards nothing'
const UNRESOLVABLE_ACTUAL =
  'an identifier that resolves to no parameter, no local binding, no import and no known global'
const UNRESOLVABLE_FIX =
  'bind the name, import it, or delete the reference; a name this file cannot resolve is a name the decision cannot depend on'

const referenceError = (
  messageId: string,
  name: string,
  actual: string,
  fix: string,
): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId,
  data: { name, expected: PURE_BODY_EXPECTED, actual, fix },
})

const controlError = (name: string): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId: 'controlFlowBanned',
  data: { name, expected: CONTROL_EXPECTED, actual: CONTROL_ACTUAL, fix: CONTROL_FIX },
})

const PRELUDE = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
`

const makeWorkflow = (decide: string, moduleLevel = ''): string =>
  `${PRELUDE}
${moduleLevel}
export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: ${decide} })`

ruleTester.run('make-body-purity', makeBodyPurity, {
  valid: [],
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
  ],
})
