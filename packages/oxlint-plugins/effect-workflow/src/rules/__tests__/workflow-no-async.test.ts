import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoAsync } from '../workflow-no-async.js'

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

ruleTester.run('workflow-no-async', workflowNoAsync, {
  valid: [
    {
      name: 'allows synchronous function declaration',
      code: `export const cancelOrder = (cmd: CancelOrderCommand): Either.Either<D, E> => Either.right(d)`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows non-Promise type references',
      code: `const x: Either.Either<Decision, WorkflowError> = Either.right(d)`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows qualified Promise type names',
      code: `const x: globalThis.Promise<number> = p`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows async functions in executor files',
      code: `export const run = async (cmd: C) => { await db.load(cmd) }`,
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'allows await in handler files',
      code: `const res = await fetch(url)`,
      filename: 'submit-order.handler.ts',
    },
    {
      name: 'allows generator functions without await',
      code: `Either.gen(function*() { return 1 })`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'flags async arrow function',
      code: `export const submitOrder = async (cmd: C) => Either.right(d)`,
      filename: 'submit-order.workflow.ts',
      errors: [{
        messageId: 'asyncFunction',
        data: {
          name: 'async',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an async function',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
    {
      name: 'flags async function declaration',
      code: `export async function processClaim(cmd: C) { return Either.right(d) }`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'asyncFunction',
        data: {
          name: 'async',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an async function',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
    {
      name: 'flags async function expression',
      code: `const f = async function() { return 1 }`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'asyncFunction',
        data: {
          name: 'async',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an async function',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
    {
      name: 'flags top-level await expression',
      code: `const body = await fetch(url)`,
      filename: 'submit-order.workflow.ts',
      errors: [{
        messageId: 'awaitExpression',
        data: {
          name: 'await',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an await expression',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
    {
      name: 'flags Promise type reference',
      code: `export const f = (cmd: C): Promise<Decision> => Either.right(d) as never`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'promiseType',
        data: {
          name: 'Promise',
          expected: 'a synchronous pure decision returning Either',
          actual: 'a Promise type reference',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
    {
      name: 'flags async and await separately',
      code: `export const f = async (cmd: C) => { await g(cmd); return Either.right(d) }`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'asyncFunction',
        data: {
          name: 'async',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an async function',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }, {
        messageId: 'awaitExpression',
        data: {
          name: 'await',
          expected: 'a synchronous pure decision returning Either',
          actual: 'an await expression',
          fix: 'move the async work to the shell and pass its result as command data',
        },
      }],
    },
  ],
})
