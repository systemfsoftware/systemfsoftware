import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerSingleExecutor } from '../handler-single-executor.js'

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

const expectedDelegation = 'exactly one import of a sibling *.executor and one Effect.either(Executor(cmd)) delegation'
const expectedOneImport = 'exactly one import of a sibling *.executor'
const expectedOneEither = 'exactly one Effect.either(Executor(cmd)) call'
const noImportActual = 'no import of a sibling *.executor.ts'
const noEitherActual = 'no Effect.either call around the executor call'
const fixDelegate =
  'construct the executor command and call yield* Effect.either(Executor(cmd)) — the executor owns the I/O sandwich'
const fixMerge = 'merge the orchestrations into one executor, or split this handler per executor'
const fixWrap = 'wrap the single executor call in Effect.either and map the Left to a response'
const fixMove =
  'only the single executor call may be wrapped in Effect.either — move the other effects into the executor'

ruleTester.run('handler-single-executor', handlerSingleExecutor, {
  valid: [
    {
      name: 'Should_Pass_When_One_Executor_Import_And_One_EffectEither_Call',
      code: `
        import { Effect } from 'effect'
        import { HttpServerResponse } from '@effect/platform'
        import { GetUserExecutor } from './get-user.executor.js'
        import { GetUserCommand } from './get-user-command.js'

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
      name: 'Should_Pass_When_Executor_Import_Uses_TS_Extension',
      code: `
        import { Effect } from 'effect'
        import { CancelOrderExecutor } from './cancel-order.executor.ts'
        export const cancelOrderHandler = Effect.gen(function*() {
          const result = yield* Effect.either(CancelOrderExecutor(new CancelOrderCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'cancel-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnly_Executor_Import_Is_Ignored',
      code: `
        import { Effect } from 'effect'
        import type { GetUserExecutor } from './get-user.executor.js'
        import { CreateUserExecutor } from './create-user.executor.js'
        export const createUserHandler = Effect.gen(function*() {
          const result = yield* Effect.either(CreateUserExecutor(new CreateUserCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'create-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Executor_Import_Comes_From_A_Nested_Path',
      code: `
        import { Effect } from 'effect'
        import { SyncUserExecutor } from '../features/sync-user.executor.js'
        export const syncUserHandler = Effect.gen(function*() {
          const result = yield* Effect.either(SyncUserExecutor(new SyncUserCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'sync-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Non_Effect_Object_Has_An_Either_Method',
      code: `
        import { Effect } from 'effect'
        import { HttpServerResponse } from '@effect/platform'
        import { GetUserExecutor } from './get-user.executor.js'
        export const getUserHandler = Effect.gen(function*() {
          const cmd = new GetUserCommand({ id: yield* HttpServerRequest.param('id') })
          const result = yield* Effect.either(GetUserExecutor(cmd))
          const cached = cacheClient.either(result.right)
          return Either.isLeft(result)
            ? toErrorResponse(result.left)
            : HttpServerResponse.schemaJson(UserSchema)(cached)
        })
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Non_Handler_File_Contains_Multiple_EffectEither_Calls',
      code: `
        import { Effect } from 'effect'
        export const run = function* (cmd: SyncUserCommand) {
          const a = yield* Effect.either(StoreA.find(cmd.id))
          const b = yield* Effect.either(StoreB.find(cmd.id))
          return a
        }
      `,
      filename: 'sync-user.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NoExecutorImport_And_NoEitherDelegation_When_Handler_Is_Empty',
      code: '',
      filename: 'empty.handler.ts',
      errors: [
        {
          messageId: 'noExecutorImport',
          data: {
            name: 'empty.handler.ts',
            expected: expectedDelegation,
            actual: noImportActual,
            fix: fixDelegate,
          },
        },
        {
          messageId: 'noEitherDelegation',
          data: {
            name: 'empty.handler.ts',
            expected: expectedOneEither,
            actual: noEitherActual,
            fix: fixWrap,
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoExecutorImport_When_EffectEither_Is_Called_Without_An_Executor_Import',
      code: `
        import { Effect } from 'effect'
        export const pingHandler = Effect.gen(function*() {
          yield* Effect.either(pingHealthcheck())
          return noContent()
        })
      `,
      filename: 'ping.handler.ts',
      errors: [
        {
          messageId: 'noExecutorImport',
          data: {
            name: 'ping.handler.ts',
            expected: expectedDelegation,
            actual: noImportActual,
            fix: fixDelegate,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MultipleExecutorImports_When_Two_Executors_Are_Imported',
      code: `
        import { Effect } from 'effect'
        import { GetUserExecutor } from './get-user.executor.js'
        import { GetProfileExecutor } from './get-profile.executor.js'
        export const getUserHandler = Effect.gen(function*() {
          const result = yield* Effect.either(GetUserExecutor(new GetUserCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'get-user.handler.ts',
      errors: [
        {
          messageId: 'multipleExecutorImports',
          data: {
            name: 'get-user.handler.ts',
            expected: expectedOneImport,
            actual: '2 *.executor imports',
            fix: fixMerge,
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoEitherDelegation_When_Executor_Is_Called_Directly',
      code: `
        import { Effect } from 'effect'
        import { CancelOrderExecutor } from './cancel-order.executor.js'
        export const cancelOrderHandler = Effect.gen(function*() {
          const result = yield* CancelOrderExecutor(new CancelOrderCommand({}))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'cancel-order.handler.ts',
      errors: [
        {
          messageId: 'noEitherDelegation',
          data: {
            name: 'cancel-order.handler.ts',
            expected: expectedOneEither,
            actual: noEitherActual,
            fix: fixWrap,
          },
        },
      ],
    },
    {
      name: 'Should_Report_MultipleEitherDelegations_When_EffectEither_Is_Called_Twice',
      code: `
        import { Effect } from 'effect'
        import { CancelOrderExecutor } from './cancel-order.executor.js'
        export const cancelOrderHandler = Effect.gen(function*() {
          const a = yield* Effect.either(CancelOrderExecutor(new CancelOrderCommand({})))
          const b = yield* Effect.either(CancelOrderExecutor(new CancelOrderCommand({})))
          return Either.isLeft(a) ? toErrorResponse(a.left) : noContent()
        })
      `,
      filename: 'cancel-order.handler.ts',
      errors: [
        {
          messageId: 'multipleEitherDelegations',
          data: {
            name: 'cancel-order.handler.ts',
            expected: expectedOneEither,
            actual: '2 Effect.either calls',
            fix: fixMove,
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoEitherDelegation_When_EffectExit_Is_Used_Instead',
      code: `
        import { Effect } from 'effect'
        import { CancelOrderExecutor } from './cancel-order.executor.js'
        export const cancelOrderHandler = Effect.gen(function*() {
          const result = yield* Effect.exit(CancelOrderExecutor(new CancelOrderCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'cancel-order.handler.ts',
      errors: [
        {
          messageId: 'noEitherDelegation',
          data: {
            name: 'cancel-order.handler.ts',
            expected: expectedOneEither,
            actual: noEitherActual,
            fix: fixWrap,
          },
        },
      ],
    },
  ],
})
