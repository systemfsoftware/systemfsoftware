import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import { BARREL_BASENAMES, BARREL_LAST_PARTS, meta, Options } from './no-barrels.config.js'

export type MessageIds = 'barrelFile' | 'reExportAll' | 'reExportNamed' | 'barrelImport'

export const noBarrels = defineRule({
  meta,
  create(context: Context) {
    const parsed = S.decodeUnknownSync(S.Array(Options))(context.options)
    const options = parsed[0] ?? S.decodeUnknownSync(Options)({})
    const severity = options.severity
    const excludeRoot = options.excludeRoot

    if (severity === 'off') {
      return {}
    }

    const filename = context.filename

    const checkBarrelFile = (): boolean => {
      const basename = filename.slice(filename.lastIndexOf('/') + 1)
      if (!BARREL_BASENAMES.has(basename)) return false
      if (!excludeRoot) return true
      const dirParts = filename.split('/').slice(0, -1)
      const srcIndex = dirParts.lastIndexOf('src')
      if (srcIndex === dirParts.length - 1) return false
      return true
    }

    const isBarrelFile = checkBarrelFile()

    const formatSpecifier = (s: ESTree.ExportSpecifier): string => {
      const localName = s.local.type === 'Identifier' ? s.local.name : String(s.local.value)
      const exported = s.exported
      const exportedName = exported.type === 'Identifier' ? exported.name : String(exported.value)
      return localName === exportedName ? localName : `${localName} as ${exportedName}`
    }

    const isBarrelImport = (importPath: string): boolean => {
      const firstChar = importPath[0]
      if (firstChar !== '.' && firstChar !== '/') {
        return false
      }

      const parts = importPath.split('/')
      const lastPart = parts[parts.length - 1]

      return lastPart !== undefined && BARREL_LAST_PARTS.has(lastPart)
    }

    return {
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (isBarrelFile) {
          context.report({
            node,
            messageId: 'reExportAll',
            data: { source: node.source.value },
          })
        }
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (!isBarrelFile || !node.source) {
          return
        }

        context.report({
          node,
          messageId: 'reExportNamed',
          data: {
            source: node.source.value,
            specifiers: node.specifiers.map(formatSpecifier).join(', '),
          },
        })
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isBarrelImport(node.source.value)) {
          context.report({
            node,
            messageId: 'barrelImport',
            data: { path: node.source.value },
          })
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
        if (isBarrelImport(node.source.value)) {
          context.report({
            node,
            messageId: 'barrelImport',
            data: { path: node.source.value },
          })
        }
      },
    }
  },
})
