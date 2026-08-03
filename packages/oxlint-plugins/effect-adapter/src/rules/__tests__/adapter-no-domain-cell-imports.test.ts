import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { adapterNoDomainCellImports } from '../adapter-no-domain-cell-imports.js'

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

const expected =
  'imports of only the port (executor), the domain error type (schema), the foreign shape, and the one foreign package'
const fix =
  'the adapter is a translation seam — pass domain values through the port or move this import to the composition root'

ruleTester.run('adapter-no-domain-cell-imports', adapterNoDomainCellImports, {
  valid: [
    {
      // A kernel is vocabulary-free and domain-blind, so importing one cannot couple the
      // adapter to the domain. Banning it forced a real duplication in omp-utils: the
      // adapter had to inline a copy of toml-loader-merge.kernel.ts to pass. The sibling
      // rule policy-no-domain-imports has always allowed kernel imports for this reason.
      name: 'Should_Pass_When_Importing_Kernel_Utility',
      code: `import { retry } from './retry.kernel.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Port_From_Executor',
      code: `import { StripePort } from './charge.executor.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Domain_Error_From_Schema',
      code: `import { StripeError } from './stripe.schema.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Foreign_Shape',
      code: `import { ChargeResponse } from './stripe.shape.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Effect_Infrastructure',
      code: `
        import * as Effect from 'effect/Effect'
        import * as Layer from 'effect/Layer'
        import { Schema as S } from 'effect/Schema'
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Foreign_Package',
      code: `import { Stripe as StripePkg } from 'stripe'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Plain_Relative_Module',
      code: `import { clientOptions } from './client-options.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Importing_File_Named_Like_A_Cell',
      code: `import { store } from './store.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Bare_Specifier_Ends_With_Cell_Word',
      code: `import { store } from 'lib/store'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NonAdapterCell_Imports_Domain_Cells',
      code: `import { cancelOrder } from './charge.workflow.ts'`,
      filename: 'charge.executor.ts',
    },
    {
      name: 'Should_Pass_When_PlainTsFile_Imports_Domain_Cells',
      code: `import { cancelOrder } from './charge.workflow.ts'`,
      filename: 'util.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_Importing_Workflow_Cell',
      code: `import { cancelOrder } from './charge.workflow.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './charge.workflow.ts',
          expected,
          actual: 'an import of the .workflow cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_State_Cell',
      code: `import { appState } from './app.state.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './app.state.ts',
          expected,
          actual: 'an import of the .state cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Handler_Cell',
      code: `import { chargeHandler } from './charge.handler.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './charge.handler.ts',
          expected,
          actual: 'an import of the .handler cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Policy_Cell',
      code: `import { rateLimit } from './rate-limit.policy.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './rate-limit.policy.ts',
          expected,
          actual: 'an import of the .policy cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Store_Cell',
      code: `import { orderStore } from './order.store.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './order.store.ts',
          expected,
          actual: 'an import of the .store cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Acl_Cell',
      code: `import { fromRow } from './order.acl.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './order.acl.ts',
          expected,
          actual: 'an import of the .acl cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Observer_Cell',
      code: `import { trace } from './charge.observer.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './charge.observer.ts',
          expected,
          actual: 'an import of the .observer cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Another_Adapter',
      code: `import { StripeLive } from './stripe.adapter.ts'`,
      filename: 'sendgrid.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './stripe.adapter.ts',
          expected,
          actual: 'an import of the .adapter cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Importing_Middleware_Cell',
      code: `import { authenticate } from './auth.middleware.ts'`,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './auth.middleware.ts',
          expected,
          actual: 'an import of the .middleware cell',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_TypeOnly_Import_Of_Another_Adapter',
      code: `import type { StripeLive } from './stripe.adapter'`,
      filename: 'sendgrid.adapter.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: './stripe.adapter',
          expected,
          actual: 'an import of the .adapter cell',
          fix,
        },
      }],
    },
  ],
})
