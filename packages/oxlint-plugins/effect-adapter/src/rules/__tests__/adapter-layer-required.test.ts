import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { adapterLayerRequired } from '../adapter-layer-required.js'

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

const expected = 'an exported const initialized with Layer.effect or Layer.succeed, providing the port'
const fix = 'export the port Layer — Layer.effect(Port, make) for live, Layer.succeed(Port, impl) for a default or stub'

ruleTester.run('adapter-layer-required', adapterLayerRequired, {
  valid: [
    {
      name: 'Should_Pass_When_Exporting_Layer_Effect',
      code: `
        import * as Effect from 'effect/Effect'
        import * as Layer from 'effect/Layer'
        import { Schema as S } from 'effect/Schema'
        import { Stripe as StripePkg } from 'stripe'
        import { StripePort } from './charge.executor.ts'
        import { StripeError } from './stripe.schema.ts'
        import { ChargeResponse } from './stripe.shape.ts'

        const make = Effect.gen(function*() {
          const client = new StripePkg('sk_test')
          return {
            charge: (input: { amount: number }) =>
              Effect.tryPromise({
                try: () => client.charges.create({ amount: input.amount }),
                catch: () => new StripeError({ reason: 'driver_failure' }),
              }).pipe(Effect.flatMap((raw) => S.decodeUnknown(ChargeResponse)(raw))),
          }
        })

        export const StripeLive = Layer.effect(StripePort, make)
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Exporting_Layer_Succeed_Default_Adapter',
      code: `
        import * as Layer from 'effect/Layer'
        import { SendEmailPort } from './send-email.executor.ts'

        export const SendEmailDefault = Layer.succeed(
          SendEmailPort,
          SendEmailPort.of({ send: () => Effect.void }),
        )
      `,
      filename: 'send-email.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Layer_Const_Is_Exported_By_Specifier',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))

        export { StripeLive }
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Default_Export_Is_Layer_Call',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export default Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Default_Export_References_Layer_Const',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))

        export default StripeLive
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NonAdapterCell_Has_No_Layer',
      code: `
        export const chargeExecutor = (cmd: ChargeCommand) => {
          return runWorkflow(cmd)
        }
      `,
      filename: 'charge.executor.ts',
    },
    {
      name: 'Should_Pass_When_PlainTsFile_Has_No_Layer',
      code: `
        export const helper = (n: number) => n + 1
      `,
      filename: 'util.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_Adapter_Exports_No_Layer',
      code: `
        import * as Effect from 'effect/Effect'
        import { Stripe as StripePkg } from 'stripe'
        import { StripePort } from './charge.executor.ts'
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Exported_Const_Is_Not_A_Layer',
      code: `
        import * as Effect from 'effect/Effect'
        import { Stripe as StripePkg } from 'stripe'

        export const StripeLive = makeClient(new StripePkg('sk_test'))
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports: StripeLive',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Layer_Const_Is_Not_Exported',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Layer_Namespace_Is_Aliased',
      code: `
        import * as L from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = L.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports: StripeLive',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Layer_Member_Is_Accessed_By_String',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer['effect'](StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports: StripeLive',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Only_Type_Export_Of_Layer_Const',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))

        export type { StripeLive }
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Only_Inline_Type_Export_Of_Layer_Const',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))

        export { type StripeLive }
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Exports_Multiple_Values_Without_Layer',
      code: `
        import * as Effect from 'effect/Effect'

        export const make = Effect.gen(function*() { return {} })
        export const helper = 1
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports: make, helper',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Default_Export_Is_A_Function',
      code: `
        export default function make() {
          return { port: () => 1 }
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Exporting_Layer_MergeAll_Instead_Of_Effect_Or_Succeed',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const A = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
        const B = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))

        export const StripeLive = Layer.mergeAll(A, B)
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports: StripeLive',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Default_Export_References_NonLayer_Local',
      code: `
        const make = (port: { charge: () => unknown }) => port
        export default make
      `,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
    {
      name: 'Should_Report_When_Adapter_File_Is_Empty',
      code: ``,
      filename: 'stripe.adapter.ts',
      errors: [{
        messageId: 'layerExportRequired',
        data: {
          name: 'the adapter Layer',
          expected,
          actual: 'no exported Layer — the file exports nothing',
          fix,
        },
      }],
    },
  ],
})
