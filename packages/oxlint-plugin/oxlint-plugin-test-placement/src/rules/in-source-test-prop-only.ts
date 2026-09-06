import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  NON_PROP_CALL_ACTUAL,
  NON_PROP_CALL_EXPECTED,
  NON_PROP_CALL_FIX,
  NON_PROP_CALL_NAME,
} from './in-source-test-prop-only.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import { isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'nonPropCall'

const PROP_MODIFIERS: ReadonlySet<string> = new Set(['only', 'skip', 'todo'])

const isPropCallee = (callee: ESTree.CallExpression['callee']): boolean => {
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
  if (callee.property.name === 'prop') {
    const object = callee.object
    if (object.type === 'Identifier') return object.name === 'it'
    return object.type === 'MemberExpression' &&
      object.property.type === 'Identifier' && object.property.name === 'effect' &&
      object.object.type === 'Identifier' && object.object.name === 'it'
  }
  return PROP_MODIFIERS.has(callee.property.name) && isPropCallee(callee.object)
}

const BANNED_TEST_ROOTS: ReadonlySet<string> = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'expect',
  'assert',
  'vi',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
])

const rootNameOf = (node: ESTree.Node): string | undefined => {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return rootNameOf(node.object)
  if (node.type === 'CallExpression') return rootNameOf(node.callee)
  return undefined
}

const isInsideConsequent = (
  node: { readonly parent: ESTree.Node | null },
  consequent: ESTree.Node,
): boolean => {
  const walk = (current: ESTree.Node | null): boolean => {
    if (current === null) return false
    if (current === consequent) return true
    return walk(current.parent)
  }
  return walk(node.parent)
}

export const inSourceTestPropOnly = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    if (!isUnderSrc(filename) || isTestFile(basename)) return {}
    const guards: ESTree.IfStatement[] = []
    const offending: ESTree.CallExpression[] = []

    return {
      IfStatement(node: ESTree.IfStatement) {
        if (!isVitestGuard(node.test)) return
        guards.push(node)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isPropCallee(node.callee)) return
        const root = rootNameOf(node.callee)
        if (root === undefined || !BANNED_TEST_ROOTS.has(root)) return
        const guard = guards.find((g) => isInsideConsequent(node, g.consequent))
        if (guard === undefined) return
        offending.push(node)
      },
      'Program:exit'() {
        for (const node of offending) {
          context.report({
            node,
            messageId: 'nonPropCall',
            data: {
              name: NON_PROP_CALL_NAME,
              expected: NON_PROP_CALL_EXPECTED,
              actual: NON_PROP_CALL_ACTUAL,
              fix: NON_PROP_CALL_FIX,
            },
          })
        }
      },
    }
  },
})
