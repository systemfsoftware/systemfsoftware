import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { expectedDepsTagName, isExecutorFile } from './cell.js'
import {
  DEPENDENCY_TAG_CONSTRUCTORS,
  meta,
  MISSING_DEPS_TAG_ACTUAL,
  MISSING_DEPS_TAG_FIX,
  MISSING_DEPS_TAG_NAME,
} from './executor-requires-deps-tag.config.js'

export type MessageIds = 'missingDepsTag'

const isDependencyTagConstructor = (node: ESTree.Node): boolean => {
  let current: ESTree.Node = node
  while (current.type === 'CallExpression') current = current.callee
  if (current.type !== 'MemberExpression') return false
  if (current.computed) return false
  if (current.object.type !== 'Identifier') return false
  if (current.property.type !== 'Identifier') return false
  const owner = current.object.name
  const member = current.property.name
  return DEPENDENCY_TAG_CONSTRUCTORS.some(([o, m]) => o === owner && m === member)
}

export const executorRequiresDepsTag = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    let declared = false

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (node.superClass === null) return
        if (!isDependencyTagConstructor(node.superClass)) return
        declared = true
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.init === null) return
        if (!isDependencyTagConstructor(node.init)) return
        declared = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (declared) return
        context.report({
          node,
          messageId: 'missingDepsTag',
          data: {
            name: MISSING_DEPS_TAG_NAME,
            expected: `exactly one consumer-owned Tag ${expectedDepsTagName(context.filename)}`,
            actual: MISSING_DEPS_TAG_ACTUAL,
            fix: MISSING_DEPS_TAG_FIX,
          },
        })
      },
    }
  },
})
