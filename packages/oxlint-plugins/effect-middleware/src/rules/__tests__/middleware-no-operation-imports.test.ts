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

const moduleData = {
  name: './order.store',
  expected: 'imports of adapters, ports, schemas, and ACLs only — never the operation',
  actual: 'an import of the .store cell',
  fix:
    'a middleware is the transport front-half — let the handler wire the executor and import only the port the middleware calls',
}

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
      name: 'Should_Pass_When_ImportingStorefrontModule_When_MiddlewareFile',
      code: `import { keys } from './storefront'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingStoresDirectory_When_MiddlewareFile',
      code: `import { keys } from './stores'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ImportingWorkflowPackage_When_MiddlewareFile',
      code: `import { x } from '@systemfsoftware/oxlint-plugin-effect-workflow'`,
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
    {
      name: 'Should_Ignore_StoreImport_When_ExecutorFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'Should_Ignore_ExecutorImport_When_WorkflowFile',
      code: `import { runPayment } from './payment.executor'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Ignore_WorkflowImport_When_HandlerFile',
      code: `import { decide } from './order.workflow'`,
      filename: 'cancel-order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StoreModule_When_MiddlewareFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'operationModuleImport', data: moduleData }],
    },
    {
      name: 'Should_Report_ExecutorModuleWithTsExtension_When_MiddlewareFile',
      code: `import { runPayment } from './payment.executor.ts'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationModuleImport',
        data: { ...moduleData, name: './payment.executor.ts', actual: 'an import of the .executor cell' },
      }],
    },
    {
      name: 'Should_Report_WorkflowModuleWithJsExtension_When_MiddlewareFile',
      code: `import { decide } from './order.workflow.js'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationModuleImport',
        data: { ...moduleData, name: './order.workflow.js', actual: 'an import of the .workflow cell' },
      }],
    },
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
    {
      name: 'Should_Report_ModuleImport_When_SymbolAlsoMatches_When_MiddlewareFile',
      code: `import { CreateOrderExecutor } from './order.executor'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'operationModuleImport',
        data: { ...moduleData, name: './order.executor', actual: 'an import of the .executor cell' },
      }],
    },
  ],
})
