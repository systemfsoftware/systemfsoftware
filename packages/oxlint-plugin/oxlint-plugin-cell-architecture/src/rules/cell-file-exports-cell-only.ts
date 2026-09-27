import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  DEFAULT_EXPORT_ACTUAL,
  EXPECTED,
  FIX,
  meta,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  VALUE_EXPORT_ACTUAL_OF,
} from './cell-file-exports-cell-only.config.js'
import { isCellFile } from './kind-file.js'
import { staticNameOf } from './module-origin.js'

export type MessageIds = 'cellValueExport' | 'cellReexport'

type BindingKind = 'value' | 'type'

interface ValueExport {
  readonly node: ESTree.Node
  readonly subject: string
  readonly actual: string
}

const reexportIsTypeOnly = (statement: ESTree.ExportNamedDeclaration): boolean =>
  statement.exportKind === 'type' ||
  statement.specifiers.every((specifier) => specifier.exportKind === 'type')

export const cellFileExportsCellOnly = defineRule({
  meta,
  create(context: Context) {
    if (!isCellFile(context.filename)) return {}
    return {
      Program(node: ESTree.Program) {
        const bindings = new Map<string, BindingKind>()

        const recordBinding = (name: string | null, kind: BindingKind): void => {
          if (name !== null) bindings.set(name, kind)
        }

        const recordDeclaration = (declaration: ESTree.Node | null): void => {
          if (declaration === null) return
          switch (declaration.type) {
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) recordBinding(staticNameOf(declarator.id), 'value')
              break
            case 'FunctionDeclaration':
            case 'TSDeclareFunction':
              recordBinding(declaration.id?.name ?? null, 'value')
              break
            case 'ClassDeclaration':
              recordBinding(declaration.id?.name ?? null, 'value')
              break
            case 'TSEnumDeclaration':
              recordBinding(declaration.id.name, 'value')
              break
            case 'TSInterfaceDeclaration':
            case 'TSTypeAliasDeclaration':
              recordBinding(declaration.id.name, 'type')
              break
            case 'TSModuleDeclaration':
              recordBinding(
                declaration.id.type === 'Identifier' ? declaration.id.name : null,
                declaration.declare ? 'type' : 'value',
              )
              break
            default:
              break
          }
        }

        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            for (const specifier of statement.specifiers) {
              const typeOnly = statement.importKind === 'type' ||
                (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type')
              recordBinding(specifier.local.name, typeOnly ? 'type' : 'value')
            }
            continue
          }
          if (statement.type === 'ExportNamedDeclaration') {
            recordDeclaration(statement.declaration)
            continue
          }
          if (statement.type === 'ExportDefaultDeclaration') {
            recordDeclaration(statement.declaration)
            continue
          }
          recordDeclaration(statement)
        }

        const valueExports: ValueExport[] = []

        const pushValueExport = (target: ESTree.Node, name: string): void => {
          valueExports.push({
            node: target,
            subject: `the value export \`${name}\``,
            actual: VALUE_EXPORT_ACTUAL_OF(name),
          })
        }

        const recordDeclarationExport = (declaration: ESTree.Node): void => {
          switch (declaration.type) {
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                pushValueExport(declarator, staticNameOf(declarator.id) ?? 'a binding')
              }
              break
            case 'FunctionDeclaration':
            case 'TSDeclareFunction':
              pushValueExport(declaration, declaration.id?.name ?? 'a declaration')
              break
            case 'ClassDeclaration':
              pushValueExport(declaration, declaration.id?.name ?? 'a declaration')
              break
            case 'TSEnumDeclaration':
              pushValueExport(declaration, declaration.id.name)
              break
            case 'TSModuleDeclaration':
              if (declaration.declare === false && declaration.id.type === 'Identifier') {
                pushValueExport(declaration, declaration.id.name)
              }
              break
            default:
              break
          }
        }

        const reportReexport = (target: ESTree.Node, source: string): void => {
          context.report({
            node: target,
            messageId: 'cellReexport',
            data: {
              name: 'a re-export',
              expected: REEXPORT_EXPECTED,
              actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
              fix: REEXPORT_FIX,
            },
          })
        }

        for (const statement of node.body) {
          switch (statement.type) {
            case 'ExportAllDeclaration':
              reportReexport(statement, statement.source.value)
              break
            case 'ExportNamedDeclaration':
              if (statement.source !== null) {
                if (reexportIsTypeOnly(statement)) break
                reportReexport(statement, statement.source.value)
                break
              }
              if (statement.exportKind === 'type') break
              if (statement.declaration !== null) {
                recordDeclarationExport(statement.declaration)
                break
              }
              for (const specifier of statement.specifiers) {
                if (specifier.exportKind === 'type') continue
                const local = staticNameOf(specifier.local)
                if (local === null || bindings.get(local) === 'type') continue
                pushValueExport(specifier, staticNameOf(specifier.exported) ?? local)
              }
              break
            case 'ExportDefaultDeclaration': {
              const declaration = statement.declaration
              if (declaration.type === 'TSInterfaceDeclaration') break
              if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
                pushValueExport(declaration, declaration.id?.name ?? 'default')
                break
              }
              valueExports.push({ node: statement, subject: 'the default export', actual: DEFAULT_EXPORT_ACTUAL })
              break
            }
            default:
              break
          }
        }

        for (const entry of valueExports.slice(1)) {
          context.report({
            node: entry.node,
            messageId: 'cellValueExport',
            data: { name: entry.subject, expected: EXPECTED, actual: entry.actual, fix: FIX },
          })
        }
      },
    }
  },
})
