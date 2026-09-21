import { createRuleTester } from './_tester.js'

import { noIoModuleInSourceTest } from '../no-io-module-in-source-test.js'

const ruleTester = createRuleTester()

const NAME = 'An in-source `import.meta.vitest` test block'
const EXPECTED =
  'the tests of a module whose own source calls an I/O binding to live outside it — a separate test file, or a composition test with a double at the port'
const ACTUAL =
  'this module calls a binding imported from a filesystem, process or network module and guards tests in-source with `import.meta.vitest`'
const FIX =
  "test the module from outside its own source — a separate test file or a composition test doubling the boundary — or, when an assertion merely restates a literal the module already computes, it is a change detector: delete it. The verdict here is the file's own imports and calls, never its name"

const error = () => ({
  messageId: 'ioSourceTest',
  data: { name: NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
})

const IN_SOURCE_BLOCK = `
if (import.meta.vitest) {
  const { it } = import.meta.vitest
  it('covers', () => {})
}
`

ruleTester.run('no-io-module-in-source-test', noIoModuleInSourceTest, {
  valid: [
    {
      name: 'Should_StaySilent_When_TypeOnlyImportStatementFormAndInSourceBlock',
      code: `
import type { Stats } from 'fs'
const read = (s: Stats): number => s.size
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/handler.ts',
    },
    {
      name: 'Should_StaySilent_When_TypeOnlyImportInlineFormAndInSourceBlock',
      code: `
import { type Stats } from 'fs'
const read = (s: Stats): number => s.size
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/handler.ts',
    },
    {
      name: 'Should_StaySilent_When_IoBindingImportedButNeverCalled',
      code: `
import { readFileSync } from 'fs'
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/handler.ts',
    },
    {
      name: 'Should_StaySilent_When_IoCallWithoutInSourceBlock',
      code: `
import { readFileSync } from 'node:fs'
const load = (p: string) => readFileSync(p, 'utf-8')
`,
      filename: '/repo/pkg/src/handler.ts',
    },
    {
      name: 'Should_StaySilent_When_FilenameSaysAclWithoutIoCall',
      code: `
export const decide = (x: number): boolean => x > 0
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/foo.acl.ts',
    },
    {
      name: 'Should_StaySilent_When_SeparateTestFileCallsTestFunctions',
      code: `
import { describe, expect, it } from 'vitest'

describe('a suite in its own file', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
`,
      filename: '/repo/pkg/tests/foo.integration.test.ts',
    },
    {
      name: 'Should_StaySilent_When_SeparateTestFilePerformsIoItself',
      code: `
import { readFileSync } from 'node:fs'
import { it } from 'vitest'

it('reads a fixture', () => {
  readFileSync('/repo/fixture.txt', 'utf-8')
})
`,
      filename: '/repo/pkg/tests/io.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_IoCallAndInSourceBlock',
      code: `
import { readFileSync } from 'node:fs'

const load = (p: string) => readFileSync(p, 'utf-8')
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/handler.ts',
      errors: [error()],
    },
    {
      name: 'Should_Report_When_AclSuffixedFilePerformsIo',
      code: `
import { readFileSync } from 'fs'

const load = (p: string) => readFileSync(p, 'utf-8')
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/foo.acl.ts',
      errors: [error()],
    },
    {
      name: 'Should_Report_When_NamespaceBindingCalledAsMember',
      code: `
import * as fs from 'node:fs'

const load = (p: string) => fs.readFileSync(p, 'utf-8')
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/fs-adapter.ts',
      errors: [error()],
    },
    {
      name: 'Should_Report_When_MemberChainCallReachesBinding',
      code: `
import * as fs from 'node:fs'

const load = (p: string) => fs.promises.readFile(p, 'utf-8')
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/fs-adapter.ts',
      errors: [error()],
    },
    {
      name: 'Should_Report_When_EffectPlatformBindingCalled',
      code: `
import * as FileSystem from 'effect/FileSystem'

const size = FileSystem.Size(8)
${IN_SOURCE_BLOCK}
`,
      filename: '/repo/pkg/src/sizes.ts',
      errors: [error()],
    },
  ],
})
