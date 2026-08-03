import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStoreFile } from './cell.js'
import {
  CONFIG_ENV_OBJECT,
  CONFIG_ENV_PROPERTY,
  CONNECTION_CONFIG_ACTUAL,
  CONNECTION_CONFIG_EXPECTED,
  CONNECTION_CONFIG_FIX,
  DRIVER_CONSTRUCTION_ACTUAL,
  DRIVER_CONSTRUCTION_EXPECTED,
  DRIVER_CONSTRUCTION_FIX,
  DRIVER_CONSTRUCTORS,
  DRIVER_IMPORT_ACTUAL,
  DRIVER_IMPORT_EXPECTED,
  DRIVER_IMPORT_FIX,
  DRIVER_PACKAGES,
  meta,
} from './store-no-driver-construction.config.js'

export type MessageIds = 'driverImport' | 'driverConstruction' | 'connectionConfig'

const isDriverPackage = (source: string): boolean =>
  DRIVER_PACKAGES.some((driver) => source === driver || source.startsWith(`${driver}/`))

const isDriverConstructor = (callee: ESTree.Node): callee is ESTree.IdentifierReference => {
  if (callee.type !== 'Identifier') return false
  return DRIVER_CONSTRUCTORS.some((constructor) => constructor === callee.name)
}

const envPropertyName = (node: ESTree.MemberExpression): string | null => {
  if (node.computed === true) {
    if (node.property.type !== 'Literal') return null
    return typeof node.property.value === 'string' ? node.property.value : null
  }
  if (node.property.type !== 'Identifier') return null
  return node.property.name
}

const isProcessEnvRead = (node: ESTree.MemberExpression): string | null => {
  const object = node.object
  if (object.type !== 'MemberExpression') return null
  if (object.computed === true) return null
  if (object.object.type !== 'Identifier' || object.object.name !== CONFIG_ENV_OBJECT) return null
  if (object.property.type !== 'Identifier' || object.property.name !== CONFIG_ENV_PROPERTY) return null
  return envPropertyName(node)
}

export const storeNoDriverConstruction = defineRule({
  meta,
  create(context: Context) {
    if (!isStoreFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (!isDriverPackage(source)) return
        context.report({
          node,
          messageId: 'driverImport',
          data: {
            name: source,
            expected: DRIVER_IMPORT_EXPECTED,
            actual: DRIVER_IMPORT_ACTUAL,
            fix: DRIVER_IMPORT_FIX,
          },
        })
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const sourceNode = node.source
        if (sourceNode.type !== 'Literal') return
        if (typeof sourceNode.value !== 'string') return
        if (!isDriverPackage(sourceNode.value)) return
        context.report({
          node,
          messageId: 'driverImport',
          data: {
            name: sourceNode.value,
            expected: DRIVER_IMPORT_EXPECTED,
            actual: DRIVER_IMPORT_ACTUAL,
            fix: DRIVER_IMPORT_FIX,
          },
        })
      },
      NewExpression(node: ESTree.NewExpression) {
        if (!isDriverConstructor(node.callee)) return
        context.report({
          node,
          messageId: 'driverConstruction',
          data: {
            name: node.callee.name,
            expected: DRIVER_CONSTRUCTION_EXPECTED,
            actual: DRIVER_CONSTRUCTION_ACTUAL,
            fix: DRIVER_CONSTRUCTION_FIX,
          },
        })
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const envName = isProcessEnvRead(node)
        if (envName === null) return
        context.report({
          node,
          messageId: 'connectionConfig',
          data: {
            name: envName,
            expected: CONNECTION_CONFIG_EXPECTED,
            actual: CONNECTION_CONFIG_ACTUAL,
            fix: CONNECTION_CONFIG_FIX,
          },
        })
      },
    }
  },
})
