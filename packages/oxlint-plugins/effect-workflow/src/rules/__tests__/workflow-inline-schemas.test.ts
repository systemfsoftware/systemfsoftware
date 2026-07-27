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

const singleConsumerData = (source: string, file: string) => ({
  name: source,
  expected: 'types consumed by exactly one workflow to be declared in the workflow file',
  actual: `importing ${source} from ${file}`,
  fix: 'move the declarations inline or rename the schema file if it is shared',
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
        data: singleConsumerData('./process-claim.schema.ts', 'process-claim.workflow.ts'),
      }],
    },
    {
      code: `import { X } from './other-name.schema.ts'`,
      filename: 'other-name.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: singleConsumerData('./other-name.schema.ts', 'other-name.workflow.ts'),
      }],
    },
    {
      code: `import { SomethingElse } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: singleConsumerData('./process-claim.schema.ts', 'process-claim.workflow.ts'),
      }],
    },
    {
      code: `import { ProcessClaimCommand } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: singleConsumerData('./process-claim.schema.ts', 'process-claim.workflow.ts'),
      }],
    },
    {
      code: `import { CancelOrderCommand } from './cancel-order.schema.js'`,
      filename: 'cancel-order.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: singleConsumerData('./cancel-order.schema.js', 'cancel-order.workflow.ts'),
      }],
    },
    {
      code: `import { ProcessClaimCommand, ClaimDecision } from './process-claim.schema.ts'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'singleConsumerSchema',
        data: singleConsumerData('./process-claim.schema.ts', 'process-claim.workflow.ts'),
      }],
    },
  ],
})
