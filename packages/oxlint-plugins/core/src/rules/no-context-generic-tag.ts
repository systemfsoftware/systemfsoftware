// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

const EFFECT_CONTEXT_MODULE = 'effect'
const CONTEXT_NAMESPACE = 'Context'
const GENERIC_TAG = 'GenericTag'

export const noContextGenericTag = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ban Context.GenericTag from Effect - use Context.Tag instead',
    },
    schema: [],
    messages: {
      banned: "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.",
    },
  },
  create(context: Context) {
    // Stryker restore all
    const trackedImports = new Set<string>()

    const reportViolation = (node: ESTree.Node) => {
      context.report({
        node,
        messageId: 'banned',
        data: {
          name: 'Context.GenericTag',
          expected: 'Context.Tag',
          actual: 'Context.GenericTag',
          fix: 'Replace with Context.Tag from effect',
        },
      })
    }

    const isContextGenericTagCall = (
      node: ESTree.CallExpression,
    ): boolean => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        trackedImports.has(node.callee.object.name) &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === GENERIC_TAG
      )
    }

    const isDirectGenericTagCall = (node: ESTree.CallExpression): boolean => {
      return (
        node.callee.type === 'Identifier' &&
        node.callee.name === GENERIC_TAG
      )
    }

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
