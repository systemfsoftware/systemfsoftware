import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { adapterNoCast } from '../adapter-no-cast.js'

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

const expected = 'S.decodeUnknown at the foreign boundary — the decode is the only way a driver payload enters the port'
const fix =
  "decode driver DATA with S.decodeUnknown(Shape)(raw), mapping failures to the port's typed error; when the driver's own TYPE is wrong — an overload that will not narrow, or a live handle that carries methods rather than data — correct it once in a .d.ts module augmentation pinned to the driver version, never at the callsite"

ruleTester.run('adapter-no-cast', adapterNoCast, {
  valid: [
    {
      name: 'Should_Pass_When_Decoding_Through_Schema',
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
          const charge = (input: { amount: number }) =>
            Effect.tryPromise({
              try: () => client.charges.create({ amount: input.amount }),
              catch: () => new StripeError({ reason: 'driver_failure' }),
            }).pipe(Effect.flatMap((raw) => S.decodeUnknown(ChargeResponse)(raw)))
          return { charge }
        })

        export const StripeLive = Layer.effect(StripePort, make)
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_AsConst_Is_Used',
      code: `
        export const retryAdapter = () => {
          const attempts = 3 as const
          const mode = 'exponential' as const
          return { attempts, mode }
        }
      `,
      filename: 'retry.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NonNullAssertion_Is_Used',
      code: `
        export const configAdapter = () => {
          const key = process.env.STRIPE_KEY!
          return { key }
        }
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Satisfies_Is_Used',
      code: `
        export const makeClient = () => {
          const options = { maxRetries: 3 } satisfies StripeOptions
          return new StripePkg('sk_test', options)
        }
      `,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_Cast_In_NonAdapterCell',
      code: `
        export const parseUser = (body: unknown): User => body as User
      `,
      filename: 'parse-user.executor.ts',
    },
    {
      name: 'Should_Pass_When_Cast_In_PlainTsFile',
      code: `
        export const parseUser = (body: unknown): User => body as User
      `,
      filename: 'parse-user.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_AsAssertion_When_Casting_Driver_Payload',
      code: `
        import { Stripe as StripePkg } from 'stripe'
        export const make = () => {
          const raw = yieldClientCharge()
          const user = raw as User
          return user
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on foreign driver data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_Through_Any',
      code: `
        export const make = () => {
          const raw = yieldClientCharge()
          const user = raw as any
          return user
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on foreign driver data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_To_String_Literal',
      code: `
        export const make = () => {
          const status = rawValue as 'active'
          return status
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on foreign driver data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_Through_Unknown',
      code: `
        export const make = () => {
          const raw = yieldClientCharge()
          const user = raw as unknown as User
          return user
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on foreign driver data',
            fix,
          },
        },
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on foreign driver data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AngleBracketAssertion_When_Using_Type_Assertion_Syntax',
      code: `
        export const make = () => {
          const raw = yieldClientCharge()
          const user = <User>raw
          return user
        }
      `,
      filename: 'stripe.adapter.ts',
      errors: [
        {
          messageId: 'angleBracketAssertion',
          data: {
            name: 'type assertion',
            expected,
            actual: 'an angle-bracket <T> type assertion on foreign driver data',
            fix,
          },
        },
      ],
    },
  ],
})
