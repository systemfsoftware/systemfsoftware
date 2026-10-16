import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { WITHOUT_MAKE_ACTUAL, WITHOUT_MAKE_EXPECTED, WITHOUT_MAKE_FIX } from '../workflow-file-make-presence.config.js'
import { workflowFileMakePresence } from '../workflow-file-make-presence.js'

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

const IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'`

const MAKE = `Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`

ruleTester.run('workflow-file-make-presence', workflowFileMakePresence, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowFileConstructsOnce',
      code: `${IMPORT}\nexport const admitOrder = ${MAKE}`,
      filename: '/repo/pkg/src/admit-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MakeLivesOutsideAWorkflowFile',
      code: `${IMPORT}\nexport const adapter = ${MAKE}`,
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_StemCarriesAnExtraPeriod',
      code: `${IMPORT}\nexport const decide = ${MAKE}`,
      filename: '/repo/pkg/src/place.order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_WorkflowFileConstructsNothing',
      code: 'export const admitOrder = 1',
      filename: '/repo/pkg/src/admit-order.workflow.ts',
      errors: [
        {
          messageId: 'workflowFileWithoutMake',
          data: {
            name: 'admit-order.workflow.ts',
            expected: WITHOUT_MAKE_EXPECTED,
            actual: WITHOUT_MAKE_ACTUAL,
            fix: WITHOUT_MAKE_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_MakeOriginIsForeign',
      code:
        `const LocalWorkflow = { make: (options: unknown) => options }\nexport const admitOrder = LocalWorkflow.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/admit-order.workflow.ts',
      errors: [
        {
          messageId: 'workflowFileWithoutMake',
          data: {
            name: 'admit-order.workflow.ts',
            expected: WITHOUT_MAKE_EXPECTED,
            actual: WITHOUT_MAKE_ACTUAL,
            fix: WITHOUT_MAKE_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_TheOnlyWorkflowMemberCalledIsUnrecognized',
      code: `${IMPORT}\nexport const admitOrder = Workflow.compose({ command: Cmd, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/admit-order.workflow.ts',
      errors: [
        {
          messageId: 'workflowFileWithoutMake',
          data: {
            name: 'admit-order.workflow.ts',
            expected: WITHOUT_MAKE_EXPECTED,
            actual: WITHOUT_MAKE_ACTUAL,
            fix: WITHOUT_MAKE_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_WorkflowFileHoldsOnlyATypePositionConstruction',
      code:
        `${IMPORT}\ntype Key = { [Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide })]: string }`,
      filename: '/repo/pkg/src/admit-order.workflow.ts',
      errors: [
        {
          messageId: 'workflowFileWithoutMake',
          data: {
            name: 'admit-order.workflow.ts',
            expected: WITHOUT_MAKE_EXPECTED,
            actual: WITHOUT_MAKE_ACTUAL,
            fix: WITHOUT_MAKE_FIX,
          },
        },
      ],
    },
  ],
})
