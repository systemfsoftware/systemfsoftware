import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, OPERATION_SYMBOL_SUFFIXES } from './middleware-no-operation-imports.config.js'

export type MessageIds = 'operationSymbolImport'

const isMiddlewareFile = (filename: string): boolean => filename.endsWith('.middleware.ts')

const OPERATION_SYMBOL_REGEX = new RegExp(`(${OPERATION_SYMBOL_SUFFIXES.join('|')})$`)

const isOperationSymbol = (name: string): boolean => OPERATION_SYMBOL_REGEX.test(name)

export const middlewareNoOperationImports = defineRule({
  meta,
  create(context: Context) {
    if (!isMiddlewareFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            const imported = spec.imported
            const importedName = imported.type === 'Identifier' ? imported.name : imported.value
            if (isOperationSymbol(importedName)) {
              context.report({
                node: spec,
                messageId: 'operationSymbolImport',
                data: {
                  name: importedName,
                  expected: 'imports of adapters, ports, schemas, and ACLs only — never the operation',
                  actual: `an import binding named ${importedName}`,
                  fix:
                    'a middleware that imports the operation is a mislabeled handler — import the port instead and let the handler wire the executor',
                },
              })
            }
          } else if (isOperationSymbol(spec.local.name)) {
            context.report({
              node: spec,
              messageId: 'operationSymbolImport',
              data: {
                name: spec.local.name,
                expected: 'imports of adapters, ports, schemas, and ACLs only — never the operation',
                actual: `an import binding named ${spec.local.name}`,
                fix:
                  'a middleware that imports the operation is a mislabeled handler — import the port instead and let the handler wire the executor',
              },
            })
          }
        }
      },
    }
  },
})
