import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStoreFile } from './cell.js'
import {
  BINDING_FIX,
  DESTRUCTURED_BINDING_NAME,
  ESCAPING_CONSTRUCTORS,
  EXPECTED_BINDING,
  meta,
} from './store-no-escaping-state.config.js'

export type MessageIds = 'mutableModuleBinding' | 'moduleLevelCollection'

const newExpressionConstructor = (init: ESTree.VariableDeclarator['init']): string | null => {
  if (init === null) return null
  if (init.type !== 'NewExpression') return null
  if (init.callee.type !== 'Identifier') return null
  if (!(ESCAPING_CONSTRUCTORS as readonly string[]).includes(init.callee.name)) return null
  return init.callee.name
}

export const storeNoEscapingState = defineRule({
  meta,
  create(context: Context) {
    if (!isStoreFile(context.filename)) return {}

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          const unwrapped = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
          if (unwrapped === null || unwrapped.type !== 'VariableDeclaration') continue

          const kind = unwrapped.kind
          const mutable = kind === 'let' || kind === 'var'

          for (const declarator of unwrapped.declarations) {
            const name = declarator.id.type === 'Identifier' ? declarator.id.name : DESTRUCTURED_BINDING_NAME
            if (mutable) {
              context.report({
                node: declarator,
                messageId: 'mutableModuleBinding',
                data: {
                  name,
                  expected: EXPECTED_BINDING,
                  actual: `a module-level ${kind} binding`,
                  fix: BINDING_FIX,
                },
              })
            }
            const constructorName = newExpressionConstructor(declarator.init)
            if (constructorName !== null) {
              context.report({
                node: declarator,
                messageId: 'moduleLevelCollection',
                data: {
                  name,
                  expected: EXPECTED_BINDING,
                  actual: `a module-level ${constructorName}`,
                  fix: BINDING_FIX,
                },
              })
            }
          }
        }
      },
    }
  },
})
