import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { stateNoAdapterImports } from '../state-no-adapter-imports.js'

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

const adapterCellImportData = (source: string) => ({
  name: source,
  expected: 'imports of coordination primitives and domain types only',
  actual: 'a value import of an adapter cell (the adapter owns the driver)',
  fix: 'keep the driver inside the *.adapter.ts cell — the state cell owns coordination, not connections',
})

ruleTester.run('state-no-adapter-imports', stateNoAdapterImports, {
  valid: [
    {
      name: 'Should_Pass_When_EffectImport',
      code: `import { Ref } from 'effect'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_SiblingStateImport',
      code: `import { AuditInFlight } from './audit-inflight.state'`,
      filename: 'presence.state.ts',
    },
    {
      name: 'Should_Pass_When_SiblingSchemaImport',
      code: `import { Report } from './report.schema'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnlyAdapterImport',
      code: `import type { Conn } from './redis.adapter.js'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_TypeSpecifierAdapterImport',
      code: `import { type Conn, type Opts } from './redis.adapter.js'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_AdaptersFolderNearMiss',
      code: `import { adapters } from './adapters'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleNamedAdapterNearMiss',
      code: `import { adapter } from './adapter'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_RestoreNearMiss',
      code: `import { restore } from './restore'`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_AdapterImport_When_ExecutorFile',
      code: `import { createClient } from './redis.adapter.js'`,
      filename: 'audit-inflight.executor.ts',
    },
    {
      name: 'Should_Pass_When_AdapterImport_When_WorkflowFile',
      code: `import { createClient } from './redis.adapter.js'`,
      filename: 'audit-inflight.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_AdapterImport_When_NamedAdapterImportWithJsExtension',
      code: `import { createClient } from './redis.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./redis.adapter.js') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_NamedAdapterImportWithTsExtension',
      code: `import { createClient } from './redis.adapter.ts'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./redis.adapter.ts') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_ExtensionlessAdapterImport',
      code: `import { createClient } from './redis.adapter'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./redis.adapter') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_NestedAdapterImport',
      code: `import { createClient } from './drivers/redis.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./drivers/redis.adapter.js') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_NamespaceAdapterImport',
      code: `import * as StripeAdapter from './stripe.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./stripe.adapter.js') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_DefaultAdapterImport',
      code: `import StripeAdapter from './stripe.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./stripe.adapter.js') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_SideEffectAdapterImport',
      code: `import './bootstrap.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./bootstrap.adapter.js') }],
    },
    {
      name: 'Should_Report_AdapterImport_When_MixedTypeAndValueSpecifiers',
      code: `import { type Conn, createClient } from './redis.adapter.js'`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'adapterCellImport', data: adapterCellImportData('./redis.adapter.js') }],
    },
  ],
})
