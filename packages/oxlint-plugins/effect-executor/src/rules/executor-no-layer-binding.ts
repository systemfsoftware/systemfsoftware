import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, isExecutorFile } from './cell.js'
import {
  DEPENDENCY_PROVISION_ACTUAL,
  EFFECT_MODULE,
  EFFECT_NAMESPACE,
  LAYER_BINDING_EXPECTED,
  LAYER_BINDING_FIX,
  LAYER_CONSTRUCTION_ACTUAL,
  LAYER_IMPORT_ACTUAL,
  LAYER_IMPORT_NAME,
  LAYER_NAMESPACE,
  meta,
  PROVISION_METHODS,
} from './executor-no-layer-binding.config.js'

export type MessageIds = 'layerConstruction' | 'dependencyProvision' | 'layerImport'

const reportLayerCall = (
  context: Context,
  node: ESTree.CallExpression,
  objectName: string | null,
  propertyName: string,
): void => {
  const name = `${objectName}.${propertyName}`

  if (objectName === LAYER_NAMESPACE) {
    context.report({
      node,
      messageId: 'layerConstruction',
      data: {
        name,
        expected: LAYER_BINDING_EXPECTED,
        actual: LAYER_CONSTRUCTION_ACTUAL,
        fix: LAYER_BINDING_FIX,
      },
    })
    return
  }

  if (objectName !== EFFECT_NAMESPACE) return
  if (!PROVISION_METHODS.some((method) => method === propertyName)) return

  context.report({
    node,
    messageId: 'dependencyProvision',
    data: {
      name,
      expected: LAYER_BINDING_EXPECTED,
      actual: DEPENDENCY_PROVISION_ACTUAL,
      fix: LAYER_BINDING_FIX,
    },
  })
}

export const executorNoLayerBinding = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        if (callee.computed) return
        reportLayerCall(context, node, calleeRootName(callee.object), callee.property.name)
      },

      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportNamespaceSpecifier' &&
            specifier.local.name === LAYER_IMPORT_NAME
          ) {
            context.report({
              node: specifier,
              messageId: 'layerImport',
              data: {
                name: LAYER_IMPORT_NAME,
                expected: LAYER_BINDING_EXPECTED,
                actual: LAYER_IMPORT_ACTUAL,
                fix: LAYER_BINDING_FIX,
              },
            })
          }

          if (
            source === EFFECT_MODULE &&
            node.importKind !== 'type' &&
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === LAYER_IMPORT_NAME &&
            specifier.importKind !== 'type'
          ) {
            context.report({
              node: specifier,
              messageId: 'layerImport',
              data: {
                name: LAYER_IMPORT_NAME,
                expected: LAYER_BINDING_EXPECTED,
                actual: LAYER_IMPORT_ACTUAL,
                fix: LAYER_BINDING_FIX,
              },
            })
          }
        }
      },
    }
  },
})
