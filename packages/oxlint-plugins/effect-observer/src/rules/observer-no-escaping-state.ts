import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ESCAPING_STATE_EXPECTED,
  meta,
  MODULE_LEVEL_LET_FIX,
  MUTABLE_CONTAINERS,
  MUTABLE_MODULE_CONSTANT_FIX,
} from './observer-no-escaping-state.config.js'

export type MessageIds = 'moduleLevelLet' | 'mutableModuleConstant'

const OBSERVER_SUFFIX = '.observer.ts'

const isObserverFile = (filename: string): boolean => filename.endsWith(OBSERVER_SUFFIX)

const mutableContainerOf = (initializer: ESTree.Expression | null): string | null => {
  if (initializer === null) return null
  if (initializer.type === 'ArrayExpression') return 'array'
  if (initializer.type === 'ObjectExpression') return 'object'
  if (
    (initializer.type === 'CallExpression' || initializer.type === 'NewExpression') &&
    initializer.callee.type === 'Identifier'
  ) {
    if (MUTABLE_CONTAINERS.includes(initializer.callee.name)) return initializer.callee.name
  }
  return null
}

export const observerNoEscapingState = defineRule({
  meta,
  create(context: Context) {
    if (!isObserverFile(context.filename)) return {}

    const inspectDeclaration = (decl: ESTree.VariableDeclaration): void => {
      if (decl.kind === 'let' || decl.kind === 'var') {
        context.report({
          node: decl,
          messageId: 'moduleLevelLet',
          data: {
            name: decl.kind,
            expected: ESCAPING_STATE_EXPECTED,
            actual: `a module-level ${decl.kind} binding`,
            fix: MODULE_LEVEL_LET_FIX,
          },
        })
        return
      }
      for (const declarator of decl.declarations) {
        if (declarator.id.type !== 'Identifier') continue
        const container = mutableContainerOf(declarator.init)
        if (container !== null) {
          context.report({
            node: decl,
            messageId: 'mutableModuleConstant',
            data: {
              name: declarator.id.name,
              expected: ESCAPING_STATE_EXPECTED,
              actual: `a module-level const holding a mutable ${container}`,
              fix: MUTABLE_MODULE_CONSTANT_FIX,
            },
          })
        }
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'VariableDeclaration') {
            inspectDeclaration(statement)
          } else if (
            statement.type === 'ExportNamedDeclaration' &&
            statement.declaration !== null &&
            statement.declaration.type === 'VariableDeclaration'
          ) {
            inspectDeclaration(statement.declaration)
          }
        }
      },
    }
  },
})
