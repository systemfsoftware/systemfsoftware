import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { middlewareNoOperationImports } from '../middleware-no-operation-imports.js'

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

const symbolData = {
  name: 'CreateOrderExecutor',
  expected: 'imports of adapters, ports, schemas, and ACLs only — never the operation',
  actual: 'an import binding named CreateOrderExecutor',
  fix:
    'a middleware that imports the operation is a mislabeled handler — import the port instead and let the handler wire the executor',
}

ruleTester.run('middleware-no-operation-imports', middlewareNoOperationImports, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingPort_When_MiddlewareFile',
      code: `import { verifyApiKey } from './api-key-port'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingAdapter_When_MiddlewareFile',
      code: `import { verifyApiKey } from './api-key.adapter'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingSchema_When_MiddlewareFile',
      code: `import { Session } from './session.schema'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingEffectSubmodule_When_MiddlewareFile',
      code: `import * as Effect from 'effect/Effect'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingEffectBarrel_When_MiddlewareFile',
      code: `import { Effect } from 'effect'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingExecutorVerbedSymbol_When_MiddlewareFile',
      code: `import { execute } from './operations'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingStorefrontSymbol_When_MiddlewareFile',
      code: `import { storefront } from './shop'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingWorkflowsPluralSymbol_When_MiddlewareFile',
      code: `import { workflows } from './ops'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingDefaultFromPort_When_MiddlewareFile',
      code: `import verifyApiKey from './key-port'`,
      filename: 'attach-session.middleware.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ExecutorSymbol_When_MiddlewareFile',
      code: `import { CreateOrderExecutor } from './operations'`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'operationSymbolImport', data: symbolData }],
    },
    {
      name: 'Should_Report_WorkflowSymbol_When_MiddlewareFile',
      code: `import { CreateOrderWorkflow } from './operations'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationSymbolImport',
        data: { ...symbolData, name: 'CreateOrderWorkflow', actual: 'an import binding named CreateOrderWorkflow' },
      }],
    },
    {
      name: 'Should_Report_StoreSymbol_When_MiddlewareFile',
      code: `import { OrderStore } from './operations'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationSymbolImport',
        data: { ...symbolData, name: 'OrderStore', actual: 'an import binding named OrderStore' },
      }],
    },
    {
      name: 'Should_Report_ExecutorSymbol_When_AliasedImport_When_MiddlewareFile',
      code: `import { CreateOrderExecutor as CreateOrder } from './operations'`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'operationSymbolImport', data: symbolData }],
    },
    {
      name: 'Should_Report_ExecutorSymbol_When_DefaultImport_When_MiddlewareFile',
      code: `import CreateOrderExecutor from './operations'`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'operationSymbolImport', data: symbolData }],
    },
    {
      name: 'Should_Report_StoreSymbol_When_NamespaceImport_When_MiddlewareFile',
      code: `import * as TokenStore from './tokens'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationSymbolImport',
        data: { ...symbolData, name: 'TokenStore', actual: 'an import binding named TokenStore' },
      }],
    },
  ],
})
