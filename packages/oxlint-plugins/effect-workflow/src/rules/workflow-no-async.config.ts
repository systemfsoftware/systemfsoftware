import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const NO_ASYNC_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban async functions, await expressions, and Promise type references in *.workflow.ts files. A workflow is a synchronous pure decision; async work belongs to the shell.',
  },
  schema: [Options],
  messages: {
    asyncFunction: NO_ASYNC_MESSAGE,
    awaitExpression: NO_ASYNC_MESSAGE,
    promiseType: NO_ASYNC_MESSAGE,
  },
} as const
