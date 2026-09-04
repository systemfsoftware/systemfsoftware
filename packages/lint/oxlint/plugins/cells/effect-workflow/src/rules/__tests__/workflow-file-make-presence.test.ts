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

ruleTester.run('workflow-file-make-presence', workflowFileMakePresence, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowFileConstructsOnce',
      code: `${IMPORT}\nexport const admitOrder = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/admit-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MakeLivesOutsideAWorkflowFile',
      code: `${IMPORT}\nexport const adapter = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_StemCarriesAnExtraPeriod',
      code: `${IMPORT}\nexport const decide = Workflow.make((input: number) => input)`,
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
  ],
})
