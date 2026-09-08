import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { ACTUAL, EXPECTED, FIX, meta } from './no-hand-curried-export.config.js'

export type Options = []
export type MessageIds = 'handCurriedExport'

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = node
  for (;;) {
    if (current.type === 'TSAsExpression') {
      current = current.expression
      continue
    }
    if (current.type === 'TSSatisfiesExpression') {
      current = current.expression
      continue
    }
    if (current.type === 'TSNonNullExpression') {
      current = current.expression
      continue
    }
    if (current.type === 'TSTypeAssertion') {
      current = current.expression
      continue
    }
    if (current.type === 'TSInstantiationExpression') {
      current = current.expression
      continue
    }
    if (current.type === 'ParenthesizedExpression') {
      current = current.expression
      continue
    }
    return current
  }
}

const innerArrowOf = (
  outer: ESTree.ArrowFunctionExpression,
): ESTree.ArrowFunctionExpression | null => {
  const body = unwrapExpression(outer.body)
  if (body.type === 'ArrowFunctionExpression') {
    return body
  }
  if (body.type === 'BlockStatement') {
    for (const statement of body.body) {
      if (statement.type === 'ReturnStatement' && statement.argument != null) {
        const returned = unwrapExpression(statement.argument)
        if (returned.type === 'ArrowFunctionExpression') {
          return returned
        }
      }
    }
  }
  return null
}

const checkDeclarator = (
  context: Context,
  declarator: ESTree.VariableDeclarator,
): void => {
  if (declarator.id.type !== 'Identifier') {
    return
  }
  const init = declarator.init
  if (init == null) {
    return
  }
  const unwrapped = unwrapExpression(init)
  if (unwrapped.type !== 'ArrowFunctionExpression') {
    return
  }
  if (unwrapped.params.length < 1 || unwrapped.typeParameters != null) {
    return
  }
  const inner = innerArrowOf(unwrapped)
  if (inner == null || inner.params.length < 1) {
    return
  }
  context.report({
    node: declarator.id,
    messageId: 'handCurriedExport',
    data: {
      name: `'${declarator.id.name}'`,
      expected: EXPECTED,
      actual: ACTUAL,
      fix: FIX,
    },
  })
}

export const noHandCurriedExport = defineRule({
  meta,
  create(context: Context) {
    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration == null || declaration.type !== 'VariableDeclaration') {
          return
        }
        for (const declarator of declaration.declarations) {
          checkDeclarator(context, declarator)
        }
      },
    }
  },
})
