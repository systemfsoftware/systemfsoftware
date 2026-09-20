import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  ACTUAL,
  CONTEXT_NAMESPACE,
  EFFECT_CONTEXT_MODULE,
  EXPECTED,
  FIX,
  GENERIC_TAG,
  meta,
} from './no-context-generic-tag.config.js'

export const noContextGenericTag = defineRule({
  meta,
  create(context: Context) {
    const trackedImports = new Set<string>()

    const reportViolation = (node: ESTree.Node) => {
      context.report({
        node,
        messageId: 'banned',
        data: {
          name: 'Context.GenericTag',
          expected: EXPECTED,
          actual: ACTUAL,
          fix: FIX,
        },
      })
    }

    const isContextGenericTagCall = (node: ESTree.CallExpression): boolean =>
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      trackedImports.has(node.callee.object.name) &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === GENERIC_TAG

    const isDirectGenericTagCall = (node: ESTree.CallExpression): boolean =>
      node.callee.type === 'Identifier' && node.callee.name === GENERIC_TAG

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.source.value !== EFFECT_CONTEXT_MODULE) return

        for (const spec of node.specifiers) {
          if (
            spec.type === 'ImportSpecifier' &&
            'name' in spec.imported &&
            spec.imported.name === CONTEXT_NAMESPACE
          ) {
            trackedImports.add(spec.local.name)
          }
        }
      },

      MemberExpression(node: ESTree.MemberExpression) {
        if (
          node.object.type === 'Identifier' &&
          trackedImports.has(node.object.name) &&
          node.property.type === 'Identifier' &&
          node.property.name === GENERIC_TAG
        ) {
          reportViolation(node)
        }
      },

      TSTypeReference(node: ESTree.TSTypeReference) {
        if (
          node.typeName.type === 'Identifier' &&
          node.typeName.name === GENERIC_TAG
        ) {
          reportViolation(node)
        }
      },

      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return

        if (
          node.superClass.type === 'CallExpression' &&
          isContextGenericTagCall(node.superClass)
        ) {
          reportViolation(node.superClass)
        }

        if (
          node.superClass.type === 'CallExpression' &&
          isDirectGenericTagCall(node.superClass)
        ) {
          reportViolation(node.superClass)
        }
      },
    }
  },
})
