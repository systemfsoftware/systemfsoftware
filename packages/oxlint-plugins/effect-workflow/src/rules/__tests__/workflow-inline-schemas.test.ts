import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowInlineSchemas } from '../workflow-inline-schemas.js'

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

ruleTester.run('workflow-inline-schemas', workflowInlineSchemas, {
  valid: [
    {
      code: `import { ProcessClaimCommand } from './process-claim.schema.ts'`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `import { ProcessClaimCommand } from './process-claim.schema.ts'`,
      filename: 'process-claim.handler.ts',
    },
    {
      code: `import { X } from './other-name.schema.ts'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { OrderId } from '../shared/primitives.schema.ts'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { Money } from '../shared/value-objects.schema.ts'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      code: `import { X } from 'other-package'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { X } from './process-claim.other.ts'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { X } from './process-claim'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { X } from './process-claim.ts'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { X } from './process-claim.schema.ts'`,
      filename: 'process-claim.ts',
    },
    {
      code: `import { X } from './process-claim.schema.ts'`,
      filename: 'process-claim',
    },
    {
      code: `import { X } from './process-claim.schema.ts.bak'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { X } from './process-claim.schema.tsx'`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `import { X } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: { file: 'process-claim.workflow.ts', source: './process-claim.schema.ts' },
      }],
    },
    {
      code: `import { X } from './other-name.schema.ts'`,
      filename: 'other-name.workflow.ts',
      errors: [{ messageId: 'singleConsumerSchema' }],
    },
    {
      code: `import { SomethingElse } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'singleConsumerSchema' }],
    },
    {
      code: `import { ProcessClaimCommand } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'singleConsumerSchema' }],
    },
    {
      code: `import { CancelOrderCommand } from './cancel-order.schema.js'`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'singleConsumerSchema' }],
    },
    {
      code: `import { ProcessClaimCommand, ClaimDecision } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'singleConsumerSchema' }],
    },
  ],
})
