import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerNoSwitch } from '../handler-no-switch.js'

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

const expected = 'a Match.tag dispatch closed by Match.orElse(() => 500)'
const actual = 'a switch statement'
const fix =
  'map each typed error variant to its status with Match.type(...).pipe(Match.tag(...), ..., Match.orElse(() => 500)) so a new variant degrades to 500 instead of falling through silently'

ruleTester.run('handler-no-switch', handlerNoSwitch, {
  valid: [
    {
      name: 'Should_Pass_When_Mapping_Errors_With_MatchTag',
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
      name: 'Should_Pass_When_Handler_Has_No_Switch',
      code: `
        import { Effect } from 'effect'
        export const getUserHandler = Effect.gen(function*() {
          const cmd = new GetUserCommand({ id: yield* HttpServerRequest.param('id') })
          const result = yield* Effect.either(GetUserExecutor(cmd))
          return Either.isLeft(result)
            ? toErrorResponse(result.left)
            : HttpServerResponse.schemaJson(UserSchema)(result.right)
        })
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Switch_In_Non_Handler_File',
      code: `
        export const toStatus = (error: OrderError): number => {
          switch (error._tag) {
            case 'OrderNotFoundError': return 404
            default: return 500
          }
        }
      `,
      filename: 'decide-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_Switch_On_Error_Tag',
      code: `
        const toErrorResponse = (error: OrderError) => {
          switch (error._tag) {
            case 'OrderNotFoundError':
              return HttpServerResponse.unsafeJson(error, { status: 404 })
            default:
              return HttpServerResponse.unsafeJson(error, { status: 500 })
          }
        }
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'switchStatement',
          data: { name: 'switch', expected, actual, fix },
        },
      ],
    },
    {
      name: 'Should_Report_When_Switch_Has_No_Default',
      code: `
        const toErrorResponse = (error: OrderError) => {
          switch (error._tag) {
            case 'OrderNotFoundError':
              return HttpServerResponse.unsafeJson(error, { status: 404 })
          }
        }
      `,
      filename: 'get-order.handler.ts',
      errors: [
        {
          messageId: 'switchStatement',
          data: { name: 'switch', expected, actual, fix },
        },
      ],
    },
    {
      name: 'Should_Report_When_Switch_On_Non_Error_Value',
      code: `
        export const routeHandler = (request: Request) => {
          switch (request.method) {
            case 'GET': return handleGet()
            case 'POST': return handlePost()
            default: return methodNotAllowed()
          }
        }
      `,
      filename: 'router.handler.ts',
      errors: [
        {
          messageId: 'switchStatement',
          data: { name: 'switch', expected, actual, fix },
        },
      ],
    },
  ],
})
