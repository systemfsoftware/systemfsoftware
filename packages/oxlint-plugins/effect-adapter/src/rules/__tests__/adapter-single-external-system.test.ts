import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { adapterSingleExternalSystem } from '../adapter-single-external-system.js'

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

const fix = 'split each technology into its own *.adapter.ts file, each implementing its own port'

ruleTester.run('adapter-single-external-system', adapterSingleExternalSystem, {
  valid: [
    {
      name: 'Should_Pass_When_AdapterWrapsOneForeignSystem',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import * as Effect from 'effect/Effect'
        import * as Layer from 'effect/Layer'
        import { Schema as S } from 'effect/Schema'
        import { StripePort } from './charge.executor.ts'
        import { StripeError } from './stripe.schema.ts'
        import { ChargeResponse } from './stripe.shape.ts'
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_SubpathImportOfSameSystemIsRepeated',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { StripeCheckout } from 'stripe/checkout'
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_AdapterHasNoForeignImport',
      code: `
        import * as Effect from 'effect/Effect'
        import * as Layer from 'effect/Layer'
        import { Schema as S } from 'effect/Schema'
        import { SendEmailPort } from './send-email.executor.ts'
      `,
      filename: 'send-email.adapter.ts',
    },
    {
      name: 'Should_Pass_When_ImportingEffectBarrel',
      code: `import { Effect } from 'effect'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_ImportingNodeRuntimeModule',
      code: `import { readFileSync } from 'node:fs'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_ImportingRelativeModule',
      code: `import { helper } from './helper.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_ImportingAbsoluteModule',
      code: `import { shared } from '/abs/shared.ts'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_AdapterWrapsScopedSystem',
      code: `import { S3Client } from '@aws-sdk/client-s3'`,
      filename: 's3.adapter.ts',
    },
    {
      name: 'Should_Pass_When_AdapterImplementsPlatformPortOverOneDriver',
      code: `
        import { FileSystem } from '@effect/platform'
        import { fs as nfs } from 'memfs'
      `,
      filename: 'memory-file-system.adapter.ts',
    },
    {
      name: 'Should_Pass_When_PortSubpathAndDriverAreImported',
      code: `
        import * as Error from '@effect/platform/Error'
        import { FileSystem } from '@effect/platform/FileSystem'
        import { fs as nfs } from 'memfs'
      `,
      filename: 'memory-file-system.adapter.ts',
    },
    {
      name: 'Should_Pass_When_MalformedScopedSpecifierCountsAsOneSystem',
      code: `import { thing } from '@broken'`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NonAdapterCellImportsManySystems',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'charge.executor.ts',
    },
    {
      name: 'Should_Pass_When_PlainTsFileImportsManySystems',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'util.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_SecondDistinctForeignSystemIsImported',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_PortIsExemptButTwoDriversRemain',
      code: `
        import { FileSystem } from '@effect/platform'
        import { fs as nfs } from 'memfs'
        import { S3Client } from '@aws-sdk/client-s3'
      `,
      filename: 'memory-file-system.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@aws-sdk/client-s3',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps memfs',
          actual: 'imports of memfs and @aws-sdk/client-s3',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_SecondSdkOfSameScopeIsImported',
      code: `
        import { S3Client } from '@aws-sdk/client-s3'
        import { SQSClient } from '@aws-sdk/client-sqs'
      `,
      filename: 'aws.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@aws-sdk/client-sqs',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps @aws-sdk/client-s3',
          actual: 'imports of @aws-sdk/client-s3 and @aws-sdk/client-sqs',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_EveryForeignSystemBeyondTheFirst',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
        import twilio from 'twilio'
      `,
      filename: 'notify.adapter.ts',
      errors: [
        {
          messageId: 'multipleExternalSystems',
          data: {
            name: '@sendgrid/mail',
            expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
            actual: 'imports of stripe and @sendgrid/mail',
            fix,
          },
        },
        {
          messageId: 'multipleExternalSystems',
          data: {
            name: 'twilio',
            expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
            actual: 'imports of stripe and twilio',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Once_When_SameSecondSystemIsImportedTwice',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
        import { sendgrid2 } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_SecondSystemFollowsEffectAndRelativeImports',
      code: `
        import * as Effect from 'effect/Effect'
        import { Stripe as StripePkg } from 'stripe'
        import { StripePort } from './charge.executor.ts'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_EffectBarrel_Sits_Alongside_Foreign_Package',
      code: `
        import { Effect } from 'effect'
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Node_Runtime_Sits_Alongside_Foreign_Package',
      code: `
        import { readFileSync } from 'node:fs'
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Relative_Import_Sits_Alongside_Foreign_Package',
      code: `
        import { helper } from './helper.ts'
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Absolute_Import_Sits_Alongside_Foreign_Package',
      code: `
        import { shared } from '/abs/shared.ts'
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_NodeJs_Scheme_Import_Sits_Alongside_Foreign_Package',
      code: `
        import { readFileSync } from 'nodejs:fs'
        import { Stripe as StripePkg } from 'stripe'
        import { sendgrid } from '@sendgrid/mail'
      `,
      filename: 'billing.adapter.ts',
      errors: [{
        messageId: 'multipleExternalSystems',
        data: {
          name: '@sendgrid/mail',
          expected: 'exactly one external system per *.adapter.ts file — this file already wraps stripe',
          actual: 'imports of stripe and @sendgrid/mail',
          fix,
        },
      }],
    },
  ],
})
