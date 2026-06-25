import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noIoBoundaryTests } from '../no-io-boundary-tests.js'

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

const IN_SOURCE = 'if (import.meta.vitest) { const { it } = await import("@effect/vitest") }'

const inSourceError = [{ messageId: 'inSourceTest' as const }]
const testFileError = [{ messageId: 'testFile' as const }]

ruleTester.run('no-io-boundary-tests', noIoBoundaryTests, {
  valid: [
    {
      name: 'allows in-source vitest in a worker (executor) file',
      code: IN_SOURCE,
      filename: 'src/supervision/pg-monitor/workers/pg-monitor.worker.ts',
    },
    {
      name: 'allows in-source vitest in a schema file',
      code: IN_SOURCE,
      filename: 'src/x/pg-stats.schema.ts',
    },
    {
      name: 'allows in-source vitest in a plain executor file',
      code: IN_SOURCE,
      filename: 'src/x/issue-token.executor.ts',
    },
    {
      name: 'allows an acl with no in-source test block',
      code: 'export const decode = transformOrFail(A, B, {})',
      filename: 'src/x/decode.acl.ts',
    },
    {
      name: 'allows a non-vitest if whose object is not import.meta',
      code: 'if (config.vitest) { run() }',
      filename: 'src/x/decode.acl.ts',
    },
    {
      name: 'allows import.meta access to a property other than vitest',
      code: 'if (import.meta.env) { run() }',
      filename: 'src/x/decode.acl.ts',
    },
    {
      name: 'allows a non-test call in an acl test-named file',
      code: 'helper("x")',
      filename: 'src/x/decode.acl.test.ts',
    },
    {
      name: 'allows a member call whose base is not a test fn',
      code: 'obj.describe("x")',
      filename: 'src/x/decode.acl.test.ts',
    },
    {
      name: 'allows describe in a non-io test file',
      code: 'describe("x", () => {})',
      filename: 'src/x/decode.test.ts',
    },
    {
      name: 'allows an acl-suffixed source name that does not end at the ts extension',
      code: IN_SOURCE,
      filename: 'src/x/decode.acl.ts.map',
    },
    {
      name: 'allows an acl test name that does not end at the ts extension',
      code: 'describe("x", () => {})',
      filename: 'src/x/decode.acl.test.ts.map',
    },
  ],
  invalid: [
    {
      name: 'flags in-source vitest in an acl file',
      code: IN_SOURCE,
      filename: 'src/x/decode.acl.ts',
      errors: inSourceError,
    },
    {
      name: 'flags in-source vitest in a store file',
      code: IN_SOURCE,
      filename: 'src/x/orders.store.ts',
      errors: inSourceError,
    },
    {
      name: 'flags in-source vitest in an adapter file',
      code: IN_SOURCE,
      filename: 'src/x/fcm.adapter.ts',
      errors: inSourceError,
    },
    {
      name: 'flags in-source vitest in a handler file',
      code: IN_SOURCE,
      filename: 'src/x/token.handler.ts',
      errors: inSourceError,
    },
    {
      name: 'flags in-source vitest in a .acl.tsx file',
      code: IN_SOURCE,
      filename: 'src/x/decode.acl.tsx',
      errors: inSourceError,
    },
    {
      name: 'flags in-source vitest in a .acl.mts file',
      code: IN_SOURCE,
      filename: 'src/x/decode.acl.mts',
      errors: inSourceError,
    },
    {
      name: 'flags a describe call in a .acl.test.mts file',
      code: 'describe("x", () => {})',
      filename: 'src/x/decode.acl.test.mts',
      errors: testFileError,
    },
    {
      name: 'flags a describe call in an acl test file',
      code: 'describe("x", () => {})',
      filename: 'src/x/decode.acl.test.ts',
      errors: testFileError,
    },
    {
      name: 'flags an it call in a store spec file',
      code: 'it("x", () => {})',
      filename: 'src/x/orders.store.spec.ts',
      errors: testFileError,
    },
    {
      name: 'flags a test call in an adapter test file',
      code: 'test("x", () => {})',
      filename: 'src/x/fcm.adapter.test.ts',
      errors: testFileError,
    },
    {
      name: 'flags it.prop (member callee) in a handler test file',
      code: 'it.prop("x", [], () => true)',
      filename: 'src/x/token.handler.test.ts',
      errors: testFileError,
    },
    {
      name: 'flags it.each (call-chain callee) in an acl test file',
      code: 'it.each([1])("x", () => {})',
      filename: 'src/x/decode.acl.test.ts',
      errors: testFileError,
    },
    {
      name: 'flags a test call passed as an argument (parent call, not its callee)',
      code: 'wrap(it("x", () => {}))',
      filename: 'src/x/decode.acl.test.ts',
      errors: testFileError,
    },
  ],
})
