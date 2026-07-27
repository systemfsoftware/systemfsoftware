import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowSinglePath } from '../workflow-single-path.js'

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

ruleTester.run('workflow-single-path', workflowSinglePath, {
  valid: [
    {
      name: 'Should_Pass_When_PureMatchWorkflow',
      code:
        `export const decide = (cmd: Command) => Match.value(cmd).pipe(Match.tag('Submitted', () => Either.right(decided)), Match.exhaustive)`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SingleTernary',
      code: `export const decide = (cmd: Command) => cmd.ok ? Either.right(decided) : Either.left(error)`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_LogicalOperatorsInBooleanData',
      code:
        `export const decide = (cmd: Command) => Either.right(cmd.body.includes('purchase') || cmd.body.includes('order'))`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TsConditionalType',
      code: `export type Result = Command extends { ok: true } ? Decision : Error`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorHasBranchingAndIteration',
      code: `export const run = (cmd: Command) => { if (cmd.ok) { for (let i = 0; i < 1; i++) {} } }`,
      filename: 'decide.executor.ts',
    },
    {
      name: 'Should_Pass_When_HandlerHasSwitch',
      code: `export const handle = (cmd: Command) => { switch (cmd._tag) { default: break } }`,
      filename: 'decide.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportBranchingStatement_When_IfElse',
      code:
        `export const decide = (cmd: Command) => { if (cmd.ok) { return Either.right(decided) } else { return Either.left(error) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'branchingStatement',
          data: {
            name: 'if',
            expected: 'Match.value(...).pipe(Match.tag(...), Match.exhaustive)',
            actual: 'an if statement',
            fix: 'dispatch exhaustively over a closed tagged union so a new variant fails to compile',
          },
        },
      ],
    },
    {
      name: 'Should_ReportBranchingStatement_When_Switch',
      code:
        `export const decide = (cmd: Command) => { switch (cmd._tag) { case 'A': return Either.right(a); default: return Either.left(error) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'branchingStatement',
          data: {
            name: 'switch',
            expected: 'Match.value(...).pipe(Match.tag(...), Match.exhaustive)',
            actual: 'a switch statement',
            fix: 'dispatch exhaustively over a closed tagged union so a new variant fails to compile',
          },
        },
      ],
    },
    {
      name: 'Should_ReportIterationStatement_When_ForLoop',
      code: `export const decide = (cmd: Command) => { for (let i = 0; i < 1; i++) { return Either.right(decided) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'iterationStatement',
          data: {
            name: 'for',
            expected: 'map or fold',
            actual: 'a for loop',
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        },
      ],
    },
    {
      name: 'Should_ReportIterationStatement_When_WhileLoop',
      code: `export const decide = (cmd: Command) => { while (cmd.ok) { return Either.right(decided) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'iterationStatement',
          data: {
            name: 'while',
            expected: 'map or fold',
            actual: 'a while loop',
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        },
      ],
    },
    {
      name: 'Should_ReportIterationStatement_When_ForInLoop',
      code: `export const decide = (cmd: Command) => { for (const k in cmd) { return Either.right(decided) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'iterationStatement',
          data: {
            name: 'for-in',
            expected: 'map or fold',
            actual: 'a for-in loop',
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        },
      ],
    },
    {
      name: 'Should_ReportIterationStatement_When_ForOfLoop',
      code: `export const decide = (cmd: Command) => { for (const x of cmd.items) { return Either.right(decided) } }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'iterationStatement',
          data: {
            name: 'for-of',
            expected: 'map or fold',
            actual: 'a for-of loop',
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        },
      ],
    },
    {
      name: 'Should_ReportIterationStatement_When_DoWhileLoop',
      code: `export const decide = (cmd: Command) => { do { return Either.right(decided) } while (cmd.ok) }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'iterationStatement',
          data: {
            name: 'do-while',
            expected: 'map or fold',
            actual: 'a do-while loop',
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        },
      ],
    },
    {
      name: 'Should_ReportExcessTernary_When_ThreeTernaries',
      code: `export const decide = (cmd: Command) => a ? b : c ? d : e ? f : g`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'excessTernary',
          data: {
            name: 'ternary',
            expected: 'at most one converging ternary per workflow',
            actual: 'ternary 2 of 3',
            fix: 'derive a closed variant and dispatch with Match.tag + Match.exhaustive',
          },
        },
        {
          messageId: 'excessTernary',
          data: {
            name: 'ternary',
            expected: 'at most one converging ternary per workflow',
            actual: 'ternary 3 of 3',
            fix: 'derive a closed variant and dispatch with Match.tag + Match.exhaustive',
          },
        },
      ],
    },
  ],
})
