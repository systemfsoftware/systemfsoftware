import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoAmbientImpurity } from '../workflow-no-ambient-impurity.js'

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

ruleTester.run('workflow-no-ambient-impurity', workflowNoAmbientImpurity, {
  valid: [
    {
      code: `const now = Date.now()`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `const id = crypto.randomUUID()`,
      filename: 'cancel-order.handler.ts',
    },
    {
      code: `const now = Date.now()`,
      filename: 'process-claim.schema.ts',
    },
    {
      code: `const x = 1`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const fn = () => Either.right(1)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const d = new Date()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const r = random()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const id = uuid()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const t = Math.now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const r = Date.random()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const t = foo['Date'].now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const t = foo.bar.now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `const t = Date['now']()`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `const now = Date.now()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `const r = Math.random()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `const id = crypto.randomUUID()`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `Date.now()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `Math.random()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `crypto.randomUUID()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
})
