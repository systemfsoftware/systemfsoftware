import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { IO_SOURCE_FILE, IO_TEST_FILE, meta, TEST_FNS } from './no-io-boundary-tests.config.js'

export type Options = []
export type MessageIds = 'inSourceTest' | 'testFile'

const isImportMetaVitest = (test: ESTree.Node): boolean =>
  test.type === 'MemberExpression' &&
  test.property.type === 'Identifier' &&
  test.property.name === 'vitest' &&
  test.object.type === 'MetaProperty'

type CalleeLike = ESTree.CallExpression['callee']

const testCallBase = (callee: CalleeLike): ESTree.Node | undefined => {
  if (callee.type === 'Identifier') {
    return TEST_FNS.has(callee.name) ? callee : undefined
  }
  if (callee.type === 'MemberExpression') {
    return testCallBase(callee.object)
  }
  if (callee.type === 'CallExpression') {
    return testCallBase(callee.callee)
  }
  return undefined
}

export const noIoBoundaryTests = defineRule({
  meta,
  create(context: Context) {
    if (IO_TEST_FILE.test(context.filename)) {
      return {
        CallExpression(node: ESTree.CallExpression) {
          if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
            return
          }
          const base = testCallBase(node.callee)
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
