import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerNoCasts } from '../handler-no-casts.js'

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

const expected = 'a Schema codec decode (HttpServerRequest.schemaBodyJson, S.decodeUnknownSync, ...)'
const fix = 'decode the request through a Schema codec so malformed or malicious payloads are rejected at the boundary'

ruleTester.run('handler-no-casts', handlerNoCasts, {
  valid: [
    {
      name: 'Should_Pass_When_Decoding_Through_Schema_Codec',
      code: `
        import { Schema as S } from 'effect'
        import { HttpServerRequest } from '@effect/platform'
        export const createUserHandler = Effect.gen(function*() {
          const body = yield* HttpServerRequest.schemaBodyJson(CreateUserRequestSchema)
          const parsed = S.decodeUnknownSync(CreateUserRequestSchema)(body)
          const cmd = new CreateUserCommand(parsed)
          const result = yield* Effect.either(CreateUserExecutor(cmd))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'create-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_AsConst_Is_Used',
      code: `
        export const listHandler = () => {
          const method = 'GET' as const
          const status = 200 as const
          return json({ method, status })
        }
      `,
      filename: 'list.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonNullAssertion_Is_Used',
      code: `
        import { HttpServerRequest } from '@effect/platform'
        export const getHandler = Effect.gen(function*() {
          const id = HttpServerRequest.param('id')!
          return json({ id })
        })
      `,
      filename: 'get.handler.ts',
    },
    {
      name: 'Should_Pass_When_Satisfies_Is_Used',
      code: `
        const responseOptions = { status: 404 as const } satisfies HttpServerResponse.Options
        export const notFoundHandler = () => HttpServerResponse.unsafeJson({}, responseOptions)
      `,
      filename: 'not-found.handler.ts',
    },
    {
      name: 'Should_Pass_When_Cast_In_Non_Handler_File',
      code: `
        export const parseUser = (body: unknown): User => body as User
      `,
      filename: 'parse-user.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_AsAssertion_When_Casting_Request_Body',
      code: `
        import { HttpServerRequest } from '@effect/platform'
        export const createUserHandler = Effect.gen(function*() {
          const body = yield* HttpServerRequest.json()
          const user = body as User
          return json({ user })
        })
      `,
      filename: 'create-user.handler.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on transport data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_To_QualifiedTypeName',
      code: `
        import { HttpServerRequest } from '@effect/platform'
        export const createUserHandler = Effect.gen(function*() {
          const body = yield* HttpServerRequest.json()
          const user = body as Domain.User
          return json({ user })
        })
      `,
      filename: 'create-user.handler.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on transport data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_With_AsAny',
      code: `
        import { HttpServerRequest } from '@effect/platform'
        export const createUserHandler = Effect.gen(function*() {
          const body = yield* HttpServerRequest.json()
          const user = body as any
          return json({ user })
        })
      `,
      filename: 'create-user.handler.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on transport data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AsAssertion_When_Casting_To_String_Literal',
      code: `
        export const tagHandler = () => {
          const tag = rawValue as 'active'
          return json({ tag })
        }
      `,
      filename: 'tag.handler.ts',
      errors: [
        {
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected,
            actual: 'an as type assertion on transport data',
            fix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_AngleBracketAssertion_When_Using_Type_Assertion_Syntax',
      code: `
        import { HttpServerRequest } from '@effect/platform'
        export const createUserHandler = Effect.gen(function*() {
          const body = yield* HttpServerRequest.json()
          const user = <User>body
          return json({ user })
        })
      `,
      filename: 'create-user.handler.ts',
      errors: [
        {
          messageId: 'angleBracketAssertion',
          data: {
            name: 'type assertion',
            expected,
            actual: 'an angle-bracket <T> type assertion',
            fix,
          },
        },
      ],
    },
  ],
})
