import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowSingleFunctionExport } from '../workflow-single-function-export.js'

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

ruleTester.run('workflow-single-function-export', workflowSingleFunctionExport, {
  valid: [
    {
      code: `export const processClaim = (cmd) => Either.right(result)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `export class ProcessClaimCommand extends S.TaggedClass()() {} export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code:
        `export class Command extends S.TaggedClass()() {} export class Decision extends S.TaggedClass()() {} export class Error extends S.TaggedError()() {} export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `export const Decision = S.Union(A, B); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `export function processClaim(cmd) { return Either.right(result) }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `export const processClaim = 1; export const x = 2`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `export const processClaim = function(cmd) { return Either.right(result) }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `export { foo }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `export const processClaim = (cmd) => Either.right(result); export const helper = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '2' } }],
    },
    {
      code: `export const processClaim = () => {}; export function helper() {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '2' } }],
    },
    {
      code: `export const a = () => {}; export const b = () => {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '3' } }],
    },
    {
      code: `export const processClaim = () => {}; export const helper = () => {}; export const x = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '3' } }],
    },
    {
      code: `const x = 1`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '0' } }],
    },
    {
      code: `export let x`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '0' } }],
    },
    {
      code: `export const processClaim = () => {}; export const helper = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { count: '2' } }],
    },
  ],
})
