import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { policyNoDomainImports } from '../policy-no-domain-imports.js'

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

const POLICY_FILE = 'src/infrastructure/rate-limiter.policy.ts'

const domainImportError = (source: string, suffix: string) => [
  { messageId: 'domainImport' as const, data: { source, suffix } },
]

const importsBannedSuffix = (suffix: string) => ({
  name: `flags import of a .${suffix} module from a policy`,
  code: `import { thing } from './neighbour.${suffix}.js'`,
  filename: POLICY_FILE,
  errors: domainImportError(`./neighbour.${suffix}.js`, suffix),
})

ruleTester.run('policy-no-domain-imports', policyNoDomainImports, {
  valid: [
    {
      name: 'allows effect imports in a policy',
      code: `import { Effect, Schedule } from 'effect'`,
      filename: POLICY_FILE,
    },
    {
      name: 'allows @effect scoped imports in a policy',
      code: `import { HttpClient } from '@effect/platform'`,
      filename: POLICY_FILE,
    },
    {
      name: 'allows importing a schema sibling for key types',
      code: `import { SubmissionKey } from './submission-key.schema.js'`,
      filename: POLICY_FILE,
    },
    {
      name: 'allows importing another policy',
      code: `import { withBulkhead } from './bulkhead.policy.js'`,
      filename: POLICY_FILE,
    },
    {
      name: 'ignores a store import outside a policy file',
      code: `import { save } from './order.store.js'`,
      filename: 'src/infrastructure/order.executor.ts',
    },
    {
      name: 'ignores a workflow import in an unsuffixed file',
      code: `import { decide } from './order.workflow.js'`,
      filename: 'src/infrastructure/helper.ts',
    },
  ],
  invalid: [
    importsBannedSuffix('workflow'),
    importsBannedSuffix('executor'),
    importsBannedSuffix('store'),
    importsBannedSuffix('acl'),
    importsBannedSuffix('handler'),
    importsBannedSuffix('middleware'),
    importsBannedSuffix('adapter'),
    importsBannedSuffix('service'),
    importsBannedSuffix('shell'),
    importsBannedSuffix('use-case'),
    importsBannedSuffix('daemon'),
    importsBannedSuffix('repository'),
    {
      name: 'flags an import from a nested behavioural path',
      code: `import { decide } from '#root/features/order/place-order.workflow.js'`,
      filename: POLICY_FILE,
      errors: domainImportError('#root/features/order/place-order.workflow.js', 'workflow'),
    },
    {
      name: 'flags a named re-export from a store',
      code: `export { save } from './order.store.js'`,
      filename: POLICY_FILE,
      errors: domainImportError('./order.store.js', 'store'),
    },
    {
      name: 'flags an export-all from a workflow',
      code: `export * from './order.workflow.js'`,
      filename: POLICY_FILE,
      errors: domainImportError('./order.workflow.js', 'workflow'),
    },
    {
      name: 'flags a dynamic import of an executor',
      code: `import('./order.executor.js')`,
      filename: POLICY_FILE,
      errors: domainImportError('./order.executor.js', 'executor'),
    },
  ],
})
