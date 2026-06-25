// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds = 'inSourceTest' | 'testFile'

// Stryker restore all

const IO_SOURCE_FILE = /\.(?:acl|store|adapter|handler)\.[cm]?tsx?$/
const IO_TEST_FILE = /\.(?:acl|store|adapter|handler)\.(?:test|spec)\.[cm]?tsx?$/
const TEST_FNS = new Set(['describe', 'it', 'test'])

const isImportMetaVitest = (test: ESTree.Node): boolean =>
  test.type === 'MemberExpression' &&
  test.property.type === 'Identifier' &&
  test.property.name === 'vitest' &&
  test.object.type === 'MetaProperty'

const testCallBase = (node: ESTree.CallExpression): ESTree.Node | undefined => {
  let current: ESTree.Node | undefined = node.callee
  while (current !== undefined) {
    if (current.type === 'Identifier') {
      return TEST_FNS.has(current.name) ? current : undefined
    }
    if (current.type === 'MemberExpression') {
      current = current.object
      continue
    }
    if (current.type === 'CallExpression') {
      current = current.callee
      continue
    }
    return undefined
  }
  return undefined
}

export const noIoBoundaryTests = defineRule({
  // Stryker disable all
  meta: {
    type: 'problem',
    docs: {
      description:
        'I/O boundary files (acl/store/adapter/handler) are verified by composition tests, never unit tests — not a *.test.ts file and not an in-source `import.meta.vitest` block',
    },
    schema: [],
    messages: {
      inSourceTest:
        "In-source `import.meta.vitest` tests are forbidden in an I/O boundary file (acl/store/adapter/handler). The transform/query/handler IS the file's public purpose — cover it with a composition test. A genuinely private pure helper (e.g. an S.filter predicate) belongs in a *.schema.ts or a named pure helper, tested in-source there.",
      testFile:
        'Unit tests for I/O boundary files (acl/store/adapter/handler) are forbidden — verify these through composition tests with boundary doubles.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    if (IO_TEST_FILE.test(context.filename)) {
      return {
        CallExpression(node: ESTree.CallExpression) {
          if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
            return
          }
          const base = testCallBase(node)
          if (base !== undefined) {
            context.report({ node: base, messageId: 'testFile' })
          }
        },
      }
    }

    if (IO_SOURCE_FILE.test(context.filename)) {
      return {
        IfStatement(node: ESTree.IfStatement) {
          if (isImportMetaVitest(node.test)) {
            context.report({ node: node.test, messageId: 'inSourceTest' })
          }
        },
      }
    }

    return {}
  },
})
