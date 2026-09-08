import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { ACTUAL, EXPECTED, FIX, MAX_POSITIONAL_PARAMETERS, meta } from './no-long-positional-signature.config.js'

export type Options = []
export type MessageIds = 'longSignature'

const isOverLimit = (params: readonly ESTree.ParamPattern[]): boolean => params.length > MAX_POSITIONAL_PARAMETERS

const report = (context: Context, node: ESTree.Node, name: string): void => {
  context.report({
    node,
    messageId: 'longSignature',
    data: {
      name: `'${name}'`,
      expected: EXPECTED,
      actual: ACTUAL,
      fix: FIX,
    },
  })
}

export const noLongPositionalSignature = defineRule({
  meta,
  create(context: Context) {
    if (context.filename.endsWith('.d.ts')) return {}
    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration == null) {
          return
        }
        if (declaration.type === 'FunctionDeclaration') {
          if (declaration.id != null && isOverLimit(declaration.params)) {
            report(context, declaration.id, declaration.id.name)
          }
          return
        }
        if (declaration.type !== 'VariableDeclaration') {
          return
        }
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') {
            continue
          }
          const init = declarator.init
          if (init == null || init.type !== 'ArrowFunctionExpression') {
            continue
          }
          if (isOverLimit(init.params)) {
            report(context, declarator.id, declarator.id.name)
          }
        }
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const declaration = node.declaration
        if (declaration.type !== 'FunctionDeclaration') {
          return
        }
        const name = declaration.id != null ? declaration.id.name : 'default'
        if (isOverLimit(declaration.params)) {
          report(context, node, name)
        }
      },
    }
  },
})
