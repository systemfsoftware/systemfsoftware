import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ACTUAL, EXPECTED, FIX, meta, TYPE_FILE } from './type-no-runtime-export.config.js'

export type MessageIds = 'runtimeValueExport'

const reportRuntimeValueExport = (context: Context, node: ESTree.Node, name: string): void => {
  context.report({
    node,
    messageId: 'runtimeValueExport',
    data: { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
  })
}

const declaredNames = (pattern: ESTree.BindingPattern): ReadonlyArray<ESTree.BindingIdentifier> => {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern]
    case 'ObjectPattern':
      return pattern.properties.flatMap((property) =>
        property.type === 'RestElement'
          ? declaredNames(property.argument)
          : declaredNames(property.value)
      )
    case 'ArrayPattern':
      return pattern.elements.flatMap((element) => {
        if (element === null) return []
        if (element.type === 'RestElement') return declaredNames(element.argument)
        return declaredNames(element)
      })
    case 'AssignmentPattern':
      return declaredNames(pattern.left)
  }
}

const isAmbient = (declaration: ESTree.Declaration): boolean => 'declare' in declaration && declaration.declare === true

export const typeNoRuntimeExport = defineRule({
  meta,
  create(context: Context) {
    if (!TYPE_FILE.test(context.filename)) return {}

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const { declaration } = node
        if (declaration !== null) {
          if (node.exportKind === 'type') return
          if (isAmbient(declaration)) return
          switch (declaration.type) {
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                for (const id of declaredNames(declarator.id)) {
                  reportRuntimeValueExport(context, id, id.name)
                }
              }
              return
            case 'ClassDeclaration':
              if (declaration.id !== null) reportRuntimeValueExport(context, declaration, declaration.id.name)
              return
            case 'FunctionDeclaration':
              if (declaration.id !== null) reportRuntimeValueExport(context, declaration, declaration.id.name)
              return
            case 'TSEnumDeclaration':
              reportRuntimeValueExport(context, declaration, declaration.id.name)
              return
            default:
              return
          }
        }
        if (node.exportKind === 'type') return
        for (const specifier of node.specifiers) {
          if (specifier.exportKind === 'type') continue
          if (specifier.exported.type === 'Identifier') {
            reportRuntimeValueExport(context, specifier, specifier.exported.name)
          }
        }
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const { declaration } = node
        if (declaration.type === 'ClassDeclaration' && !isAmbient(declaration)) {
          reportRuntimeValueExport(context, declaration, declaration.id?.name ?? 'default')
          return
        }
        if (declaration.type === 'FunctionDeclaration' && !isAmbient(declaration)) {
          reportRuntimeValueExport(context, declaration, declaration.id?.name ?? 'default')
        }
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        reportRuntimeValueExport(context, node, node.source.value)
      },
    }
  },
})
