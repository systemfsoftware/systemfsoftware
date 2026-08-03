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

ruleTester.run('policy-no-domain-imports', policyNoDomainImports, {
  valid: [
    {
      name: 'Should_Allow_EffectImport_When_PolicyFile',
      code: `import { Effect, Schema as S } from 'effect'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_EffectSubmodule_When_PolicyFile',
      code: `import * as Either from 'effect/Either'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_SiblingPolicyCombinator_When_PolicyFile',
      code: `import { andThen } from './retry.policy.js'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_KernelUtility_When_PolicyFile',
      code: `import { tuple } from './pair.kernel.ts'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_PlainValueModule_When_PolicyFile',
      code: `import { DEFAULT_WINDOW } from './constants.ts'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_RelativeParentImport_When_PolicyFile',
      code: `import { Money } from '../shared/money'`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_NoImports_When_PolicyFile',
      code: `export const identity = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Ignore_StoreImport_When_ExecutorFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Ignore_WorkflowImport_When_HandlerFile',
      code: `import { decide } from './order.workflow.ts'`,
      filename: 'order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StoreImport_When_PolicyFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './order.store',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .store cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_StoreReExport_When_PolicyFile',
      code: `export * from './order.store.js'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './order.store.js',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .store cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_NamedReExport_When_PolicyFile',
      code: `export { saveOrder } from './order.store.js'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './order.store.js',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .store cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_DynamicImport_When_PolicyFile',
      code: `const load = () => import('./order.store.js')`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './order.store.js',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .store cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterImportWithExtension_When_PolicyFile',
      code: `import { chargeCard } from './stripe.adapter.js'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './stripe.adapter.js',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .adapter cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_WorkflowImportWithTsExtension_When_PolicyFile',
      code: `import { runPayment } from './payment.workflow.ts'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './payment.workflow.ts',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .workflow cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_SchemaImport_When_PolicyFile',
      code: `import { OrderId } from './order-id.schema.ts'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './order-id.schema.ts',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .schema cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_StateImport_When_PolicyFile',
      code: `import { limiterRegistry } from './limiter-registry.state.ts'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './limiter-registry.state.ts',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .state cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_LegacyServiceImport_When_PolicyFile',
      code: `import { billing } from './billing.service.ts'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './billing.service.ts',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .service cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_HyphenatedUseCaseImport_When_PolicyFile',
      code: `import { cancel } from './cancel.use-case.js'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './cancel.use-case.js',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .use-case cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShapeImport_When_PolicyFile',
      code: `import { ChargeEvent } from './charge-events.shape.ts'`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'domainCellImport',
          data: {
            name: './charge-events.shape.ts',
            expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
            actual: 'an import of the .shape cell',
            fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
          },
        },
      ],
    },
  ],
})
