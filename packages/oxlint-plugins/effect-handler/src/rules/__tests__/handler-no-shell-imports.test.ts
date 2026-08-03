import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerNoShellImports } from '../handler-no-shell-imports.js'

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

const expectedImports = 'imports of the transport, the schema codec, and exactly one executor'
const shellFix =
  'the executor owns I/O and orchestration — call it from the executor instead, or pass the value in as command data'
const expectedTerminus = 'a transport terminus with no I/O of its own'
const runtimeFix = 'read the value inside the executor and pass it as a command field'

ruleTester.run('handler-no-shell-imports', handlerNoShellImports, {
  valid: [
    {
      name: 'Should_Pass_When_Importing_Kernel_Utility',
      code: `import { matchTag } from './dispatch.kernel.ts'`,
      filename: 'dispatch.handler.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Executor_Schema_And_Effect_Modules',
      code: `
        import { Effect } from 'effect'
        import { Match } from 'effect'
        import { GetUserExecutor } from './get-user.executor.js'
        import { UserSchema } from './user.schema.js'
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Executor_With_TS_Extension',
      code: `
        import { GetUserExecutor } from './get-user.executor.ts'
        import { RequestSchema } from './request.schema.ts'
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Scoped_Package_Modules',
      code: `
        import { HttpServerResponse } from '@effect/platform'
        import { HttpServerRequest } from '@effect/platform'
        import { Schema as S } from 'effect'
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Importing_Plain_Relative_Module_With_Schema_Like_Name',
      code: `
        import { helpers } from './helpers.js'
        import { requestShape } from './request-shape.js'
      `,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Non_Handler_File_Imports_Shell_Cells',
      code: `
        import { UserStore } from './user.store.js'
        import { PaymentsAdapter } from './payments.adapter.js'
      `,
      filename: 'user-list.util.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ShellCellImport_When_Importing_Store',
      code: `
        import { Effect } from 'effect'
        import { UserStore } from './user.store.js'
        export const getUserHandler = Effect.gen(function*() {
          const user = yield* UserStore.findById('1')
          return HttpServerResponse.schemaJson(UserSchema)(user)
        })
      `,
      filename: 'get-user.handler.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './user.store.js',
            expected: expectedImports,
            actual: 'an import of the .store cell',
            fix: shellFix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShellCellImport_When_Importing_Workflow',
      code: `
        import { Effect } from 'effect'
        import { decideOrder } from './decide-order.workflow.js'
        export const createOrderHandler = Effect.gen(function*() {
          const result = yield* Effect.either(CreateOrderExecutor(new CreateOrderCommand({})))
          return Either.isLeft(result) ? toErrorResponse(result.left) : noContent()
        })
      `,
      filename: 'create-order.handler.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './decide-order.workflow.js',
            expected: expectedImports,
            actual: 'an import of the .workflow cell',
            fix: shellFix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShellCellImport_When_Importing_Adapter',
      code: `
        import { PaymentsAdapter } from './payments.adapter.ts'
        export const payHandler = () => PaymentsAdapter.charge('1')
      `,
      filename: 'pay.handler.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './payments.adapter.ts',
            expected: expectedImports,
            actual: 'an import of the .adapter cell',
            fix: shellFix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShellCellImport_When_Importing_Sibling_Handler',
      code: `
        import { getUserHandler } from './get-user.handler.js'
        export const getProfileHandler = () => getUserHandler()
      `,
      filename: 'get-profile.handler.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './get-user.handler.js',
            expected: expectedImports,
            actual: 'an import of the .handler cell',
            fix: shellFix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_RuntimeModuleImport_When_Importing_NodeFs',
      code: `
        import { readFileSync } from 'node:fs'
        export const uploadHandler = () => readFileSync('avatar.png')
      `,
      filename: 'upload.handler.ts',
      errors: [
        {
          messageId: 'runtimeModuleImport',
          data: {
            name: 'node:fs',
            expected: expectedTerminus,
            actual: 'an import of the Node runtime module node:fs',
            fix: runtimeFix,
          },
        },
      ],
    },
    {
      name: 'Should_Report_RuntimeModuleImport_When_Importing_Bare_Builtin',
      code: `
        import * as path from 'path'
        export const downloadHandler = () => path.join('a', 'b')
      `,
      filename: 'download.handler.ts',
      errors: [
        {
          messageId: 'runtimeModuleImport',
          data: {
            name: 'path',
            expected: expectedTerminus,
            actual: 'an import of the Node runtime module path',
            fix: runtimeFix,
          },
        },
      ],
    },
  ],
})
