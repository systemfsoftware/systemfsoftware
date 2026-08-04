import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, isStoreFile } from './cell.js'
import {
  ACTUAL_EFFECT_VALUE,
  ACTUAL_FUNCTION,
  FN_EXPORT_EXPECTED,
  FN_EXPORT_FIX,
  meta,
} from './store-effect-fn-required.config.js'

export type MessageIds = 'nonFnExport'

const bindingName = (node: ESTree.Node, fallback: string): string => node.type === 'Identifier' ? node.name : fallback

const effectFnCall = (init: ESTree.CallExpression): boolean => {
  const callee = init.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed === true) return false
  if (callee.object.type !== 'Identifier') return false
  return callee.property.name === 'fn'
}

const exportKind = (init: ESTree.Node | null): 'function' | 'effectValue' | 'pass' => {
  if (init === null) return 'pass'
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return 'function'
  if (init.type !== 'CallExpression') return 'pass'
  if (effectFnCall(init)) return 'pass'
  if (calleeRootName(init.callee) === 'Effect') return 'effectValue'
  return 'pass'
}

export const storeEffectFnRequired = defineRule({
  meta,
  create(context: Context) {
    if (!isStoreFile(context.filename)) return {}

    const reportExport = (node: ESTree.Node, name: string, kind: 'function' | 'effectValue'): void => {
      context.report({
        node,
        messageId: 'nonFnExport',
        data: {
          name,
          expected: FN_EXPORT_EXPECTED,
          actual: kind === 'function' ? ACTUAL_FUNCTION : ACTUAL_EFFECT_VALUE,
          fix: FN_EXPORT_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration === null) return
        if (declaration.type === 'FunctionDeclaration') {
          reportExport(declaration, String(declaration.id?.name), 'function')
          return
        }
        if (declaration.type !== 'VariableDeclaration') return
        for (const declarator of declaration.declarations) {
          const kind = exportKind(declarator.init)
          if (kind === 'pass') continue
          reportExport(declarator, bindingName(declarator.id, '<destructured>'), kind)
        }
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const declaration = node.declaration
        if (declaration.type === 'FunctionDeclaration') {
          reportExport(declaration, declaration.id?.name ?? '<default>', 'function')
          return
        }
        const kind = exportKind(declaration)
        if (kind === 'pass') return
        reportExport(declaration, '<default>', kind)
      },
    }
  },
})
