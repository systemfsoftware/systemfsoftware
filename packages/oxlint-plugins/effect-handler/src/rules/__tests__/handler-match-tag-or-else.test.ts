import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerMatchTagOrElse } from '../handler-match-tag-or-else.js'

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

const expectedOrElse = 'a Match.orElse(() => 500) fallback arm'
const actualMissing = 'a Match.tag dispatch with no Match.orElse arm'
const fixOrElse =
  'add Match.orElse(() => 500) as the final arm so a new error variant degrades to a 500 instead of failing the build'
const expectedTerminator = 'Match.orElse(() => 500) as the terminator'
const actualExhaustive = 'Match.exhaustive closing a Match.tag dispatch'
const fixExhaustive =
  'replace Match.exhaustive with Match.orElse(() => 500) — new error variants must degrade to 500 at runtime, not fail the build'

ruleTester.run('handler-match-tag-or-else', handlerMatchTagOrElse, {
  valid: [
    {
      name: 'Should_Pass_When_MatchType_Pipe_Ends_With_MatchOrElse',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.type<OrderError>().pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.tag('PaymentGatewayError', () => 402),
              Match.orElse(() => 500),
            )(error),
          })
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_MatchValue_Pipe_Ends_With_MatchOrElse',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.value(error).pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.tag('PaymentGatewayError', () => 402),
              Match.orElse(() => 500),
            ),
          })
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_OrElse_Follows_Tag_Arms_With_Other_Arms_Between',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.type<OrderError>().pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.when((e) => e.retryable, () => 429),
              Match.orElse(() => 500),
            )(error),
          })
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_Pipe_Has_No_Tag_Arms',
      code: `
        import { Match } from 'effect'
        const toBoolean = (input: string) =>
          Match.type<string>().pipe(
            Match.when((s) => s === 'yes', () => true),
            Match.orElse(() => false),
          )(input)
      `,
      filename: 'parse.handler.ts',
    },
    {
      name: 'Should_Pass_When_MatchTag_Pipe_Ends_With_Exhaustive_In_Non_Handler_File',
      code: `
        import { Match } from 'effect'
        export const toStatus = (error: OrderError) =>
          Match.value(error).pipe(
            Match.tag('OrderNotFoundError', () => 404),
            Match.tag('PaymentGatewayError', () => 402),
            Match.exhaustive(),
          )
      `,
      filename: 'decide-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MatchValue_Pipe_Has_NonMatch_Arm_Then_OrElse',
      code: `
        import { Match } from 'effect'
        const toStatus = (error: OrderError) =>
          Match.value(error).pipe(
            Match.tag('OrderNotFoundError', () => 404),
            someOther(),
            Match.orElse(() => 500),
          )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_MatchType_Pipe_Has_OnlyWhenAndExhaustive_NoTag',
      code: `
        import { Match } from 'effect'
        const toBoolean = (input: string) =>
          Match.type<string>().pipe(
            Match.when((s) => s === 'yes', () => true),
            Match.exhaustive(),
          )(input)
      `,
      filename: 'parse.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonPipe_MatchType_MemberCall_Has_Tag_Arms',
      code: `
        import { Match } from 'effect'
        const f = Match.type<OrderError>().map(
          Match.tag('OrderNotFoundError', () => 404),
        )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonMatch_Member_Arm_Is_Not_A_Tag',
      code: `
        import { Match } from 'effect'
        const f = Match.type<OrderError>().pipe(
          Other.tag('OrderNotFoundError', () => 404),
        )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonMatch_ObjectCallee_Pipe_Ends_With_Exhaustive',
      code: `
        import { Match } from 'effect'
        const f = someOther.type<OrderError>().pipe(
          Match.tag('OrderNotFoundError', () => 404),
          Match.exhaustive(),
        )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonTypeValue_MatchMember_Pipe_Has_Tag_Arm',
      code: `
        import { Match } from 'effect'
        const f = Match.someMethod<OrderError>().pipe(
          Match.tag('OrderNotFoundError', () => 404),
        )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonDispatchCall_Has_Tag_Arm_Argument',
      code: `
        import { Match } from 'effect'
        const f = someFn(Match.tag('OrderNotFoundError', () => 404))
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonCallObject_Pipe_Has_Tag_Arm',
      code: `
        import { Match } from 'effect'
        const f = someObj.pipe(
          Match.tag('OrderNotFoundError', () => 404),
        )
      `,
      filename: 'get-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_IdentifierCallee_Call_Pipe_Has_Tag_Arm',
      code: `
        import { Match } from 'effect'
        const f = someFn().pipe(
          Match.tag('OrderNotFoundError', () => 404),
        )
      `,
      filename: 'get-order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_MissingOrElse_When_Tag_Then_When_Arm_Without_Terminator',
      code: `
        import { Match } from 'effect'
        const toBoolean = (input: string) =>
          Match.type<string>().pipe(
            Match.tag('OrderNotFoundError', () => 404),
            Match.when((e) => e.retryable, () => 429),
          )(input)
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'missingOrElse',
          data: {
            name: 'Match.tag dispatch',
            expected: expectedOrElse,
            actual: actualMissing,
            fix: fixOrElse,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingOrElse_When_MatchValue_Pipe_Has_No_OrElse',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.value(error).pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.tag('PaymentGatewayError', () => 402),
            ),
          })
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'missingOrElse',
          data: {
            name: 'Match.tag dispatch',
            expected: expectedOrElse,
            actual: actualMissing,
            fix: fixOrElse,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingOrElse_When_MatchTag_Pipe_Has_No_OrElse',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.type<OrderError>().pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.tag('PaymentGatewayError', () => 402),
            )(error),
          })
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'missingOrElse',
          data: {
            name: 'Match.tag dispatch',
            expected: expectedOrElse,
            actual: actualMissing,
            fix: fixOrElse,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExhaustiveInsteadOfOrElse_When_MatchTag_Pipe_Ends_With_Exhaustive',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.type<OrderError>().pipe(
              Match.tag('OrderNotFoundError', () => 404),
              Match.exhaustive(),
            )(error),
          })
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'exhaustiveInsteadOfOrElse',
          data: {
            name: 'Match.exhaustive',
            expected: expectedTerminator,
            actual: actualExhaustive,
            fix: fixExhaustive,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingOrElse_When_Single_Tag_Arm_Without_Terminator',
      code: `
        import { Match } from 'effect'
        const toErrorResponse = (error: OrderError) =>
          HttpServerResponse.unsafeJson(error, {
            status: Match.type<OrderError>().pipe(
              Match.tag('OrderNotFoundError', () => 404),
            )(error),
          })
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'missingOrElse',
          data: {
            name: 'Match.tag dispatch',
            expected: expectedOrElse,
            actual: actualMissing,
            fix: fixOrElse,
          },
        },
      ],
    },
  ],
})
