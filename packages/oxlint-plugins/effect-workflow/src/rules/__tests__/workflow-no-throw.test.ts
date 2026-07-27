import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoThrow } from '../workflow-no-throw.js'

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

const expected = 'a typed failure returned in the Either error channel'
const actual = 'a thrown exception'
const fix =
  'return Either.left with an S.TaggedError variant, or let the invariant surface as a defect at the shell edge'

ruleTester.run('workflow-no-throw', workflowNoThrow, {
  valid: [
    {
      name: 'Should_Pass_When_ReturningTypedErrorWithoutThrow',
      code:
        `export const cancelOrder = (cmd: CancelOrderCommand): Either.Either<Decision, OrderAlreadyDeliveredError> => Either.left(new OrderAlreadyDeliveredError({ orderId: cmd.orderId }))`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowHasNoThrow',
      code:
        `export const submitOrder = (cmd: SubmitOrderCommand): Either.Either<Decision, never> => Either.right(decision)`,
      filename: 'submit-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ConstructingErrorWithoutThrow',
      code: `const error = new Error('not thrown')`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ThrowInExecutorFile',
      code: `export const run = (cmd: CancelOrderCommand) => { if (!cmd.orderId) throw new Error('missing') }`,
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_ThrowInHandlerFile',
      code: `export const handler = (req: Request) => { if (!req.body) throw new Error('missing') }`,
      filename: 'submit-order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_BareThrowStatement',
      code: `throw new Error('boom')`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'throwStatement', data: { name: 'throw', expected, actual, fix } }],
    },
    {
      name: 'Should_Report_When_ThrowNestedInArrowFunction',
      code: `export const cancelOrder = (cmd: CancelOrderCommand): Either.Either<Decision, Error> => {
        if (cmd.orderId === '') throw new DomainError('empty')
        return Either.right(decision)
      }`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'throwStatement', data: { name: 'throw', expected, actual, fix } }],
    },
    {
      name: 'Should_Report_When_ThrowingNonErrorExpression',
      code: `export const cancelOrder = (cmd: CancelOrderCommand) => { throw cmd }`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'throwStatement', data: { name: 'throw', expected, actual, fix } }],
    },
  ],
})
