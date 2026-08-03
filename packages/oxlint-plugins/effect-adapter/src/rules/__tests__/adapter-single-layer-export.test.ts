import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { adapterSingleLayerExport } from '../adapter-single-layer-export.js'

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

const expectedLayer = 'exactly one exported Layer — the binding that provides the port'
const fixLayer =
  'keep a single Layer for the port; collapse live/default/declined variants into one or pick the one the composition root wires'
const expectedHelper = 'Layer-only export — the composition root receives the port, not the wrap internals'
const fixHelper =
  'move the helper to a sibling file (or inline it behind the Layer); only the Layer should leave the adapter'

const tooManyLayerData = {
  name: 'the adapter Layer',
  expected: expectedLayer,
  actual: '2 exported Layers',
  fix: fixLayer,
}

const leakedHelperData = {
  name: 'makeStripeClient',
  expected: expectedHelper,
  actual: 'exported function helper alongside the Layer',
  fix: fixHelper,
}

ruleTester.run('adapter-single-layer-export', adapterSingleLayerExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleLayer_Effect_Exported',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_SingleLayer_Succeed_Exported',
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
      name: 'Should_Pass_When_Layer_Exported_Alongside_Types_And_Schemas',
      code: `
        import * as Layer from 'effect/Layer'
        import { Schema as S } from 'effect/Schema'
        import { StripePort } from './charge.executor.ts'

        export interface StripeConfig { apiKey: string }
        export type StripeError = { reason: 'driver_failure' }
        export class StripeInput extends S.TaggedClass<StripeInput>()('StripeInput', {
          amount: S.Number,
        }) {}

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Layer_Exported_Via_Specifier_With_Types',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export type StripeConfig = { apiKey: string }

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
      name: 'Should_Pass_When_NonAdapter_File_Has_Many_Layers',
      code: `
        import * as Layer from 'effect/Layer'
        export const A = Layer.succeed(X, 1)
        export const B = Layer.succeed(X, 2)
      `,
      filename: 'stripe.executor.ts',
    },
    {
      name: 'Should_Pass_When_Type_Reexported_From_Other_Module',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export type { StripeConfig } from './stripe.types.ts'
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_HelperOnly_NoLayer_Adapter_Defers_To_AdapterLayerRequired',
      code: `
        import { StripePort } from './charge.executor.ts'

        export const makeStripeClient = (apiKey: string) => ({ apiKey })
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Type_Export_All_Is_Present_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export type * from './sibling.adapter.ts'
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Specifier_Export_Of_NonFunction_Value_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const stripeConfig = { apiKey: 'sk_test' }
        export { stripeConfig }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Inline_Type_Specifier_Names_A_Layer_Const',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export { type StripeLive }

        export const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Uninitialized_Const_Is_Exported_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        let make: ((port: { charge: () => unknown }) => unknown) | undefined
        export { make }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Default_Export_Is_Layer_Const',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export default StripeLive
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Default_Export_Is_Plain_Value_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const stripeConfig = { apiKey: 'sk_test' }
        export default stripeConfig

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Two_Named_Layer_Exports',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'tooManyLayerExports',
          data: tooManyLayerData,
        },
      ],
    },
    {
      name: 'Should_Report_Two_Layers_Exported_Via_Specifier',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
        export { StripeLive, StripeTest }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'tooManyLayerExports',
          data: tooManyLayerData,
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Effect_And_Layer_Succeed_Together',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export const StripeDefault = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'tooManyLayerExports',
          data: {
            name: 'the adapter Layer',
            expected: expectedLayer,
            actual: '2 exported Layers',
            fix: fixLayer,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_Arrow_Function_Helper',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const makeStripeClient = (apiKey: string) => ({ apiKey })

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: leakedHelperData,
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_Function_Declaration',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export function makeStripeClient(apiKey: string) { return { apiKey } }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeStripeClient',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_Helper_Reexported_By_Specifier',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const makeStripeClient = (apiKey: string) => ({ apiKey })
        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export { makeStripeClient }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeStripeClient',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Two_Layers_And_Leaked_Helper_Together',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const makeStripeClient = (apiKey: string) => ({ apiKey })

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeStripeClient',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
        {
          messageId: 'tooManyLayerExports',
          data: {
            name: 'the adapter Layer',
            expected: expectedLayer,
            actual: '2 exported Layers',
            fix: fixLayer,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_Export_All',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export * from './sibling.adapter.ts'
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: './sibling.adapter.ts',
            expected: expectedHelper,
            actual: 'opaque re-export — the adapter cannot verify what leaves the module',
            fix:
              'remove the export * and import only what you need explicitly, or move the re-exports to a barrel file outside the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_Cross_Module_Specifier_Reexport',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export { helper } from './helpers.ts'
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'helper',
            expected: expectedHelper,
            actual: 'cross-module re-export — the local name does not resolve to a local declaration',
            fix: 'import the value first, then export it by name, so the adapter controls what leaves',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Layer_Exported_Alongside_NonFunction_Value_Helper',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const stripeConfig = { apiKey: 'sk_test' }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'stripeConfig',
            expected: expectedHelper,
            actual: 'exported value alongside the Layer',
            fix:
              'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Value_Helper_Not_Layer_When_Callee_Object_Is_Not_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const makeClient = Foo.succeed('sk_test')

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeClient',
            expected: expectedHelper,
            actual: 'exported value alongside the Layer',
            fix:
              'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Value_Helper_Not_Layer_When_Property_Is_Not_Effect_Or_Succeed',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const A = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
        const B = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))

        export const merged = Layer.mergeAll(A, B)

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'merged',
            expected: expectedHelper,
            actual: 'exported value alongside the Layer',
            fix:
              'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Function_Expression_Helper_When_Exported_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const makeClient = function() { return { apiKey: 'sk_test' } }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeClient',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },

    {
      name: 'Should_Report_Too_Many_Layers_When_Named_And_Default_Layer_Both_Exported',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export default Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'tooManyLayerExports',
          data: {
            name: 'the adapter Layer',
            expected: expectedLayer,
            actual: '2 exported Layers',
            fix: fixLayer,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Function_Declaration_Exported_By_Specifier_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        function makeClient() { return { apiKey: 'sk_test' } }
        export { makeClient }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'makeClient',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Plain_Call_Value_Helper_Not_Layer_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const make = makeClient('sk_test')

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'make',
            expected: expectedHelper,
            actual: 'exported value alongside the Layer',
            fix:
              'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Computed_Member_Call_Not_Layer_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export const computed = Layer['effect'](StripePort, Effect.gen(function*() { return {} }))

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'computed',
            expected: expectedHelper,
            actual: 'exported value alongside the Layer',
            fix:
              'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
          },
        },
      ],
    },
    {
      name: 'Should_Report_Default_Function_Declaration_Helper_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export default function make() {
          return { port: () => 1 }
        }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'make',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Default_Arrow_Function_Helper_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export default () => ({ port: () => 1 })

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'default',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Default_Export_Of_Arrow_Const_Helper_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const make = () => ({ port: () => 1 })
        export default make

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'make',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Anonymous_Default_Function_Helper_Alongside_Layer',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        export default function() {
          return { port: () => 1 }
        }

        export const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'leakedHelper',
          data: {
            name: 'default',
            expected: expectedHelper,
            actual: 'exported function helper alongside the Layer',
            fix: fixHelper,
          },
        },
      ],
    },
    {
      name: 'Should_Report_Too_Many_Layers_When_Default_Is_Layer_Const_And_Named_Layer_Also_Exported',
      code: `
        import * as Layer from 'effect/Layer'
        import { StripePort } from './charge.executor.ts'

        const StripeLive = Layer.effect(StripePort, Effect.gen(function*() { return {} }))
        export default StripeLive

        export const StripeTest = Layer.succeed(StripePort, StripePort.of({ charge: () => Effect.void }))
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'tooManyLayerExports',
          data: {
            name: 'the adapter Layer',
            expected: expectedLayer,
            actual: '2 exported Layers',
            fix: fixLayer,
          },
        },
      ],
    },
  ],
})
